import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OpenAiService } from './openai.service';
import { AiSession } from './entities/ai-session.entity';
import { AiMessage } from './entities/ai-message.entity';
import { Resource } from '../resources/entities/resource.entity';
import { PointsModule } from '../points/points.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiSession, AiMessage, Resource]),
    PointsModule,
  ],
  controllers: [AiController],
  providers: [AiService, OpenAiService],
  exports: [AiService, OpenAiService],
})
export class AiModule {}
