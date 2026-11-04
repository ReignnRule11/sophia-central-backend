import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { typeOrmConfig } from '../config/typeorm.config';
import { Institution } from '../institutions/entities/institution.entity';

function decodeHtml(value: string): string {
  return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));
}

function cleanCell(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function main() {
  const response = await fetch('https://enuc.nuc.edu.ng/nus', { headers: { 'user-agent': 'SophisCentralAcademicCatalogueImporter/1.0' } });
  if (!response.ok) throw new Error('NUC directory request failed: HTTP ' + response.status);
  const html = await response.text();
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
    [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cleanCell(cell[1])),
  );
  const records = rows.filter((cells) => cells.length >= 5 && /^\d+$/.test(cells[0]) && cells[1] && ['Federal', 'State', 'Private'].includes(cells[3]))
    .map((cells) => ({ name: cells[1], year: cells[2], ownership: cells[3], state: cells[4] }))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.name.toLowerCase() === item.name.toLowerCase()) === index);
  if (records.length < 300) throw new Error('Expected at least 300 NUC university records but parsed ' + records.length + '. No database changes were made. Inspect the NUC page structure before retrying.');
  const dataSource = new DataSource(typeOrmConfig);
  await dataSource.initialize();
  try {
    const repository = dataSource.getRepository(Institution);
    let inserted = 0;
    let updated = 0;
    for (const record of records) {
      const existing = await repository.createQueryBuilder('institution')
        .where('LOWER(institution.name) = LOWER(:name)', { name: record.name }).getOne();
      if (existing) {
        existing.country = 'Nigeria';
        existing.state = record.state;
        existing.ownership = record.ownership;
        await repository.save(existing);
        updated += 1;
      } else {
        await repository.save(repository.create({ name: record.name, country: 'Nigeria', state: record.state, ownership: record.ownership }));
        inserted += 1;
      }
    }
    process.stdout.write('NUC import complete. Parsed: ' + records.length + '; inserted: ' + inserted + '; updated: ' + updated + '. Existing faculties, departments and user profiles were preserved.\n');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; });
