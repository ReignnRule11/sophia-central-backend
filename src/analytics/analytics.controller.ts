import { Controller, Get, Query, UseGuards, Post, Body, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('search-event')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record an authenticated user search for aggregate analytics' })
  recordSearch(@Body() body: { query?: string }, @CurrentUser() user: User) {
    if (typeof body.query !== 'string') throw new BadRequestException('query is required');
    return this.analyticsService.recordSearch(user.id, body.query);
  }

  @Get('lecturer/resources')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LECTURER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get resource engagement analytics for the authenticated lecturer only' })
  getLecturerResourceAnalytics(@CurrentUser() user: User) {
    return this.analyticsService.getLecturerResourceAnalytics(user.id);
  }

  @Get('activity')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get aggregate search, activity, retention and popular resource metrics by account role' })
  getActivityAnalytics(@Query('role') role: string) {
    if (role !== UserRole.STUDENT && role !== UserRole.LECTURER) throw new BadRequestException('role must be student or lecturer');
    return this.analyticsService.getActivityAnalytics(role as UserRole);
  }

  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get platform analytics dashboard' })
  async getDashboard() {
    return this.analyticsService.getDashboard();
  }

  @Get('resources')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get resource analytics' })
  async getResourceAnalytics() {
    return this.analyticsService.getResourceAnalytics();
  }

  @Get('moderation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get moderation analytics' })
  async getModerationAnalytics() {
    return this.analyticsService.getModerationAnalytics();
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get aggregate user growth analytics for authorized administrators and moderators' })
  async getUserAnalytics() {
    return this.analyticsService.getUserAnalytics();
  }
}
