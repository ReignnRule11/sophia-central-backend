import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  BadRequestException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole, User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetReviewerAccessDto } from './dto/set-reviewer-access.dto';
import { SetSecurityQuestionDto } from './dto/set-security-question.dto';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';
import { RequestAccountDeletionDto } from './dto/request-account-deletion.dto';
import { TransitionExternalReviewerDto } from './dto/transition-external-reviewer.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get('management')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List account details for authorized moderation management' })
  managementList() {
    return this.usersService.findAllForManagement();
  }

  @Get('platform-accounts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'View the single designated Support and Moderator accounts' })
  getPlatformAccounts(@CurrentUser() actor: User) {
    return this.usersService.getPlatformAccounts(actor.id);
  }

  @Get('admin/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated Admin dashboard overview' })
  getAdminOverview(@CurrentUser() actor: User) {
    return this.usersService.getAdminOverview(actor.id);
  }

  @Get('admin/audit-events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recent immutable platform-role and reviewer decision audit events' })
  getAdminAuditEvents(@CurrentUser() actor: User, @Query('limit') limit?: string) {
    const parsedLimit = limit === undefined ? 50 : Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100.');
    }
    return this.usersService.getAdminAuditEvents(actor.id, parsedLimit);
  }

  @Patch(':id/platform-role')
  @UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin-link one verified existing account to the Support or Moderator platform role' })
  async setPlatformRole(@Param('id') id: string, @Body() body: { role: UserRole }, @CurrentUser() actor: User) {
    if (body.role !== UserRole.SUPPORT && body.role !== UserRole.MODERATOR) {
      throw new BadRequestException('Only the dedicated Support or Moderator platform role can be assigned here.');
    }
    return this.usersService.assignPlatformRole(actor.id, id, body.role);
  }

  @Patch(':id/reviewer-access')
  @UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Grant or revoke academic reviewer access; administrator approval is required' })
  setReviewerAccess(@Param('id') id: string, @Body() dto: SetReviewerAccessDto) {
    return this.usersService.setReviewerAccess(id, dto);
  }

  @Patch(':id/platform-access')
  @UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspend, restore or revoke the designated Support or Moderator workspace access' })
  updatePlatformAccess(
    @Param('id') id: string,
    @Body() body: { action: 'suspend' | 'restore' | 'revoke'; reason?: string },
    @CurrentUser() actor: User,
  ) {
    if (!['suspend', 'restore', 'revoke'].includes(body.action)) {
      throw new BadRequestException('action must be suspend, restore or revoke.');
    }
    if (body.action !== 'restore' && !body.reason?.trim()) {
      throw new BadRequestException('A reason is required for suspension or revocation.');
    }
    return this.usersService.updatePlatformRoleAccess(actor.id, id, body.action, body.reason);
  }

  @Post(':id/reactivate')
  @UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reactivate a voluntarily deactivated account without overriding moderator suspension' })
  async reactivateDeactivatedAccount(@Param('id') id: string, @CurrentUser() actor: User) {
    const target = await this.usersService.findOne(id);
    if (actor.role === UserRole.MODERATOR && target &&
      (target.role === UserRole.ADMIN || target.role === UserRole.SUPPORT || target.role === UserRole.MODERATOR)) {
      throw new ForbiddenException('Moderators cannot change the lifecycle of platform-owned accounts.');
    }
    return this.usersService.reactivateDeactivatedAccount(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspend or restore an account with a recorded reason' })
  async setStatus(@Param('id') id: string, @Body() body: { isSuspended?: boolean; reason?: string }, @CurrentUser() actor: User) {
    if (typeof body.isSuspended !== 'boolean' || !body.reason?.trim()) {
      throw new BadRequestException('isSuspended and a reason are required');
    }
    const target = await this.usersService.findOne(id);
    if (actor.role === UserRole.MODERATOR && target &&
      (target.role === UserRole.ADMIN || target.role === UserRole.SUPPORT || target.role === UserRole.MODERATOR)) {
      throw new ForbiddenException('Moderators cannot change the lifecycle of platform-owned accounts.');
    }
    if (actor.role === UserRole.ADMIN && target &&
      (target.role === UserRole.SUPPORT || target.role === UserRole.MODERATOR)) {
      return this.usersService.updatePlatformRoleAccess(actor.id, id, body.isSuspended ? 'suspend' : 'restore', body.reason);
    }
    return this.usersService.update(id, { isSuspended: body.isSuspended, suspensionReason: body.isSuspended ? body.reason.trim() : undefined });
  }

  @Post('me/academic-account-transition')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Convert an approved External Reviewer account once to either Student or Lecturer' })
  transitionExternalReviewer(@CurrentUser() user: User, @Body() dto: TransitionExternalReviewerDto) {
    return this.usersService.transitionExternalReviewer(user.id, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser() user: User) {
    return this.usersService.findOne(user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own profile (administrators may update any profile)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: User,
  ) {
    if (currentUser.id !== id && currentUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You may only update your own profile');
    }
    return this.usersService.update(id, dto);
  }

  @Get('me/security-question')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current account security-question setup status' })
  getSecurityQuestionStatus(@CurrentUser() user: User) {
    return this.usersService.getSecurityQuestionStatus(user.id);
  }

  @Patch('me/security-question')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set or update the account security question after password verification' })
  setSecurityQuestion(@CurrentUser() user: User, @Body() dto: SetSecurityQuestionDto) {
    return this.usersService.setSecurityQuestion(user.id, dto.password, dto.questionId, dto.answer, dto.currentAnswer);
  }

  @Post('me/deactivate')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Temporarily deactivate the authenticated account' })
  async deactivateOwnAccount(@CurrentUser() user: User, @Body() dto: DeactivateAccountDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.usersService.deactivateOwnAccount(user.id, dto.password);
    this.clearAuthCookies(response);
    return { ...result, message: 'Your account has been deactivated. To return, sign in and verify the one-time code sent to your registered email, then confirm reactivation.' };
  }

  @Post('me/deletion-request')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Schedule permanent account deletion after a 30-day grace period' })
  async requestOwnAccountDeletion(@CurrentUser() user: User, @Body() dto: RequestAccountDeletionDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.usersService.requestOwnAccountDeletion(user.id, dto.password, dto.securityAnswer);
    this.clearAuthCookies(response);
    return { ...result, message: 'Your account is scheduled for permanent deletion in 30 days. You can cancel the request during the grace period.' };
  }

  private clearAuthCookies(response: Response) {
    const isProduction = process.env.NODE_ENV === 'production';
    const sameSite = (process.env.AUTH_COOKIE_SAME_SITE || (isProduction ? 'none' : 'lax')) as 'lax' | 'strict' | 'none';
    const cookieOptions = { httpOnly: true, secure: isProduction, sameSite, path: '/' } as const;
    response.clearCookie('sophia_access_token', cookieOptions);
    response.clearCookie('sophia_csrf_token', { ...cookieOptions, httpOnly: false });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a user' })
  remove(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.usersService.remove(id, actor);
  }
}
