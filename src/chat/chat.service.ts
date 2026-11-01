import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { ChatContentType, ChatKind, ChatMessage } from './entities/chat-message.entity';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';

const EDIT_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage) private readonly repo: Repository<ChatMessage>,
    private readonly users: UsersService,
  ) {}

  private async eligible(id: string, roles: UserRole[]): Promise<User> {
    const user = await this.users.findOne(id);
    if (!user || user.isSuspended || !roles.includes(user.role)) {
      throw new ForbiddenException('This account cannot use chat.');
    }
    if (!user.academicHandle) throw new ForbiddenException('Set an academic handle before using chat.');
    return user;
  }

  private groupKey(user: User): string {
    if (!user.institution || !user.faculty || !user.department) {
      throw new ForbiddenException('Complete institution, faculty, and department before joining Group Chat.');
    }
    return 'group:' + [user.institution, user.faculty, user.department].map(value => value.trim().toLowerCase()).join(':');
  }

  private directKey(a: string, b: string): string {
    return 'direct:' + [a, b].sort().join(':');
  }

  async contacts(id: string) {
    await this.eligible(id, [UserRole.STUDENT, UserRole.LECTURER]);
    return this.users.findChatContacts(id);
  }

  async history(id: string, kind: 'group' | 'direct', otherId?: string, limitValue?: string, before?: string) {
    let room: string;
    if (kind === 'group') {
      room = this.groupKey(await this.eligible(id, [UserRole.STUDENT]));
    } else {
      const sender = await this.eligible(id, [UserRole.STUDENT, UserRole.LECTURER]);
      if (!otherId || otherId === id) throw new BadRequestException('Choose another user.');
      const recipient = await this.eligible(otherId, [UserRole.STUDENT, UserRole.LECTURER]);
      room = this.directKey(sender.id, recipient.id);
    }

    const parsed = Number(limitValue || 30);
    const limit = Number.isInteger(parsed) ? Math.max(1, Math.min(100, parsed)) : 30;
    const query = this.repo.createQueryBuilder('message').where('message.roomKey = :room', { room });
    if (before) {
      const cursor = await this.repo.findOne({ where: { id: before, roomKey: room } });
      if (!cursor) throw new BadRequestException('Invalid pagination cursor.');
      query.andWhere('message.createdAt < :date', { date: cursor.createdAt });
    }
    const rows = await query.orderBy('message.createdAt', 'DESC').take(limit + 1).getMany();
    const hasMore = rows.length > limit;
    return {
      items: rows.slice(0, limit).reverse().map(message => this.present(message, id)),
      hasMore,
      nextBefore: hasMore ? rows[limit - 1]?.id : null,
    };
  }

  async create(id: string, dto: CreateChatMessageDto) {
    const sender = dto.kind === 'group'
      ? await this.eligible(id, [UserRole.STUDENT])
      : await this.eligible(id, [UserRole.STUDENT, UserRole.LECTURER]);

    if (dto.voiceKey) throw new BadRequestException('Voice messages are not enabled until the audio upload flow is completed.');
    if (!dto.text?.trim()) throw new BadRequestException('Message cannot be empty.');
    if (dto.kind === 'group' && dto.recipientId) throw new BadRequestException('Group messages cannot specify a recipient.');

    let roomKey: string;
    if (dto.kind === 'group') {
      roomKey = this.groupKey(sender);
    } else {
      if (!dto.recipientId || dto.recipientId === id) throw new BadRequestException('Choose a recipient.');
      const recipient = await this.eligible(dto.recipientId, [UserRole.STUDENT, UserRole.LECTURER]);
      roomKey = this.directKey(sender.id, recipient.id);
    }

    const message = await this.repo.save(this.repo.create({
      kind: dto.kind === 'group' ? ChatKind.GROUP : ChatKind.DIRECT,
      roomKey,
      senderId: sender.id,
      senderHandle: sender.academicHandle!,
      contentType: ChatContentType.TEXT,
      text: dto.text.trim(),
      voiceKey: null,
    }));
    return this.present(message, id);
  }

  async edit(id: string, messageId: string, text: string) {
    await this.eligible(id, [UserRole.STUDENT, UserRole.LECTURER]);
    const message = await this.repo.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found.');
    if (message.senderId !== id) throw new ForbiddenException('You can only edit your own messages.');
    if (message.isDeleted || message.contentType !== ChatContentType.TEXT) throw new BadRequestException('This message cannot be edited.');
    if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) throw new ForbiddenException('Messages can only be edited within 15 minutes.');
    if (!text?.trim()) throw new BadRequestException('Message cannot be empty.');
    message.text = text.trim();
    message.editedAt = new Date();
    return this.present(await this.repo.save(message), id);
  }

  async remove(id: string, messageId: string) {
    await this.eligible(id, [UserRole.STUDENT, UserRole.LECTURER]);
    const message = await this.repo.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found.');
    if (message.senderId !== id) throw new ForbiddenException('You can only delete your own messages.');
    message.isDeleted = true;
    message.text = null;
    message.voiceKey = null;
    await this.repo.save(message);
    return { success: true, id: message.id };
  }

  private present(message: ChatMessage, viewerId: string) {
    return {
      id: message.id,
      kind: message.kind,
      senderId: message.senderId,
      senderHandle: message.senderHandle,
      contentType: message.contentType,
      text: message.isDeleted ? null : message.text,
      isDeleted: message.isDeleted,
      editedAt: message.editedAt,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      isOwn: message.senderId === viewerId,
    };
  }
}