import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { UserActivityEvent } from '../analytics/entities/user-activity-event.entity';
import { Resource } from './entities/resource.entity';
import { SavedResource } from './entities/saved-resource.entity';
import { User } from '../users/entities/user.entity';
import { S3Service } from '../upload/s3.service';

@Module({
  imports: [TypeOrmModule.forFeature([Resource, SavedResource, User, UserActivityEvent])],
  controllers: [ResourcesController],
  providers: [ResourcesService, S3Service],
  exports: [ResourcesService],
})
export class ResourcesModule {}
