import {
  Body, Controller, Get, NotImplementedException, Post, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SocialSignInDto } from './dto/social-signin.dto';
import { OnboardingDto } from './dto/onboarding.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendEmailVerificationDto } from './dto/resend-email-verification.dto';
import { ConfirmEmailVerificationDto } from './dto/confirm-email-verification.dto';
import { CompletePreAccountOnboardingDto } from './dto/complete-pre-account-onboarding.dto';
import { SavePreAccountProgressDto } from './dto/save-pre-account-progress.dto';
import { CancelAccountDeletionDto } from './dto/cancel-account-deletion.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { User } from '../users/entities/user.entity';

type AuthenticatedRequest = Request & { user: User };
const ACCESS_COOKIE = 'sophia_access_token';
const CSRF_COOKIE = 'sophia_csrf_token';

function cookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSite = isProduction ? 'none' : 'lax';
  return { httpOnly: true, secure: isProduction, sameSite, path: '/' } as const;
}
function csrfCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSite = isProduction ? 'none' : 'lax';
  return { httpOnly: false, secure: isProduction, sameSite, path: '/' } as const;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('csrf')
  @ApiOperation({ summary: 'Issue a CSRF token for browser cookie authentication' })
  csrf(@Res({ passthrough: true }) response: Response) {
    const token = randomBytes(32).toString('hex');
    response.cookie(CSRF_COOKIE, token, csrfCookieOptions());
    return { csrfToken: token };
  }

  @Get('academic-handle/availability')
  @ApiOperation({ summary: 'Check whether an academic handle is available for registration' })
  academicHandleAvailability(@Query('handle') handle = '') {
    return this.authService.checkAcademicHandleAvailability(handle);
  }

  @Post('signup')
  @ApiOperation({ summary: 'Create an account and send an email activation link; no session is created yet' })
  signup(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('email-verification/resend')
  @ApiOperation({ summary: 'Resend an email activation link without revealing account existence' })
  resendEmailVerification(@Body() dto: ResendEmailVerificationDto) {
    return this.authService.resendEmailVerification(dto);
  }

  @Post('email-verification/confirm')
  @ApiOperation({ summary: 'Verify an email address using its single-use activation token' })
  confirmEmailVerification(@Body() dto: ConfirmEmailVerificationDto) {
    return this.authService.confirmEmailVerification(dto.token, dto.password);
  }

  @Post('login')
  @ApiOperation({ summary: 'Authenticate with verified email and password' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(dto);
    if (!('accessToken' in result)) return result;
    this.setSessionCookies(response, result.accessToken);
    return { user: result.user };
  }

  @Post('account-deletion/cancel')
  @ApiOperation({ summary: 'Cancel a pending account deletion after password and security-answer verification' })
  cancelAccountDeletion(@Body() dto: CancelAccountDeletionDto) {
    return this.authService.cancelPendingAccountDeletion(dto);
  }

  @Post('password-reset/request')
  @ApiOperation({ summary: 'Request password reset instructions without revealing account existence' })
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('password-reset/confirm')
  @ApiOperation({ summary: 'Set a new password using a single-use reset token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('onboarding/progress')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Save encrypted onboarding progress for a verified pre-account' })
  savePreAccountProgress(@Body() dto: SavePreAccountProgressDto) {
    return this.authService.savePreAccountProgress(dto.preAccountToken, dto.progress);
  }

  @Post('onboarding/complete')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Create a verified account after required academic onboarding is complete' })
  async completePreAccountOnboarding(@Body() dto: CompletePreAccountOnboardingDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.completePreAccountOnboarding(dto.preAccountToken, dto);
    this.setSessionCookies(response, result.accessToken);
    return { user: result.user };
  }

  @Post('onboarding')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @ApiBearerAuth()
  async onboarding(@Req() req: AuthenticatedRequest, @Body() dto: OnboardingDto) {
    const result = await this.authService.completeOnboarding(req.user.id, dto);
    return { user: result.user };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @ApiBearerAuth()
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(ACCESS_COOKIE, { ...cookieOptions(), maxAge: undefined });
    response.clearCookie(CSRF_COOKIE, { ...csrfCookieOptions(), maxAge: undefined });
    return { success: true };
  }

  @Post('social')
  @ApiOperation({ summary: 'Social sign-in is disabled until provider-token verification is configured' })
  socialSignIn(@Body() _dto: SocialSignInDto): never {
    throw new NotImplementedException('Social sign-in is unavailable until provider-issued identity tokens can be verified');
  }
  @Post('google')
  googleSignIn(@Body() dto: SocialSignInDto): never {
    if (dto.provider !== 'google') throw new NotImplementedException('Google sign-in requires verified Google identity-token support');
    throw new NotImplementedException('Google sign-in is disabled until provider-token verification is configured');
  }
  @Post('apple')
  appleSignIn(@Body() dto: SocialSignInDto): never {
    if (dto.provider !== 'apple') throw new NotImplementedException('Apple sign-in requires verified Apple identity-token support');
    throw new NotImplementedException('Apple sign-in is disabled until provider-token verification is configured');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getMe(@Req() req: AuthenticatedRequest) {
    const { password: _password, ...safeUser } = req.user;
    return { user: safeUser };
  }

  private setSessionCookies(response: Response, accessToken: string): string {
    const csrfToken = randomBytes(32).toString('hex');
    response.cookie(ACCESS_COOKIE, accessToken, cookieOptions());
    response.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions());
    return csrfToken;
  }
}
