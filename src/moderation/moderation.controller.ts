import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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
import { EscalateReviewDto } from './dto/escalate-review.dto';

type AuthenticatedRequest = Request & { user: User };

@ApiTags('Moderation')
@Controller('moderation')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

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

  @Get('conflict-declarations')
  @Roles(UserRole.ADMIN)
  getConflictDeclarations(@Req() request: AuthenticatedRequest) {
    return this.moderationService.getConflictDeclarations(request.user);
  }

  @Get('escalations')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  getReviewEscalations(@Req() request: AuthenticatedRequest) {
    return this.moderationService.listReviewEscalations(request.user);
  }

  @Post('resources/:id/escalate-review')
  @Roles(UserRole.REVIEWER)
  @UseGuards(CsrfGuard)
  escalateReview(@Param('id') id: string, @Body() dto: EscalateReviewDto, @Req() request: AuthenticatedRequest) {
    return this.moderationService.escalateReview(id, dto.reason, request.user);
  }

  @Get('reviewers')
  @Roles(UserRole.ADMIN)
  getReviewerRoster(@Req() request: AuthenticatedRequest) {
    return this.moderationService.getReviewerRoster(request.user);
  }

  @Get('assignable-reviewers')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  getAssignableReviewers(@Req() request: AuthenticatedRequest) {
    return this.moderationService.getAssignableReviewers(request.user);
  }

  @Get('history')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  getHistory(@Req() request: AuthenticatedRequest) {
    return this.moderationService.getHistory(request.user);
  }

  @Patch('resources/:id/assign-reviewer')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  assignReviewer(@Param('id') id: string, @Body() dto: AssignReviewerDto, @Req() request: AuthenticatedRequest) {
    return this.moderationService.assignReviewer(id, dto.reviewerId, request.user);
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
