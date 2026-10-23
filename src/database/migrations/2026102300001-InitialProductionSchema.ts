import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Completes the schema created by the four legacy migrations and adds every
 * remaining entity table. It deliberately fails on unexpected schema drift.
 */
export class InitialProductionSchema2026102300001 implements MigrationInterface {
  name = 'InitialProductionSchema2026102300001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The legacy users table used a PostgreSQL enum and required profile fields.
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN role DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN role TYPE varchar USING role::text`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'student'`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN password DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN "firstName" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN "lastName" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN "socialHandle" varchar`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN "profileImage" varchar`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN "authProvider" varchar NOT NULL DEFAULT 'email'`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN "studyLevel" varchar`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN bio text`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN "isProfileComplete" boolean NOT NULL DEFAULT false`);

    await queryRunner.query(`
      CREATE TABLE faculties (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar NOT NULL,
        "institutionId" uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE departments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar NOT NULL,
        "facultyId" uuid NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE courses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar NOT NULL,
        code varchar,
        description text,
        level varchar,
        "institutionId" uuid REFERENCES institutions(id) ON DELETE SET NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE course_topics (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar NOT NULL,
        description text,
        "courseId" uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE TYPE moderation_reviews_status_enum AS ENUM ('draft','pending','approved','rejected','flagged')`);
    await queryRunner.query(`
      CREATE TABLE moderation_reviews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "resourceId" uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        "reviewerId" uuid REFERENCES users(id) ON DELETE SET NULL,
        status moderation_reviews_status_enum NOT NULL,
        note text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE TYPE point_transactions_type_enum AS ENUM ('earned','spent','bonus')`);
    await queryRunner.query(`
      CREATE TABLE point_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" varchar NOT NULL,
        type point_transactions_type_enum NOT NULL DEFAULT 'earned',
        amount integer NOT NULL,
        reason text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE TYPE file_uploads_status_enum AS ENUM ('pending','completed','failed','scanned')`);
    await queryRunner.query(`
      CREATE TABLE file_uploads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "uploadId" varchar NOT NULL UNIQUE,
        "resourceId" uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        "userId" varchar NOT NULL,
        filename varchar NOT NULL,
        mimetype varchar NOT NULL,
        size bigint NOT NULL,
        "s3Key" varchar NOT NULL,
        status file_uploads_status_enum NOT NULL DEFAULT 'pending',
        "scanResult" text,
        "uploadedAt" timestamptz NOT NULL DEFAULT now(),
        "completedAt" timestamp,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE referrals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "referrerId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code varchar NOT NULL UNIQUE,
        "isActive" boolean NOT NULL DEFAULT true,
        "redeemedAt" timestamp,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" varchar NOT NULL,
        type varchar NOT NULL,
        title varchar NOT NULL,
        message text NOT NULL,
        link varchar,
        "isRead" boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE ai_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" varchar NOT NULL,
        "resourceId" uuid REFERENCES resources(id) ON DELETE SET NULL,
        title varchar NOT NULL,
        notes text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE ai_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sessionId" uuid NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
        role varchar NOT NULL CHECK (role IN ('user','assistant','system')),
        content text NOT NULL,
        metadata jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Kept for the existing SQL consumers introduced by migration 003.
    await queryRunner.query(`
      CREATE TABLE resource_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        resource_id uuid NOT NULL,
        s3_key text NOT NULL,
        url text,
        filename text NOT NULL,
        content_type text,
        size bigint,
        uploaded_by uuid,
        verified boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_resource_files_resource_id ON resource_files(resource_id)`);
    await queryRunner.query(`
      CREATE TABLE ai_usage_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        type text NOT NULL,
        prompt text,
        result_summary text,
        resource_id uuid,
        cost numeric,
        metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_ai_usage_user ON ai_usage_logs(user_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE ai_usage_logs`);
    await queryRunner.query(`DROP TABLE resource_files`);
    await queryRunner.query(`DROP TABLE ai_messages`);
    await queryRunner.query(`DROP TABLE ai_sessions`);
    await queryRunner.query(`DROP TABLE notifications`);
    await queryRunner.query(`DROP TABLE referrals`);
    await queryRunner.query(`DROP TABLE file_uploads`);
    await queryRunner.query(`DROP TYPE file_uploads_status_enum`);
    await queryRunner.query(`DROP TABLE point_transactions`);
    await queryRunner.query(`DROP TYPE point_transactions_type_enum`);
    await queryRunner.query(`DROP TABLE moderation_reviews`);
    await queryRunner.query(`DROP TYPE moderation_reviews_status_enum`);
    await queryRunner.query(`DROP TABLE course_topics`);
    await queryRunner.query(`DROP TABLE courses`);
    await queryRunner.query(`DROP TABLE departments`);
    await queryRunner.query(`DROP TABLE faculties`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN "isProfileComplete"`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN bio`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN "studyLevel"`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN "authProvider"`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN "profileImage"`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN "socialHandle"`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN role DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN role TYPE users_role_enum USING role::users_role_enum`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'student'`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN password SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN "firstName" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN "lastName" SET NOT NULL`);
  }
}
