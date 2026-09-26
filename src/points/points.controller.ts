import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PointsService } from './points.service';
import { AwardPointsDto } from './dto/award-points.dto';

@ApiTags('Points')
@Controller('points')
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get(':userId/balance')
  getBalance(@Param('userId') userId: string) {
    return this.pointsService.getBalance(userId);
  }

  @Get(':userId/transactions')
  getTransactions(@Param('userId') userId: string, @Query('limit') limit?: string) {
    return this.pointsService.getTransactions(userId, Number(limit || 20));
  }

  @Post('award')
  awardPoints(@Body() dto: AwardPointsDto) {
    return this.pointsService.awardPoints(dto);
  }
}
