import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserActivityEvents2026110100002 implements MigrationInterface {
  name = 'AddUserActivityEvents2026110100002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS user_activity_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" varchar(64) NOT NULL,
      "eventType" varchar(32) NOT NULL,
      "resourceId" uuid,
      query text,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_user_activity_user_created ON user_activity_events ("userId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_user_activity_type_created ON user_activity_events ("eventType", "createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_activity_type_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_activity_user_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_activity_events`);
  }
}
