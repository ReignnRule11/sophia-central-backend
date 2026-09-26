import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SeedService } from './seed.service';

@ApiTags('Seed')
@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post('run')
  @ApiOperation({ summary: 'Populate demo data for Sophia Central' })
  async run() {
    await this.seedService.seed();
    return { success: true, message: 'Seed data loaded successfully' };
  }
}
