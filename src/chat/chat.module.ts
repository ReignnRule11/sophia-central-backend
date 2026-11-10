import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatUserBlock } from './entities/chat-user-block.entity';
import { ChatConversationRead } from './entities/chat-conversation-read.entity';
import { ChatMessageUserHide } from './entities/chat-message-user-hide.entity';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RedisChatService } from './redis-chat.service';
import { UsersModule } from '../users/users.module';
import { StorageModule } from '../upload/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
@Module({ imports: [TypeOrmModule.forFeature([ChatMessage, ChatUserBlock, ChatConversationRead, ChatMessageUserHide]), UsersModule, StorageModule, NotificationsModule], controllers: [ChatController], providers: [ChatService, RedisChatService] })
export class ChatModule {}