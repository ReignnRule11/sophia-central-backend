import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const result = await app.get(UsersService).purgeDueAccountDeletions();
    console.log(`Account deletion cleanup completed. Accounts permanently deleted: ${result.processed}`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error('Account deletion cleanup failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
