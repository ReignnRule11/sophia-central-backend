import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Referral } from './entities/referral.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { PointsService } from '../points/points.service';

@Injectable()
export class ReferralService {
  private readonly REFERRER_BONUS = 20;

  constructor(
    @InjectRepository(Referral) private readonly referralRepository: Repository<Referral>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly pointsService: PointsService,
  ) {}

  async generateReferralCode(userId: string): Promise<{ code: string; link: string }> {
    const owner = await this.userRepository.findOne({ where: { id: userId } });
    if (!owner || owner.role !== UserRole.STUDENT || owner.isSuspended) {
      throw new ForbiddenException('Only active student accounts can generate referral links.');
    }

    // Keep one permanent code-owner row; every redemption is a separate event.
    let referral = await this.referralRepository.findOne({
      where: { referrerId: userId, isCodeOwnerRecord: true },
    });
    if (!referral) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
      referral = this.referralRepository.create({
        referrerId: userId, code, isActive: true, isCodeOwnerRecord: true,
        rewardAmount: 0, rewardRemaining: 0,
      });
      try {
        referral = await this.referralRepository.save(referral);
      } catch (error) {
        // Concurrent first requests may race; return the permanent row that won.
        const existing = await this.referralRepository.findOne({
          where: { referrerId: userId, isCodeOwnerRecord: true },
        });
        if (!existing) throw error;
        referral = existing;
      }
    }

    return { code: referral.code, link: `${process.env.APP_URL}/onboarding?ref=${referral.code}` };
  }

  async validateReferralCode(referralCode: string, referredEmail: string): Promise<void> {
    const referral = await this.referralRepository.findOne({
      where: { code: referralCode.trim().toUpperCase(), isActive: true, isCodeOwnerRecord: true },
      relations: ['referrer'],
    });
    if (!referral || !referral.referrer || referral.referrer.role !== UserRole.STUDENT || referral.referrer.isSuspended) {
      throw new BadRequestException('This student referral link is invalid.');
    }
    if (referral.referrer.email.toLowerCase() === referredEmail.toLowerCase()) {
      throw new BadRequestException('You cannot use your own referral link.');
    }
  }

  async redeemReferral(referralCode: string, referredUser: User): Promise<{ success: boolean; message: string }> {
    if (referredUser.role !== UserRole.STUDENT) {
      return { success: false, message: 'Referrals are only available for new student accounts.' };
    }

    const code = referralCode.trim().toUpperCase();
    const ownerReferral = await this.referralRepository.findOne({
      where: { code, isActive: true, isCodeOwnerRecord: true },
      relations: ['referrer'],
    });
    if (!ownerReferral || !ownerReferral.referrer || ownerReferral.referrer.role !== UserRole.STUDENT || ownerReferral.referrer.isSuspended) {
      throw new BadRequestException('This student referral link is invalid.');
    }
    if (ownerReferral.referrerId === referredUser.id || ownerReferral.referrer.email.toLowerCase() === referredUser.email.toLowerCase()) {
      throw new BadRequestException('You cannot use your own referral link.');
    }

    const existingAttribution = await this.referralRepository.findOne({ where: { referredUserId: referredUser.id } });
    if (existingAttribution) throw new BadRequestException('This student account already has a referral attribution.');

    const savedEvent = await this.referralRepository.save(this.referralRepository.create({
      referrerId: ownerReferral.referrerId,
      code: ownerReferral.code,
      isActive: false,
      isCodeOwnerRecord: false,
      redeemedAt: new Date(),
      referredUserId: referredUser.id,
      rewardAmount: this.REFERRER_BONUS,
      rewardRemaining: 0,
    }));
    await this.pointsService.awardReferralReward(ownerReferral.referrerId, savedEvent.id, this.REFERRER_BONUS);
    return { success: true, message: 'Student referral applied successfully.' };
  }

  async getUserReferrals(userId: string, currentUserId: string) {
    const owner = await this.userRepository.findOne({ where: { id: userId } });
    if (!owner || owner.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Referral statistics are available only to student accounts.');
    }
    if (userId !== currentUserId) throw new ForbiddenException('Unauthorized');

    const [codeRecord, referralEvents] = await Promise.all([
      this.referralRepository.findOne({ where: { referrerId: userId, isCodeOwnerRecord: true } }),
      this.referralRepository.find({
        where: { referrerId: userId, isCodeOwnerRecord: false },
        order: { createdAt: 'DESC' },
      }),
    ]);
    const successfulReferrals = referralEvents.filter(r => r.redeemedAt != null);
    return {
      totalGenerated: codeRecord ? 1 : 0,
      successfulReferrals: successfulReferrals.length,
      totalBonusEarned: successfulReferrals.reduce((total, referral) => total + (referral.rewardAmount || 0), 0),
      referrals: referralEvents.map(r => ({
        code: r.code, referredUserId: r.referredUserId ?? null,
        createdAt: r.createdAt, redeemedAt: r.redeemedAt,
        status: r.redeemedAt ? 'completed' : 'pending',
      })),
    };
  }
}