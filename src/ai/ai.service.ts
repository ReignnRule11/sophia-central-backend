import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiSession } from './entities/ai-session.entity';
import { AiMessage } from './entities/ai-message.entity';
import { Resource } from '../resources/entities/resource.entity';
import { AskQuestionDto } from './dto/ask-question.dto';
import { SummarizeResourceDto } from './dto/summarize-resource.dto';
import { PointsService } from '../points/points.service';
import { GeminiService } from './gemini.service';

@Injectable()
export class AiService {
  private readonly AI_USAGE_COST = 2;
  private readonly SUMMARY_USAGE_COST = 5;

  constructor(
    @InjectRepository(AiSession)
    private readonly sessionRepository: Repository<AiSession>,
    @InjectRepository(AiMessage)
    private readonly messageRepository: Repository<AiMessage>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly pointsService: PointsService,
    private readonly geminiService: GeminiService,
  ) {}

  async processQuestion(userId: string, dto: AskQuestionDto) {
    const balance = await this.pointsService.getBalance(userId);
    if (balance < this.AI_USAGE_COST) {
      return {
        error: 'Insufficient Wisdom Points',
        required: this.AI_USAGE_COST,
        balance,
      };
    }

    const resource = dto.resourceId
      ? await this.resourceRepository.findOne({ where: { id: dto.resourceId } })
      : null;

    if (dto.resourceId && !resource) {
      throw new NotFoundException('Resource not found');
    }

    const context = resource
      ? [
          'The student is asking about this Sophia Central resource.',
          `Title: ${resource.title}`,
          `Description: ${resource.description || 'No description provided'}`,
          `Type: ${resource.type}`,
          `Course: ${resource.course || 'N/A'}`,
          `Topic: ${resource.topic || 'N/A'}`,
          `Institution: ${resource.institution || 'N/A'}`,
          `Level: ${resource.level || 'N/A'}`,
          `Tags: ${resource.tags?.join(', ') || 'None'}`,
          'Only metadata is available here; the actual uploaded file contents have not been extracted.',
        ].join('\n')
      : 'No specific resource metadata was provided.';

    // Generate first. If Gemini fails, no session/messages are created and no points are charged.
    const aiResponse = await this.geminiService.generateText(dto.question, context);

    let session = dto.sessionId
      ? await this.sessionRepository.findOne({
          where: { id: dto.sessionId, userId },
        })
      : null;

    if (!session) {
      session = this.sessionRepository.create({
        userId,
        resourceId: dto.resourceId,
        title: `Chat about ${dto.question.substring(0, 50)}...`,
      });
      session = await this.sessionRepository.save(session);
    }

    const userMessage = this.messageRepository.create({
      sessionId: session.id,
      role: 'user',
      content: dto.question,
    });
    await this.messageRepository.save(userMessage);

    const assistantMessage = this.messageRepository.create({
      sessionId: session.id,
      role: 'assistant',
      content: aiResponse,
    });
    await this.messageRepository.save(assistantMessage);

    await this.pointsService.awardPoints({
      userId,
      amount: -this.AI_USAGE_COST,
      reason: `AI tutor query - resource: ${dto.resourceId || 'general'}`,
    });

    return {
      sessionId: session.id,
      userMessage: dto.question,
      assistantMessage: aiResponse,
      pointsUsed: this.AI_USAGE_COST,
      balanceRemaining: balance - this.AI_USAGE_COST,
    };
  }

  async summarizeResource(userId: string, dto: SummarizeResourceDto) {
    const balance = await this.pointsService.getBalance(userId);
    if (balance < this.SUMMARY_USAGE_COST) {
      return {
        error: 'Insufficient Wisdom Points for summary',
        required: this.SUMMARY_USAGE_COST,
        balance,
      };
    }

    const resource = await this.resourceRepository.findOne({
      where: { id: dto.resourceId, isVerified: true },
    });

    if (!resource) {
      throw new NotFoundException('Resource not found or not verified');
    }

    const summary = await this.geminiService.generateText(
      'Create a useful study summary of the academic resource described in the supplied metadata. Organize it into overview, key points, important concepts, and suggested study takeaways. Clearly state when the supplied metadata is insufficient to summarize the actual document.',
      [
        `Title: ${resource.title}`,
        `Description: ${resource.description || 'No description'}`,
        `Type: ${resource.type}`,
        `Course: ${resource.course || 'N/A'}`,
        `Topic: ${resource.topic || 'N/A'}`,
        `Level: ${resource.level || 'N/A'}`,
        'Important: The actual uploaded file contents are not currently extracted or supplied. Do not imply that you have read the full file.',
      ].join('\n'),
    );

    await this.pointsService.awardPoints({
      userId,
      amount: -this.SUMMARY_USAGE_COST,
      reason: `Resource summary - ${resource.title}`,
    });

    return {
      resourceId: resource.id,
      resourceTitle: resource.title,
      summary,
      pointsUsed: this.SUMMARY_USAGE_COST,
      balanceRemaining: balance - this.SUMMARY_USAGE_COST,
    };
  }

  async getSession(sessionId: string, userId: string) {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['messages'],
    });

    if (!session) {
      throw new ForbiddenException('Session not found or unauthorized');
    }

    return session;
  }

  async getUsageStats(targetUserId: string, currentUserId: string) {
    if (targetUserId !== currentUserId) {
      throw new ForbiddenException('Unauthorized');
    }

    const sessions = await this.sessionRepository.find({
      where: { userId: currentUserId },
      relations: ['messages'],
    });

    const totalQueries = sessions.reduce((sum, s) => sum + s.messages.length / 2, 0);
    const totalSessions = sessions.length;

    return {
      totalSessions,
      totalQueries: Math.floor(totalQueries),
      pointsSpent: totalQueries * this.AI_USAGE_COST,
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        resourceId: s.resourceId,
        messageCount: s.messages.length,
        createdAt: s.createdAt,
      })),
    };
  }
}
