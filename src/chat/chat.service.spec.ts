import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatContentType, ChatKind } from './entities/chat-message.entity';
import { UserRole } from '../users/entities/user.entity';
import { firstValueFrom } from 'rxjs';

describe('ChatService access and message rules', () => {
  let service: ChatService;
  let repo: any;
  let users: any;
  let s3: any;

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
      save: jest.fn(async value => value),
      create: jest.fn(value => value),
      createQueryBuilder: jest.fn(),
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
    service = new ChatService(repo, users, s3);
  });

  it('notifies subscribers in the authenticated student group when a message is created', async () => {
    const events = service.eventStream(student as unknown as import('../users/entities/user.entity').User);
    const nextEvent = firstValueFrom(events);

    await service.create(student.id, { kind: 'group', text: 'Hello group' } as any);

    await expect(nextEvent).resolves.toEqual({ data: { type: 'refresh' } });
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
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isDeleted: true, text: null, voiceKey: null }));
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

});
