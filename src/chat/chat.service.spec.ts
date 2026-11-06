import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatContentType, ChatKind } from './entities/chat-message.entity';
import { UserRole } from '../users/entities/user.entity';
import { firstValueFrom, Subject } from 'rxjs';

describe('ChatService access and message rules', () => {
  let service: ChatService;
  let repo: any;
  let blocks: any;
  let reads: any;
  let users: any;
  let s3: any;
  let redis: any;
  let notifications: any;
  let redisEvents: Subject<{ roomKey: string }>;
  let onlineUsers: Set<string>;

  const student = {
    id: 'student-1',
    role: UserRole.STUDENT,
    isSuspended: false,
    academicHandle: 'learner',
    institution: 'Example University',
    faculty: 'Science',
    department: 'Biology',
  };

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      count: jest.fn(async () => 0),
      save: jest.fn(async value => value),
      create: jest.fn(value => value),
      createQueryBuilder: jest.fn(),
    };
    blocks = {
      findOne: jest.fn(async () => null),
      find: jest.fn(async () => []),
      save: jest.fn(async value => value),
      create: jest.fn(value => value),
      delete: jest.fn(async () => ({ affected: 1 })),
    };
    reads = {
      findOne: jest.fn(async () => null),
      save: jest.fn(async value => value),
      create: jest.fn(value => value),
    };
    users = {
      findOne: jest.fn(async id => id === student.id ? { ...student } : null),
      findChatContacts: jest.fn(async () => []),
    };
    s3 = {
      createPresignedUploadUrl: jest.fn(async (key, contentType) => ({ url: 'https://upload.invalid', key, contentType })),
      getObjectMetadata: jest.fn(),
      createPresignedDownloadUrl: jest.fn(),
    };
    redisEvents = new Subject<{ roomKey: string }>();
    onlineUsers = new Set<string>();
    redis = {
      events$: redisEvents.asObservable(),
      publishRoom: jest.fn(async (roomKey: string) => { redisEvents.next({ roomKey }); }),
      setPresence: jest.fn(async (id: string) => { onlineUsers.add(id); }),
      isOnline: jest.fn(async (id: string) => onlineUsers.has(id)),
    };
    notifications = { createNotification: jest.fn(async () => ({})) };
    service = new ChatService(repo, blocks, reads, users, s3, redis, notifications);
  });

  it('notifies subscribers in the authenticated student group when a message is created', async () => {
    const events = service.eventStream(student as unknown as import('../users/entities/user.entity').User);
    const nextEvent = firstValueFrom(events);

    await service.create(student.id, { kind: 'group', text: 'Hello group' } as any);

    await expect(nextEvent).resolves.toEqual({ data: { type: 'refresh' } });
  });

  it('records an authenticated heartbeat and reports the contact as online', async () => {
    users.findChatContacts.mockResolvedValue([
      { id: 'student-2', academicHandle: 'reader2', role: UserRole.STUDENT },
    ]);
    await service.heartbeat(student.id);
    await expect(service.presence(student.id)).resolves.toEqual([
      { id: 'student-2', online: false },
    ]);
    users.findOne.mockImplementation(async id => id === student.id
      ? { ...student }
      : id === 'student-2' ? { ...student, id: 'student-2' } : null);
    await service.heartbeat('student-2');
    await expect(service.presence(student.id)).resolves.toEqual([
      { id: 'student-2', online: true },
    ]);
  });

  it('rejects presence heartbeats for ineligible accounts', async () => {
    users.findOne.mockResolvedValue({ ...student, role: UserRole.MODERATOR });
    await expect(service.heartbeat(student.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects group history for lecturers and other non-student roles', async () => {
    users.findOne.mockResolvedValueOnce({ ...student, role: UserRole.LECTURER });
    await expect(service.history('student-1', 'group')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('derives group history scope from the authenticated student profile', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    };
    repo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.history(student.id, 'group');

    expect(qb.where).toHaveBeenCalledWith('message.roomKey = :room', {
      room: 'group:example university:science:biology',
    });
    expect(result).toEqual({ items: [], hasMore: false, nextBefore: null });
  });

  it('rejects attempts to edit another user\'s message', async () => {
    repo.findOne.mockResolvedValue({
      id: 'message-1',
      senderId: 'someone-else',
      contentType: ChatContentType.TEXT,
      isDeleted: false,
      createdAt: new Date(),
    });

    await expect(service.edit(student.id, 'message-1', 'Changed')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects voice uploads with unsupported MIME types', async () => {
    await expect(service.createVoiceUpload(student.id, {
      mimetype: 'video/mp4',
      size: 1000,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(s3.createPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('creates a short-lived upload for a supported voice recording', async () => {
    const result = await service.createVoiceUpload(student.id, {
      mimetype: 'audio/webm',
      size: 1024,
    });

    expect(s3.createPresignedUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^voice-messages\/student-1\/[0-9a-f-]{36}\.webm$/i),
      'audio/webm',
      300,
    );
    expect(result).toMatchObject({
      uploadUrl: 'https://upload.invalid',
      contentType: 'audio/webm',
      expiresIn: 300,
      maxBytes: 12 * 1024 * 1024,
    });
  });

  it('rejects direct history when the other account is not eligible', async () => {
    users.findOne.mockImplementation(async id => id === student.id ? { ...student } : null);
    await expect(service.history(student.id, 'direct', 'unknown-user')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('derives a direct room key from both authenticated participant IDs', async () => {
    const recipient = { ...student, id: 'student-2', academicHandle: 'reader2' };
    users.findOne.mockImplementation(async id => id === student.id ? { ...student } : id === recipient.id ? recipient : null);
    const qb = {
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(), getMany: jest.fn(async () => []),
    };
    repo.createQueryBuilder.mockReturnValue(qb);
    await service.history(student.id, 'direct', recipient.id);
    expect(qb.where).toHaveBeenCalledWith('message.roomKey = :room', { room: 'direct:student-1:student-2' });
  });

  it('only allows the sender to delete a message', async () => {
    repo.findOne.mockResolvedValue({ id: 'message-3', senderId: 'someone-else' });
    await expect(service.remove(student.id, 'message-3')).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('soft-deletes the sender\'s own message and clears its content', async () => {
    const message = { id: 'message-4', senderId: student.id, text: 'hello', voiceKey: null, isDeleted: false };
    repo.findOne.mockResolvedValue(message);
    await expect(service.remove(student.id, 'message-4')).resolves.toEqual({ success: true, id: 'message-4' });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isDeleted: true, text: null, voiceKey: null, stickerId: null }));
  });

  it('rejects an edit after the 15-minute window', async () => {
    repo.findOne.mockResolvedValue({
      id: 'message-2',
      senderId: student.id,
      contentType: ChatContentType.TEXT,
      isDeleted: false,
      createdAt: new Date(Date.now() - 16 * 60 * 1000),
    });

    await expect(service.edit(student.id, 'message-2', 'Too late')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a voice key belonging to another account before checking storage', async () => {
    await expect(service.create(student.id, {
      kind: 'group' as any,
      voiceKey: 'voice-messages/another-user/123e4567-e89b-12d3-a456-426614174000.webm',
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(s3.getObjectMetadata).not.toHaveBeenCalled();
  });

  it('rejects voice objects that exceed the size limit', async () => {
    s3.getObjectMetadata.mockResolvedValue({ contentLength: 12 * 1024 * 1024 + 1, contentType: 'audio/webm' });
    await expect(service.create(student.id, {
      kind: 'group' as any,
      voiceKey: 'voice-messages/student-1/123e4567-e89b-12d3-a456-426614174000.webm',
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects voice objects whose MIME type does not match the key extension', async () => {
    s3.getObjectMetadata.mockResolvedValue({ contentLength: 1024, contentType: 'audio/ogg' });
    await expect(service.create(student.id, {
      kind: 'group' as any,
      voiceKey: 'voice-messages/student-1/123e4567-e89b-12d3-a456-426614174000.webm',
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('uses both timestamp and message ID for stable pagination cursors', async () => {
    const cursorDate = new Date('2026-11-01T10:00:00.000Z');
    repo.findOne.mockResolvedValue({ id: 'cursor-id', roomKey: 'group:example university:science:biology', createdAt: cursorDate });
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    };
    repo.createQueryBuilder.mockReturnValue(qb);

    await service.history(student.id, 'group', undefined, '20', 'cursor-id');

    expect(qb.andWhere).toHaveBeenCalledWith(
      '(message.createdAt < :date OR (message.createdAt = :date AND message.id < :cursorId))',
      { date: cursorDate, cursorId: 'cursor-id' },
    );
    expect(qb.orderBy).toHaveBeenCalledWith('message.createdAt', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('message.id', 'DESC');
  });


  it('accepts only an approved sticker ID and persists a sticker message', async () => {
    const saved = { id: 'sticker-message', kind: ChatKind.GROUP, roomKey: 'group:example university:science:biology', senderId: student.id, senderHandle: student.academicHandle, contentType: ChatContentType.STICKER, text: null, voiceKey: null, stickerId: 'celebrate', createdAt: new Date(), updatedAt: new Date(), isDeleted: false };
    repo.create.mockReturnValue(saved);
    repo.save.mockResolvedValue(saved);
    await expect(service.create(student.id, { kind: 'group', stickerId: 'celebrate' } as any))
      .resolves.toMatchObject({ contentType: ChatContentType.STICKER, stickerId: 'celebrate' });
  });

  it('rejects unapproved sticker IDs', async () => {
    await expect(service.create(student.id, { kind: 'group', stickerId: 'https://example.invalid/sticker.gif' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });


  it('rejects private DM history when either participant has blocked the other', async () => {
    const recipient = { ...student, id: 'student-2', academicHandle: 'reader2' };
    users.findOne.mockImplementation(async id => id === student.id ? { ...student } : id === recipient.id ? recipient : null);
    blocks.findOne.mockResolvedValue({ userId: recipient.id, blockedUserId: student.id });

    await expect(service.history(student.id, 'direct', recipient.id))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects sending a private DM when either participant has blocked the other', async () => {
    const recipient = { ...student, id: 'student-2', academicHandle: 'reader2' };
    users.findOne.mockImplementation(async id => id === student.id ? { ...student } : id === recipient.id ? recipient : null);
    blocks.findOne.mockResolvedValue({ userId: student.id, blockedUserId: recipient.id });

    await expect(service.create(student.id, {
      kind: 'direct',
      recipientId: recipient.id,
      text: 'Hello',
    } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('does not apply private DM blocks to Group Chat', async () => {
    blocks.findOne.mockResolvedValue({ userId: student.id, blockedUserId: 'student-2' });
    const saved = {
      id: 'group-message',
      kind: ChatKind.GROUP,
      roomKey: 'group:example university:science:biology',
      senderId: student.id,
      senderHandle: student.academicHandle,
      contentType: ChatContentType.TEXT,
      text: 'Hello group',
      voiceKey: null,
      stickerId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };
    repo.create.mockReturnValue(saved);
    repo.save.mockResolvedValue(saved);

    await expect(service.create(student.id, { kind: 'group', text: 'Hello group' } as any))
      .resolves.toMatchObject({ text: 'Hello group' });
    expect(blocks.findOne).not.toHaveBeenCalled();
  });


  it('creates a persistent notification for the recipient of a private message', async () => {
    const recipient = { ...student, id: 'student-2', academicHandle: 'reader2' };
    users.findOne.mockImplementation(async id =>
      id === student.id ? { ...student } : id === recipient.id ? recipient : null,
    );

    const saved = {
      id: 'direct-message',
      kind: ChatKind.DIRECT,
      roomKey: 'direct:student-1:student-2',
      senderId: student.id,
      senderHandle: student.academicHandle,
      contentType: ChatContentType.TEXT,
      text: 'Hello there',
      voiceKey: null,
      stickerId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };
    repo.create.mockReturnValue(saved);
    repo.save.mockResolvedValue(saved);

    await service.create(student.id, {
      kind: 'direct',
      recipientId: recipient.id,
      text: 'Hello there',
    } as any);

    expect(notifications.createNotification).toHaveBeenCalledWith(
      recipient.id,
      'chat_message',
      'New message from @learner',
      'Hello there',
      '/messages?userId=student-1',
    );
  });

  it('returns recent private conversations with unread message counts', async () => {
    users.findChatContacts.mockResolvedValue([
      { id: 'student-2', academicHandle: 'reader2', role: UserRole.STUDENT },
    ]);
    repo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => []),
    });
    const createdAt = new Date('2026-11-06T10:00:00.000Z');
    repo.findOne.mockResolvedValue({
      id: 'latest-message',
      roomKey: 'direct:student-1:student-2',
      kind: ChatKind.DIRECT,
      senderId: 'student-2',
      senderHandle: 'reader2',
      contentType: ChatContentType.TEXT,
      text: 'Are you available?',
      createdAt,
      isDeleted: false,
    });
    reads.findOne.mockResolvedValue(null);
    repo.count.mockResolvedValue(2);

    const result = await service.inbox(student.id);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      contact: { id: 'student-2', academicHandle: 'reader2' },
      lastMessage: {
        id: 'latest-message',
        preview: 'Are you available?',
        isOwn: false,
      },
      unreadCount: 2,
    });
  });

  it('persists the latest message timestamp when a private conversation is read', async () => {
    const recipient = { ...student, id: 'student-2', academicHandle: 'reader2' };
    users.findOne.mockImplementation(async id =>
      id === student.id ? { ...student } : id === recipient.id ? recipient : null,
    );
    const createdAt = new Date('2026-11-06T10:30:00.000Z');
    repo.findOne.mockResolvedValue({ roomKey: 'direct:student-1:student-2', createdAt });

    const result = await service.markDirectRead(student.id, recipient.id);

    expect(reads.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: student.id,
      roomKey: 'direct:student-1:student-2',
      lastReadAt: createdAt,
    }));
    expect(result).toEqual({ success: true, lastReadAt: createdAt });
  });

});
