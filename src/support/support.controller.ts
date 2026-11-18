import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { Request } from 'express';
import { ConcludeSupportRequestDto } from './dto/conclude-support-request.dto';
import { SupportEmailService } from './support-email.service';
type AuthenticatedRequest = Request & { user: User };
import { SupportService } from './support.service';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';

@ApiTags('Support')
@Controller('support-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(private readonly support: SupportService, private readonly supportEmail: SupportEmailService) {}

  @Get('email-status')
  @Roles(UserRole.SUPPORT)
  emailStatus() { return this.supportEmail.getConfigurationStatus(); }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateSupportRequestDto) {
    return this.support.create(user, dto);
  }

  @Get('queue')
  @Roles(UserRole.SUPPORT)
  queue(@Query('status') status?: string) {
    const allowed = ['pending', 'under_review', 'reviewed', 'response_sent', 'concluded'] as const;
    const value = allowed.find(item => item === status) || 'pending';
    return this.support.listForModeration(value);
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPPORT)
  updateStatus(@Param('id') id: string, @Body() body: { status: 'under_review' | 'reviewed' }, @Req() request: AuthenticatedRequest) {
    if (!['under_review', 'reviewed'].includes(body.status)) throw new BadRequestException('Choose a valid support ticket status.');
    return this.support.updateStatus(id, request.user, body.status);
  }

  @Patch(':id/respond')
  @Roles(UserRole.SUPPORT)
  respond(@Param('id') id: string, @Body() dto: ConcludeSupportRequestDto, @Req() request: AuthenticatedRequest) {
    return this.support.conclude(id, request.user.id, dto);
  }

  @Patch(':id/escalate')
  @Roles(UserRole.SUPPORT)
  escalate(@Param('id') id: string, @Body() body: { targetRole: 'moderator' | 'admin'; reason: string }, @Req() request: AuthenticatedRequest) {
    if (!body.reason?.trim() || !['moderator', 'admin'].includes(body.targetRole)) throw new BadRequestException('Choose a valid escalation destination and provide a reason.');
    return this.support.escalate(id, request.user, body.targetRole as UserRole.MODERATOR | UserRole.ADMIN, body.reason);
  }

  @Get('mine')
  listMine(@CurrentUser() user: User) {
    return this.support.listMine(user.id);
  }
}
