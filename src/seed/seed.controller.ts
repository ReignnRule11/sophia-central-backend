import { Controller, Post, ForbiddenException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SeedService } from './seed.service';

@ApiTags('Seed')
@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post('run')
  @ApiOperation({ summary: 'Populate demo data for Sophis Central' })
  async run() {
    // Demo seeding is never available in production and is opt-in outside production.
    if (process.env.NODE_ENV === 'production' || process.env.SEED_ENDPOINT_ENABLED !== 'true') {
      throw new ForbiddenException('Demo seeding is disabled.');
    }
    await this.seedService.seed();
    return { success: true, message: 'Seed data loaded successfully' };
  }
}
