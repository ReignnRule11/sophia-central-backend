import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { SupportCaseService } from './support-case.service';

@ApiTags('Support case management')
@Controller('support-requests/cases')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Roles(UserRole.SUPPORT)
export class SupportCasesController {
  constructor(private readonly cases: SupportCaseService) {}

  @Get('assignees')
  assignees(@CurrentUser() actor: User) { return this.cases.assignees(actor); }

  @Get()
  queue(
    @CurrentUser() actor: User,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigned') assigned?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (assigned && !['me', 'unassigned', 'all'].includes(assigned)) throw new BadRequestException('Choose a valid assignment filter.');
    return this.cases.queue(actor, { status, priority, assigned, q, page, limit });
  }

  @Post(':id/assignment')
  @UseGuards(CsrfGuard)
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() body: { assigneeId: string | null }, @CurrentUser() actor: User) {
    if (body.assigneeId !== null && (typeof body.assigneeId !== 'string' || !body.assigneeId.trim())) throw new BadRequestException('Provide a valid Support assignee or null to unassign.');
    return this.cases.assign(id, actor, body.assigneeId);
  }

  @Post(':id/priority')
  @UseGuards(CsrfGuard)
  priority(@Param('id', ParseUUIDPipe) id: string, @Body() body: { priority: 'low' | 'normal' | 'high' | 'urgent' }, @CurrentUser() actor: User) {
    return this.cases.setPriority(id, actor, body.priority);
  }

  @Post(':id/notes')
  @UseGuards(CsrfGuard)
  note(@Param('id', ParseUUIDPipe) id: string, @Body() body: { body: string }, @CurrentUser() actor: User) {
    return this.cases.addInternalNote(id, actor, body.body);
  }

  @Get(':id/notes')
  notes(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.cases.notes(id, actor);
  }

  @Get(':id/timeline')
  timeline(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.cases.timeline(id, actor);
  }
}
