import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
import { PreAccount } from './entities/pre-account.entity';
import { RegistrationDraft } from './entities/registration-draft.entity';
import { RegistrationTokenService, type RegistrationTokenPayload } from './registration-token.service';
import { PasswordResetEmailService } from './password-reset-email.service';
import { EmailVerificationEmailService } from './email-verification-email.service';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/entities/user.entity';
import { ReferralService } from '../referral/referral.service';

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PRE_ACCOUNT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_RESPONSE = 'If the registration can be verified, a verification link will be sent.';

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
    @InjectRepository(PreAccount)
    private readonly preAccounts: Repository<PreAccount>,
    @InjectRepository(RegistrationDraft)
    private readonly registrationDrafts: Repository<RegistrationDraft>,
    private readonly dataSource: DataSource,
    private readonly registrationTokens: RegistrationTokenService,
    private readonly resetEmail: PasswordResetEmailService,
    private readonly verificationEmail: EmailVerificationEmailService,
    private readonly referralService: ReferralService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const academicHandle = dto.academicHandle.trim().replace(/^@/, '').toLowerCase();
    const existingUser = await this.usersService.findByEmail(email);
    let existingPreAccount = await this.preAccounts.findOne({ where: { email } });
    const existingDraft = await this.registrationDrafts.findOne({ where: { email } });
    if (existingDraft && existingDraft.expiresAt.getTime() <= Date.now()) {
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(PreAccount).delete({ email });
        await manager.getRepository(RegistrationDraft).delete({ email });
      });
      existingPreAccount = null;
    }
    if (existingUser || existingPreAccount || (existingDraft && existingDraft.expiresAt.getTime() > Date.now())) {
      return { emailSent: false, message: 'If this address can be registered, a verification link will be sent. Check your inbox.' };
    }
    const existingHandle = await this.usersService.findByAcademicHandle(academicHandle);
    const reservedHandle = await this.registrationDrafts.findOne({ where: { academicHandle } });
    if (reservedHandle && reservedHandle.expiresAt.getTime() <= Date.now()) {
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(PreAccount).delete({ email: reservedHandle.email });
        await manager.getRepository(RegistrationDraft).delete({ email: reservedHandle.email });
      });
    }
    if (existingHandle || (reservedHandle && reservedHandle.expiresAt.getTime() > Date.now())) throw new ConflictException('Academic handle taken');

    const role = dto.role ?? UserRole.STUDENT;
    const referralCode = role === UserRole.STUDENT ? dto.referralCode?.trim() || undefined : undefined;
    if (referralCode) await this.referralService.validateReferralCode(referralCode, email);

    // Registration data is encrypted into the email link. No user row or
    // pending-registration row is created before onboarding is completed.
    const token = this.registrationTokens.seal({
      stage: 'verify',
      jti: randomBytes(32).toString('hex'),
      expiresAt: Date.now() + EMAIL_VERIFICATION_TTL_MS,
      email,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      academicHandle,
      role,
      referralCode,
    });
    try {
      await this.verificationEmail.sendVerificationLink(email, token, dto.firstName.trim());
      return { emailSent: true, message: 'Check your inbox. Verify your email, create your password, then complete your academic profile to create your account.' };
    } catch (error) {
      this.logger.error(`Registration verification email could not be sent: ${error instanceof Error ? error.message : 'unknown error'}`);
      return { emailSent: false, message: 'The verification email could not be sent. Please retry registration.' };
    }
  }

  async login(dto: LoginDto) {
    const identifier = dto.identifier.trim();
    const looksLikeEmail = identifier.indexOf('@') > 0 && identifier.slice(identifier.lastIndexOf('@') + 1).includes('.');
    const looksLikeInstitutionId = /^SC-/i.test(identifier);
    let user = looksLikeEmail
      ? await this.usersService.findByEmail(identifier.toLowerCase())
      : looksLikeInstitutionId
        ? await this.usersService.findByUniqueId(identifier)
        : await this.usersService.findByAcademicHandle(identifier);

    if (!user && looksLikeEmail) {
      const email = identifier.toLowerCase();
      const preAccount = await this.preAccounts.findOne({ where: { email } });
      const draft = await this.registrationDrafts.findOne({ where: { email } });
      const passwordMatches = preAccount?.password ? await bcrypt.compare(dto.password, preAccount.password) : false;
      if (!preAccount || !draft || !passwordMatches || draft.expiresAt.getTime() <= Date.now()) {
        if (draft && draft.expiresAt.getTime() <= Date.now()) {
          await this.preAccounts.delete({ email });
          await this.registrationDrafts.delete({ email });
        }
        throw new UnauthorizedException('Invalid credentials');
      }
      const metadata = this.registrationTokens.open(draft.encryptedPayload);
      if (metadata.stage !== 'pre-account-draft' || String(metadata.email).toLowerCase() !== email) {
        throw new UnauthorizedException('This onboarding record is invalid. Please contact support.');
      }
      return {
        preAccountRequired: true as const,
        onboardingToken: this.registrationTokens.seal({
          stage: 'pre-account',
          email,
          jti: randomBytes(32).toString('hex'),
          expiresAt: draft.expiresAt.getTime(),
        }),
        preAccount: {
          email,
          firstName: String(metadata.firstName || ''),
          lastName: String(metadata.lastName || ''),
          academicHandle: String(metadata.academicHandle || ''),
          role: metadata.role as UserRole,
        },
      };
    }

    const passwordMatches = user?.password ? await bcrypt.compare(dto.password, user.password) : false;
    if (!user || !passwordMatches) throw new UnauthorizedException('Invalid credentials');
    if (user.emailVerified !== true) {
      throw new ForbiddenException('Please verify your email address before signing in. Open the verification page to resend your activation link.');
    }
    if (user.accountStatus === 'pending_deletion') {
      throw new ForbiddenException('This account has a pending deletion request. Cancel the request during the 30-day grace period before signing in.');
    }
    if (user.isSuspended) throw new UnauthorizedException('This account is suspended. Contact Sophis Central support for assistance.');
    if (user.accountStatus === 'deactivated') {
      user = await this.usersService.update(user.id, { accountStatus: 'active' });
    }
    user = await this.usersService.update(user.id, { lastLoginAt: new Date() });
    return this.buildAuthResponse(user);
  }


  async cancelPendingAccountDeletion(dto: { email: string; password: string; securityAnswer: string }) {
    return this.usersService.cancelPendingDeletion(dto.email, dto.password, dto.securityAnswer);
  }

  async resendEmailVerification(dto: { email: string; firstName?: string; lastName?: string; academicHandle?: string; role?: UserRole; referralCode?: string }): Promise<{ message: string }> {
    // New registrations are stateless: the browser resubmits the original
    // registration fields when requesting another link. No pending PII is stored.
    const email = dto.email.trim().toLowerCase();
    if (dto.firstName && dto.lastName && dto.academicHandle && dto.role) {
      const existingAccount = await this.usersService.findByEmail(email);
      if (!existingAccount) {
        await this.register({
          email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          academicHandle: dto.academicHandle,
          role: dto.role,
          referralCode: dto.referralCode,
        } as RegisterDto);
        return { message: EMAIL_VERIFICATION_RESPONSE };
      }
      // Fall through to the legacy-account resend path only for an already
      // existing unverified account. Verified accounts remain non-enumerated.
    }

    // Compatibility for older, already-created but unverified accounts.
    const user = await this.usersService.findByEmail(email);
    if (user && user.authProvider === 'email' && user.emailVerified !== true) {
      const latestToken = await this.verificationTokens.findOne({ where: { userId: user.id }, order: { createdAt: 'DESC' } });
      const sentRecently = latestToken && Date.now() - latestToken.createdAt.getTime() < 60_000;
      if (!sentRecently) await this.issueEmailVerification(user, latestToken?.referralCode);
    }
    return { message: EMAIL_VERIFICATION_RESPONSE };
  }

  async confirmEmailVerification(token: string, password: string): Promise<{ message: string; onboardingToken?: string; preAccount?: { email: string; firstName: string; lastName: string; academicHandle: string; role: UserRole } }> {
    let registration: RegistrationTokenPayload | null = null;
    try { registration = this.registrationTokens.open(token); } catch { registration = null; }
    if (registration?.stage === 'verify') {
      const email = String(registration.email || '').trim().toLowerCase();
      const academicHandle = String(registration.academicHandle || '').trim().replace(/^@+/, '').toLowerCase();
      const firstName = String(registration.firstName || '').trim();
      const lastName = String(registration.lastName || '').trim();
      const role = registration.role as UserRole;
      if (!email || !academicHandle || !firstName || !lastName || !registration.jti || ![UserRole.STUDENT, UserRole.LECTURER].includes(role)) {
        throw new UnauthorizedException('This verification link is invalid or has expired. Please restart registration.');
      }
      if (await this.usersService.findByEmail(email)) throw new ConflictException('An account already exists for this email. Sign in instead.');
      if (await this.preAccounts.findOne({ where: { email } })) throw new ConflictException('A pre-account already exists for this email. Sign in to continue onboarding.');
      const existingHandle = await this.usersService.findByAcademicHandle(academicHandle);
      const reservedHandle = await this.registrationDrafts.findOne({ where: { academicHandle } });
      if (existingHandle || (reservedHandle && reservedHandle.expiresAt.getTime() > Date.now())) {
        throw new ConflictException('Academic handle taken. Please restart registration with another handle.');
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const claimed = await this.registrationTokens.claimOnce(
        registration.jti,
        Math.ceil((registration.expiresAt - Date.now()) / 1000),
      );
      if (!claimed) throw new UnauthorizedException('This verification link has already been used. Request a new link.');

      const expiresAt = new Date(Date.now() + PRE_ACCOUNT_TTL_MS);
      try {
        await this.dataSource.transaction(async (manager) => {
          await manager.getRepository(PreAccount).save({ email, password: passwordHash });
          await manager.getRepository(RegistrationDraft).save({
            email,
            academicHandle,
            encryptedPayload: this.registrationTokens.seal({
              ...registration,
              stage: 'pre-account-draft',
              jti: undefined,
              expiresAt: expiresAt.getTime(),
            }),
            expiresAt,
          });
        });
      } catch (error) {
        await this.registrationTokens.releaseClaim(registration.jti);
        if (((error as { code?: string; driverError?: { code?: string } })?.driverError?.code ?? (error as { code?: string })?.code) === '23505') {
          throw new ConflictException('Academic handle taken or an account already exists for this email.');
        }
        throw error;
      }
      const onboardingToken = this.registrationTokens.seal({
        stage: 'pre-account',
        email,
        jti: randomBytes(32).toString('hex'),
        expiresAt: expiresAt.getTime(),
      });
      return {
        message: 'Your email has been verified. Your pre-account is saved. Complete your academic profile now or sign in later to resume.',
        onboardingToken,
        preAccount: { email, firstName, lastName, academicHandle, role },
      };
    }

    // Compatibility path for accounts created before the no-pre-account flow.
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const tokenRecord = await this.verificationTokens.findOne({ where: { tokenHash } });
    if (!tokenRecord || tokenRecord.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('This verification link is invalid or has expired. Request a new link and try again.');
    }
    const user = await this.usersService.findOne(tokenRecord.userId);
    if (!user || user.authProvider !== 'email') {
      await this.verificationTokens.delete({ id: tokenRecord.id });
      throw new UnauthorizedException('This verification link is invalid or has expired. Request a new link and try again.');
    }
    if (!user.emailVerified) await this.usersService.update(user.id, { emailVerified: true, password: await bcrypt.hash(password, 12) });
    await this.verificationTokens.delete({ userId: user.id });
    if (tokenRecord.referralCode && user.role === UserRole.STUDENT) {
      try { await this.referralService.redeemReferral(tokenRecord.referralCode, user); }
      catch (error) { this.logger.warn(`Referral attribution could not be completed after email verification for user ${user.id}: ${error instanceof Error ? error.message : 'unknown error'}`); }
    }
    return { message: 'Your email has been verified. You can now sign in to Sophis Central.' };
  }

  async completePreAccountOnboarding(token: string, dto: OnboardingDto) {
    const registration = this.registrationTokens.open(token);
    if (registration.stage !== 'pre-account') throw new UnauthorizedException('Complete email verification before onboarding.');
    const email = String(registration.email || '').trim().toLowerCase();
    if (!email || !registration.jti) throw new UnauthorizedException('Your pre-account session is invalid. Please sign in again.');
    const [preAccount, draft] = await Promise.all([
      this.preAccounts.findOne({ where: { email } }),
      this.registrationDrafts.findOne({ where: { email } }),
    ]);
    if (!preAccount || !draft || draft.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Your pre-account has expired. Please restart registration.');
    }
    const metadata = this.registrationTokens.open(draft.encryptedPayload);
    if (metadata.stage !== 'pre-account-draft' || String(metadata.email).toLowerCase() !== email) {
      throw new UnauthorizedException('Your saved onboarding details could not be verified.');
    }
    const academicHandle = String(metadata.academicHandle || '').trim().replace(/^@+/, '').toLowerCase();
    const firstName = String(metadata.firstName || '').trim();
    const lastName = String(metadata.lastName || '').trim();
    const role = metadata.role as UserRole;
    const passwordHash = preAccount.password;
    if (!academicHandle || !firstName || !lastName || !passwordHash || ![UserRole.STUDENT, UserRole.LECTURER].includes(role)) {
      throw new UnauthorizedException('Your pre-account details are incomplete. Please contact support.');
    }
    if (!dto.institutionId || !dto.faculty?.trim() || !dto.department?.trim()) {
      throw new BadRequestException('Institution, faculty and department are required to complete onboarding.');
    }
    if (role === UserRole.STUDENT && (!dto.studyLevel?.trim() || !dto.programme?.trim())) {
      throw new BadRequestException('Your current academic level and programme are required.');
    }
    if (role === UserRole.LECTURER && (!dto.teachingAssignments?.length || !dto.coursesTaught?.length)) {
      throw new BadRequestException('Add at least one course taught, including its course code and academic level.');
    }
    if (await this.usersService.findByEmail(email)) throw new ConflictException('An account already exists for this email. Sign in instead.');
    if (await this.usersService.findByAcademicHandle(academicHandle)) throw new ConflictException('Academic handle taken. Please contact support to update your saved handle.');

    const claimed = await this.registrationTokens.claimOnce(
      registration.jti,
      Math.ceil((registration.expiresAt - Date.now()) / 1000),
    );
    if (!claimed) throw new UnauthorizedException('This onboarding session has already been used or expired.');
    let user: User;
    try {
      user = await this.dataSource.transaction(async (manager) => {
        const created = await this.usersService.createWithManager(manager, {
          email,
          firstName,
          lastName,
          academicHandle,
          role,
          password: passwordHash,
          authProvider: 'email',
          emailVerified: true,
          isVerified: false,
          isProfileComplete: true,
          accountStatus: 'active',
          institutionId: dto.institutionId,
          institution: dto.institution,
          faculty: dto.faculty?.trim() ?? '',
          department: dto.department?.trim() ?? '',
          programme: dto.programme?.trim(),
          studyLevel: dto.studyLevel?.trim(),
          coursesTaught: dto.coursesTaught,
          teachingAssignments: dto.teachingAssignments,
          bio: dto.bio?.trim(),
          socialHandle: dto.socialHandle?.trim(),
          socialLinks: dto.socialLinks,
        });
        await manager.getRepository(PreAccount).delete({ email });
        await manager.getRepository(RegistrationDraft).delete({ email });
        return created;
      });
    } catch (error) {
      await this.registrationTokens.releaseClaim(registration.jti);
      if ((error as { code?: string })?.code === '23505') {
        throw new ConflictException('Academic handle taken or an account already exists for this email.');
      }
      throw error;
    }

    const referralCode = typeof metadata.referralCode === 'string' ? metadata.referralCode : undefined;
    if (referralCode && role === UserRole.STUDENT) {
      try { await this.referralService.redeemReferral(referralCode, user); }
      catch (error) { this.logger.warn(`Referral attribution could not be completed after onboarding for user ${user.id}: ${error instanceof Error ? error.message : 'unknown error'}`); }
    }
    // Transactional user creation generates the permanent Institution ID and
    // the database CreateDateColumn records account creation at this exact stage.
    return this.buildAuthResponse(user);
  }

  async checkAcademicHandleAvailability(handle: string): Promise<{ available: boolean; message: string }> {
    const normalized = handle.trim().replace(/^@+/, '').toLowerCase();
    if (!/^[a-zA-Z0-9._]{3,30}$/.test(normalized)) return { available: false, message: 'Enter a valid academic handle.' };
    const [user, draft] = await Promise.all([
      this.usersService.findByAcademicHandle(normalized),
      this.registrationDrafts.findOne({ where: { academicHandle: normalized } }),
    ]);
    if (draft && draft.expiresAt.getTime() <= Date.now()) {
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(PreAccount).delete({ email: draft.email });
        await manager.getRepository(RegistrationDraft).delete({ email: draft.email });
      });
    }
    const available = !user && (!draft || draft.expiresAt.getTime() <= Date.now());
    return { available, message: available ? 'Academic handle available' : 'Academic handle taken' };
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
    if (!dto.institutionId || !dto.faculty?.trim() || !dto.department?.trim()) {
      throw new BadRequestException('Institution, faculty and department are required to complete onboarding.');
    }
    if (currentUser.role === UserRole.STUDENT && (!dto.studyLevel?.trim() || !dto.programme?.trim())) {
      throw new BadRequestException('Your current academic level and programme are required.');
    }
    if (currentUser.role === UserRole.LECTURER && (!dto.teachingAssignments?.length || !dto.coursesTaught?.length)) {
      throw new BadRequestException('Add at least one course taught, including its course code and academic level.');
    }
    const user = await this.usersService.update(userId, {
      ...(!currentUser.isProfileComplete ? { institutionId: dto.institutionId, institution: dto.institution } : {}),
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
