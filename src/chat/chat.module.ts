import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RedisChatService } from './redis-chat.service';
import { UsersModule } from '../users/users.module';
import { UploadModule } from '../upload/upload.module';
@Module({ imports: [TypeOrmModule.forFeature([ChatMessage]), UsersModule, UploadModule], controllers: [ChatController], providers: [ChatService, RedisChatService] })
export class ChatModule {}