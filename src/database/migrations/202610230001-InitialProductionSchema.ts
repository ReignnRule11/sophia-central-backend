import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fresh-install baseline for the entities registered in typeorm.config.ts.
 * Intentionally does not use IF NOT EXISTS: an untracked/pre-existing schema
 * must be reconciled explicitly rather than silently treated as migrated.
 */
export class InitialProductionSchema202610230001 implements MigrationInterface {
  name = 'InitialProductionSchema202610230001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(320) NOT NULL UNIQUE,
        password varchar,
        "firstName" varchar,
        "lastName" varchar,
        "socialHandle" varchar,
        "profileImage" varchar,
        role varchar NOT NULL DEFAULT 'student',
        "authProvider" varchar NOT NULL DEFAULT 'email',
        institution varchar,
        department varchar,
        faculty varchar,
        "studyLevel" varchar,
        bio text,
        "isVerified" boolean NOT NULL DEFAULT false,
        "isProfileComplete" boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );

      CREATE TYPE resources_type_enum AS ENUM ('lecture_notes','past_question','research_paper','project','slides','other');
      CREATE TYPE resources_moderationstatus_enum AS ENUM ('draft','pending','approved','rejected','flagged');
      CREATE TABLE resources (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar NOT NULL,
        description text,
        type resources_type_enum NOT NULL DEFAULT 'other',
        course varchar,
        topic varchar,
        institution varchar,
        level varchar,
        "fileUrl" varchar,
        "moderationStatus" resources_moderationstatus_enum NOT NULL DEFAULT 'pending',
        "isVerified" boolean NOT NULL DEFAULT false,
        views integer NOT NULL DEFAULT 0,
        downloads integer NOT NULL DEFAULT 0,
        "uploaderId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_resources_uploader_id ON resources("uploaderId");

      CREATE TABLE institutions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar NOT NULL,
        country varchar,
        city varchar,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE faculties (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar NOT NULL,
        "institutionId" uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE departments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar NOT NULL,
        "facultyId" uuid NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE courses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar NOT NULL,
        code varchar,
        description text,
        level varchar,
        "institutionId" uuid REFERENCES institutions(id) ON DELETE SET NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE course_topics (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar NOT NULL,
        description text,
        "courseId" uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );

      CREATE TYPE moderation_reviews_status_enum AS ENUM ('draft','pending','approved','rejected','flagged');
      CREATE TABLE moderation_reviews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "resourceId" uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        "reviewerId" uuid REFERENCES users(id) ON DELETE SET NULL,
        status moderation_reviews_status_enum NOT NULL,
        note text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE point_wallets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" varchar NOT NULL UNIQUE,
        balance integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TYPE point_transactions_type_enum AS ENUM ('earned','spent','bonus');
      CREATE TABLE point_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" varchar NOT NULL,
        type point_transactions_type_enum NOT NULL DEFAULT 'earned',
        amount integer NOT NULL,
        reason text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );

      CREATE TYPE file_uploads_status_enum AS ENUM ('pending','completed','failed','scanned');
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
      );

      CREATE TABLE referrals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "referrerId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code varchar NOT NULL UNIQUE,
        "isActive" boolean NOT NULL DEFAULT true,
        "redeemedAt" timestamp,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );

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
      );

      CREATE TABLE ai_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" varchar NOT NULL,
        "resourceId" uuid REFERENCES resources(id) ON DELETE SET NULL,
        title varchar NOT NULL,
        notes text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE ai_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sessionId" uuid NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
        role varchar NOT NULL CHECK (role IN ('user','assistant','system')),
        content text NOT NULL,
        metadata jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );

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
      );
      CREATE INDEX idx_resource_files_resource_id ON resource_files(resource_id);
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
      );
      CREATE INDEX idx_ai_usage_user ON ai_usage_logs(user_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS ai_usage_logs;
      DROP TABLE IF EXISTS resource_files;
      DROP TABLE IF EXISTS ai_messages;
      DROP TABLE IF EXISTS ai_sessions;
      DROP TABLE IF EXISTS notifications;
      DROP TABLE IF EXISTS referrals;
      DROP TABLE IF EXISTS file_uploads;
      DROP TABLE IF EXISTS point_transactions;
      DROP TABLE IF EXISTS point_wallets;
      DROP TABLE IF EXISTS moderation_reviews;
      DROP TABLE IF EXISTS course_topics;
      DROP TABLE IF EXISTS courses;
      DROP TABLE IF EXISTS departments;
      DROP TABLE IF EXISTS faculties;
      DROP TABLE IF EXISTS institutions;
      DROP TABLE IF EXISTS resources;
      DROP TABLE IF EXISTS users;
      DROP TYPE IF EXISTS file_uploads_status_enum;
      DROP TYPE IF EXISTS point_transactions_type_enum;
      DROP TYPE IF EXISTS moderation_reviews_status_enum;
      DROP TYPE IF EXISTS resources_moderationstatus_enum;
      DROP TYPE IF EXISTS resources_type_enum;
    `);
  }
}
