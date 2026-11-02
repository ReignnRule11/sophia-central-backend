import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Referral } from './entities/referral.entity';
import { User, UserRole } from '../users/entities/user.entity';
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
    const owner = await this.userRepository.findOne({ where: { id: userId } });
    if (!owner || owner.role !== UserRole.STUDENT || owner.isSuspended) throw new ForbiddenException('Only active student accounts can generate referral links.');
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
      link: `${process.env.APP_URL}/onboarding?ref=${referral.code}`,
    };
  }

  async validateReferralCode(referralCode: string, referredEmail: string): Promise<void> {
    const referral = await this.referralRepository.findOne({ where: { code: referralCode.trim().toUpperCase(), isActive: true }, relations: ['referrer'] });
    if (!referral || !referral.referrer || referral.referrer.role !== UserRole.STUDENT || referral.referrer.isSuspended) {
      throw new BadRequestException('This student referral link is invalid or has already been used.');
    }
    if (referral.referrer.email.toLowerCase() === referredEmail.toLowerCase()) {
      throw new BadRequestException('You cannot use your own referral link.');
    }
  }

  async redeemReferral(referralCode: string, referredUser: User): Promise<{ success: boolean; message: string }> {
    if (referredUser.role !== UserRole.STUDENT) return { success: false, message: 'Referrals are only available for new student accounts.' };
    const referral = await this.referralRepository.findOne({
      where: { code: referralCode.trim().toUpperCase(), isActive: true },
      relations: ['referrer'],
    });
    if (!referral || !referral.referrer || referral.referrer.role !== UserRole.STUDENT || referral.referrer.isSuspended) {
      throw new BadRequestException('This student referral link is invalid or has already been used.');
    }
    if (referral.referrerId === referredUser.id || referral.referrer.email.toLowerCase() === referredUser.email.toLowerCase()) {
      throw new BadRequestException('You cannot use your own referral link.');
    }
    referral.isActive = false;
    referral.redeemedAt = new Date();
    await this.referralRepository.save(referral);
    await this.pointsService.awardPoints({
      userId: referral.referrerId,
      amount: this.REFERRER_BONUS,
      reason: 'Student referral bonus - new student account created',
    });
    await this.pointsService.awardPoints({
      userId: referredUser.id,
      amount: this.REFEREE_BONUS,
      reason: 'Welcome bonus - joined through a student referral',
    });
    return { success: true, message: 'Student referral applied successfully.' };
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
