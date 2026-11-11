import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { UserRole } from '../users/entities/user.entity';

describe('ReferralService hybrid reward eligibility', () => {
  let referrals: any;
  let users: any;
  let points: any;
  let service: ReferralService;
  let placementResults: any[];

  beforeEach(() => {
    placementResults = [];
    referrals = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(value => value),
      save: jest.fn(async value => ({ id: 'event-1', createdAt: new Date(), ...value })),
      manager: {
        query: jest.fn(async () => placementResults.shift() ?? []),
        transaction: jest.fn(async callback => callback({
          findOne: jest.fn()
            .mockResolvedValueOnce({
              id: 'student-2', email: 'new@example.com', role: UserRole.STUDENT,
              emailVerified: true, isProfileComplete: false,
            })
            .mockResolvedValueOnce(null),
          create: jest.fn((_entity, value) => value),
          save: jest.fn(async (_entity, value) => ({ id: 'event-1', createdAt: new Date(), ...value })),
        })),
      },
    };
    users = { findOne: jest.fn() };
    points = { awardReferralReward: jest.fn().mockResolvedValue(undefined) };
    service = new ReferralService(referrals, users, points);
    process.env.APP_URL = 'https://sophiscentral.vercel.app';
  });

  it('returns the existing permanent code and does not regenerate it', async () => {
    users.findOne.mockResolvedValue({ id: 'student-1', role: UserRole.STUDENT, isSuspended: false });
    referrals.findOne.mockResolvedValue({
      id: 'owner-row', referrerId: 'student-1', code: 'QZPSNUNK', isActive: true, isCodeOwnerRecord: true,
    });
    await expect(service.generateReferralCode('student-1')).resolves.toEqual({
      code: 'QZPSNUNK',
      link: 'https://sophiscentral.vercel.app/onboarding?ref=QZPSNUNK',
    });
    expect(referrals.save).not.toHaveBeenCalled();
  });

  it('records a cross-institution referral as pending without awarding on email verification alone', async () => {
    const ownerRecord = {
      id: 'owner-row', referrerId: 'referrer-1', code: 'QZPSNUNK', isActive: true,
      isCodeOwnerRecord: true, referrer: {
        id: 'referrer-1', email: 'owner@example.com', role: UserRole.STUDENT, isSuspended: false,
        institution: 'University A',
      },
    };
    referrals.findOne
      .mockResolvedValueOnce(ownerRecord)
      .mockResolvedValueOnce({
        id: 'event-1', referrerId: 'referrer-1', referredUserId: 'student-2',
        rewardStatus: 'pending', isCodeOwnerRecord: false,
        referredUser: { id: 'student-2', role: UserRole.STUDENT, emailVerified: true, isProfileComplete: false },
      });
    const response = await service.redeemReferral('qzpsnunk', {
      id: 'student-2', email: 'new@example.com', role: UserRole.STUDENT,
    } as any);

    expect(response.message).toContain('completes academic onboarding');
    expect(points.awardReferralReward).not.toHaveBeenCalled();
  });

  it('awards only after email verification and complete academic placement', async () => {
    placementResults = [[{ id: 'institution-1' }], [{ id: 'faculty-1' }], [{ id: 'department-1' }]];
    referrals.findOne.mockResolvedValue({
      id: 'event-1', referrerId: 'referrer-1', rewardStatus: 'pending',
      referredUser: {
        id: 'student-2', role: UserRole.STUDENT, emailVerified: true, isProfileComplete: true,
        isSuspended: false, institution: 'University B', faculty: 'Science', department: 'Biology', programme: 'B.Sc. Biology',
      },
      referrer: { id: 'referrer-1', role: UserRole.STUDENT, isSuspended: false, institution: 'University A' },
    });
    await service.processPendingReferralForUser('student-2');
    expect(points.awardReferralReward).toHaveBeenCalledWith('referrer-1', 'event-1', 20);
  });

  it('keeps unlisted manual academic placement pending without moderator review', async () => {
    const event: any = {
      id: 'event-2', rewardStatus: 'pending', referrerId: 'referrer-1',
      referredUser: {
        id: 'student-3', role: UserRole.STUDENT, emailVerified: true, isProfileComplete: true,
        isSuspended: false, institution: 'New Institution', faculty: 'School of Computing',
        department: 'Software Engineering', programme: 'B.Sc. Software Engineering',
      },
      referrer: { id: 'referrer-1', role: UserRole.STUDENT, isSuspended: false },
    };
    referrals.findOne.mockResolvedValue(event);

    await service.processPendingReferralForUser('student-3');

    expect(event.rewardStatus).toBe('pending');
    expect(referrals.save).not.toHaveBeenCalled();
    expect(points.awardReferralReward).not.toHaveBeenCalled();
  });

  it('keeps a verified referral pending until the referred student supplies a programme', async () => {
    const event = {
      id: 'event-1', rewardStatus: 'pending', referrerId: 'referrer-1',
      referredUser: {
        id: 'student-2', role: UserRole.STUDENT, emailVerified: true, isProfileComplete: true,
        isSuspended: false, institution: 'University B', faculty: 'Science', department: 'Biology',
      },
      referrer: { id: 'referrer-1', role: UserRole.STUDENT, isSuspended: false },
    };
    referrals.findOne.mockResolvedValue(event);
    await service.processPendingReferralForUser('student-2');
    expect(event.rewardStatus).toBe('pending');
    expect(referrals.save).not.toHaveBeenCalled();
    expect(points.awardReferralReward).not.toHaveBeenCalled();
  });

  it('does not award a referral if either account is suspended and moves it to review', async () => {
    const event = {
      id: 'event-1', rewardStatus: 'pending', referrerId: 'referrer-1',
      referredUser: {
        id: 'student-2', role: UserRole.STUDENT, emailVerified: true, isProfileComplete: true,
        isSuspended: true, institution: 'University B', faculty: 'Science', department: 'Biology', programme: 'B.Sc. Biology',
      },
      referrer: { id: 'referrer-1', role: UserRole.STUDENT, isSuspended: false },
    };
    referrals.findOne.mockResolvedValue(event);
    await service.processPendingReferralForUser('student-2');
    expect(event.rewardStatus).toBe('under_review');
    expect(referrals.save).toHaveBeenCalledWith(event);
    expect(points.awardReferralReward).not.toHaveBeenCalled();
  });

  it('rejects duplicate referral attribution for the same student', async () => {
    referrals.findOne.mockResolvedValue({
      id: 'owner-row', referrerId: 'referrer-1', code: 'QZPSNUNK', isActive: true,
      isCodeOwnerRecord: true, referrer: {
        id: 'referrer-1', email: 'owner@example.com', role: UserRole.STUDENT, isSuspended: false,
      },
    });
    referrals.manager.transaction.mockImplementation(async callback => callback({
      findOne: jest.fn()
        .mockResolvedValueOnce({ id: 'student-2', role: UserRole.STUDENT })
        .mockResolvedValueOnce({ id: 'existing-event', referredUserId: 'student-2' }),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(),
    }));
    await expect(service.redeemReferral('QZPSNUNK', {
      id: 'student-2', email: 'new@example.com', role: UserRole.STUDENT,
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(points.awardReferralReward).not.toHaveBeenCalled();
  });

  it('continues to restrict referral code generation to active student accounts', async () => {
    users.findOne.mockResolvedValue({ id: 'lecturer-1', role: UserRole.LECTURER, isSuspended: false });
    await expect(service.generateReferralCode('lecturer-1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
