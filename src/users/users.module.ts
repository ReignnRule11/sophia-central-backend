import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { ReviewerApplication } from './entities/reviewer-application.entity';
import { ReviewerApplicationDecision } from './entities/reviewer-application-decision.entity';
import { ReviewerApplicationsController } from './reviewer-applications.controller';
import { ReviewerApplicationsService } from './reviewer-applications.service';
import { Institution } from '../institutions/entities/institution.entity';
import { StorageModule } from '../upload/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Institution, ReviewerApplication, ReviewerApplicationDecision]), StorageModule, NotificationsModule],
  controllers: [UsersController, ReviewerApplicationsController],
  providers: [UsersService, ReviewerApplicationsService],
  exports: [UsersService],
})
export class UsersModule {}
