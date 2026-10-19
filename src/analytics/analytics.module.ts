import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { Resource } from '../resources/entities/resource.entity';
import { User } from '../users/entities/user.entity';
import { ModerationReview } from '../moderation/entities/moderation-review.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Resource, User, ModerationReview])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
