import { Controller, Post, Get, Param, Body, UseGuards, Patch, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { ReferralService } from './referral.service';

@ApiTags('Referrals')
@Controller('referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post('generate-code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate or retrieve the student permanent referral code' })
  async generateCode(@CurrentUser() user: User) {
    return this.referralService.generateReferralCode(user.id);
  }

  @Get(':userId/referrals')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get referral totals and reward eligibility statuses' })
  async getUserReferrals(@Param('userId') userId: string, @CurrentUser() user: User) {
    return this.referralService.getUserReferrals(userId, user.id);
  }

  @Get('moderation/queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List referral rewards requiring manual fraud review' })
  async getReviewQueue() {
    return this.referralService.getReferralReviewQueue();
  }

  @Patch(':referralId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve or reject a referral held for manual review' })
  async reviewReferral(
    @Param('referralId') referralId: string,
    @Body() body: { decision?: 'approve' | 'reject'; reason?: string },
    @CurrentUser() reviewer: User,
  ) {
    if (body.decision !== 'approve' && body.decision !== 'reject') {
      throw new BadRequestException('decision must be approve or reject.');
    }
    return this.referralService.reviewReferral(referralId, body.decision, body.reason ?? '', reviewer.id);
  }
}
