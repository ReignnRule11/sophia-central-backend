import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedResource } from '../resources/entities/saved-resource.entity';
import { FileUpload } from '../upload/entities/file-upload.entity';
import { S3Service } from '../upload/s3.service';
import { extractAcademicDocumentText } from './resource-content-extractor';
import { AiSession } from './entities/ai-session.entity';
import { AiMessage } from './entities/ai-message.entity';
import { Resource, ResourceModerationStatus } from '../resources/entities/resource.entity';
import { AskQuestionDto } from './dto/ask-question.dto';
import { SummarizeResourceDto } from './dto/summarize-resource.dto';
import { PointsService } from '../points/points.service';
import { AiProviderService } from './ai-provider.service';

@Injectable()
export class AiService {
  private readonly GENERAL_AI_USAGE_COST = 1;
  private readonly RESOURCE_AI_USAGE_COST = 2;
  private readonly SUMMARY_USAGE_COST = 5;
  private readonly MAX_HISTORY_MESSAGES = 12;

  constructor(
    @InjectRepository(AiSession)
    private readonly sessionRepository: Repository<AiSession>,
    @InjectRepository(AiMessage)
    private readonly messageRepository: Repository<AiMessage>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly pointsService: PointsService,
    private readonly aiProviderService: AiProviderService,
    @InjectRepository(SavedResource)
    private readonly savedResourceRepository: Repository<SavedResource>,
    @InjectRepository(FileUpload)
    private readonly fileUploadRepository: Repository<FileUpload>,
    private readonly s3Service: S3Service,
  ) {}

  private async loadDownloadedResourceText(resource: Resource, userId: string): Promise<string> {
    const download = await this.savedResourceRepository.findOne({ where: { userId, resourceId: resource.id } });
    if (!download?.downloadedAt) throw new ForbiddenException('Download this approved material before using it with Sophis AI.');
    let key = resource.fileUrl ? this.s3Service.getKeyFromPublicUrl(resource.fileUrl) : null;
    let filename = key?.split('/').pop() || '';
    if (!key) {
      const upload = await this.fileUploadRepository.findOne({ where: { resourceId: resource.id }, order: { uploadedAt: 'DESC' } });
      if (upload && ['completed', 'scanned'].includes(upload.status)) { key = upload.s3Key; filename = upload.filename; }
    }
    if (!key) throw new BadRequestException('The selected material does not have an accessible full-text file stored for Sophis AI.');
    const file = await this.s3Service.getObjectStream(key);
    const maxBytes = 12 * 1024 * 1024;
    if (file.contentLength && file.contentLength > maxBytes) throw new BadRequestException('This material is too large for Sophis AI to process. Please use a smaller document.');
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of file.body as any) {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += part.length;
      if (totalBytes > maxBytes) throw new BadRequestException('This material is too large for Sophis AI to process. Please use a smaller document.');
      chunks.push(part);
    }
    let extracted = '';
    try { extracted = extractAcademicDocumentText(Buffer.concat(chunks), filename); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Could not read this academic document.'); }
    if (!extracted.trim()) throw new BadRequestException('No readable text was found in this material. Scanned or image-only PDFs are not supported yet.');
    return extracted.slice(0, 48000);
  }


  async editUserMessage(userId: string, sessionId: string, messageId: string, nextQuestion: string) {
    const question = nextQuestion.trim();
    if (!question) throw new BadRequestException('A question cannot be empty.');

    const session = await this.sessionRepository.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new ForbiddenException('AI conversation not found or unauthorized.');

    const messages = await this.messageRepository.find({
      where: { sessionId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const targetIndex = messages.findIndex((message) => message.id === messageId);
    const target = messages[targetIndex];
    if (!target || target.role !== 'user') {
      throw new ForbiddenException('You can only edit your own question.');
    }

    const resource = session.resourceId
      ? await this.resourceRepository.findOne({
          where: [
            { id: session.resourceId, isVerified: true },
            { id: session.resourceId, moderationStatus: ResourceModerationStatus.APPROVED },
          ],
        })
      : null;
    const usageCost = resource ? this.RESOURCE_AI_USAGE_COST : this.GENERAL_AI_USAGE_COST;
    const balance = await this.pointsService.getBalance(userId);
    if (balance < usageCost) {
      return { error: 'Insufficient Wisdom Points', required: usageCost, balance };
    }
    const resourceText = resource ? await this.loadDownloadedResourceText(resource, userId) : '';
    const context = resource
      ? [
          'The student selected a downloaded, approved academic document. Use its extracted contents as the primary source. If the answer is not in the document, say so and clearly distinguish any additional academic explanation.',
          `Title: ${resource.title}`,
          `Description: ${resource.description || 'No description provided'}`,
          `Type: ${resource.type}`,
          `Course: ${resource.course || 'N/A'}`,
          `Topic: ${resource.topic || 'N/A'}`,
          `Institution: ${resource.institution || 'N/A'}`,
          `Level: ${resource.level || 'N/A'}`,
          `Tags: ${resource.tags?.join(', ') || 'None'}`,
          'EXTRACTED DOCUMENT CONTENT:',
          resourceText,
        ].join('\n')
      : 'No specific resource was selected. Answer the student question directly using your academic knowledge.';

    const history = messages
      .slice(0, targetIndex)
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }));

    // Generate first. If the provider fails, the saved conversation remains untouched.
    const aiResponse = await this.aiProviderService.generateText(question, context, history);

    target.content = question;
    await this.messageRepository.save(target);

    const laterMessages = messages.slice(targetIndex + 1);
    if (laterMessages.length) await this.messageRepository.remove(laterMessages);

    const assistantMessage = await this.messageRepository.save(this.messageRepository.create({
      sessionId,
      role: 'assistant',
      content: aiResponse,
    }));

    if (targetIndex === 0) session.title = `Chat about ${question.substring(0, 50)}...`;
    await this.sessionRepository.save(session);

    await this.pointsService.chargeForAiUsage(userId, usageCost, `AI tutor question edited - resource: ${session.resourceId || 'general'}`);

    return {
      sessionId,
      userMessageId: target.id,
      userMessage: target.content,
      assistantMessage: assistantMessage.content,
      pointsUsed: usageCost,
      balanceRemaining: balance - usageCost,
    };
  }

  async processQuestion(userId: string, dto: AskQuestionDto) {
    const question = dto.question.trim();
    let session: AiSession | null = null;
    if (dto.sessionId) {
      session = await this.sessionRepository.findOne({
        where: { id: dto.sessionId, userId },
      });
      if (!session) {
        throw new ForbiddenException('AI conversation not found or unauthorized');
      }
    }

    const selectedResourceId = dto.resourceId !== undefined ? dto.resourceId : session?.resourceId;
    const resource = selectedResourceId
      ? await this.resourceRepository.findOne({
          where: [
            { id: selectedResourceId, isVerified: true },
            { id: selectedResourceId, moderationStatus: ResourceModerationStatus.APPROVED },
          ],
        })
      : null;

    if (selectedResourceId && !resource) {
      throw new NotFoundException('Approved academic resource not found');
    }

    if (session && dto.resourceId !== undefined) session.resourceId = dto.resourceId || null;

    const usageCost = resource ? this.RESOURCE_AI_USAGE_COST : this.GENERAL_AI_USAGE_COST;
    const balance = await this.pointsService.getBalance(userId);
    if (balance < usageCost) {
      return { error: 'Insufficient Wisdom Points', required: usageCost, balance };
    }

    const resourceText = resource ? await this.loadDownloadedResourceText(resource, userId) : '';
    const context = resource
      ? [
          'The student selected a downloaded, approved academic document. Use its extracted contents as the primary source. If the answer is not in the document, say so and clearly distinguish any additional academic explanation.',
          `Title: ${resource.title}`,
          `Description: ${resource.description || 'No description provided'}`,
          `Type: ${resource.type}`,
          `Course: ${resource.course || 'N/A'}`,
          `Topic: ${resource.topic || 'N/A'}`,
          `Institution: ${resource.institution || 'N/A'}`,
          `Level: ${resource.level || 'N/A'}`,
          `Tags: ${resource.tags?.join(', ') || 'None'}`,
          'EXTRACTED DOCUMENT CONTENT:',
          resourceText,
        ].join('\n')
      : 'No specific resource was selected. Answer the student question directly using your academic knowledge.';

    const history = session
      ? (await this.messageRepository.find({
          where: { sessionId: session.id },
          order: { createdAt: 'DESC' },
          take: this.MAX_HISTORY_MESSAGES,
        }))
          .reverse()
          .filter((message) => message.role === 'user' || message.role === 'assistant')
          .map((message) => ({
            role: message.role as 'user' | 'assistant',
            content: message.content,
          }))
      : [];

    // Generate before persisting messages or charging points. Provider failures are not billable.
    const aiResponse = await this.aiProviderService.generateText(question, context, history);

    if (!session) {
      session = this.sessionRepository.create({
        userId,
        resourceId: selectedResourceId,
        title: `Chat about ${question.substring(0, 50)}...`,
      });
      session = await this.sessionRepository.save(session);
    } else if (dto.resourceId !== undefined) {
      session = await this.sessionRepository.save(session);
    }

    const savedUserMessage = await this.messageRepository.save(this.messageRepository.create({
      sessionId: session.id,
      role: 'user',
      content: question,
    }));

    await this.messageRepository.save(this.messageRepository.create({
      sessionId: session.id,
      role: 'assistant',
      content: aiResponse,
    }));

    await this.pointsService.chargeForAiUsage(userId, usageCost, `AI tutor query - resource: ${resource?.id || 'general'}`);

    return {
      sessionId: session.id,
      userMessageId: savedUserMessage.id,
      userMessage: question,
      assistantMessage: aiResponse,
      pointsUsed: usageCost,
      balanceRemaining: balance - usageCost,
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

    const resourceText = await this.loadDownloadedResourceText(resource, userId);
    const summary = await this.aiProviderService.generateText(
      'Create a detailed study summary from the actual academic document content supplied. Organize it into overview, section-by-section key points, important concepts and definitions, formulas or examples where present, and suggested study takeaways. Do not invent content absent from the document.',
      [
        `Title: ${resource.title}`,
        `Description: ${resource.description || 'No description'}`,
        `Type: ${resource.type}`,
        `Course: ${resource.course || 'N/A'}`,
        `Topic: ${resource.topic || 'N/A'}`,
        `Level: ${resource.level || 'N/A'}`,
        'EXTRACTED DOCUMENT CONTENT:',
        resourceText,
      ].join('\n'),
    );

    await this.pointsService.chargeForAiUsage(userId, this.SUMMARY_USAGE_COST, `Resource summary - ${resource.title}`);

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
      pointsSpent: sessions.reduce((sum, session) => sum + (session.messages.length / 2) * (session.resourceId ? this.RESOURCE_AI_USAGE_COST : this.GENERAL_AI_USAGE_COST), 0),
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
