import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSavedResources2026110200001 implements MigrationInterface {
  name = 'CreateSavedResources2026110200001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "saved_resources" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "resourceId" uuid NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_saved_resources_user_resource" UNIQUE ("userId", "resourceId")
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_saved_resources_user_created" ON "saved_resources" ("userId", "createdAt" DESC)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "saved_resources"`);
  }
}