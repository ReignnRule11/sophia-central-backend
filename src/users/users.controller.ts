import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  BadRequestException,
  Get,
  Param,
  Patch,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole, User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetReviewerAccessDto } from './dto/set-reviewer-access.dto';
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
    return this.usersService.findAll();
  }

  @Patch(':id/reviewer-access')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Grant or revoke academic reviewer access; administrator approval is required' })
  setReviewerAccess(@Param('id') id: string, @Body() dto: SetReviewerAccessDto) {
    return this.usersService.setReviewerAccess(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspend or restore an account with a recorded reason' })
  async setStatus(@Param('id') id: string, @Body() body: { isSuspended?: boolean; reason?: string }) {
    if (typeof body.isSuspended !== 'boolean' || !body.reason?.trim()) {
      throw new BadRequestException('isSuspended and a reason are required');
    }
    return this.usersService.update(id, { isSuspended: body.isSuspended, suspensionReason: body.isSuspended ? body.reason.trim() : undefined });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser() user: User) {
    return this.usersService.findOne(user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
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

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Permanently delete the authenticated student or lecturer account and its records' })
  async removeOwnAccount(@CurrentUser() user: User, @Res({ passthrough: true }) response: Response) {
    if (![UserRole.STUDENT, UserRole.LECTURER].includes(user.role)) {
      throw new ForbiddenException('Only student and lecturer accounts can be deleted from the profile page.');
    }
    await this.usersService.removeOwnAccount(user.id);
    const isProduction = process.env.NODE_ENV === 'production';
    const sameSite = (process.env.AUTH_COOKIE_SAME_SITE || (isProduction ? 'none' : 'lax')) as 'lax' | 'strict' | 'none';
    const cookieOptions = { httpOnly: true, secure: isProduction, sameSite, path: '/' } as const;
    response.clearCookie('sophia_access_token', cookieOptions);
    response.clearCookie('sophia_csrf_token', { ...cookieOptions, httpOnly: false });
    return { success: true, message: 'Your account and associated personal data have been permanently deleted.' };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a user' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
