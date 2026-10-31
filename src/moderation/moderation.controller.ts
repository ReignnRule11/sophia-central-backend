import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { ModerationService } from './moderation.service';
import { ReviewResourceDto } from './dto/review-resource.dto';
import { SupportService } from '../support/support.service';
import { ConcludeSupportRequestDto } from '../support/dto/conclude-support-request.dto';

type AuthenticatedRequest = Request & { user: User };

@ApiTags('Moderation')
@Controller('moderation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MODERATOR, UserRole.ADMIN)
@ApiBearerAuth()
export class ModerationController {
  constructor(private readonly moderationService: ModerationService, private readonly supportService: SupportService) {}

  @Get('queue')
  getQueue() {
    return this.moderationService.getQueue();
  }

  @Get('history')
  getHistory() {
    return this.moderationService.getHistory();
  }

  @Get('support-requests')
  getSupportRequests(@Query('status') status?: string) {
    return this.supportService.listForModeration(status === 'concluded' ? 'concluded' : 'pending');
  }

  @Patch('support-requests/:id/conclude')
  concludeSupportRequest(
    @Param('id') id: string,
    @Body() dto: ConcludeSupportRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.supportService.conclude(id, request.user.id, dto);
  }

  @Patch('resources/:id/review')
  reviewResource(
    @Param('id') id: string,
    @Body() dto: ReviewResourceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.moderationService.reviewResource(id, dto, request.user.id);
  }
}
