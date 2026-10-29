import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiTags } from '@nestjs/swagger';
import { PointsService } from './points.service';
import { AwardPointsDto } from './dto/award-points.dto';

@ApiTags('Points')
@Controller('points')
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('me/balance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getMyBalance(@CurrentUser() user: User) {
    return this.pointsService.getBalance(user.id);
  }

  @Get('me/transactions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getMyTransactions(@CurrentUser() user: User, @Query('limit') limit?: string) {
    return this.pointsService.getTransactions(user.id, Number(limit || 20));
  }

  @Get(':userId/balance')
  getBalance(@Param('userId') userId: string) {
    return this.pointsService.getBalance(userId);
  }

  @Get(':userId/transactions')
  getTransactions(@Param('userId') userId: string, @Query('limit') limit?: string) {
    return this.pointsService.getTransactions(userId, Number(limit || 20));
  }

  @Post('award')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  awardPoints(@Body() dto: AwardPointsDto) {
    return this.pointsService.awardPoints(dto);
  }
}
