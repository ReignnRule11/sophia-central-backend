import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Referral } from './entities/referral.entity';
import { User } from '../users/entities/user.entity';
import { PointsService } from '../points/points.service';
import { CreateReferralDto } from './dto/create-referral.dto';

@Injectable()
export class ReferralService {
  private readonly REFERRER_BONUS = 50; // Points for successful referral
  private readonly REFEREE_BONUS = 30; // Points for new user who was referred

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
      // Generate unique code
      const code = this.generateCode();
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
    // Find referral
    const referral = await this.referralRepository.findOne({
      where: { code: referralCode, isActive: true },
      relations: ['referrer'],
    });

    if (!referral) {
      throw new BadRequestException('Invalid or expired referral code');
    }

    // Mark as redeemed (in real flow, this happens after new user signup)
    referral.isActive = false;
    referral.redeemedAt = new Date();
    await this.referralRepository.save(referral);

    // Award points to referrer
    await this.pointsService.awardPoints({
      userId: referral.referrerId,
      amount: this.REFERRER_BONUS,
      reason: `Referral bonus - user sign up via your code`,
    });

    return {
      success: true,
      message: `Welcome! Your friend ${referral.referrer.firstName} earned ${this.REFERRER_BONUS} Wisdom Points for referring you.`,
    };
  }

  async getUserReferrals(userId: string, currentUserId: string) {
    // Users can only view their own referrals
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
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
