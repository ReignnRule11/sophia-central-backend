import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatContentType, ChatKind } from './entities/chat-message.entity';
import { UserRole } from '../users/entities/user.entity';

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

  it('rejects group history for lecturers and other non-student roles', async () => {
    users.findOne.mockResolvedValueOnce({ ...student, role: UserRole.LECTURER });
    await expect(service.history('student-1', 'group')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('derives group history scope from the authenticated student profile', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
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
});
