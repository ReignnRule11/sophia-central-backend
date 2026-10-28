import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { ModerationService } from './moderation.service';
import { ReviewResourceDto } from './dto/review-resource.dto';

type AuthenticatedRequest = Request & { user: User };

@ApiTags('Moderation')
@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  @ApiBearerAuth()
  getQueue() {
    return this.moderationService.getQueue();
  }

  @Patch('resources/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  @ApiBearerAuth()
  reviewResource(
    @Param('id') id: string,
    @Body() dto: ReviewResourceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    // Reviewer identity must come from the authenticated session, never the request body.
    return this.moderationService.reviewResource(id, dto, request.user.id);
  }
}
