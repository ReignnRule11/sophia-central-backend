import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { typeOrmConfig } from '../config/typeorm.config';
import { Institution, InstitutionType } from '../institutions/entities/institution.entity';

type ImportedInstitution = {
  name: string;
  institutionType: InstitutionType;
  state?: string;
  ownership?: string;
  source: 'NBTE' | 'NCCE';
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));
}

function cleanCell(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function ownershipFrom(value: string): string | undefined {
  if (/federal/i.test(value)) return 'Federal';
  if (/state/i.test(value)) return 'State';
  if (/private/i.test(value)) return 'Private';
  return undefined;
}

async function fetchNbtePolytechnics(): Promise<ImportedInstitution[]> {
  const records: ImportedInstitution[] = [];
  for (let page = 1; page <= 30; page += 1) {
    const url = new URL('https://www.digitalnbte.nbte.gov.ng/Public/Institutions');
    url.searchParams.set('type', 'polytechnic');
    if (page > 1) url.searchParams.set('page', String(page));
    const response = await fetch(url, { headers: { 'user-agent': 'SophisCentralAcademicCatalogueImporter/1.0' } });
    if (!response.ok) throw new Error('NBTE register request failed: HTTP ' + response.status);
    const html = await response.text();
    const links = [...html.matchAll(/<a\b([^>]*href=["']\/Public\/Institutions\/\d+["'][^>]*)>([\s\S]*?)<\/a>/gi)];
    if (!links.length) break;
    for (const match of links) {
      const attributes = match[1];
      const title = attributes.match(/title=["']([^"']+)["']/i)?.[1];
      const parts = cleanCell(match[2]).split('·').map((part) => part.trim());
      const name = cleanCell(title ?? parts[0]);
      if (!name || /^(institutions|polytechnics)$/i.test(name)) continue;
      const stateLabel = parts[2]?.replace(/\\s+\\d+\\s+programmes?.*$/i, '').trim();
      records.push({
        name,
        institutionType: InstitutionType.POLYTECHNIC,
        ownership: ownershipFrom(parts[1] ?? ''),
        state: stateLabel?.replace(/\\s+State$/i, '') || undefined,
        source: 'NBTE',
      });
    }
  }
  const unique = new Map<string, ImportedInstitution>();
  for (const item of records) unique.set(item.name.toLocaleLowerCase(), item);
  if (unique.size < 180) {
    throw new Error('NBTE parser returned only ' + unique.size + ' polytechnics. Expected at least 180; no database changes were made.');
  }
  return [...unique.values()];
}

async function fetchNcceInstitutions(): Promise<ImportedInstitution[]> {
  const response = await fetch('https://ncce.gov.ng/AccreditedColleges', {
    headers: { 'user-agent': 'SophisCentralAcademicCatalogueImporter/1.0' },
  });
  if (!response.ok) throw new Error('NCCE accredited-colleges request failed: HTTP ' + response.status);
  const html = await response.text();
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const records: ImportedInstitution[] = [];

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cleanCell(cell[1]));
    if (cells.length < 5 || !/^\d+$/.test(cells[0]) || !cells[1]) continue;
    const name = cells[1];
    const classification = cells[3] ?? '';
    const state = cells[4] ?? undefined;

    // Polytechnics are sourced from NBTE's dedicated polytechnic register below.
    // NCCE's table also lists polytechnics offering NCE; excluding those rows avoids duplicate records.
    const isCollegeOfEducation = /college of education/i.test(classification) || /college of education/i.test(name);
    if (!isCollegeOfEducation) continue;
    records.push({
      name,
      institutionType: InstitutionType.COLLEGE_OF_EDUCATION,
      state,
      ownership: ownershipFrom(classification),
      source: 'NCCE',
    });
  }

  const unique = new Map<string, ImportedInstitution>();
  for (const item of records) {
    const key = item.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const existing = unique.get(key);
    if (!existing || (existing.source === 'NCCE' && item.source === 'NBTE')) unique.set(key, item);
  }
  const colleges = [...unique.values()].filter((item) => item.institutionType === InstitutionType.COLLEGE_OF_EDUCATION);
  if (colleges.length < 150) {
    throw new Error('NCCE parser returned only ' + colleges.length + ' colleges of education. Expected at least 150; no database changes were made.');
  }
  return [...unique.values()];
}

async function main() {
  // The importer is deliberately restricted to the configured Neon production database.
  // It is a separate, explicit command; it is never run by the application startup path.
  if (process.env.NODE_ENV !== 'production') throw new Error('Refusing to import: set NODE_ENV=production.');
  if (process.env.DB_SSL !== 'true') throw new Error('Refusing to import: DB_SSL must be true.');
  if (!/\.neon\.tech$/i.test(process.env.DB_HOST ?? '')) throw new Error('Refusing to import: DB_HOST must identify the configured Neon host.');
  if (process.env.DB_DATABASE !== 'neondb') throw new Error('Refusing to import: DB_DATABASE must be neondb.');

  const [polytechnics, ncceRecords] = await Promise.all([fetchNbtePolytechnics(), fetchNcceInstitutions()]);
  const records = new Map<string, ImportedInstitution>();
  for (const item of [...polytechnics, ...ncceRecords]) {
    const key = item.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const current = records.get(key);
    if (!current || (current.source === 'NCCE' && item.source === 'NBTE')) records.set(key, item);
  }

  const dataSource = new DataSource({ ...typeOrmConfig, synchronize: false, migrationsRun: false } as DataSourceOptions);
  await dataSource.initialize();
  try {
    const repository = dataSource.getRepository(Institution);
    let inserted = 0;
    let updated = 0;
    for (const item of records.values()) {
      const existing = await repository.createQueryBuilder('institution')
        .where('LOWER(institution.name) = LOWER(:name)', { name: item.name })
        .getOne();
      if (existing) {
        if (existing.institutionType !== InstitutionType.UNIVERSITY && existing.institutionType !== item.institutionType) continue;
        existing.institutionType = item.institutionType;
        existing.country = 'Nigeria';
        existing.state = existing.state || item.state;
        existing.ownership = existing.ownership || item.ownership;
        await repository.save(existing);
        updated += 1;
      } else {
        await repository.save(repository.create({
          name: item.name,
          country: 'Nigeria',
          state: item.state,
          ownership: item.ownership,
          institutionType: item.institutionType,
        }));
        inserted += 1;
      }
    }
    console.log(JSON.stringify({
      nbtePolytechnics: polytechnics.length,
      ncceRecords: ncceRecords.length,
      inserted,
      updated,
    }, null, 2));
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
