import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Sse, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatRetentionPeriod } from './entities/chat-conversation-retention.entity';
import { CreateChatMessageDto, CreateVoiceUploadDto, EditChatMessageDto } from './dto/create-chat-message.dto';

type AuthRequest = Request & { user: import('../users/entities/user.entity').User };

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Sse('events')
  events(@Req() request: AuthRequest) { return this.chat.eventStream(request.user); }

  @Post('presence/heartbeat')
  heartbeat(@Req() request: AuthRequest) { return this.chat.heartbeat(request.user.id); }

  @Get('presence')
  presence(@Req() request: AuthRequest) { return this.chat.presence(request.user.id); }

  @Get('contacts')
  contacts(@Req() request: AuthRequest, @Query('search') search?: string) { return this.chat.contacts(request.user.id, search); }

  @Get('inbox')
  inbox(@Req() request: AuthRequest) { return this.chat.inbox(request.user.id); }

  @Post('direct/:userId/read')
  markDirectRead(@Req() request: AuthRequest, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.chat.markDirectRead(request.user.id, userId);
  }

  @Patch('direct/:userId/retention')
  updateDirectRetention(
    @Req() request: AuthRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('retentionPeriod') retentionPeriod: ChatRetentionPeriod,
  ) {
    return this.chat.updateDirectRetention(request.user.id, userId, retentionPeriod);
  }

  @Get('blocks')
  blocks(@Req() request: AuthRequest) { return this.chat.listBlocks(request.user.id); }

  @Post('blocks/:userId')
  block(@Req() request: AuthRequest, @Param('userId', ParseUUIDPipe) userId: string) { return this.chat.blockUser(request.user.id, userId); }

  @Delete('blocks/:userId')
  unblock(@Req() request: AuthRequest, @Param('userId', ParseUUIDPipe) userId: string) { return this.chat.unblockUser(request.user.id, userId); }

  @Post('voice-upload')
  voiceUpload(@Req() request: AuthRequest, @Body() dto: CreateVoiceUploadDto) {
    return this.chat.createVoiceUpload(request.user.id, dto);
  }

  @Get('group/messages')
  group(@Req() request: AuthRequest, @Query('limit') limit?: string, @Query('before') before?: string) {
    return this.chat.history(request.user.id, 'group', undefined, limit, before);
  }

  @Get('direct/:userId/messages')
  direct(@Req() request: AuthRequest, @Param('userId', ParseUUIDPipe) userId: string, @Query('limit') limit?: string, @Query('before') before?: string) {
    return this.chat.history(request.user.id, 'direct', userId, limit, before);
  }

  @Post('messages')
  create(@Req() request: AuthRequest, @Body() dto: CreateChatMessageDto) { return this.chat.create(request.user.id, dto); }

  @Patch('messages/:id')
  edit(@Req() request: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditChatMessageDto) {
    return this.chat.edit(request.user.id, id, dto.text);
  }

  @Delete('messages/:id/hide')
  hideDeletedMessage(@Req() request: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.hideDeletedMessage(request.user.id, id);
  }

  @Delete('messages/:id')
  remove(@Req() request: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.chat.remove(request.user.id, id); }
}