import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OnboardingDto } from './dto/onboarding.dto';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.usersService.findByEmail(email);

    if (existing) {
      throw new ConflictException(
        'User with this email already exists',
      );
    }

    const user = await this.usersService.create({
      email,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      password: await bcrypt.hash(dto.password, 12),
      institution: dto.institution,
      faculty: dto.faculty,
      department: dto.department,
      socialHandle: dto.socialHandle,
      socialLinks: dto.socialLinks,
      authProvider: 'email',
      isVerified: false,
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(
      dto.email.trim().toLowerCase(),
    );

    const passwordMatches = user?.password
      ? await bcrypt.compare(dto.password, user.password)
      : false;

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  async completeOnboarding(userId: string, dto: OnboardingDto) {
    const user = await this.usersService.update(userId, {
      institution: dto.institution,
      faculty: dto.faculty,
      department: dto.department,
      studyLevel: dto.studyLevel,
      bio: dto.bio,
      socialHandle: dto.socialHandle,
      socialLinks: dto.socialLinks,
      isProfileComplete: true,
    });

    return this.buildAuthResponse(user);
  }

  async getCurrentUser(userId: string) {
    const user = await this.usersService.findOne(userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { password: _password, ...safeUser } = user;

    return { user: safeUser };
  }

  private async buildAuthResponse(user: User) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const { password: _password, ...safeUser } = user;

    return { accessToken, user: safeUser };
  }
}
