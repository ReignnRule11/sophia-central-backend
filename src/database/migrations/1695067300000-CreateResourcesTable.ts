import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateResourcesTable1695067300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'resources',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'title',
            type: 'varchar',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['lecture_notes', 'past_question', 'research_paper', 'project', 'slides', 'other'],
            default: "'other'",
          },
          {
            name: 'course',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'topic',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'institution',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'level',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'fileUrl',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'moderationStatus',
            type: 'enum',
            enum: ['draft', 'pending', 'approved', 'rejected', 'flagged'],
            default: "'pending'",
          },
          {
            name: 'isVerified',
            type: 'boolean',
            default: false,
          },
          {
            name: 'views',
            type: 'int',
            default: 0,
          },
          {
            name: 'downloads',
            type: 'int',
            default: 0,
          },
          {
            name: 'uploaderId',
            type: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
        indices: [
          new TableIndex({ columnNames: ['uploaderId'] }),
          new TableIndex({ columnNames: ['moderationStatus'] }),
          new TableIndex({ columnNames: ['course'] }),
          new TableIndex({ columnNames: ['institution'] }),
          new TableIndex({ columnNames: ['isVerified'] }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['uploaderId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('resources');
  }
}
