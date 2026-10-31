import { ConflictException, Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportRequest } from './entities/support-request.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { ConcludeSupportRequestDto } from './dto/conclude-support-request.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectRepository(SupportRequest) private readonly requests: Repository<SupportRequest>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  async create(user: User, dto: CreateSupportRequestDto) {
    if (![UserRole.STUDENT, UserRole.LECTURER].includes(user.role)) {
      throw new ForbiddenException('Only student and lecturer accounts can contact support');
    }
    const request = this.requests.create({
      userId: user.id,
      subject: dto.subject.trim(),
      category: dto.category,
      description: dto.description.trim(),
      links: (dto.links ?? []).map((link) => link.trim()).filter(Boolean),
      attachments: (dto.attachments ?? []).filter(Boolean),
      status: 'pending',
    });
    const saved = await this.requests.save(request);
    return {
      ...saved,
      confirmationMessage: 'Your message has been sent to Support. Our administration team will review your request and provide an update through your notifications.',
    };
  }

  async listMine(userId: string) {
    return this.requests.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async listForModeration(status: 'pending' | 'concluded' = 'pending') {
    return this.requests.find({
      where: { status },
      relations: ['user', 'reviewer'],
      order: { createdAt: 'ASC' },
    });
  }

  async conclude(id: string, reviewerId: string, dto: ConcludeSupportRequestDto) {
    const request = await this.requests.findOne({ where: { id }, relations: ['user'] });
    if (!request) throw new NotFoundException('Support request not found');
    if (request.status === 'concluded') throw new ConflictException('This support request has already been concluded');
    const reviewer = await this.users.findOne({ where: { id: reviewerId } });
    if (!reviewer) throw new NotFoundException('Administrator account not found');

    request.status = 'concluded';
    request.resolutionMessage = dto.resolutionMessage.trim();
    request.reviewerId = reviewerId;
    request.concludedAt = new Date();
    const saved = await this.requests.save(request);

    try {
      const summary = request.subject;
      await this.notifications.createNotification(
        request.userId,
        'support_request_resolved',
        'Your support request has been concluded',
        `Our support team has reviewed “${summary}”. ${request.resolutionMessage}`,
        '/notifications',
      );
    } catch (error) {
      this.logger.error(`Support request ${id} was concluded but its notification could not be created: ${String(error)}`);
    }
    return saved;
  }
}
