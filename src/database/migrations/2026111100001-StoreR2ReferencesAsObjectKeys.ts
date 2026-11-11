import { MigrationInterface, QueryRunner } from 'typeorm';

export class StoreR2ReferencesAsObjectKeys2026111100001 implements MigrationInterface {
  name = 'StoreR2ReferencesAsObjectKeys2026111100001';

  async up(queryRunner: QueryRunner): Promise<void> {
    const ownedReference = '^https?://[^/]+/(profile-images|resources|support-attachments)/[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9._-]{0,179}$';
    await queryRunner.query(
      `UPDATE users
       SET "profileImage" = regexp_replace("profileImage", '^https?://[^/]+/', '')
       WHERE "profileImage" ~* $1`,
      [ownedReference],
    );
    await queryRunner.query(
      `UPDATE resources
       SET "fileUrl" = regexp_replace("fileUrl", '^https?://[^/]+/', '')
       WHERE "fileUrl" ~* $1`,
      [ownedReference],
    );
    await queryRunner.query(
      `UPDATE support_requests request
       SET attachments = converted.values
       FROM LATERAL (
         SELECT COALESCE(
           jsonb_agg(
             to_jsonb(
               CASE WHEN item.value ~* $1
                 THEN regexp_replace(item.value, '^https?://[^/]+/', '')
                 ELSE item.value
               END
             ) ORDER BY item.ordinality
           ),
           '[]'::jsonb
         ) AS values
         FROM jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(request.attachments) = 'array' THEN request.attachments ELSE '[]'::jsonb END
         ) WITH ORDINALITY AS item(value, ordinality)
       ) converted
       WHERE jsonb_typeof(request.attachments) = 'array'
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(request.attachments) AS existing(value)
           WHERE existing.value ~* $1
         )`,
      [ownedReference],
    );
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally irreversible: reconstructing URL hosts from object keys is environment-specific.
  }
}
