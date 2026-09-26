import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationReview } from './entities/moderation-review.entity';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { Resource } from '../resources/entities/resource.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ModerationReview, Resource, User])],
  controllers: [ModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
