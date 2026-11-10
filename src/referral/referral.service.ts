import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Referral } from './entities/referral.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Institution, Faculty, Department } from '../institutions/entities/institution.entity';
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

    // One permanent code per student. There is intentionally no referral-count cap.
    let referral = await this.referralRepository.findOne({
      where: { referrerId: userId, isCodeOwnerRecord: true },
    });
    if (!referral) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
      referral = this.referralRepository.create({
        referrerId: userId, code, isActive: true, isCodeOwnerRecord: true,
        rewardAmount: 0, rewardRemaining: 0, rewardStatus: 'pending',
      });
      try {
        referral = await this.referralRepository.save(referral);
      } catch (error) {
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
    if (referral.referrer.email.trim().toLowerCase() === referredEmail.trim().toLowerCase()) {
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
    if (ownerReferral.referrerId === referredUser.id || ownerReferral.referrer.email.trim().toLowerCase() === referredUser.email.trim().toLowerCase()) {
      throw new BadRequestException('You cannot use your own referral link.');
    }

    // Serialize attribution for a referred account and rely on the unique
    // referredUserId index as a final protection against concurrent requests.
    const event = await this.referralRepository.manager.transaction(async manager => {
      const lockedUser = await manager.findOne(User, {
        where: { id: referredUser.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedUser || lockedUser.role !== UserRole.STUDENT) {
        throw new BadRequestException('Only student accounts can receive a referral attribution.');
      }
      const existingAttribution = await manager.findOne(Referral, {
        where: { referredUserId: lockedUser.id, isCodeOwnerRecord: false },
      });
      if (existingAttribution) {
        throw new BadRequestException('This student account already has a referral attribution.');
      }
      return manager.save(Referral, manager.create(Referral, {
        referrerId: ownerReferral.referrerId,
        code: ownerReferral.code,
        isActive: false,
        isCodeOwnerRecord: false,
        redeemedAt: new Date(),
        referredUserId: lockedUser.id,
        rewardAmount: this.REFERRER_BONUS,
        rewardRemaining: 0,
        rewardStatus: 'pending',
      }));
    });

    // Email verification records attribution only. Rewarding waits until the
    // referred student has completed a valid academic profile.
    await this.processPendingReferralForUser(referredUser.id);
    return {
      success: true,
      message: 'Referral recorded. The reward will be credited after the referred student verifies their account and completes academic onboarding.',
    };
  }

  private async hasVerifiedAcademicPlacement(user: User): Promise<boolean> {
    const institutionName = user.institution?.trim();
    const facultyName = user.faculty?.trim();
    const departmentName = user.department?.trim();
    if (!institutionName || !facultyName || !departmentName) return false;

    const manager = this.referralRepository.manager;
    const institution = await manager.createQueryBuilder(Institution, 'institution')
      .where('LOWER(institution.name) = LOWER(:name)', { name: institutionName })
      .getOne();
    if (!institution) return false;

    const faculty = await manager.createQueryBuilder(Faculty, 'faculty')
      .where('faculty.institutionId = :institutionId', { institutionId: institution.id })
      .andWhere('LOWER(faculty.name) = LOWER(:name)', { name: facultyName })
      .getOne();
    if (!faculty) return false;

    const department = await manager.createQueryBuilder(Department, 'department')
      .where('department.facultyId = :facultyId', { facultyId: faculty.id })
      .andWhere('LOWER(department.name) = LOWER(:name)', { name: departmentName })
      .getOne();
    return Boolean(department);
  }

  async processPendingReferralForUser(referredUserId: string): Promise<void> {
    const event = await this.referralRepository.findOne({
      where: { referredUserId, isCodeOwnerRecord: false },
      relations: ['referrer', 'referredUser'],
    });
    if (!event || event.rewardStatus !== 'pending' || !event.referredUser) return;

    const referred = event.referredUser;
    if (referred.emailVerified !== true || referred.isProfileComplete !== true || !referred.programme?.trim()) return;

    // Onboarding validates institution/faculty/department against the approved
    // academic catalogue. Missing placement or suspended accounts require review.
    if (referred.isSuspended || event.referrer?.isSuspended) {
      event.rewardStatus = 'under_review';
      event.reviewReason = referred.isSuspended
        ? 'Referred student account is suspended.'
        : 'Referring student account is suspended.';
      await this.referralRepository.save(event);
      return;
    }
    if (
      referred.role !== UserRole.STUDENT ||
      !referred.institution?.trim() ||
      !referred.faculty?.trim() ||
      !referred.department?.trim() ||
      !event.referrer ||
      event.referrer.role !== UserRole.STUDENT
    ) {
      event.rewardStatus = 'under_review';
      event.reviewReason = 'Student role or academic placement could not be confirmed.';
      await this.referralRepository.save(event);
      return;
    }

    // Manual profile values keep onboarding non-blocking, but referral rewards
    // remain gated on an exact institution -> academic unit -> department match.
    if (!(await this.hasVerifiedAcademicPlacement(referred))) {
      event.rewardStatus = 'under_review';
      event.reviewReason = 'Academic placement is not yet present in the verified institution catalogue.';
      await this.referralRepository.save(event);
      return;
    }

    await this.pointsService.awardReferralReward(event.referrerId, event.id, this.REFERRER_BONUS);
  }

  async getReferralReviewQueue() {
    return this.referralRepository.find({
      where: { isCodeOwnerRecord: false, rewardStatus: 'under_review' },
      relations: ['referrer', 'referredUser'],
      order: { updatedAt: 'ASC' },
    });
  }

  async reviewReferral(referralId: string, decision: 'approve' | 'reject', reason: string, reviewerId: string) {
    if (!reason?.trim()) throw new BadRequestException('A review reason is required.');
    const event = await this.referralRepository.findOne({
      where: { id: referralId, isCodeOwnerRecord: false },
      relations: ['referrer', 'referredUser'],
    });
    if (!event) throw new NotFoundException('Referral record not found.');
    if (event.rewardStatus !== 'under_review') throw new BadRequestException('This referral is not awaiting manual review.');

    if (decision === 'reject') {
      event.rewardStatus = 'rejected';
      event.reviewReason = `Rejected by ${reviewerId}: ${reason.trim()}`;
      await this.referralRepository.save(event);
      return { success: true, status: event.rewardStatus };
    }

    const referred = event.referredUser;
    if (
      !referred ||
      referred.role !== UserRole.STUDENT ||
      referred.emailVerified !== true ||
      referred.isProfileComplete !== true ||
      referred.isSuspended ||
      !referred.institution?.trim() ||
      !referred.faculty?.trim() ||
      !referred.department?.trim() ||
      !referred.programme?.trim() ||
      !event.referrer ||
      event.referrer.role !== UserRole.STUDENT ||
      event.referrer.isSuspended
    ) {
      throw new BadRequestException('This referral does not currently meet the account and academic eligibility requirements.');
    }

    if (!(await this.hasVerifiedAcademicPlacement(referred))) {
      throw new BadRequestException('The academic placement must exist in the verified institution catalogue before this referral can be approved.');
    }

    event.rewardStatus = 'pending';
    event.reviewReason = `Approved by ${reviewerId}: ${reason.trim()}`;
    await this.referralRepository.save(event);
    await this.pointsService.awardReferralReward(event.referrerId, event.id, this.REFERRER_BONUS);
    return { success: true, status: 'awarded' };
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
    const awarded = referralEvents.filter(r => r.rewardStatus === 'awarded');
    return {
      totalGenerated: codeRecord ? 1 : 0,
      totalReferrals: referralEvents.length,
      successfulReferrals: awarded.length,
      pendingReferrals: referralEvents.filter(r => r.rewardStatus === 'pending').length,
      referralsUnderReview: referralEvents.filter(r => r.rewardStatus === 'under_review').length,
      rejectedReferrals: referralEvents.filter(r => r.rewardStatus === 'rejected').length,
      totalBonusEarned: awarded.reduce((total, referral) => total + (referral.rewardAmount || 0), 0),
      referrals: referralEvents.map(r => ({
        code: r.code,
        referredUserId: r.referredUserId ?? null,
        createdAt: r.createdAt,
        redeemedAt: r.redeemedAt,
        rewardAwardedAt: r.rewardAwardedAt ?? null,
        status: r.rewardStatus,
        reviewReason: r.rewardStatus === 'under_review' ? r.reviewReason ?? null : undefined,
        rewardAmount: r.rewardAmount,
      })),
    };
  }
}
