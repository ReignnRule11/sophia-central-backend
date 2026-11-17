import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { ModerationService } from './moderation.service';
import { ReviewResourceDto } from './dto/review-resource.dto';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import { ReviewerConflictDeclarationDto } from './dto/reviewer-conflict-declaration.dto';
import { CreateResourceAppealDto } from './dto/create-resource-appeal.dto';
import { DecideResourceAppealDto } from './dto/decide-resource-appeal.dto';
import { OverrideModerationReviewDto } from './dto/override-moderation-review.dto';
import { SupportService } from '../support/support.service';
import { ConcludeSupportRequestDto } from '../support/dto/conclude-support-request.dto';
import { SupportEmailService } from '../support/support-email.service';

type AuthenticatedRequest = Request & { user: User };

@ApiTags('Moderation')
@Controller('moderation')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ModerationController {
  constructor(private readonly moderationService: ModerationService, private readonly supportService: SupportService, private readonly supportEmail: SupportEmailService) {}

  @Get('queue')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  getQueue(@Req() request: AuthenticatedRequest) {
    return this.moderationService.getQueue(request.user);
  }

  @Get('resources/:id/review-history')
  @Roles(UserRole.STUDENT, UserRole.LECTURER, UserRole.ADMIN)
  getResourceReviewHistory(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.moderationService.getResourceReviewHistory(id, request.user);
  }

  @Post('resources/:id/appeals')
  @Roles(UserRole.STUDENT, UserRole.LECTURER)
  @UseGuards(CsrfGuard)
  createAppeal(@Param('id') id: string, @Body() dto: CreateResourceAppealDto, @Req() request: AuthenticatedRequest) {
    return this.moderationService.createAppeal(id, request.user, dto);
  }

  @Get('appeals/mine')
  @Roles(UserRole.STUDENT, UserRole.LECTURER)
  getMyAppeals(@Req() request: AuthenticatedRequest) {
    return this.moderationService.getMyAppeals(request.user);
  }

  @Get('appeals')
  @Roles(UserRole.ADMIN)
  getAppeals(@Req() request: AuthenticatedRequest) {
    return this.moderationService.getAppeals(request.user);
  }

  @Get('appeals/:id/decisions')
  @Roles(UserRole.ADMIN)
  getAppealDecisionHistory(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.moderationService.getAppealDecisionHistory(id, request.user);
  }

  @Patch('appeals/:id/decision')
  @Roles(UserRole.ADMIN)
  @UseGuards(CsrfGuard)
  decideAppeal(@Param('id') id: string, @Body() dto: DecideResourceAppealDto, @Req() request: AuthenticatedRequest) {
    return this.moderationService.decideAppeal(id, request.user, dto);
  }

  @Patch('resources/:id/override')
  @Roles(UserRole.ADMIN)
  @UseGuards(CsrfGuard)
  overrideReview(@Param('id') id: string, @Body() dto: OverrideModerationReviewDto, @Req() request: AuthenticatedRequest) {
    return this.moderationService.overrideReview(id, request.user, dto);
  }

  @Get('resources/:id/override-history')
  @Roles(UserRole.ADMIN)
  getOverrideHistory(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.moderationService.getOverrideHistory(id, request.user);
  }

  @Get('integrity-monitor')
  @Roles(UserRole.ADMIN)
  getIntegrityReport(@Req() request: AuthenticatedRequest) {
    return this.moderationService.getIntegrityReport(request.user);
  }

  @Get('conflict-declarations')
  @Roles(UserRole.ADMIN)
  getConflictDeclarations(@Req() request: AuthenticatedRequest) {
    return this.moderationService.getConflictDeclarations(request.user);
  }

  @Get('history')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  getHistory(@Req() request: AuthenticatedRequest) {
    return this.moderationService.getHistory(request.user);
  }

  @Get('support-email-status')
  @Roles(UserRole.MODERATOR)
  getSupportEmailStatus() {
    return this.supportEmail.getConfigurationStatus();
  }

  @Get('support-requests')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  getSupportRequests(@Query('status') status?: string) {
    return this.supportService.listForModeration(status === 'concluded' ? 'concluded' : 'pending');
  }

  @Patch('support-requests/:id/conclude')
  @Roles(UserRole.MODERATOR)
  concludeSupportRequest(
    @Param('id') id: string,
    @Body() dto: ConcludeSupportRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.supportService.conclude(id, request.user.id, dto);
  }

  @Patch('resources/:id/assign-reviewer')
  @Roles(UserRole.ADMIN)
  assignReviewer(@Param('id') id: string, @Body() dto: AssignReviewerDto, @Req() request: AuthenticatedRequest) {
    return this.moderationService.assignReviewer(id, dto.reviewerId, request.user.id);
  }

  @Patch('resources/:id/conflict-declaration')
  @Roles(UserRole.REVIEWER)
  @UseGuards(CsrfGuard)
  declareConflict(@Param('id') id: string, @Body() dto: ReviewerConflictDeclarationDto, @Req() request: AuthenticatedRequest) {
    return this.moderationService.declareConflict(id, dto, request.user);
  }

  @Patch('resources/:id/review')
  @Roles(UserRole.REVIEWER)
  reviewResource(
    @Param('id') id: string,
    @Body() dto: ReviewResourceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.moderationService.reviewResource(id, dto, request.user);
  }
}
