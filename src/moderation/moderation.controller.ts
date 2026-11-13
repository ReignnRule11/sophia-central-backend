import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { ModerationService } from './moderation.service';
import { ReviewResourceDto } from './dto/review-resource.dto';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
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

  @Get('history')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  getHistory(@Req() request: AuthenticatedRequest) {
    return this.moderationService.getHistory(request.user);
  }

  @Get('support-email-status')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  getSupportEmailStatus() {
    return this.supportEmail.getConfigurationStatus();
  }

  @Get('support-requests')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  getSupportRequests(@Query('status') status?: string) {
    return this.supportService.listForModeration(status === 'concluded' ? 'concluded' : 'pending');
  }

  @Patch('support-requests/:id/conclude')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  concludeSupportRequest(
    @Param('id') id: string,
    @Body() dto: ConcludeSupportRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.supportService.conclude(id, request.user.id, dto);
  }

  @Patch('resources/:id/assign-reviewer')
  @Roles(UserRole.ADMIN)
  assignReviewer(@Param('id') id: string, @Body() dto: AssignReviewerDto) {
    return this.moderationService.assignReviewer(id, dto.reviewerId);
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
