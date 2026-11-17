import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { Institution } from '../institutions/entities/institution.entity';
import { StorageModule } from '../upload/storage.module';
import { ReviewerApplication } from './entities/reviewer-application.entity';
import { ReviewerApplicationsService } from './reviewer-applications.service';
import { ReviewerApplicationsController } from './reviewer-applications.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Institution, ReviewerApplication]), StorageModule],
  controllers: [UsersController, ReviewerApplicationsController],
  providers: [UsersService, ReviewerApplicationsService],
  exports: [UsersService],
})
export class UsersModule {}
