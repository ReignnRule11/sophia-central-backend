import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { SupportService } from './support.service';
import { UserRole } from '../users/entities/user.entity';

describe('SupportService attachment ownership', () => {
  const user = { id: 'student-1', role: UserRole.STUDENT } as any;
  const reference = 'https://files.example.test/support-attachments/student-1/image.jpg';
  let requests: any;
  let s3: any;
  let notifications: any;
  let service: SupportService;

  beforeEach(() => {
    requests = {
      create: jest.fn(value => value),
      query: jest.fn().mockResolvedValue([{ value: 1 }]),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async value => ({ id: 'request-1', ...value })),
    };
    s3 = {
      getKeyFromPublicUrl: jest.fn(value => {
        if (value === reference || value === 'support-attachments/student-1/image.jpg') return 'support-attachments/student-1/image.jpg';
        if (value === 'https://files.example.test/support-attachments/other-user/image.jpg') {
          return 'support-attachments/other-user/image.jpg';
        }
        return null;
      }),
      getObjectMetadata: jest.fn().mockResolvedValue({
        contentLength: 1024,
        contentType: 'image/jpeg',
      }),
      createPresignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example.test/support-image'),
    };
    notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    service = new SupportService(
      requests,
      { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) } as any,
      notifications,
      s3,
      { notifyNewRequest: jest.fn().mockResolvedValue(false), notifyGuestRequest: jest.fn().mockResolvedValue(true), sendResolution: jest.fn().mockResolvedValue(false), sendGuestResolution: jest.fn().mockResolvedValue(true) } as any,
    );
  });

  it('persists public Contact Us enquiries as guest support tickets', async () => {
    const result = await service.createGuestContact({
      name: 'Guest Requester',
      email: 'guest@example.com',
      category: 'general',
      subject: 'Public enquiry',
      message: 'Please help me understand the platform.',
    });

    expect(result.success).toBe(true);
    expect(result.ticketNumber).toBe('SUP-2026-000001');
    expect(requests.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: null,
      requesterType: 'guest',
      senderName: 'Guest Requester',
      senderEmail: 'guest@example.com',
      senderAccountType: 'guest',
      subject: 'Public enquiry',
      status: 'pending',
    }));
  });

  it('notifies the registered requester after a support ticket is successfully saved', async () => {
    const result = await service.create(user, {
      subject: 'Help with my account',
      category: 'technical',
      description: 'I need help accessing my account.',
      attachments: [],
    } as any);

    expect(result.ticketNumber).toBe('SUP-2026-000001');
    expect(notifications.createNotification).toHaveBeenCalledWith(
      user.id,
      'support_request_submitted',
      'Your support request was submitted',
      expect.stringContaining(result.ticketNumber),
      '/my-activity',
    );
  });

  it('accepts only an existing attachment uploaded under the submitting account prefix', async () => {
    const result = await service.create(user, {
      subject: 'Help',
      category: 'technical',
      description: 'Please help.',
      attachments: [reference],
    } as any);

    expect(result.attachments).toEqual(['https://signed.example.test/support-image']);
    expect(s3.getObjectMetadata).toHaveBeenCalledWith('support-attachments/student-1/image.jpg');
  });

  it('does not expose untrusted external attachment URLs in ticket history', async () => {
    requests.find.mockResolvedValueOnce([{
      id: 'request-legacy',
      userId: user.id,
      attachments: ['https://untrusted.example.test/private-image.jpg'],
    }]);
    const result = await service.listMineForActivity(user.id);
    expect(result[0].attachments).toEqual([]);
    expect(s3.createPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('rejects an attachment belonging to another account', async () => {
    await expect(service.create(user, {
      subject: 'Help',
      category: 'technical',
      description: 'Please help.',
      attachments: ['https://files.example.test/support-attachments/other-user/image.jpg'],
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(requests.save).not.toHaveBeenCalled();
  });

  it('rejects a missing or unsupported attachment object', async () => {
    s3.getObjectMetadata.mockResolvedValueOnce(null);
    await expect(service.create(user, {
      subject: 'Help',
      category: 'technical',
      description: 'Please help.',
      attachments: [reference],
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(requests.save).not.toHaveBeenCalled();
  });
  it('loads Admin escalations through mapped repository fields and relations', async () => {
    const admin = { id: 'admin-1', role: UserRole.ADMIN, isSuspended: false, accountStatus: 'active', emailVerified: true } as any;
    const escalated = { id: 'ticket-1', ticketNumber: 'SUP-2026-000001', escalatedToRole: 'admin', escalatedAt: new Date(), attachments: [] };
    requests.find.mockResolvedValueOnce([escalated]);
    requests.query.mockResolvedValueOnce([]);

    const result = await service.listAdminEscalations(admin);

    expect(result).toEqual([{ ...escalated, adminDecision: null, adminDecisionHistory: [] }]);
    expect(requests.find).toHaveBeenCalledWith({
      where: { escalatedToRole: 'admin' },
      relations: ['user', 'reviewer'],
      order: { escalatedAt: 'DESC' },
      take: 100,
    });
  });

  it('keeps the Admin escalation queue available when a private attachment cannot be signed', async () => {
    const admin = { id: 'admin-1', role: UserRole.ADMIN, isSuspended: false, accountStatus: 'active', emailVerified: true } as any;
    const escalated = {
      id: 'ticket-2',
      ticketNumber: 'SUP-2026-000002',
      escalatedToRole: 'admin',
      escalatedAt: new Date(),
      attachments: ['support-attachments/student-1/image.jpg'],
    };
    requests.find.mockResolvedValueOnce([escalated]);
    s3.createPresignedDownloadUrl.mockRejectedValueOnce(new Error('Storage temporarily unavailable'));

    const result = await service.listAdminEscalations(admin);

    expect(result).toHaveLength(1);
    expect(result[0].attachments).toEqual([]);
  });

  describe('service-level Support authorization', () => {
    const nonSupport = { id: 'student-1', role: UserRole.STUDENT, isSuspended: false, accountStatus: 'active', emailVerified: true } as any;
    const inactiveSupport = { id: 'support-1', role: UserRole.SUPPORT, isSuspended: false, accountStatus: 'deactivated', emailVerified: true } as any;

    it('rejects non-Support actors from the moderation queue', async () => {
      await expect(service.listForModeration(nonSupport)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects inactive Support actors from status changes', async () => {
      await expect(service.updateStatus('ticket-1', inactiveSupport, 'under_review')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects non-Support actors from concluding tickets', async () => {
      await expect(service.conclude('ticket-1', nonSupport, { resolutionMessage: 'A sufficiently long resolution message.' } as any)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects Moderator escalation so Moderators do not enter the Support workflow', async () => {
      const activeSupport = { id: 'support-1', role: UserRole.SUPPORT, isSuspended: false, accountStatus: 'active', emailVerified: true } as any;
      await expect(service.escalate('ticket-1', activeSupport, UserRole.MODERATOR, 'Escalation reason')).rejects.toBeInstanceOf(BadRequestException);
    });


    it('rejects duplicate Admin escalations for a ticket', async () => {
      const activeSupport = { id: 'support-1', role: UserRole.SUPPORT, isSuspended: false, accountStatus: 'active', emailVerified: true } as any;
      requests.findOne.mockResolvedValueOnce({ id: 'ticket-1', ticketNumber: 'SUP-2026-000001', subject: 'Test', category: 'technical', description: 'Issue', escalatedToRole: 'admin' });
      await expect(service.escalate('ticket-1', activeSupport, UserRole.ADMIN, 'Escalation reason')).rejects.toBeInstanceOf(ConflictException);
      expect(requests.save).not.toHaveBeenCalled();
    });

    it('rejects inactive Support actors from escalating tickets', async () => {
      await expect(service.escalate('ticket-1', inactiveSupport, UserRole.ADMIN, 'Escalation reason')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

});
