import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { CommunityResourcesService } from './community-resources.service';
import { UserActivityEvent } from '../analytics/entities/user-activity-event.entity';
import { Resource } from './entities/resource.entity';
import { SavedResource } from './entities/saved-resource.entity';
import { User } from '../users/entities/user.entity';
import { StorageModule } from '../upload/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([Resource, SavedResource, User, UserActivityEvent]), StorageModule],
  controllers: [ResourcesController],
  providers: [ResourcesService, CommunityResourcesService],
  exports: [ResourcesService, CommunityResourcesService],
})
export class ResourcesModule {}
