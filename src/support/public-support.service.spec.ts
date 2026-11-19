import { BadRequestException } from '@nestjs/common';
import { SupportService } from './support.service';
import { UserRole } from '../users/entities/user.entity';

describe('Public support ticket verification', () => {
  let requests: any;
  let users: any;
  let notifications: any;
  let supportEmail: any;
  let service: SupportService;

  beforeEach(() => {
    requests = {
      create: jest.fn(value => value),
      query: jest.fn().mockResolvedValue([{ value: 12 }]),
      save: jest.fn(async value => value),
      createQueryBuilder: jest.fn(),
    };
    users = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([{ id: 'support-1' }]),
    };
    notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    supportEmail = {
      sendGuestVerification: jest.fn().mockResolvedValue(undefined),
      notifyNewGuestRequest: jest.fn().mockResolvedValue(true),
      sendGuestResolution: jest.fn().mockResolvedValue(true),
    };
    service = new SupportService(requests, users, notifications, {} as any, supportEmail);
  });

  it('creates an unlinked guest ticket and sends a one-time verification link without account lookup', async () => {
    const result = await service.createPublic({
      name: 'Guest User',
      email: ' Guest@Example.test ',
      institution: 'Example University',
      category: 'technical',
      subject: 'Cannot open a page',
      description: 'The page returns an error when I open it.',
      links: ['https://sophiscentral.vercel.app/contact'],
    } as any);

    const saved = requests.save.mock.calls[0][0];
    expect(saved.userId).toBeNull();
    expect(saved.senderEmail).toBe('guest@example.test');
    expect(saved.emailVerifiedAt).toBeNull();
    expect(saved.emailVerificationTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.emailVerificationExpiresAt).toBeInstanceOf(Date);
    expect(supportEmail.sendGuestVerification).toHaveBeenCalledWith(saved, expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(users.findOne).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.message).not.toContain('registered');
  });

  it('requires a valid, unexpired verification token before exposing the ticket to Support', async () => {
    const request: any = {
      id: 'request-1',
      ticketNumber: 'SUP-2026-000012',
      senderEmail: 'guest@example.test',
      emailVerificationExpiresAt: new Date(Date.now() + 60_000),
      emailVerificationTokenHash: 'hash',
      userId: null,
      status: 'pending',
    };
    const query = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(request),
    };
    requests.createQueryBuilder.mockReturnValue(query);

    const result = await service.verifyPublicEmail('a'.repeat(64));

    expect(query.addSelect).toHaveBeenCalledWith(['request.emailVerificationTokenHash', 'request.emailVerificationExpiresAt']);
    expect(request.emailVerifiedAt).toBeInstanceOf(Date);
    expect(request.emailVerificationTokenHash).toBe('hash');
    expect(request.emailVerificationExpiresAt).toBeNull();
    expect(supportEmail.notifyNewGuestRequest).toHaveBeenCalledWith(request);
    expect(result.ticketNumber).toBe('SUP-2026-000012');

    const repeated = await service.verifyPublicEmail('a'.repeat(64));
    expect(repeated.ticketNumber).toBe(result.ticketNumber);
    expect(supportEmail.notifyNewGuestRequest).toHaveBeenCalledTimes(1);
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
  });

  it('links a public ticket to a verified student account only after email ownership is proven', async () => {
    const account = {
      id: 'student-1',
      email: 'guest@example.test',
      emailVerified: true,
      role: UserRole.STUDENT,
      isSuspended: false,
      accountStatus: 'active',
      firstName: 'Ada',
      lastName: 'Student',
      institution: 'Example University',
    };
    users.findOne.mockResolvedValue(account);
    const request: any = {
      id: 'request-1',
      ticketNumber: 'SUP-2026-000013',
      senderEmail: account.email,
      senderName: 'Submitted Name',
      emailVerificationExpiresAt: new Date(Date.now() + 60_000),
      emailVerificationTokenHash: 'hash',
      userId: null,
      status: 'pending',
    };
    const query = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(request),
    };
    requests.createQueryBuilder.mockReturnValue(query);

    await service.verifyPublicEmail('b'.repeat(64));

    expect(request.userId).toBe(account.id);
    expect(request.senderName).toBe('Ada Student');
    expect(request.senderAccountType).toBe(UserRole.STUDENT);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      account.id,
      'support_request_submitted',
      'Your support request was submitted',
      expect.stringContaining(request.ticketNumber),
      '/my-activity',
    );
  });

  it('rejects malformed or expired verification links', async () => {
    await expect(service.verifyPublicEmail('bad-token')).rejects.toBeInstanceOf(BadRequestException);
    const query = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ emailVerificationExpiresAt: new Date(Date.now() - 1) }),
    };
    requests.createQueryBuilder.mockReturnValue(query);
    await expect(service.verifyPublicEmail('c'.repeat(64))).rejects.toBeInstanceOf(BadRequestException);
  });
});
