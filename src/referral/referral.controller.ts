import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { ReferralService } from './referral.service';

@ApiTags('Referrals')
@Controller('referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post('generate-code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate referral code for user' })
  async generateCode(@CurrentUser() user: User) {
    return this.referralService.generateReferralCode(user.id);
  }

  @Get(':userId/referrals')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user referral stats' })
  async getUserReferrals(@Param('userId') userId: string, @CurrentUser() user: User) {
    return this.referralService.getUserReferrals(userId, user.id);
  }
}
