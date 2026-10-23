import {
  Body,
  Controller,
  Get,
  NotImplementedException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SocialSignInDto } from './dto/social-signin.dto';
import { OnboardingDto } from './dto/onboarding.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';

type AuthenticatedRequest = Request & { user: User };

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Register with email and password' })
  signup(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Authenticate with email and password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('onboarding')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  onboarding(@Req() req: AuthenticatedRequest, @Body() dto: OnboardingDto) {
    return this.authService.completeOnboarding(req.user.id, dto);
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
}
