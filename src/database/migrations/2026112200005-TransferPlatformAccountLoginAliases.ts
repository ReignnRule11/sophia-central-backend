import { MigrationInterface, QueryRunner } from 'typeorm';

type IdentityRow = { id: string; email: string; authProvider: string };

export class TransferPlatformAccountLoginAliases2026112200005 implements MigrationInterface {
  name = 'TransferPlatformAccountLoginAliases2026112200005';

  private async transfer(
    queryRunner: QueryRunner,
    label: string,
    predicate: string,
    alias: string,
  ): Promise<void> {
    const rows: IdentityRow[] = await queryRunner.query(
      `SELECT id, email, "authProvider" FROM users WHERE ${predicate} FOR UPDATE`,
    );
    if (rows.length === 0) return; // Fresh/test databases may not contain provisioned platform identities.
    if (rows.length !== 1) {
      throw new Error(`Expected exactly one existing ${label} identity; found ${rows.length}. No login email was changed.`);
    }

    const identity = rows[0];
    if (identity.authProvider !== 'email') {
      throw new Error(`The existing ${label} account does not use email/password authentication. Resolve its authentication method before transferring the login alias.`);
    }
    if (identity.email.trim().toLowerCase() === alias) return;

    const collisions: IdentityRow[] = await queryRunner.query(
      'SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1',
      [alias, identity.id],
    );
    if (collisions.length) {
      throw new Error(`The reserved ${label} alias is already attached to another account. No login email was changed.`);
    }

    await queryRunner.query(
      'UPDATE users SET email = $1, "emailVerified" = false WHERE id = $2',
      [alias, identity.id],
    );

    // Invalidate any verification links issued for the previous address.
    if (await queryRunner.hasTable('email_verification_tokens')) {
      await queryRunner.query(
        'DELETE FROM email_verification_tokens WHERE "userId" = $1',
        [identity.id],
      );
    }
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.transfer(
      queryRunner,
      'Moderator',
      `role = 'moderator'`,
      'sophiscentral+moderator@gmail.com',
    );
    await this.transfer(
      queryRunner,
      'Global Reviewer',
      `"isGlobalReviewer" = true`,
      'sophiscentral+reviewer@gmail.com',
    );
  }

  async down(): Promise<void> {
    // Login email transfers are intentionally irreversible by automatic rollback.
    // Reverting could restore obsolete or unverified mailbox identities.
  }
}
