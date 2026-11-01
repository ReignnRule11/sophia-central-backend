import { Controller, Get, Post, Param, Body, Query, UseGuards, ForbiddenException, BadRequestException } from '@nestjs/common';
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

  @Get('my-wallet/balance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getMyBalance(@CurrentUser() user: User) {
    return this.pointsService.getBalance(user.id);
  }

  @Get('my-wallet/transactions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getMyTransactions(@CurrentUser() user: User, @Query('limit') limit?: string) {
    return this.pointsService.getTransactions(user.id, Number(limit || 20));
  }

  @Get(':userId/balance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getBalance(@Param('userId') userId: string, @CurrentUser() currentUser: User) {
    if (currentUser.id !== userId && ![UserRole.ADMIN, UserRole.MODERATOR].includes(currentUser.role)) throw new ForbiddenException('You may only inspect your own wallet.');
    return this.pointsService.getBalance(userId);
  }

  @Get(':userId/transactions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getTransactions(@Param('userId') userId: string, @CurrentUser() currentUser: User, @Query('limit') limit?: string) {
    if (currentUser.id !== userId && ![UserRole.ADMIN, UserRole.MODERATOR].includes(currentUser.role)) throw new ForbiddenException('You may only inspect your own wallet.');
    const parsedLimit = Number(limit || 20);
    return this.pointsService.getTransactions(userId, Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 20);
  }

  @Post('adjust')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  async adjustPoints(@Body() body: { userId?: string; amount?: number; reason?: string }, @CurrentUser() currentUser: User) {
    if (!body.userId || typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount === 0 || !body.reason?.trim()) throw new BadRequestException('userId, a non-zero integer amount, and a reason are required');
    return this.pointsService.adjustPoints(body.userId, body.amount as number, body.reason.trim(), currentUser.id);
  }

  @Post('award')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  awardPoints(@Body() dto: AwardPointsDto) {
    return this.pointsService.awardPoints(dto);
  }
}
