import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { ReviewerApplication, ReviewerApplicationStatus } from './entities/reviewer-application.entity';
import { ReviewerApplicationDecision } from './entities/reviewer-application-decision.entity';
import { SubmitReviewerApplicationDto } from './dto/submit-reviewer-application.dto';
import { ReviewerApplicationDecisionDto } from './dto/reviewer-application-decision.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { hasActiveGlobalReviewerAuthority } from './reviewer-permissions';

@Injectable()
export class ReviewerApplicationsService {
  constructor(
    @InjectRepository(ReviewerApplication) private readonly applications: Repository<ReviewerApplication>,
    @InjectRepository(ReviewerApplicationDecision) private readonly decisions: Repository<ReviewerApplicationDecision>,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  async submit(user: User, dto: SubmitReviewerApplicationDto) {
    const recruitmentOpen = process.env.REVIEWER_RECRUITMENT_OPEN === 'true';
    const testEmail = (process.env.REVIEWER_TEST_ACCOUNT_EMAIL || '').trim().toLowerCase();
    const isTestAccount = Boolean(testEmail && user.email?.trim().toLowerCase() === testEmail);
    if (!recruitmentOpen && !isTestAccount && user.hasReviewerAccess !== true) {
      throw new ForbiddenException('Academic Reviewer applications are coming soon. Recruitment is currently closed.');
    }
    if (!dto.policyAccepted) throw new BadRequestException('You must accept the Academic Reviewer policy before submitting.');

    const qualifications = [...new Set(dto.qualifications.map(value => value.trim()).filter(Boolean))];
    const expertiseAreas = [...new Set(dto.expertiseAreas.map(value => value.trim()).filter(Boolean))];
    const academicLevels = [...new Set(dto.academicLevels.map(value => value.trim()).filter(Boolean))];
    const reviewExperience = dto.reviewExperience.trim();
    const conflictDeclaration = dto.conflictDeclaration.trim();
    if (!qualifications.length || !expertiseAreas.length || !academicLevels.length) {
      throw new BadRequestException('Add at least one qualification, expertise area and academic level.');
    }
    if (reviewExperience.length < 30 || conflictDeclaration.length < 20) {
      throw new BadRequestException('Provide sufficient review experience and a meaningful conflict-of-interest declaration.');
    }

    try {
      return await this.dataSource.transaction(async manager => {
        const currentUser = await manager.findOne(User, {
          where: { id: user.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!currentUser) throw new NotFoundException('Applicant account no longer exists.');
        if (![UserRole.STUDENT, UserRole.LECTURER, UserRole.REVIEWER].includes(currentUser.role)) {
          throw new ForbiddenException('Only Student, Lecturer or External Reviewer accounts can apply for Academic Reviewer access.');
        }
        if (currentUser.hasReviewerAccess === true) {
          throw new ConflictException('Academic Reviewer access is already active on this account.');
        }

        const latest = await manager.findOne(ReviewerApplication, {
          where: { userId: currentUser.id },
          order: { createdAt: 'DESC' },
        });
        if (latest && [ReviewerApplicationStatus.SUBMITTED, ReviewerApplicationStatus.UNDER_REVIEW].includes(latest.status)) {
          throw new ConflictException('Your existing reviewer application is being processed. Check its status before submitting again.');
        }
        if (latest?.status === ReviewerApplicationStatus.APPROVED) {
          throw new ConflictException('Reviewer access has already been approved for this account.');
        }
        if ([ReviewerApplicationStatus.SUSPENDED, ReviewerApplicationStatus.REVOKED].includes(latest?.status as ReviewerApplicationStatus)) {
          throw new ConflictException('Reviewer access is suspended or revoked. Contact an administrator for a formal access review.');
        }

        const institution = dto.institution?.trim() || currentUser.institution?.trim() || null;
        const faculty = dto.faculty?.trim() || currentUser.faculty?.trim() || null;
        const department = dto.department?.trim() || currentUser.department?.trim() || null;
        if (currentUser.role !== UserRole.REVIEWER && (!institution || !faculty || !department)) {
          throw new BadRequestException('Your existing Student or Lecturer academic affiliation must be complete before applying.');
        }

        const application = manager.create(ReviewerApplication, {
          userId: currentUser.id,
          status: ReviewerApplicationStatus.SUBMITTED,
          qualifications,
          expertiseAreas,
          institution,
          faculty,
          department,
          academicLevels,
          reviewExperience,
          supportingDocuments: dto.supportingDocuments?.map(value => value.trim()).filter(Boolean),
          conflictDeclaration,
          policyAccepted: true,
        });
        const saved = await manager.save(ReviewerApplication, application);
        currentUser.reviewerStatus = ReviewerApplicationStatus.SUBMITTED;
        await manager.save(User, currentUser);
        return saved;
      });
    } catch (error) {
      const databaseError = error as { code?: string; driverError?: { code?: string; constraint?: string } };
      const code = databaseError.driverError?.code ?? databaseError.code;
      const constraint = databaseError.driverError?.constraint;
      if (code === '23505' && constraint === 'UQ_reviewer_applications_one_active_per_user') {
        throw new ConflictException('You already have an active reviewer application. Check its status before submitting again.');
      }
      throw error;
    }
  }

  async mine(user: User) {
    return this.applications.find({ where: { userId: user.id }, order: { createdAt: 'DESC' } });
  }

  async listForAdmin(status?: string, actor?: User) {
    if (actor && actor.role !== UserRole.ADMIN && !hasActiveGlobalReviewerAuthority(actor)) throw new ForbiddenException('Only administrators or the Global Academic Reviewer can inspect reviewer applications.');
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

  async decisionHistory(applicationId: string, actor?: User) {
    if (actor && actor.role !== UserRole.ADMIN && !hasActiveGlobalReviewerAuthority(actor)) throw new ForbiddenException('Only administrators or the Global Academic Reviewer can inspect reviewer decision history.');
    const application = await this.applications.findOne({ where: { id: applicationId }, select: ['id'] });
    if (!application) throw new NotFoundException('Reviewer application not found.');
    return this.decisions.find({
      where: { applicationId },
      relations: ['actor'],
      order: { createdAt: 'ASC' },
    });
  }

  async decide(applicationId: string, admin: User, dto: ReviewerApplicationDecisionDto) {
    if (admin.role !== UserRole.ADMIN && !hasActiveGlobalReviewerAuthority(admin)) throw new ForbiddenException('Only administrators or the Global Academic Reviewer can decide reviewer applications.');
    if (hasActiveGlobalReviewerAuthority(admin) && admin.id === (await this.applications.findOne({ where: { id: applicationId }, select: ['id', 'userId'] }))?.userId) {
      throw new ForbiddenException('The Global Academic Reviewer cannot decide their own reviewer application.');
    }
    if ([ReviewerApplicationStatus.REJECTED, ReviewerApplicationStatus.SUSPENDED, ReviewerApplicationStatus.REVOKED].includes(dto.status) && !dto.note?.trim()) {
      throw new BadRequestException('A reason is required for rejection, suspension or revocation.');
    }
    const result = await this.dataSource.transaction(async manager => {
      const applicationSnapshot = await manager.findOne(ReviewerApplication, { where: { id: applicationId } });
      if (!applicationSnapshot) throw new NotFoundException('Reviewer application not found.');
      const user = await manager.findOne(User, {
        where: { id: applicationSnapshot.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('Applicant account no longer exists.');
      const application = await manager.findOne(ReviewerApplication, {
        where: { id: applicationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!application) throw new NotFoundException('Reviewer application not found.');
      if (application.userId !== user.id) throw new ConflictException('The reviewer application identity changed. Refresh and try again.');
      const latestApplication = await manager.findOne(ReviewerApplication, {
        where: { userId: user.id },
        order: { createdAt: 'DESC' },
      });
      if (latestApplication && latestApplication.id !== application.id) {
        throw new ConflictException('A newer reviewer application exists. Review the latest submission instead.');
      }
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
      const approvedExpertiseAreas = dto.approvedExpertiseAreas?.map(area => area.trim()).filter(Boolean)
        ?? application.approvedExpertiseAreas
        ?? application.expertiseAreas;
      const approvedAcademicLevels = dto.approvedAcademicLevels?.map(level => level.trim()).filter(Boolean)
        ?? application.approvedAcademicLevels
        ?? application.academicLevels;
      if (dto.status === ReviewerApplicationStatus.APPROVED && (!approvedExpertiseAreas.length || !approvedAcademicLevels.length)) {
        throw new BadRequestException('Approved reviewer access requires at least one subject area and one academic level.');
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
        user.reviewerExpertise = approvedExpertiseAreas;
        user.reviewerAcademicLevels = approvedAcademicLevels;
        application.approvedExpertiseAreas = approvedExpertiseAreas;
        application.approvedAcademicLevels = approvedAcademicLevels;
      } else if ([ReviewerApplicationStatus.SUSPENDED, ReviewerApplicationStatus.REVOKED, ReviewerApplicationStatus.REJECTED].includes(dto.status)) {
        user.hasReviewerAccess = false;
        user.isGlobalReviewer = false;
        user.reviewerExpertise = [];
        await manager.query(
          'INSERT INTO reviewer_assignment_events ("assignmentId", "resourceId", "reviewerId", "actorId", "eventType") SELECT "reviewAssignmentId", "id", "assignedReviewerId", $2::uuid, $3 FROM resources WHERE "assignedReviewerId" = $1::uuid AND "reviewAssignmentId" IS NOT NULL',
          [user.id, admin.id, 'released'],
        );
        await manager.query('UPDATE resources SET "assignedReviewerId" = NULL, "reviewAssignmentId" = NULL WHERE "assignedReviewerId" = $1::uuid', [user.id]);
      }
      await manager.save(User, user);
      const savedApplication = await manager.save(ReviewerApplication, application);
      return { application: savedApplication, applicantId: user.id, applicantName: user.firstName || 'there' };
    });

    const notificationByStatus: Record<ReviewerApplicationStatus, { title: string; message: string; link: string }> = {
      [ReviewerApplicationStatus.DRAFT]: { title: 'Reviewer application updated', message: 'Your reviewer application draft has been updated.', link: '/reviewer-application' },
      [ReviewerApplicationStatus.SUBMITTED]: { title: 'Reviewer application submitted', message: 'Your reviewer application has been submitted.', link: '/reviewer-application' },
      [ReviewerApplicationStatus.UNDER_REVIEW]: { title: 'Reviewer application under review', message: 'Your reviewer application is now being reviewed.', link: '/reviewer-application' },
      [ReviewerApplicationStatus.MORE_INFORMATION_REQUIRED]: { title: 'More information required', message: 'Please review the decision note and provide the requested information for your reviewer application.', link: '/reviewer-application' },
      [ReviewerApplicationStatus.APPROVED]: { title: 'Academic Reviewer access approved', message: 'Your Academic Reviewer access has been approved. Your reviewer workspace is now available.', link: '/moderation' },
      [ReviewerApplicationStatus.REJECTED]: { title: 'Reviewer application not approved', message: 'Your reviewer application was not approved. Review the decision note for details.', link: '/reviewer-application' },
      [ReviewerApplicationStatus.SUSPENDED]: { title: 'Reviewer access suspended', message: 'Your Academic Reviewer access has been suspended. Review the decision note for details.', link: '/reviewer-application' },
      [ReviewerApplicationStatus.REVOKED]: { title: 'Reviewer access revoked', message: 'Your Academic Reviewer access has been revoked. Review the decision note for details.', link: '/reviewer-application' },
    };
    const notification = notificationByStatus[result.application.status];
    try {
      await this.notificationsService.createNotification(
        result.applicantId,
        'reviewer_application_decision',
        notification.title,
        `${notification.message}${result.application.decisionNote ? ` Decision note: ${result.application.decisionNote}` : ''}`,
        notification.link,
      );
    } catch {
      // The decision and immutable audit record remain committed if notification delivery is unavailable.
    }
    return result.application;
  }
}
