import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { ReferralService } from './referral.service';
import { CreateReferralDto } from './dto/create-referral.dto';

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

  @Post('redeem')
  @ApiOperation({ summary: 'Redeem referral code' })
  async redeemCode(@Body() dto: CreateReferralDto) {
    return this.referralService.redeemReferral(dto.referralCode);
  }

  @Get(':userId/referrals')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user referral stats' })
  async getUserReferrals(@Param('userId') userId: string, @CurrentUser() user: User) {
    return this.referralService.getUserReferrals(userId, user.id);
  }
}
