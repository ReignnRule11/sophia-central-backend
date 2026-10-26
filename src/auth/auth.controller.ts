import {
  Body,
  Controller,
  Get,
  NotImplementedException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SocialSignInDto } from './dto/social-signin.dto';
import { OnboardingDto } from './dto/onboarding.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { User } from '../users/entities/user.entity';

type AuthenticatedRequest = Request & { user: User };

const ACCESS_COOKIE = 'sophia_access_token';
const CSRF_COOKIE = 'sophia_csrf_token';

function cookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSite = (process.env.AUTH_COOKIE_SAME_SITE || (isProduction ? 'none' : 'lax')) as 'lax' | 'strict' | 'none';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite,
    path: '/',
    maxAge: 15 * 60 * 1000,
  } as const;
}

function csrfCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSite = (process.env.AUTH_COOKIE_SAME_SITE || (isProduction ? 'none' : 'lax')) as 'lax' | 'strict' | 'none';
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite,
    path: '/',
    maxAge: 15 * 60 * 1000,
  } as const;
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

  @Post('signup')
  @ApiOperation({ summary: 'Register with email and password' })
  async signup(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.register(dto);
    const csrfToken = this.setSessionCookies(response, result.accessToken);
    return { user: result.user, csrfToken };
  }

  @Post('login')
  @ApiOperation({ summary: 'Authenticate with email and password' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(dto);
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
    throw new NotImplementedException(
      'Social sign-in is unavailable until provider-issued identity tokens can be verified',
    );
  }

  @Post('google')
  googleSignIn(@Body() dto: SocialSignInDto): never {
    if (dto.provider !== 'google') {
      throw new NotImplementedException('Google sign-in requires verified Google identity-token support');
    }
    throw new NotImplementedException('Google sign-in is disabled until provider-token verification is configured');
  }

  @Post('apple')
  appleSignIn(@Body() dto: SocialSignInDto): never {
    if (dto.provider !== 'apple') {
      throw new NotImplementedException('Apple sign-in requires verified Apple identity-token support');
    }
    throw new NotImplementedException('Apple sign-in is disabled until provider-token verification is configured');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getMe(@Req() req: AuthenticatedRequest) {
    return this.authService.getCurrentUser(req.user.id);
  }

  private setSessionCookies(response: Response, accessToken: string): string {
    const csrfToken = randomBytes(32).toString('hex');
    response.cookie(ACCESS_COOKIE, accessToken, cookieOptions());
    response.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions());
    return csrfToken;
  }
}
