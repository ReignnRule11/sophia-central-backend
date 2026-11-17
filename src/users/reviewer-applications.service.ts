import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { ReviewerApplication, ReviewerApplicationStatus } from './entities/reviewer-application.entity';
import { ReviewerApplicationDecision } from './entities/reviewer-application-decision.entity';
import { SubmitReviewerApplicationDto } from './dto/submit-reviewer-application.dto';
import { ReviewerApplicationDecisionDto } from './dto/reviewer-application-decision.dto';

@Injectable()
export class ReviewerApplicationsService {
  constructor(
    @InjectRepository(ReviewerApplication) private readonly applications: Repository<ReviewerApplication>,
    @InjectRepository(ReviewerApplicationDecision) private readonly decisions: Repository<ReviewerApplicationDecision>,
    private readonly dataSource: DataSource,
  ) {}

  async submit(user: User, dto: SubmitReviewerApplicationDto) {
    if (![UserRole.STUDENT, UserRole.LECTURER, UserRole.REVIEWER].includes(user.role)) {
      throw new ForbiddenException('Only Student, Lecturer or External Reviewer accounts can apply for Academic Reviewer access.');
    }
    if (user.hasReviewerAccess === true) {
      throw new ConflictException('Academic Reviewer access is already active on this account.');
    }
    if (!dto.policyAccepted) throw new BadRequestException('You must accept the Academic Reviewer policy before submitting.');
    const pending = await this.applications.findOne({
      where: { userId: user.id, status: ReviewerApplicationStatus.SUBMITTED },
      order: { createdAt: 'DESC' },
    });
    if (pending) throw new ConflictException('You already have a submitted reviewer application awaiting review.');
    const latest = await this.applications.findOne({ where: { userId: user.id }, order: { createdAt: 'DESC' } });
    if (latest && [ReviewerApplicationStatus.SUBMITTED, ReviewerApplicationStatus.UNDER_REVIEW].includes(latest.status)) {
      throw new ConflictException('Your existing reviewer application is being processed. Check its status before submitting again.');
    }
    if (latest?.status === ReviewerApplicationStatus.APPROVED) {
      throw new ConflictException('Reviewer access has already been approved for this account.');
    }
    if ([ReviewerApplicationStatus.SUSPENDED, ReviewerApplicationStatus.REVOKED].includes(latest?.status as ReviewerApplicationStatus)) {
      throw new ConflictException('Reviewer access is suspended or revoked. Contact an administrator for a formal access review.');
    }
    const institution = dto.institution?.trim() || user.institution?.trim() || null;
    const faculty = dto.faculty?.trim() || user.faculty?.trim() || null;
    const department = dto.department?.trim() || user.department?.trim() || null;
    if (user.role !== UserRole.REVIEWER && (!institution || !faculty || !department)) {
      throw new BadRequestException('Your existing Student or Lecturer academic affiliation must be complete before applying.');
    }
    const application = this.applications.create({
      userId: user.id,
      status: ReviewerApplicationStatus.SUBMITTED,
      qualifications: [...new Set(dto.qualifications.map(v => v.trim()).filter(Boolean))],
      expertiseAreas: [...new Set(dto.expertiseAreas.map(v => v.trim()).filter(Boolean))],
      institution,
      faculty,
      department,
      academicLevels: [...new Set(dto.academicLevels.map(v => v.trim()).filter(Boolean))],
      reviewExperience: dto.reviewExperience.trim(),
      supportingDocuments: dto.supportingDocuments?.map(v => v.trim()).filter(Boolean),
      conflictDeclaration: dto.conflictDeclaration.trim(),
      policyAccepted: true,
    });
    return this.dataSource.transaction(async manager => {
      const saved = await manager.save(ReviewerApplication, application);
      user.reviewerStatus = 'submitted';
      await manager.save(User, user);
      return saved;
    });
  }

  async mine(user: User) {
    return this.applications.find({ where: { userId: user.id }, order: { createdAt: 'DESC' } });
  }

  async listForAdmin(status?: string) {
    const allowed = Object.values(ReviewerApplicationStatus);
    if (status && !allowed.includes(status as ReviewerApplicationStatus)) {
      throw new BadRequestException('Unknown reviewer application status.');
    }
    return this.applications.find({
      where: status ? { status: status as ReviewerApplicationStatus } : {},
      relations: ['user', 'decidedBy'],
      order: { createdAt: 'ASC' },
    });
  }

  async decisionHistory(applicationId: string) {
    const application = await this.applications.findOne({ where: { id: applicationId }, select: ['id'] });
    if (!application) throw new NotFoundException('Reviewer application not found.');
    return this.decisions.find({
      where: { applicationId },
      relations: ['actor'],
      order: { createdAt: 'ASC' },
    });
  }

  async decide(applicationId: string, admin: User, dto: ReviewerApplicationDecisionDto) {
    if (admin.role !== UserRole.ADMIN) throw new ForbiddenException('Only an administrator can decide reviewer applications.');
    if ([ReviewerApplicationStatus.REJECTED, ReviewerApplicationStatus.SUSPENDED, ReviewerApplicationStatus.REVOKED].includes(dto.status) && !dto.note?.trim()) {
      throw new BadRequestException('A reason is required for rejection or revocation.');
    }
    return this.dataSource.transaction(async manager => {
      const application = await manager.findOne(ReviewerApplication, { where: { id: applicationId }, lock: { mode: 'pessimistic_write' } });
      if (!application) throw new NotFoundException('Reviewer application not found.');
      const user = await manager.findOne(User, { where: { id: application.userId }, lock: { mode: 'pessimistic_write' } });
      if (!user) throw new NotFoundException('Applicant account no longer exists.');
      if (![UserRole.STUDENT, UserRole.LECTURER, UserRole.REVIEWER].includes(user.role)) {
        throw new ConflictException('The applicant account type has changed. Resolve the account identity before deciding this application.');
      }
      const allowedTransitions: Record<ReviewerApplicationStatus, ReviewerApplicationStatus[]> = {
        [ReviewerApplicationStatus.DRAFT]: [ReviewerApplicationStatus.SUBMITTED],
        [ReviewerApplicationStatus.SUBMITTED]: [ReviewerApplicationStatus.UNDER_REVIEW, ReviewerApplicationStatus.MORE_INFORMATION_REQUIRED, ReviewerApplicationStatus.APPROVED, ReviewerApplicationStatus.REJECTED],
        [ReviewerApplicationStatus.UNDER_REVIEW]: [ReviewerApplicationStatus.MORE_INFORMATION_REQUIRED, ReviewerApplicationStatus.APPROVED, ReviewerApplicationStatus.REJECTED],
        [ReviewerApplicationStatus.MORE_INFORMATION_REQUIRED]: [ReviewerApplicationStatus.UNDER_REVIEW, ReviewerApplicationStatus.APPROVED, ReviewerApplicationStatus.REJECTED],
        [ReviewerApplicationStatus.APPROVED]: [ReviewerApplicationStatus.SUSPENDED, ReviewerApplicationStatus.REVOKED],
        [ReviewerApplicationStatus.SUSPENDED]: [ReviewerApplicationStatus.APPROVED, ReviewerApplicationStatus.REVOKED],
        [ReviewerApplicationStatus.REJECTED]: [],
        [ReviewerApplicationStatus.REVOKED]: [],
      };
      if (!allowedTransitions[application.status]?.includes(dto.status)) {
        throw new ConflictException(`Reviewer application cannot transition from ${application.status} to ${dto.status}.`);
      }
      await manager.save(ReviewerApplicationDecision, manager.create(ReviewerApplicationDecision, {
        applicationId: application.id,
        actorId: admin.id,
        fromStatus: application.status,
        toStatus: dto.status,
        note: dto.note?.trim() || null,
      }));
      application.status = dto.status;
      application.decidedById = admin.id;
      application.decisionNote = dto.note?.trim() || null;
      application.decidedAt = new Date();
      user.reviewerStatus = dto.status;
      if (dto.status === ReviewerApplicationStatus.APPROVED) {
        user.hasReviewerAccess = true;
        user.reviewerExpertise = application.expertiseAreas;
      } else if ([ReviewerApplicationStatus.SUSPENDED, ReviewerApplicationStatus.REVOKED, ReviewerApplicationStatus.REJECTED].includes(dto.status)) {
        user.hasReviewerAccess = false;
        user.reviewerExpertise = [];
        await manager.query('UPDATE resources SET "assignedReviewerId" = NULL WHERE "assignedReviewerId" = $1::uuid', [user.id]);
      }
      await manager.save(User, user);
      return manager.save(ReviewerApplication, application);
    });
  }
}
