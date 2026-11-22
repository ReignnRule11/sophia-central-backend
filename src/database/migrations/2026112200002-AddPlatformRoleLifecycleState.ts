import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformRoleLifecycleState2026112200002 implements MigrationInterface {
  name = 'AddPlatformRoleLifecycleState2026112200002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "platformRoleStatus" varchar(16) NOT NULL DEFAULT 'pending'
    `);
    await queryRunner.query(`
      UPDATE users
      SET "platformRoleStatus" = CASE
        WHEN "platformRoleVerifiedAt" IS NULL THEN 'pending'
        WHEN "isSuspended" = true THEN 'suspended'
        ELSE 'approved'
      END
      WHERE role IN ('support', 'moderator')
    `);
    await queryRunner.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS "CHK_users_platform_role_status"
    `);
    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT "CHK_users_platform_role_status"
      CHECK ("platformRoleStatus" IN ('pending', 'approved', 'suspended', 'revoked'))
    `);
    await queryRunner.query(`
      ALTER TABLE platform_role_audit_events
      ADD COLUMN IF NOT EXISTS reason text
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE platform_role_audit_events DROP COLUMN IF EXISTS reason
    `);
    await queryRunner.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS "CHK_users_platform_role_status"
    `);
    await queryRunner.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS "platformRoleStatus"
    `);
  }
}
