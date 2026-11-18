import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAcademicAccountTransitions2026111700003 implements MigrationInterface {
  name = 'AddAcademicAccountTransitions2026111700003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "academicAccountType" varchar(24)`);
    await queryRunner.query(`
      UPDATE "users"
      SET "academicAccountType" = CASE
        WHEN "role" = 'student' THEN 'student'
        WHEN "role" = 'lecturer' THEN 'lecturer'
        WHEN "role" = 'reviewer' THEN 'external_reviewer'
        ELSE NULL
      END
      WHERE "academicAccountType" IS NULL
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "academic_account_transitions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "fromAccountType" varchar(24) NOT NULL,
        "toAccountType" varchar(24) NOT NULL,
        "actorId" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_academic_account_transition_one_way"
          CHECK ("fromAccountType" = 'external_reviewer' AND "toAccountType" IN ('student', 'lecturer'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_academic_account_transitions_user_created" ON "academic_account_transitions" ("userId", "createdAt" DESC)`);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_academic_account_transitions_immutable"
      BEFORE UPDATE OR DELETE ON "academic_account_transitions"
      FOR EACH ROW EXECUTE FUNCTION prevent_immutable_audit_mutation()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "academic_account_transitions"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "academicAccountType"`);
  }
}
