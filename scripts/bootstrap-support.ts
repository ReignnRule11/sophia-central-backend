import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { dataSource } from '../src/database/data-source';
import { User, UserRole } from '../src/users/entities/user.entity';
import { RegistrationTokenService } from '../src/auth/registration-token.service';
import { EmailVerificationEmailService } from '../src/auth/email-verification-email.service';
import { PLATFORM_LOGIN_ALIASES } from '../src/users/platform-login-aliases';

function createSupportUniqueId(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const suffix = Array.from(randomBytes(10), byte => alphabet[byte & 31]).join('');
  return `SC-PLT-SUP-${suffix}`;
}

async function main() {
  if (process.env.SUPPORT_BOOTSTRAP_ENABLED !== 'true') {
    throw new Error('Set SUPPORT_BOOTSTRAP_ENABLED=true for this controlled command.');
  }
  const email = (process.env.SUPPORT_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const confirmation = (process.env.SUPPORT_BOOTSTRAP_CONFIRM_EMAIL || '').trim().toLowerCase();
  const firstName = (process.env.SUPPORT_BOOTSTRAP_FIRST_NAME || '').trim();
  const lastName = (process.env.SUPPORT_BOOTSTRAP_LAST_NAME || '').trim();
  if (!email || email !== confirmation || email !== PLATFORM_LOGIN_ALIASES.support) {
    throw new Error('Both email confirmation values must match the reserved Support login alias.');
  }
  if (!firstName || !lastName) throw new Error('Set SUPPORT_BOOTSTRAP_FIRST_NAME and SUPPORT_BOOTSTRAP_LAST_NAME.');
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
    throw new Error('A production JWT_SECRET of at least 32 characters is required.');
  }

  const config = new ConfigService(process.env);
  const registrationTokens = new RegistrationTokenService(config);
  const emailService = new EmailVerificationEmailService(config);
  try {
    await dataSource.initialize();
    const auditTable = await dataSource.query('SELECT to_regclass(\'public.platform_role_audit_events\') AS table_name');
    if (!auditTable[0]?.table_name) throw new Error('Platform-role audit migration is missing. Apply reviewed migrations first.');
    const result = await dataSource.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['sophis-central-support-bootstrap']);
      const existingSupport = await manager.getRepository(User).find({ where: { role: UserRole.SUPPORT } });
      const existing = await manager.getRepository(User).findOne({ where: { email } });
      if (existingSupport.length > 1) throw new Error('Multiple Support accounts exist. Stop and reconcile manually.');
      if (existingSupport.length === 1) {
        if (!existing || existingSupport[0].id !== existing.id || existing.email.toLowerCase() !== email) {
          throw new Error('A different Support identity already exists. Bootstrap will not replace it.');
        }
        if (existing.emailVerified || existing.platformRoleStatus !== 'pending' || existing.accountStatus !== 'active' || existing.isSuspended) {
          throw new Error('The existing Support account is already verified or unavailable. No changes were made.');
        }
        return { user: existing, created: false };
      }
      if (existing) throw new Error('The reserved Support email already belongs to another account. It will not be promoted.');
      const repository = manager.getRepository(User);
      const user = repository.create({
        uniqueId: createSupportUniqueId(),
        email,
        firstName,
        lastName,
        role: UserRole.SUPPORT,
        authProvider: 'email',
        emailVerified: false,
        isVerified: false,
        isSuspended: false,
        accountStatus: 'active',
        platformRoleStatus: 'pending',
        platformRoleVerifiedAt: null,
        hasReviewerAccess: false,
        isGlobalReviewer: false,
        reviewerStatus: 'not_applied',
        isProfileComplete: true,
      });
      const saved = await repository.save(user);
      await manager.query(
        'INSERT INTO platform_role_audit_events ("actorId", "targetId", role, action, "previousRole", "newRole", reason, "actorEmail", "targetEmail") VALUES (NULL, $1::uuid, $2, $3, NULL, $4, $5, NULL, $6)',
        [saved.id, UserRole.SUPPORT, 'bootstrap_created', UserRole.SUPPORT, 'Controlled Support account bootstrap; pending email verification and Admin approval.', email],
      );
      return { user: saved, created: true };
    });
    await registrationTokens.onModuleInit();
    const token = registrationTokens.seal({
      stage: 'support-bootstrap',
      userId: result.user.id,
      email,
      jti: randomBytes(32).toString('hex'),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    await emailService.sendVerificationLink(email, token, firstName);
    process.stdout.write(`Support bootstrap ${result.created ? 'created' : 'verification resent'} for ${email}. A single-use password-setup link was emailed; Admin approval is still required. No password or token was printed.\n`);
  } finally {
    await registrationTokens.onModuleDestroy().catch(() => undefined);
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}
main().catch(error => {
  process.stderr.write(`Support bootstrap failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
