import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProviderService } from './ai-provider.service';
import { GeminiService } from './gemini.service';
import { GroqService } from './groq.service';
import { AiSession } from './entities/ai-session.entity';
import { AiMessage } from './entities/ai-message.entity';
import { Resource } from '../resources/entities/resource.entity';
import { SavedResource } from '../resources/entities/saved-resource.entity';
import { FileUpload } from '../upload/entities/file-upload.entity';
import { StorageModule } from '../upload/storage.module';
import { PointsModule } from '../points/points.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiSession, AiMessage, Resource, SavedResource, FileUpload]),
    PointsModule,
    StorageModule,
  ],
  controllers: [AiController],
  providers: [AiService, AiProviderService, GroqService, GeminiService],
  exports: [AiService, AiProviderService],
})
export class AiModule {}
