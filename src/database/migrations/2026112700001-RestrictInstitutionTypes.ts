import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestrictInstitutionTypes2026112700001 implements MigrationInterface {
  name = 'RestrictInstitutionTypes2026112700001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fail safely rather than silently reclassifying existing institutions or
    // pending submissions whose academic category has not been reconciled.
    await queryRunner.query(`
      DO $block$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "institutions"
          WHERE "institutionType" NOT IN ('university', 'polytechnic', 'college_of_education')
        ) THEN
          RAISE EXCEPTION 'Unsupported institution categories exist in institutions; reconcile them before applying this migration.';
        END IF;

        IF EXISTS (
          SELECT 1 FROM "academic_catalogue_submissions"
          WHERE "institutionType" NOT IN ('university', 'polytechnic', 'college_of_education')
        ) THEN
          RAISE EXCEPTION 'Unsupported institution categories exist in academic_catalogue_submissions; reconcile them before applying this migration.';
        END IF;
      END
      $block$;
    `);

    await queryRunner.query(`
      ALTER TABLE "institutions"
      ADD CONSTRAINT "CK_institutions_supported_type"
      CHECK ("institutionType" IN ('university', 'polytechnic', 'college_of_education'))
    `);

    await queryRunner.query(`
      ALTER TABLE "academic_catalogue_submissions"
      ADD CONSTRAINT "CK_academic_catalogue_submissions_supported_type"
      CHECK ("institutionType" IN ('university', 'polytechnic', 'college_of_education'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "academic_catalogue_submissions" DROP CONSTRAINT IF EXISTS "CK_academic_catalogue_submissions_supported_type"');
    await queryRunner.query('ALTER TABLE "institutions" DROP CONSTRAINT IF EXISTS "CK_institutions_supported_type"');
  }
}
