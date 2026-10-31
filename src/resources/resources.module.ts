import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { Resource } from './entities/resource.entity';
import { User } from '../users/entities/user.entity';
import { S3Service } from '../upload/s3.service';

@Module({
  imports: [TypeOrmModule.forFeature([Resource, User])],
  controllers: [ResourcesController],
  providers: [ResourcesService, S3Service],
  exports: [ResourcesService],
})
export class ResourcesModule {}
