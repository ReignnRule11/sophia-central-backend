import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateContentReportDto } from './dto/create-content-report.dto';
import { UpdateContentReportDto } from './dto/update-content-report.dto';
import { ContentReportStatus } from './entities/content-report.entity';
import { ContentReportsService } from './reports.service';

type AuthenticatedRequest = Request & { user: User };

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reports: ContentReportsService) {}

  @Post()
  @Roles(UserRole.STUDENT, UserRole.LECTURER)
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateContentReportDto) {
    return this.reports.create(request.user, dto);
  }

  @Get('mine')
  @Roles(UserRole.STUDENT, UserRole.LECTURER)
  mine(@Req() request: AuthenticatedRequest) {
    return this.reports.listMine(request.user.id);
  }

  @Get('/../moderation')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  moderatorQueue() {
    return this.reports.listForModeration();
  }
}

@ApiTags('Moderation reports')
@Controller('moderation/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ModerationReportsController {
  constructor(private readonly reports: ContentReportsService) {}

  @Get()
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  list(@Query('status') status?: ContentReportStatus) {
    return this.reports.listForModeration(status);
  }

  @Patch(':id')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentReportDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reports.update(id, request.user, dto);
  }
}
