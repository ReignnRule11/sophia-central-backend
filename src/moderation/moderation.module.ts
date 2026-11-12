import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationReview } from './entities/moderation-review.entity';
import { ContentReport } from './entities/content-report.entity';
import { ModerationController } from './moderation.controller';
import { ReportsController, ModerationReportsController } from './reports.controller';
import { ModerationService } from './moderation.service';
import { ContentReportsService } from './reports.service';
import { Resource } from '../resources/entities/resource.entity';
import { User } from '../users/entities/user.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupportModule } from '../support/support.module';

@Module({
  imports: [TypeOrmModule.forFeature([ModerationReview, ContentReport, Resource, User, ChatMessage]), NotificationsModule, SupportModule],
  controllers: [ModerationController, ReportsController, ModerationReportsController],
  providers: [ModerationService, ContentReportsService],
  exports: [ModerationService, ContentReportsService],
})
export class ModerationModule {}
