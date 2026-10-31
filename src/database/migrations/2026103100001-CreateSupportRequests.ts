import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSupportRequests2026103100001 implements MigrationInterface {
  name = 'CreateSupportRequests2026103100001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "support_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "subject" character varying(180) NOT NULL,
        "category" character varying(60) NOT NULL,
        "description" text NOT NULL,
        "links" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "resolutionMessage" text,
        "reviewerId" uuid,
        "concludedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_requests_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_support_requests_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_support_requests_reviewer" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_support_requests_status_createdAt" ON "support_requests" ("status", "createdAt")');
    await queryRunner.query('CREATE INDEX "IDX_support_requests_userId" ON "support_requests" ("userId")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "support_requests"');
  }
}
