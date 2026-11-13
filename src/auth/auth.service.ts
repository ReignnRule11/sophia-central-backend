import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OnboardingDto } from './dto/onboarding.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { PasswordResetEmailService } from './password-reset-email.service';
import { EmailVerificationEmailService } from './email-verification-email.service';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/entities/user.entity';
import { ReferralService } from '../referral/referral.service';

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_RESPONSE = 'If an unverified account exists for that email, a verification link will be sent.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    @InjectRepository(EmailVerificationToken)
    private readonly verificationTokens: Repository<EmailVerificationToken>,
    private readonly resetEmail: PasswordResetEmailService,
    private readonly verificationEmail: EmailVerificationEmailService,
    private readonly referralService: ReferralService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.usersService.findByEmail(email);
    if (existing) throw new ConflictException('User with this email already exists');

    const academicHandle = dto.academicHandle.trim().replace(/^@/, '').toLowerCase();
    const existingHandle = await this.usersService.findByAcademicHandle(academicHandle);
    if (existingHandle) throw new ConflictException('Academic handle already exists');

    const role = dto.role ?? UserRole.STUDENT;
    if (dto.referralCode && role === UserRole.STUDENT) {
      await this.referralService.validateReferralCode(dto.referralCode, email);
    }

    const user = await this.usersService.create({
      email,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      academicHandle,
      password: await bcrypt.hash(dto.password, 12),
      role,
      institution: dto.institution?.trim() || undefined,
      faculty: dto.faculty?.trim() || undefined,
      department: dto.department?.trim() || undefined,
      socialHandle: dto.socialHandle,
      socialLinks: dto.socialLinks,
      authProvider: 'email',
      isVerified: false,
      emailVerified: false,
    });

    const emailSent = await this.issueEmailVerification(user, dto.referralCode && role === UserRole.STUDENT ? dto.referralCode : undefined);
    return {
      user: this.toSafeUser(user),
      emailSent,
      message: emailSent
        ? 'Account created. Check your inbox and verify your email before signing in.'
        : 'Your account was created, but the verification email could not be sent. Request a new verification link before signing in.',
    };
  }

  async login(dto: LoginDto) {
    const identifier = dto.identifier.trim();
    const looksLikeEmail = identifier.indexOf('@') > 0 && identifier.slice(identifier.lastIndexOf('@') + 1).includes('.');
    let user = looksLikeEmail
      ? await this.usersService.findByEmail(identifier.toLowerCase())
      : await this.usersService.findByAcademicHandle(identifier);
    const passwordMatches = user?.password ? await bcrypt.compare(dto.password, user.password) : false;
    if (!user || !passwordMatches) throw new UnauthorizedException('Invalid credentials');
    if (user.authProvider === 'email' && user.emailVerified === false) {
      throw new ForbiddenException('Please verify your email address before signing in. Open the verification page to resend your activation link.');
    }
    if (user.isSuspended) throw new UnauthorizedException('This account is suspended. Contact Sophis Central support for assistance.');
    if (user.accountStatus === 'pending_deletion') {
      throw new ForbiddenException('This account has a pending deletion request. Cancel the request during the 30-day grace period before signing in.');
    }
    if (user.accountStatus === 'deactivated') {
      user = await this.usersService.update(user.id, { accountStatus: 'active' });
    }
    return this.buildAuthResponse(user);
  }


  async cancelPendingAccountDeletion(dto: { email: string; password: string; securityAnswer: string }) {
    return this.usersService.cancelPendingDeletion(dto.email, dto.password, dto.securityAnswer);
  }

  async resendEmailVerification(dto: { email: string }): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);
    if (user && user.authProvider === 'email' && user.emailVerified === false) {
      const latestToken = await this.verificationTokens.findOne({ where: { userId: user.id }, order: { createdAt: 'DESC' } });
      const sentRecently = latestToken && Date.now() - latestToken.createdAt.getTime() < 60_000;
      if (!sentRecently) await this.issueEmailVerification(user, latestToken?.referralCode);
    }
    return { message: EMAIL_VERIFICATION_RESPONSE };
  }

  async confirmEmailVerification(token: string): Promise<{ message: string }> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const tokenRecord = await this.verificationTokens.findOne({ where: { tokenHash } });
    if (!tokenRecord || tokenRecord.expiresAt.getTime() <= Date.now()) {
      // Keep an expired record until resend so any pending referral code can be carried forward.
      throw new UnauthorizedException('This verification link is invalid or has expired. Request a new link and try again.');
    }

    const user = await this.usersService.findOne(tokenRecord.userId);
    if (!user || user.authProvider !== 'email') {
      await this.verificationTokens.delete({ id: tokenRecord.id });
      throw new UnauthorizedException('This verification link is invalid or has expired. Request a new link and try again.');
    }

    if (!user.emailVerified) {
      await this.usersService.update(user.id, { emailVerified: true });
    }
    await this.verificationTokens.delete({ userId: user.id });

    // Referral rewards are only attributed after the referred email has been verified.
    if (tokenRecord.referralCode && user.role === UserRole.STUDENT) {
      try {
        await this.referralService.redeemReferral(tokenRecord.referralCode, user);
      } catch (error) {
        this.logger.warn(`Referral attribution could not be completed after email verification for user ${user.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    return { message: 'Your email has been verified. You can now sign in to Sophis Central.' };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto): Promise<{ message: string }> {
    const generic = { message: 'If an account exists for that email, password reset instructions will be sent.' };
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.password || user.authProvider !== 'email') return generic;

    await this.resetTokens.delete({ userId: user.id });
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.resetTokens.save(this.resetTokens.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    }));

    try {
      await this.resetEmail.sendResetLink(user.email, token, user.firstName);
    } catch {
      await this.resetTokens.delete({ tokenHash });
      return generic;
    }
    return generic;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const tokenRecord = await this.resetTokens.findOne({ where: { tokenHash } });
    if (!tokenRecord || tokenRecord.expiresAt.getTime() <= Date.now()) {
      if (tokenRecord) await this.resetTokens.delete({ id: tokenRecord.id });
      throw new UnauthorizedException('Password reset link is invalid or expired');
    }

    const consumed = await this.resetTokens.createQueryBuilder()
      .delete()
      .where('"id" = :id AND "expiresAt" > NOW()', { id: tokenRecord.id })
      .returning('"userId"')
      .execute();
    if (!consumed.affected) throw new UnauthorizedException('Password reset link is invalid or expired');

    const password = await bcrypt.hash(dto.password, 12);
    await this.usersService.update(tokenRecord.userId, { password });
    await this.resetTokens.delete({ userId: tokenRecord.userId });
    return { message: 'Password has been reset. You can now sign in with your new password.' };
  }

  async completeOnboarding(userId: string, dto: OnboardingDto) {
    const currentUser = await this.usersService.findOne(userId);
    if (!currentUser) throw new UnauthorizedException('User not found');
    const user = await this.usersService.update(userId, {
      ...(!currentUser.isProfileComplete ? { institution: dto.institution } : {}),
      faculty: dto.faculty,
      department: dto.department,
      programme: dto.programme,
      coursesTaught: dto.coursesTaught,
      teachingAssignments: dto.teachingAssignments,
      studyLevel: dto.studyLevel,
      bio: dto.bio,
      ...(dto.academicHandle !== undefined ? { academicHandle: dto.academicHandle.trim().replace(/^@+/, '').toLowerCase() } : {}),
      socialHandle: dto.socialHandle,
      socialLinks: dto.socialLinks,
      isProfileComplete: true,
    });
    // Referral processing is post-onboarding work. A reward/catalogue failure
    // must never roll back or block a student's or lecturer's profile completion.
    await this.processPendingReferralSafely(userId);
    return this.buildAuthResponse(user);
  }

  private async processPendingReferralSafely(userId: string): Promise<void> {
    try {
      await this.referralService.processPendingReferralForUser(userId);
    } catch (error) {
      this.logger.warn(`Referral processing deferred for user ${userId}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async getCurrentUser(userId: string) {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new UnauthorizedException('User not found');
    // Re-evaluate legacy pending attribution without making sign-in/session
    // retrieval depend on the referral subsystem being available.
    await this.processPendingReferralSafely(userId);
    return { user: this.toSafeUser(user) };
  }

  private async issueEmailVerification(user: User, referralCode?: string): Promise<boolean> {
    await this.verificationTokens.delete({ userId: user.id });
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.verificationTokens.save(this.verificationTokens.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      referralCode,
    }));

    try {
      await this.verificationEmail.sendVerificationLink(user.email, token, user.firstName);
      return true;
    } catch (error) {
      // Keep the hashed token record so a later resend can preserve a pending referral attribution.
      // The raw token was not delivered, so only a newly generated token can activate the account.
      this.logger.error(`Verification email could not be delivered for user ${user.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  }

  private toSafeUser(user: User) {
    const { password: _password, ...safeUser } = user;
    return safeUser;
  }

  private async buildAuthResponse(user: User) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken, user: this.toSafeUser(user) };
  }
}
