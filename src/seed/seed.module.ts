import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';
import { User } from '../users/entities/user.entity';
import { Resource } from '../resources/entities/resource.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Resource])],
  controllers: [SeedController],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
