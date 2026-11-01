import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { Resource } from '../resources/entities/resource.entity';
import { User } from '../users/entities/user.entity';
import { ModerationReview } from '../moderation/entities/moderation-review.entity';
import { UserActivityEvent } from './entities/user-activity-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Resource, User, ModerationReview, UserActivityEvent])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
