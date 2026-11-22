import 'dotenv/config';
import AppDataSource from '../src/database/data-source';
import { User, UserRole } from '../src/users/entities/user.entity';

async function main() {
  if (process.env.ADMIN_MFA_RESET_ENABLED !== 'true') {
    throw new Error('Set ADMIN_MFA_RESET_ENABLED=true for this owner-authorized recovery command.');
  }

  const email = (process.env.ADMIN_MFA_RESET_EMAIL || '').trim().toLowerCase();
  const confirmation = (process.env.ADMIN_MFA_RESET_CONFIRM_EMAIL || '').trim().toLowerCase();
  const operatorEmail = (process.env.ADMIN_MFA_RESET_OPERATOR_EMAIL || '').trim().toLowerCase();
  const reason = (process.env.ADMIN_MFA_RESET_REASON || '').trim();

  if (!email || email !== confirmation) {
    throw new Error('ADMIN_MFA_RESET_EMAIL and ADMIN_MFA_RESET_CONFIRM_EMAIL must match the exact Admin login email.');
  }
  if (!operatorEmail || !operatorEmail.includes('@')) {
    throw new Error('ADMIN_MFA_RESET_OPERATOR_EMAIL must identify the authorized operator.');
  }
  if (reason.length < 30) {
    throw new Error('ADMIN_MFA_RESET_REASON must contain at least 30 characters explaining the recovery.');
  }

  try {
    await AppDataSource.initialize();
    const auditTable = await AppDataSource.query(
      `SELECT to_regclass('public.admin_mfa_audit_events') AS table_name`,
    );
    if (!auditTable[0]?.table_name) {
      throw new Error('Admin MFA audit migration is missing. Apply reviewed migrations before recovery.');
    }

    await AppDataSource.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['sophis-central-admin-mfa-reset']);
      const admins = await manager.getRepository(User).find({ where: { role: UserRole.ADMIN } });
      if (admins.length !== 1) throw new Error(`Expected exactly one Admin identity; found ${admins.length}.`);
      if (admins[0].email.trim().toLowerCase() !== email) {
        throw new Error('The confirmed email does not match the existing Admin identity. No changes were made.');
      }

      const admin = await manager.findOne(User, {
        where: { id: admins[0].id, role: UserRole.ADMIN },
        lock: { mode: 'pessimistic_write' },
      });
      if (!admin || admin.adminMfaEnabled !== true) {
        throw new Error('Admin MFA is not enabled for this identity. No changes were made.');
      }

      await manager.update(User, admin.id, {
        adminMfaEnabled: false,
        adminMfaSecretEncrypted: null,
        adminMfaRecoveryCodeHashes: [],
      });
      await manager.query(
        'INSERT INTO admin_mfa_audit_events ("targetId", email, action, method, "actorEmail", reason) VALUES ($1::uuid, $2, $3, $4, $5, $6)',
        [admin.id, admin.email, 'mfa_reset', 'owner_cli', operatorEmail, reason],
      );
    });

    process.stdout.write(`Admin MFA reset completed for ${email}. The next password login will require fresh authenticator enrollment. Notify the account owner through the verified recovery channel.\n`);
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

main().catch(error => {
  process.stderr.write(`Admin MFA recovery failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
