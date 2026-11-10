import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { MessageEvent } from '@nestjs/common';
import { Observable, filter, map } from 'rxjs';
import { User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { S3Service } from '../upload/s3.service';
import { ChatContentType, ChatKind, ChatMessage } from './entities/chat-message.entity';
import { CreateChatMessageDto, CreateVoiceUploadDto } from './dto/create-chat-message.dto';
import { RedisChatService } from './redis-chat.service';
import { ChatUserBlock } from './entities/chat-user-block.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatConversationRead } from './entities/chat-conversation-read.entity';
import { ChatMessageUserHide } from './entities/chat-message-user-hide.entity';

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_VOICE_BYTES = 12 * 1024 * 1024;
const STICKER_CATALOG = ['celebrate','thank-you','well-done','studying','thinking','laughing','encouragement','hello'] as const;
const VOICE_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage) private readonly repo: Repository<ChatMessage>,
    @InjectRepository(ChatUserBlock) private readonly blocks: Repository<ChatUserBlock>,
    @InjectRepository(ChatConversationRead) private readonly reads: Repository<ChatConversationRead>,
    @InjectRepository(ChatMessageUserHide) private readonly messageHides: Repository<ChatMessageUserHide>,
    private readonly users: UsersService,
    private readonly s3: S3Service,
    private readonly redis: RedisChatService,
    private readonly notifications: NotificationsService,
  ) {}

  private async eligible(id: string, roles: UserRole[]): Promise<User> {
    const user = await this.users.findOne(id);
    if (!user || user.isSuspended || !roles.includes(user.role)) throw new ForbiddenException('This account cannot use chat.');
    if (!user.academicHandle) throw new ForbiddenException('Set an academic handle before using chat.');
    return user;
  }

  private groupKey(user: User): string {
    if (!user.institution || !user.faculty || !user.department) throw new ForbiddenException('Complete institution, faculty, and department before joining Group Chat.');
    return 'group:' + [user.institution, user.faculty, user.department].map(value => value.trim().toLowerCase()).join(':');
  }

  private directKey(a: string, b: string): string { return 'direct:' + [a, b].sort().join(':'); }

  private async assertNotBlocked(a: string, b: string): Promise<void> {
    const block = await this.blocks.findOne({ where: [ { userId: a, blockedUserId: b }, { userId: b, blockedUserId: a } ] });
    if (block) throw new ForbiddenException('Private messaging is unavailable because one account has blocked the other.');
  }

  private assertSameInstitution(sender: User, recipient: User): void {
    const senderInstitution = sender.institution?.trim().toLocaleLowerCase();
    const recipientInstitution = recipient.institution?.trim().toLocaleLowerCase();
    if (!senderInstitution || !recipientInstitution || senderInstitution !== recipientInstitution) {
      throw new ForbiddenException('Private DM is available only between students and lecturers at the same institution.');
    }
  }

  private async assertCanViewMessage(user: User, message: ChatMessage): Promise<void> {
    if (message.kind === ChatKind.GROUP) {
      if (user.role !== UserRole.STUDENT || this.groupKey(user) !== message.roomKey) throw new ForbiddenException('You cannot reference a message outside your group.');
      return;
    }
    if (!message.roomKey.split(':').includes(user.id)) throw new ForbiddenException('You cannot reference a message outside your conversation.');
  }

  async listBlocks(userId: string) {
    await this.eligible(userId, [UserRole.STUDENT, UserRole.LECTURER]);
    const rows = await this.blocks.find({ where: { userId }, order: { createdAt: 'DESC' } });
    const contacts = await this.users.findChatContacts(userId);
    return rows.map(row => ({ userId: row.blockedUserId, academicHandle: contacts.find(contact => contact.id === row.blockedUserId)?.academicHandle ?? null, createdAt: row.createdAt }));
  }

  async blockUser(userId: string, blockedUserId: string) {
    await this.eligible(userId, [UserRole.STUDENT, UserRole.LECTURER]);
    if (!blockedUserId || userId === blockedUserId) throw new BadRequestException('Choose another account to block.');
    const blocker = await this.eligible(userId, [UserRole.STUDENT, UserRole.LECTURER]);
    const blocked = await this.eligible(blockedUserId, [UserRole.STUDENT, UserRole.LECTURER]);
    this.assertSameInstitution(blocker, blocked);
    const existing = await this.blocks.findOne({ where: { userId, blockedUserId } });
    if (!existing) await this.blocks.save(this.blocks.create({ userId, blockedUserId }));
    return { success: true, blockedUserId };
  }

  async unblockUser(userId: string, blockedUserId: string) {
    await this.eligible(userId, [UserRole.STUDENT, UserRole.LECTURER]);
    await this.blocks.delete({ userId, blockedUserId });
    return { success: true, unblockedUserId: blockedUserId };
  }

  eventStream(user: User): Observable<MessageEvent> {
    if (user.isSuspended || ![UserRole.STUDENT, UserRole.LECTURER].includes(user.role) || !user.academicHandle) {
      throw new ForbiddenException('This account cannot use chat.');
    }
    const groupRoomKey = user.role === UserRole.STUDENT ? this.groupKey(user) : undefined;
    return this.redis.events$.pipe(
      filter(({ roomKey }) => {
        if (groupRoomKey && roomKey === groupRoomKey) return true;
        return roomKey.startsWith('direct:') && roomKey.slice('direct:'.length).split(':').includes(user.id);
      }),
      map(() => ({ data: { type: 'refresh' } })),
    );
  }

  private publishRoom(roomKey: string): void {
    void this.redis.publishRoom(roomKey).catch(() => {
      // The PostgreSQL write remains authoritative; the frontend recovery refresh repairs missed notifications.
    });
  }

  async heartbeat(id: string) {
    await this.eligible(id, [UserRole.STUDENT, UserRole.LECTURER]);
    await this.redis.setPresence(id);
    return { success: true };
  }

  async presence(id: string) {
    await this.eligible(id, [UserRole.STUDENT, UserRole.LECTURER]);
    const contacts = await this.users.findChatContacts(id);
    return Promise.all(contacts.map(async contact => ({
      id: contact.id,
      online: await this.redis.isOnline(contact.id),
    })));
  }

  async contacts(id: string, search?: string) {
    await this.eligible(id, [UserRole.STUDENT, UserRole.LECTURER]);
    const activeContacts = await this.users.findChatContacts(id, search);
    if (search?.trim()) return activeContacts.map(contact => ({ ...contact, isDeleted: false }));
    // Keep deleted DM participants visible as read-only conversations.
    const rooms = await this.repo.createQueryBuilder('message')
      .select('DISTINCT message.roomKey', 'roomKey')
      .where('message.kind = :kind', { kind: ChatKind.DIRECT })
      .andWhere('message.roomKey LIKE :roomKey', { roomKey: '%' + id + '%' })
      .andWhere('message.senderId IS NULL')
      .getRawMany<{ roomKey: string }>();
    const activeIds = new Set(activeContacts.map(contact => contact.id));
    const deletedIds = [...new Set(rooms.flatMap(row => row.roomKey.split(':').slice(1).filter(part => part !== id)))];
    const deletedContacts = deletedIds.filter(otherId => !activeIds.has(otherId)).map(otherId => ({
      id: otherId, academicHandle: 'Deleted user', role: UserRole.STUDENT, isDeleted: true,
    }));
    return [...activeContacts.map(contact => ({ ...contact, isDeleted: false })), ...deletedContacts];
  }

  async inbox(id: string) {
    const contacts = await this.contacts(id);

    const conversations = await Promise.all(contacts.map(async contact => {
      const roomKey = this.directKey(id, contact.id);

      if (!contact.isDeleted) {
        try {
          await this.assertNotBlocked(id, contact.id);
        } catch {
          return null;
        }
      }

      const [latest, readState] = await Promise.all([
        this.repo.createQueryBuilder('message')
          .where('message.roomKey = :roomKey', { roomKey })
          .andWhere('message.kind = :kind', { kind: ChatKind.DIRECT })
          .andWhere(
            'NOT EXISTS (SELECT 1 FROM chat_message_user_hides hidden WHERE hidden."messageId" = message.id AND hidden."userId" = :viewerId)',
            { viewerId: id },
          )
          .orderBy('message.createdAt', 'DESC')
          .getOne(),
        this.reads.findOne({ where: { userId: id, roomKey } }),
      ]);

      if (!latest) return null;

      const unreadCount = contact.isDeleted
        ? 0
        : await this.repo.count({
            where: {
              roomKey,
              kind: ChatKind.DIRECT,
              senderId: contact.id,
              isDeleted: false,
              createdAt: MoreThan(readState?.lastReadAt ?? new Date(0)),
            },
          });

      const preview = latest.isDeleted
        ? 'This message was deleted'
        : latest.contentType === ChatContentType.VOICE
          ? 'Voice message'
          : latest.contentType === ChatContentType.STICKER
            ? 'Sticker'
            : latest.text ?? 'Message';

      return {
        contact,
        lastMessage: {
          id: latest.id,
          senderHandle: latest.senderHandle,
          contentType: latest.contentType,
          text: latest.isDeleted ? null : latest.text,
          preview,
          createdAt: latest.createdAt,
          isOwn: latest.senderId === id,
          isDeleted: latest.isDeleted,
        },
        unreadCount,
      };
    }));

    return conversations
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
  }

  async markDirectRead(id: string, otherId: string) {
    const current = await this.eligible(id, [UserRole.STUDENT, UserRole.LECTURER]);
    if (!otherId || otherId === id) throw new BadRequestException('Choose another user.');

    const other = await this.users.findOne(otherId);
    const roomKey = this.directKey(current.id, otherId);

    if (other) {
      const recipient = await this.eligible(otherId, [UserRole.STUDENT, UserRole.LECTURER]);
      this.assertSameInstitution(current, recipient);
      await this.assertNotBlocked(current.id, otherId);
    } else {
      const previousMessage = await this.repo.findOne({ where: { roomKey, kind: ChatKind.DIRECT } });
      if (!previousMessage) throw new ForbiddenException('This conversation is unavailable.');
    }

    const latest = await this.repo.findOne({
      where: { roomKey, kind: ChatKind.DIRECT },
      order: { createdAt: 'DESC' },
    });
    const readState = await this.reads.findOne({ where: { userId: id, roomKey } });
    const lastReadAt = latest?.createdAt ?? new Date();

    await this.reads.save(this.reads.create({
      ...(readState ?? {}),
      userId: id,
      roomKey,
      lastReadAt,
    }));

    return { success: true, lastReadAt };
  }

  async createVoiceUpload(id: string, dto: CreateVoiceUploadDto) {
    await this.eligible(id, [UserRole.STUDENT, UserRole.LECTURER]);
    if (!VOICE_TYPES[dto.mimetype] || !Number.isInteger(dto.size) || dto.size < 1 || dto.size > MAX_VOICE_BYTES) {
      throw new BadRequestException('Choose a supported audio recording no larger than 12 MB.');
    }
    const key = `voice-messages/${id}/${randomUUID()}.${VOICE_TYPES[dto.mimetype]}`;
    const signed = await this.s3.createPresignedUploadUrl(key, dto.mimetype, 300);
    return { uploadUrl: signed.url, key, contentType: dto.mimetype, expiresIn: 300, maxBytes: MAX_VOICE_BYTES };
  }

  async history(id: string, kind: 'group' | 'direct', otherId?: string, limitValue?: string, before?: string) {
    let room: string;
    if (kind === 'group') room = this.groupKey(await this.eligible(id, [UserRole.STUDENT]));
    else {
      const sender = await this.eligible(id, [UserRole.STUDENT, UserRole.LECTURER]);
      if (!otherId || otherId === id) throw new BadRequestException('Choose another user.');
      const recipient = await this.users.findOne(otherId);
      room = this.directKey(sender.id, otherId);
      if (recipient) {
        const eligibleRecipient = await this.eligible(otherId, [UserRole.STUDENT, UserRole.LECTURER]);
        this.assertSameInstitution(sender, eligibleRecipient);
        await this.assertNotBlocked(sender.id, recipient.id);
      } else {
        const preservedHistory = await this.repo.findOne({ where: { roomKey: room, kind: ChatKind.DIRECT, senderId: IsNull() } });
        if (!preservedHistory) throw new ForbiddenException('This conversation is unavailable.');
      }
    }
    const parsed = Number(limitValue || 30);
    const limit = Number.isInteger(parsed) ? Math.max(1, Math.min(100, parsed)) : 30;
    const query = this.repo.createQueryBuilder('message')
      .where('message.roomKey = :room', { room })
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM chat_message_user_hides hidden WHERE hidden."messageId" = message.id AND hidden."userId" = :viewerId)',
        { viewerId: id },
      );
    if (before) {
      const cursor = await this.repo.findOne({ where: { id: before, roomKey: room } });
      if (!cursor) throw new BadRequestException('Invalid pagination cursor.');
      query.andWhere(
        '(message.createdAt < :date OR (message.createdAt = :date AND message.id < :cursorId))',
        { date: cursor.createdAt, cursorId: cursor.id },
      );
    }
    const rows = await query.orderBy('message.createdAt', 'DESC').addOrderBy('message.id', 'DESC').take(limit + 1).getMany();
    const hasMore = rows.length > limit;
    const [items, hiddenRows] = await Promise.all([
      Promise.all(rows.slice(0, limit).reverse().map(message => this.present(message, id))),
      this.messageHides.createQueryBuilder('hidden')
        .innerJoin(ChatMessage, 'message', 'message.id = hidden."messageId"')
        .where('hidden."userId" = :viewerId', { viewerId: id })
        .andWhere('message."roomKey" = :room', { room })
        .select('hidden."messageId"', 'messageId')
        .getRawMany<{ messageId: string }>(),
    ]);
    return {
      items,
      hasMore,
      nextBefore: hasMore ? rows[limit - 1]?.id : null,
      hiddenMessageIds: hiddenRows.map(row => row.messageId),
    };
  }

  async create(id: string, dto: CreateChatMessageDto) {
    const sender = dto.kind === 'group' ? await this.eligible(id, [UserRole.STUDENT]) : await this.eligible(id, [UserRole.STUDENT, UserRole.LECTURER]);
    const hasText = typeof dto.text === 'string' && dto.text.trim().length > 0;
    const hasVoice = typeof dto.voiceKey === 'string' && dto.voiceKey.length > 0;
    const hasSticker = typeof dto.stickerId === 'string' && dto.stickerId.length > 0;
    const hasForward = typeof dto.forwardMessageId === 'string' && dto.forwardMessageId.length > 0;
    if ([hasText, hasVoice, hasSticker, hasForward].filter(Boolean).length !== 1) throw new BadRequestException('Send exactly one message, voice recording, sticker, or forwarded message.');
    if (dto.replyToMessageId && hasForward) throw new BadRequestException('A forwarded message cannot also be a reply.');
    let replyToMessage: ChatMessage | null = null;
    if (dto.replyToMessageId) {
      replyToMessage = await this.repo.findOne({ where: { id: dto.replyToMessageId } });
      if (!replyToMessage || replyToMessage.isDeleted) throw new BadRequestException('The message you are replying to is unavailable.');
      await this.assertCanViewMessage(sender, replyToMessage);
    }
    let forwardedMessage: ChatMessage | null = null;
    if (hasForward) {
      forwardedMessage = await this.repo.findOne({ where: { id: dto.forwardMessageId! } });
      if (!forwardedMessage || forwardedMessage.isDeleted) throw new BadRequestException('The message you are forwarding is unavailable.');
      await this.assertCanViewMessage(sender, forwardedMessage);
    }
    if (hasSticker && !STICKER_CATALOG.includes(dto.stickerId as typeof STICKER_CATALOG[number])) throw new BadRequestException('This sticker is not available.');
    if (dto.kind === 'group' && dto.recipientId) throw new BadRequestException('Group messages cannot specify a recipient.');

    let roomKey: string;
    if (dto.kind === 'group') roomKey = this.groupKey(sender);
    else {
      if (!dto.recipientId || dto.recipientId === id) throw new BadRequestException('Choose a recipient.');
      const recipient = await this.eligible(dto.recipientId, [UserRole.STUDENT, UserRole.LECTURER]);
      this.assertSameInstitution(sender, recipient);
      await this.assertNotBlocked(sender.id, recipient.id);
      roomKey = this.directKey(sender.id, recipient.id);
    }

    if (replyToMessage) {
      const sameConversation = replyToMessage.kind === (dto.kind === 'group' ? ChatKind.GROUP : ChatKind.DIRECT) && replyToMessage.roomKey === roomKey;
      const privateReplyToGroupSender = replyToMessage.kind === ChatKind.GROUP && dto.kind === 'direct' && replyToMessage.senderId === dto.recipientId;
      if (!sameConversation && !privateReplyToGroupSender) throw new BadRequestException('Replies must stay in the original conversation, except when replying privately to the group-message sender.');
    }

    let contentType = forwardedMessage?.contentType ?? ChatContentType.TEXT;
    let voiceKey: string | null = forwardedMessage?.voiceKey ?? null;
    let stickerId: string | null = forwardedMessage?.stickerId ?? null;
    if (forwardedMessage?.contentType === ChatContentType.TEXT && !forwardedMessage.text?.trim()) throw new BadRequestException('This message cannot be forwarded.');
    if (!forwardedMessage && hasSticker) { contentType = ChatContentType.STICKER; stickerId = dto.stickerId!; }
    if (hasVoice) {
      const key = dto.voiceKey!;
      const allowedKey = new RegExp(`^voice-messages/${id}/[0-9a-f-]{36}\\.(webm|ogg|m4a|mp3|wav)$`, 'i');
      if (!allowedKey.test(key)) throw new BadRequestException('Invalid voice recording key.');
      const stored = await this.s3.getObjectMetadata(key);
      if (!stored || !stored.contentLength || stored.contentLength > MAX_VOICE_BYTES || !stored.contentType || !Object.keys(VOICE_TYPES).includes(stored.contentType)) {
        throw new BadRequestException('The uploaded audio could not be verified or exceeds the 12 MB limit.');
      }
      const extension = key.split('.').pop();
      if (VOICE_TYPES[stored.contentType] !== extension) throw new BadRequestException('Audio file type does not match its upload key.');
      contentType = ChatContentType.VOICE;
      voiceKey = key;
    }

    const message = await this.repo.save(this.repo.create({
      kind: dto.kind === 'group' ? ChatKind.GROUP : ChatKind.DIRECT,
      roomKey, senderId: sender.id, senderHandle: sender.academicHandle!,
      contentType,
      text: forwardedMessage ? forwardedMessage.text : hasText ? dto.text!.trim() : null,
      voiceKey, stickerId,
      replyToMessageId: replyToMessage?.id ?? null,
      forwardedFromMessageId: forwardedMessage?.id ?? null,
    }));
    this.publishRoom(roomKey);

    if (dto.kind === 'direct' && dto.recipientId) {
      const preview = forwardedMessage
        ? forwardedMessage.contentType === ChatContentType.TEXT ? (forwardedMessage.text ?? 'Forwarded message').slice(0, 140) : forwardedMessage.contentType === ChatContentType.VOICE ? 'Forwarded a voice message' : 'Forwarded a sticker'
        : hasText
          ? dto.text!.trim().slice(0, 140)
          : hasVoice
            ? 'Sent a voice message'
            : 'Sent a sticker';

      try {
        await this.notifications.createNotification(
          dto.recipientId,
          'chat_message',
          `New message from @${sender.academicHandle}`,
          preview,
          `/messages?userId=${encodeURIComponent(sender.id)}`,
        );
      } catch {
        // A notification failure must not undo or fail a successfully stored chat message.
      }
    }

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
    message.text = text.trim(); message.editedAt = new Date();
    const saved = await this.repo.save(message);
    this.publishRoom(saved.roomKey);
    return this.present(saved, id);
  }

  async remove(id: string, messageId: string) {
    await this.eligible(id, [UserRole.STUDENT, UserRole.LECTURER]);
    const message = await this.repo.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found.');
    if (message.senderId !== id) throw new ForbiddenException('You can only delete your own messages.');
    message.isDeleted = true; message.text = null; message.voiceKey = null; message.stickerId = null;
    await this.repo.save(message);
    this.publishRoom(message.roomKey);
    return { success: true, id: message.id };
  }

  async hideDeletedMessage(userId: string, messageId: string) {
    const user = await this.eligible(userId, [UserRole.STUDENT, UserRole.LECTURER]);
    const message = await this.repo.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found.');
    if (!message.isDeleted) throw new BadRequestException('Only deleted messages can be removed from your chat.');
    await this.assertCanViewMessage(user, message);

    const existing = await this.messageHides.findOne({ where: { userId, messageId } });
    if (!existing) {
      await this.messageHides.save(this.messageHides.create({ userId, messageId }));
    }

    this.publishRoom(message.roomKey);
    return { success: true, id: message.id };
  }

  private async present(message: ChatMessage, viewerId: string) {
    const voiceUrl = !message.isDeleted && message.contentType === ChatContentType.VOICE && message.voiceKey
      ? await this.s3.createPresignedDownloadUrl(message.voiceKey, undefined, 'inline', 300)
      : null;
    const quoteId = message.replyToMessageId ?? message.forwardedFromMessageId ?? null;
    const quoted = quoteId ? await this.repo.findOne({ where: { id: quoteId } }) : null;
    const quotedMessage = quoted ? { id: quoted.id, senderHandle: quoted.senderHandle, contentType: quoted.contentType, text: quoted.isDeleted ? null : quoted.text ?? null, stickerId: quoted.isDeleted ? null : quoted.stickerId ?? null, isDeleted: quoted.isDeleted } : null;
    return {
      id: message.id, kind: message.kind, senderId: message.senderId, senderHandle: message.senderHandle,
      contentType: message.contentType, text: message.isDeleted ? null : message.text,
      voiceUrl, stickerId: message.isDeleted ? null : message.stickerId ?? null, isDeleted: message.isDeleted, editedAt: message.editedAt,
      replyToMessageId: message.replyToMessageId ?? null, forwardedFromMessageId: message.forwardedFromMessageId ?? null, quotedMessage,
      createdAt: message.createdAt, updatedAt: message.updatedAt, isOwn: message.senderId === viewerId,
    };
  }
}