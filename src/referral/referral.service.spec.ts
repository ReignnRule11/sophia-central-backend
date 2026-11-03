import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { UserRole } from '../users/entities/user.entity';

describe('ReferralService permanent codes', () => {
  let referrals: any;
  let users: any;
  let points: any;
  let service: ReferralService;

  beforeEach(() => {
    referrals = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(value => value),
      save: jest.fn(async value => ({ id: 'event-1', createdAt: new Date(), ...value })),
    };
    users = { findOne: jest.fn() };
    points = { awardReferralReward: jest.fn().mockResolvedValue(undefined) };
    service = new ReferralService(referrals, users, points);
    process.env.APP_URL = 'https://sophiscentral.vercel.app';
  });

  it('returns the existing permanent code instead of generating a replacement', async () => {
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

  it('creates a separate redemption event and leaves the permanent code active', async () => {
    const ownerRecord = {
      id: 'owner-row', referrerId: 'referrer-1', code: 'QZPSNUNK', isActive: true,
      isCodeOwnerRecord: true, referrer: {
        id: 'referrer-1', email: 'owner@example.com', role: UserRole.STUDENT, isSuspended: false,
      },
    };
    referrals.findOne
      .mockResolvedValueOnce(ownerRecord)
      .mockResolvedValueOnce(null);
    const referred = { id: 'student-2', email: 'new@example.com', role: UserRole.STUDENT };
    await expect(service.redeemReferral('qzpsnunk', referred)).resolves.toEqual({
      success: true, message: 'Student referral applied successfully.',
    });

    expect(referrals.save).toHaveBeenCalledWith(expect.objectContaining({
      referrerId: 'referrer-1', referredUserId: 'student-2', code: 'QZPSNUNK',
      isCodeOwnerRecord: false, isActive: false, rewardAmount: 20,
    }));
    expect(ownerRecord.isActive).toBe(true);
    expect(points.awardReferralReward).toHaveBeenCalledWith('referrer-1', 'event-1', 20);
  });

  it('rejects duplicate referral attribution for the same student', async () => {
    referrals.findOne
      .mockResolvedValueOnce({
        id: 'owner-row', referrerId: 'referrer-1', code: 'QZPSNUNK', isActive: true,
        isCodeOwnerRecord: true, referrer: {
          id: 'referrer-1', email: 'owner@example.com', role: UserRole.STUDENT, isSuspended: false,
        },
      })
      .mockResolvedValueOnce({ id: 'existing-event', referredUserId: 'student-2' });

    await expect(service.redeemReferral('QZPSNUNK', {
      id: 'student-2', email: 'new@example.com', role: UserRole.STUDENT,
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(referrals.save).not.toHaveBeenCalled();
    expect(points.awardReferralReward).not.toHaveBeenCalled();
  });

  it('continues to restrict code generation to active student accounts', async () => {
    users.findOne.mockResolvedValue({ id: 'lecturer-1', role: UserRole.LECTURER, isSuspended: false });
    await expect(service.generateReferralCode('lecturer-1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
