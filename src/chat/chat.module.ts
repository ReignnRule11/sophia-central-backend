import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatUserBlock } from './entities/chat-user-block.entity';
import { ChatConversationRead } from './entities/chat-conversation-read.entity';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RedisChatService } from './redis-chat.service';
import { UsersModule } from '../users/users.module';
import { UploadModule } from '../upload/upload.module';
import { NotificationsModule } from '../notifications/notifications.module';
@Module({ imports: [TypeOrmModule.forFeature([ChatMessage, ChatUserBlock, ChatConversationRead]), UsersModule, UploadModule, NotificationsModule], controllers: [ChatController], providers: [ChatService, RedisChatService] })
export class ChatModule {}