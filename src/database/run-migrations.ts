import 'dotenv/config';
import 'reflect-metadata';
import AppDataSource from './data-source';

async function main() {
  const source = await AppDataSource.initialize();
  try {
    await source.runMigrations({ transaction: 'all' });
    console.log('Database migrations completed successfully.');
  } finally {
    await source.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Database migration failed.');
  console.error(error instanceof Error ? error.message : 'Unknown migration error');
  process.exitCode = 1;
});
