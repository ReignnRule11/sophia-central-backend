import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiSession } from './entities/ai-session.entity';
import { AiMessage } from './entities/ai-message.entity';
import { Resource } from '../resources/entities/resource.entity';
import { AskQuestionDto } from './dto/ask-question.dto';
import { SummarizeResourceDto } from './dto/summarize-resource.dto';
import { PointsService } from '../points/points.service';

@Injectable()
export class AiService {
  private readonly AI_USAGE_COST = 2; // Points per query
  private readonly SUMMARY_USAGE_COST = 5; // Points per summary

  constructor(
    @InjectRepository(AiSession)
    private readonly sessionRepository: Repository<AiSession>,
    @InjectRepository(AiMessage)
    private readonly messageRepository: Repository<AiMessage>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly pointsService: PointsService,
  ) {}

  async processQuestion(userId: string, dto: AskQuestionDto) {
    // Check user has enough points
    const balance = await this.pointsService.getBalance(userId);
    if (balance < this.AI_USAGE_COST) {
      return {
        error: 'Insufficient Wisdom Points',
        required: this.AI_USAGE_COST,
        balance,
      };
    }

    // Get or create session
    let session = await this.sessionRepository.findOne({
      where: { id: dto.sessionId, userId },
    });

    if (!session) {
      session = this.sessionRepository.create({
        userId,
        resourceId: dto.resourceId,
        title: `Chat about ${dto.question.substring(0, 50)}...`,
      });
      session = await this.sessionRepository.save(session);
    }

    // Verify resource exists
    if (dto.resourceId) {
      const resource = await this.resourceRepository.findOne({
        where: { id: dto.resourceId },
      });
      if (!resource) {
        throw new NotFoundException('Resource not found');
      }
    }

    // Mock AI response (replace with actual LLM integration)
    const aiResponse = await this.generateAiResponse(dto.question, dto.resourceId);

    // Save user message
    const userMessage = this.messageRepository.create({
      sessionId: session.id,
      role: 'user',
      content: dto.question,
    });
    await this.messageRepository.save(userMessage);

    // Save AI message
    const assistantMessage = this.messageRepository.create({
      sessionId: session.id,
      role: 'assistant',
      content: aiResponse,
    });
    await this.messageRepository.save(assistantMessage);

    // Deduct points
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
    // Check balance
    const balance = await this.pointsService.getBalance(userId);
    if (balance < this.SUMMARY_USAGE_COST) {
      return {
        error: 'Insufficient Wisdom Points for summary',
        required: this.SUMMARY_USAGE_COST,
        balance,
      };
    }

    // Verify resource exists
    const resource = await this.resourceRepository.findOne({
      where: { id: dto.resourceId, isVerified: true },
    });

    if (!resource) {
      throw new NotFoundException('Resource not found or not verified');
    }

    // Mock summary generation
    const summary = await this.generateSummary(resource);

    // Deduct points
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
    // Users can only see their own usage
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

  private async generateAiResponse(question: string, resourceId?: string): Promise<string> {
    // PLACEHOLDER: Replace with actual LLM API call
    // Example integrations:
    // - OpenAI GPT API
    // - Anthropic Claude API
    // - Open-source models (LLaMA, Mistral) via Ollama or HuggingFace
    // - Azure OpenAI

    // Mock response for MVP
    return `Based on the course material, here's what I understand about your question: "${question}"\n\nThis is a mock AI response. In production, this would be powered by an LLM that has context from the uploaded resources and course materials. The AI tutor would provide personalized explanations, worked examples, and study guidance.\n\nTo enable real AI features, integrate with an LLM provider like OpenAI, Anthropic, or self-hosted models.`;
  }

  private async generateSummary(resource: Resource): Promise<string> {
    // PLACEHOLDER: Replace with actual LLM summarization
    return `Summary of "${resource.title}":\n\nThis is a mock summary. In production, this would extract key concepts, main points, and important takeaways from the resource content using an LLM or document processing pipeline.\n\nKey topics would include the core concepts, methodology, and conclusions relevant to the course material.`;
  }
}
