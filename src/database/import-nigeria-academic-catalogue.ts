import 'reflect-metadata';
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource, DataSourceOptions, EntityManager } from 'typeorm';
import { typeOrmConfig } from '../config/typeorm.config';
import { Institution, Faculty, Department } from '../institutions/entities/institution.entity';

type CatalogueRecord = {
  institutionName: string;
  institutionWebsite: string;
  facultyName: string;
  departmentName: string;
  officialSourceUrl: string;
  verifiedAt: string;
};

function requiredHttpsUrl(value: string, field: string): URL {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(field + ' must be a valid URL.'); }
  if (parsed.protocol !== 'https:') throw new Error(field + ' must use HTTPS.');
  return parsed;
}

function parseRecords(filePath: string): CatalogueRecord[] {
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Catalogue file must contain a non-empty JSON array.');
  const now = Date.now();
  const seen = new Set<string>();
  return parsed.map((raw, index) => {
    const row = raw as Partial<CatalogueRecord>;
    const fields: (keyof CatalogueRecord)[] = ['institutionName', 'institutionWebsite', 'facultyName', 'departmentName', 'officialSourceUrl', 'verifiedAt'];
    for (const field of fields) {
      if (typeof row[field] !== 'string' || !row[field]!.trim()) throw new Error('Record ' + (index + 1) + ' is missing ' + field + '.');
    }
    const website = requiredHttpsUrl(row.institutionWebsite!, 'institutionWebsite');
    const source = requiredHttpsUrl(row.officialSourceUrl!, 'officialSourceUrl');
    if (source.hostname !== website.hostname && !source.hostname.endsWith('.' + website.hostname)) {
      throw new Error('Record ' + (index + 1) + ': officialSourceUrl must use the institution website domain or a subdomain.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.verifiedAt!)) throw new Error('Record ' + (index + 1) + ': verifiedAt must use YYYY-MM-DD format.');
    const verifiedAt = new Date(row.verifiedAt! + 'T00:00:00.000Z');
    if (!Number.isFinite(verifiedAt.getTime()) || verifiedAt.toISOString().slice(0, 10) !== row.verifiedAt || verifiedAt.getTime() > now || now - verifiedAt.getTime() > 365 * 24 * 60 * 60 * 1000) {
      throw new Error('Record ' + (index + 1) + ': verifiedAt must be a valid date within the last 365 days.');
    }
    const key = [row.institutionName, row.facultyName, row.departmentName].map((v) => v!.trim().toLocaleLowerCase()).join('|');
    if (seen.has(key)) throw new Error('Duplicate institution/faculty/department record: ' + key);
    seen.add(key);
    return {
      institutionName: row.institutionName!.trim(),
      institutionWebsite: row.institutionWebsite!.trim(),
      facultyName: row.facultyName!.trim(),
      departmentName: row.departmentName!.trim(),
      officialSourceUrl: row.officialSourceUrl!.trim(),
      verifiedAt: row.verifiedAt!.trim(),
    };
  });
}

async function applyRecords(manager: EntityManager, records: CatalogueRecord[]) {
  const institutionCache = new Map<string, Institution>();
  const facultyCache = new Map<string, Faculty>();
  let facultiesInserted = 0;
  let departmentsInserted = 0;
  let facultiesExisting = 0;
  let departmentsExisting = 0;

  for (const record of records) {
    const institutionKey = record.institutionName.toLocaleLowerCase();
    let institution = institutionCache.get(institutionKey);
    if (!institution) {
      institution = await manager.createQueryBuilder(Institution, 'institution')
        .where('LOWER(institution.name) = LOWER(:name)', { name: record.institutionName })
        .andWhere('institution.country = :country', { country: 'Nigeria' }).getOne() ?? undefined;
      if (!institution) throw new Error('Institution not found in the imported Nigerian institutions catalogue: ' + record.institutionName);
      institutionCache.set(institutionKey, institution);
    }

    const facultyKey = institution.id + '|' + record.facultyName.toLocaleLowerCase();
    let faculty = facultyCache.get(facultyKey);
    if (!faculty) {
      faculty = await manager.createQueryBuilder(Faculty, 'faculty')
        .where('faculty.institutionId = :institutionId', { institutionId: institution.id })
        .andWhere('LOWER(faculty.name) = LOWER(:name)', { name: record.facultyName }).getOne() ?? undefined;
      if (faculty) facultiesExisting += 1;
      else {
        faculty = manager.create(Faculty, { name: record.facultyName, institution, institutionId: institution.id });
        faculty = await manager.save(Faculty, faculty);
        facultiesInserted += 1;
      }
      facultyCache.set(facultyKey, faculty);
    }

    const existingDepartment = await manager.createQueryBuilder(Department, 'department')
      .where('department.facultyId = :facultyId', { facultyId: faculty.id })
      .andWhere('LOWER(department.name) = LOWER(:name)', { name: record.departmentName }).getOne();
    if (existingDepartment) {
      departmentsExisting += 1;
    } else {
      const department = manager.create(Department, { name: record.departmentName, faculty, facultyId: faculty.id });
      await manager.save(Department, department);
      departmentsInserted += 1;
    }
  }

  return { facultiesInserted, departmentsInserted, facultiesExisting, departmentsExisting };
}

async function main() {
  if (process.env.NODE_ENV !== 'production') throw new Error('Refusing to connect: NODE_ENV must be production.');
  if (process.env.DB_SSL !== 'true') throw new Error('Refusing to connect: DB_SSL must be true.');
  if (!/\.neon\.tech$/i.test(process.env.DB_HOST ?? '')) throw new Error('Refusing to connect: DB_HOST must identify the intended Neon database.');
  if (process.env.DB_DATABASE !== 'neondb') throw new Error('Refusing to connect: DB_DATABASE must be neondb.');
  if (!process.env.DB_USERNAME || !process.env.DB_PASSWORD) throw new Error('Refusing to connect: database credentials are missing.');

  const filePath = resolve(process.env.ACADEMIC_CATALOGUE_FILE || 'data/nigeria-academic-catalogue.json');
  const records = parseRecords(filePath);
  const apply = process.env.ACADEMIC_CATALOGUE_APPLY === 'true';
  if (apply && process.env.ACADEMIC_CATALOGUE_CONFIRM_PRODUCTION !== 'YES') {
    throw new Error('Set ACADEMIC_CATALOGUE_CONFIRM_PRODUCTION=YES explicitly before applying production inserts.');
  }

  const dataSource = new DataSource({
    ...typeOrmConfig,
    entities: [Institution, Faculty, Department],
    synchronize: false,
    migrationsRun: false,
    logging: false,
  } as DataSourceOptions);

  await dataSource.initialize();
  try {
    if (apply) {
      const result = await dataSource.transaction((manager) => applyRecords(manager, records));
      process.stdout.write('Academic catalogue import applied. Records checked: ' + records.length +
        '; faculties inserted: ' + result.facultiesInserted +
        '; departments inserted: ' + result.departmentsInserted +
        '; existing faculties preserved: ' + result.facultiesExisting +
        '; existing departments preserved: ' + result.departmentsExisting + '.\n');
    } else {
      const result = await dataSource.transaction(async (manager) => {
        const counts = await applyRecords(manager, records);
        throw Object.assign(new Error('DRY_RUN_ROLLBACK'), { counts });
      }).catch((error: any) => {
        if (error?.message === 'DRY_RUN_ROLLBACK') return error.counts;
        throw error;
      });
      process.stdout.write('Dry run successful; no records were written. Records validated: ' + records.length +
        '; faculties that would be inserted: ' + counts.facultiesInserted +
        '; departments that would be inserted: ' + counts.departmentsInserted +
        '; existing faculties preserved: ' + counts.facultiesExisting +
        '; existing departments preserved: ' + counts.departmentsExisting + '.\n');
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write('Academic catalogue import failed: ' + (error instanceof Error ? error.message : String(error)) + '\n');
  process.exitCode = 1;
});
