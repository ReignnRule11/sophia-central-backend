import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Referral } from './entities/referral.entity';
import { User } from '../users/entities/user.entity';
import { PointsService } from '../points/points.service';
import { CreateReferralDto } from './dto/create-referral.dto';

const DEFAULT_REFERRER_BONUS_POINTS = 2;
const REFERRER_BONUS_ENV = 'REFERRER_BONUS_POINTS';

@Injectable()
export class ReferralService {
  /**
   * Referral rewards are configured server-side so the amount can be changed
   * without allowing a caller to award themselves an arbitrary number of points.
   * Set REFERRER_BONUS_POINTS in the backend environment; defaults to 2.
   */
  private readonly REFERRER_BONUS = this.getReferrerBonusPoints();

  constructor(
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly pointsService: PointsService,
  ) {}

  async generateReferralCode(userId: string): Promise<{ code: string; link: string }> {
    // Check if user already has active code
    let referral = await this.referralRepository.findOne({
      where: { referrerId: userId, isActive: true },
    });

    if (!referral) {
      // Generate a unique code and persist it against the authenticated referrer's account.
      let code = this.generateCode();
      for (let attempt = 0; await this.referralRepository.findOne({ where: { code } }); attempt += 1) {
        if (attempt >= 5) {
          throw new BadRequestException('Unable to generate a unique referral code. Please try again.');
        }
        code = this.generateCode();
      }
      referral = this.referralRepository.create({
        referrerId: userId,
        code,
        isActive: true,
      });
      await this.referralRepository.save(referral);
    }

    return {
      code: referral.code,
      link: `${process.env.APP_URL}/signup?ref=${referral.code}`,
    };
  }

  async redeemReferral(referralCode: string): Promise<{ success: boolean; message: string }> {
    const referral = await this.referralRepository.findOne({
      where: { code: referralCode, isActive: true },
      relations: ['referrer'],
    });

    if (!referral) {
      throw new BadRequestException('Invalid or expired referral code');
    }

    // The existing redeem endpoint grants the referrer bonus and can only redeem
    // an active code once. Signup attribution still needs to call this endpoint
    // only after a new account is successfully created.
    referral.isActive = false;
    referral.redeemedAt = new Date();
    await this.referralRepository.save(referral);

    await this.pointsService.awardPoints({
      userId: referral.referrerId,
      amount: this.REFERRER_BONUS,
      reason: 'Referral bonus - user sign up via your code',
    });

    return {
      success: true,
      awardedPoints: this.REFERRER_BONUS,
      message: `Welcome! Your friend ${referral.referrer.firstName} earned ${this.REFERRER_BONUS} Wisdom Points for referring you.`,
    };
  }

  async getUserReferrals(userId: string, currentUserId: string) {
    if (userId !== currentUserId) {
      throw new ForbiddenException('Unauthorized');
    }

    const referrals = await this.referralRepository.find({
      where: { referrerId: userId },
      order: { createdAt: 'DESC' },
    });

    const successfulReferrals = referrals.filter((r) => r.redeemedAt !== null);

    return {
      totalGenerated: referrals.length,
      successfulReferrals: successfulReferrals.length,
      totalBonusEarned: successfulReferrals.length * this.REFERRER_BONUS,
      referralBonusPerSignup: this.REFERRER_BONUS,
      referrals: referrals.map((r) => ({
        code: r.code,
        createdAt: r.createdAt,
        redeemedAt: r.redeemedAt,
        status: r.redeemedAt ? 'completed' : 'pending',
      })),
    };
  }

  private getReferrerBonusPoints(): number {
    const configured = process.env[REFERRER_BONUS_ENV];
    if (configured === undefined || configured.trim() === '') {
      return DEFAULT_REFERRER_BONUS_POINTS;
    }

    const amount = Number(configured);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error(`${REFERRER_BONUS_ENV} must be a non-negative integer.`);
    }

    return amount;
  }

  private generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(crypto.randomInt(0, chars.length));
    }
    return code;
  }
}
