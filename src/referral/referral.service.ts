import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Referral } from './entities/referral.entity';
import { User } from '../users/entities/user.entity';
import { PointsService } from '../points/points.service';
import { CreateReferralDto } from './dto/create-referral.dto';

const REFERRER_BONUS_POINTS = 10;

@Injectable()
export class ReferralService {
  /** A successful signup using this account's referral code awards exactly 10 points to the referrer. */
  private readonly REFERRER_BONUS = REFERRER_BONUS_POINTS;

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

    // The referral is redeemed only after the new account has been successfully created.
    referral.isActive = false;
    referral.redeemedAt = new Date();
    await this.referralRepository.save(referral);

    // The reward belongs to the account that owns the referral code, never the new account.
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

  private generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(crypto.randomInt(0, chars.length));
    }
    return code;
  }
}
