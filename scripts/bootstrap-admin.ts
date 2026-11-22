import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { dataSource } from '../src/database/data-source';
import { User, UserRole } from '../src/users/entities/user.entity';
import { RegistrationTokenService } from '../src/auth/registration-token.service';
import { EmailVerificationEmailService } from '../src/auth/email-verification-email.service';

function createAdminUniqueId(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const suffix = Array.from(randomBytes(10), byte => alphabet[byte & 31]).join('');
  return `SC-PLT-ADM-${suffix}`;
}

async function main() {
  if (process.env.ADMIN_BOOTSTRAP_ENABLED !== 'true') {
    throw new Error('Set ADMIN_BOOTSTRAP_ENABLED=true for this one-time command.');
  }

  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const confirmation = (process.env.ADMIN_BOOTSTRAP_CONFIRM_EMAIL || '').trim().toLowerCase();
  const firstName = (process.env.ADMIN_BOOTSTRAP_FIRST_NAME || '').trim();
  const lastName = (process.env.ADMIN_BOOTSTRAP_LAST_NAME || '').trim();

  if (!email || email !== confirmation) {
    throw new Error('ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_CONFIRM_EMAIL must both be set to the same intended address.');
  }
  if (email !== 'sophiscentral+admin@gmail.com') {
    throw new Error('The initial Admin bootstrap is restricted to the agreed temporary Admin login address.');
  }
  if (!firstName || !lastName) {
    throw new Error('Set ADMIN_BOOTSTRAP_FIRST_NAME and ADMIN_BOOTSTRAP_LAST_NAME.');
  }
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
    throw new Error('A production JWT_SECRET of at least 32 characters is required.');
  }

  const config = new ConfigService(process.env);
  const registrationTokens = new RegistrationTokenService(config);
  const emailService = new EmailVerificationEmailService(config);

  try {
    await dataSource.initialize();
    const migrationTable = await dataSource.query(
      `SELECT to_regclass('public.admin_bootstrap_audit_events') AS table_name`,
    );
    if (!migrationTable[0]?.table_name) {
      throw new Error('Admin bootstrap audit migration is missing. Run the reviewed database migrations before bootstrapping.');
    }

    const result = await dataSource.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['sophis-central-admin-bootstrap']);
      const admins = await manager.getRepository(User).find({ where: { role: UserRole.ADMIN } });
      const existing = await manager.getRepository(User).findOne({ where: { email } });

      if (admins.length > 1) throw new Error('More than one Admin account already exists. Stop and reconcile the records manually.');
      if (admins.length === 1) {
        if (!existing || admins[0].email.toLowerCase() !== email || admins[0].id !== existing.id) {
          throw new Error('An Admin account already exists with a different identity. This bootstrap cannot replace it.');
        }
        if (existing.emailVerified === true) {
          throw new Error('The initial Admin account is already verified. No changes were made.');
        }
        if (existing.accountStatus !== 'active' || existing.isSuspended === true) {
          throw new Error('The pending Admin account is unavailable. Reconcile its state before retrying.');
        }
        return { user: existing, created: false };
      }

      if (existing) {
        throw new Error('The intended email already belongs to a non-Admin account. It will not be promoted by bootstrap.');
      }

      const repository = manager.getRepository(User);
      const user = repository.create({
        uniqueId: createAdminUniqueId(),
        email,
        firstName,
        lastName,
        role: UserRole.ADMIN,
        authProvider: 'email',
        emailVerified: false,
        isVerified: false,
        isSuspended: false,
        accountStatus: 'active',
        hasReviewerAccess: false,
        isGlobalReviewer: false,
        reviewerStatus: 'not_applied',
        isProfileComplete: true,
      });
      const saved = await repository.save(user);
      await manager.query(
        'INSERT INTO admin_bootstrap_audit_events ("targetId", email, action) VALUES ($1::uuid, $2, $3)',
        [saved.id, saved.email, 'created'],
      );
      return { user: saved, created: true };
    });

    await registrationTokens.onModuleInit();
    const token = registrationTokens.seal({
      stage: 'admin-bootstrap',
      userId: result.user.id,
      email,
      jti: randomBytes(32).toString('hex'),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    await emailService.sendVerificationLink(email, token, firstName);

    process.stdout.write(
      `Admin bootstrap ${result.created ? 'created' : 'verification resent'} for ${email}. A single-use password-setup link has been emailed; no password or token was printed.\n`,
    );
  } finally {
    await registrationTokens.onModuleDestroy().catch(() => undefined);
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

main().catch(error => {
  process.stderr.write(`Admin bootstrap failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
