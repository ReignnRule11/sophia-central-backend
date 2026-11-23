import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateContentReportDto } from './dto/create-content-report.dto';
import { UpdateContentReportDto } from './dto/update-content-report.dto';
import { AdminEscalationDecisionDto } from '../common/dto/admin-escalation-decision.dto';
import { ContentReportStatus } from './entities/content-report.entity';
import { AssignReportDto } from './dto/assign-report.dto';
import { SetReportSeverityDto } from './dto/set-report-severity.dto';
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
}

@ApiTags('Moderation reports')
@Controller('moderation/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ModerationReportsController {
  constructor(private readonly reports: ContentReportsService) {}

  @Get()
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  list(
    @Query('status') status: ContentReportStatus | undefined,
    @Query('assignedToMe') assignedToMe: string | undefined,
    @Query('unassigned') unassigned: string | undefined,
    @Query('severity') severity: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reports.listForModeration(request.user, status, {
      assignedToMe: assignedToMe === 'true',
      unassigned: unassigned === 'true',
      severity,
    });
  }

  @Get(':id/history')
  caseHistory(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.reports.getCaseHistory(id, request.user);
  }

  @Patch(':id/assignment')
  @UseGuards(CsrfGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignReportDto, @Req() request: AuthenticatedRequest) {
    return this.reports.assignReport(id, request.user, dto.moderatorId, dto.reason);
  }

  @Patch(':id/severity')
  @UseGuards(CsrfGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  severity(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetReportSeverityDto, @Req() request: AuthenticatedRequest) {
    return this.reports.setSeverity(id, request.user, dto.severity, dto.reason);
  }

  @Get('admin/escalations')
  @Roles(UserRole.ADMIN)
  adminEscalations(@Req() request: AuthenticatedRequest) {
    return this.reports.listAdminEscalations(request.user);
  }

  @Post(':id/admin-decision')
  @UseGuards(CsrfGuard)
  @Roles(UserRole.ADMIN)
  adminDecision(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminEscalationDecisionDto, @Req() request: AuthenticatedRequest) {
    return this.reports.recordAdminEscalationDecision(id, request.user, dto);
  }

  @Patch(':id/escalate')
  @UseGuards(CsrfGuard)
  @Roles(UserRole.MODERATOR)
  escalate(@Param('id', ParseUUIDPipe) id: string, @Body() body: { targetRole: 'admin'; reason: string }, @Req() request: AuthenticatedRequest) {
    if (!body.reason?.trim() || body.targetRole !== 'admin') throw new BadRequestException('Moderation reports may only be escalated to Admin; provide a reason.');
    return this.reports.escalate(id, request.user, UserRole.ADMIN, body.reason);
  }

  @Patch(':id')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContentReportDto, @Req() request: AuthenticatedRequest) {
    return this.reports.update(id, request.user, dto);
  }
}
