import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportRequest } from './entities/support-request.entity';
import { SupportController } from './support.controller';
import { PublicContactController } from './public-contact.controller';
import { SupportService } from './support.service';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../upload/storage.module';
import { SupportEmailService } from './support-email.service';

@Module({
  imports: [TypeOrmModule.forFeature([SupportRequest, User]), NotificationsModule, StorageModule],
  controllers: [SupportController, PublicContactController],
  providers: [SupportService, SupportEmailService],
  exports: [SupportService, SupportEmailService],
})
export class SupportModule {}
