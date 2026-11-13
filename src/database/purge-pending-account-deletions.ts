import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const usersService = app.get(UsersService);
    if (process.argv.includes('--dry-run')) {
      const preview = await usersService.previewDueAccountDeletions();
      console.log(`Account deletion dry run only. Eligible accounts: ${preview.eligible}; batch limit: ${preview.batchLimit}; additional eligible accounts remain for later runs: ${preview.hasMore ? 'yes' : 'no'}. No accounts or files were changed.`);
      return;
    }
    const result = await usersService.purgeDueAccountDeletions();
    console.log(`Account deletion cleanup completed. Accounts permanently deleted: ${result.processed}`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error('Account deletion cleanup failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
