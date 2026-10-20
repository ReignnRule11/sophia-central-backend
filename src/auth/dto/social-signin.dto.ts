import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SocialSignInDto } from './dto/social-signin.dto';
import { OnboardingDto } from './dto/onboarding.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  signup(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('onboarding')
  @UseGuards(AuthGuard('jwt'))
  onboarding(@Req() req: any, @Body() onboardingDto: OnboardingDto) {
    return this.authService.completeOnboarding(req.user.userId, onboardingDto);
  }

  @Post('social')
  socialAuth(@Body() socialSignInDto: SocialSignInDto) {
    return this.authService.socialSignIn(socialSignInDto);
  }

  @Post('google')
  googleSignIn(@Body() payload: SocialSignInDto) {
    return this.authService.socialSignIn({
      ...payload,
      provider: 'google',
    });
  }

  @Post('apple')
  appleSignIn(@Body() payload: SocialSignInDto) {
    return this.authService.socialSignIn({
      ...payload,
      provider: 'apple',
    });
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getMe(@Req() req: any) {
    return this.authService.getCurrentUser(req.user.userId);
  }
}
