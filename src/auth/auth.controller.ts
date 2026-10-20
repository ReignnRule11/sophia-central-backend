import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SocialSignInDto } from './dto/social-signin.dto';
import { OnboardingDto } from './dto/onboarding.dto';

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    const user = await this.usersService.create({
      ...registerDto,
      password: await bcrypt.hash(registerDto.password, 10),
      authProvider: 'email',
    });

    return this.buildAuthResponse(user);
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const validPassword = await bcrypt.compare(loginDto.password, user.password || '');
    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  async socialSignIn(socialDto: SocialSignInDto) {
    const provider = socialDto.provider.toLowerCase();
    const allowedProviders = ['google', 'apple', 'twitter', 'linkedin', 'instagram'];

    if (!allowedProviders.includes(provider)) {
      throw new BadRequestException('Unsupported auth provider');
    }

    const existingUser = await this.usersService.findByEmail(socialDto.email || `${provider}-unknown@local.dev`);

    if (existingUser) {
      return this.buildAuthResponse(existingUser);
    }

    const user = await this.usersService.create({
      firstName: socialDto.firstName || 'New',
      lastName: socialDto.lastName || 'User',
      email: socialDto.email || `${provider}-${Date.now()}@local.dev`,
      password: await bcrypt.hash(`social-${provider}-${Date.now()}`, 10),
      authProvider: provider,
      socialHandle: socialDto.socialHandle,
      profileImage: socialDto.profileImage,
      isVerified: true,
      // optional fields for onboarding
      institution: socialDto.institution,
      faculty: socialDto.faculty,
      department: socialDto.department,
    });

    return this.buildAuthResponse(user);
  }

  async completeOnboarding(userId: string, onboardingDto: OnboardingDto) {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const updatedUser = await this.usersService.update(userId, {
      ...onboardingDto,
      isProfileComplete: true,
      isVerified: true,
    });

    return this.buildAuthResponse(updatedUser);
  }

  async getCurrentUser(userId: string) {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    return { user };
  }

  private async buildAuthResponse(user: any) {
    const payload: AuthTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const token = await this.jwtService.signAsync(payload);

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        authProvider: user.authProvider,
        socialHandle: user.socialHandle,
        profileImage: user.profileImage,
        institution: user.institution,
        department: user.department,
        faculty: user.faculty,
        isProfileComplete: user.isProfileComplete,
        isVerified: user.isVerified,
      },
    };
  }
}
