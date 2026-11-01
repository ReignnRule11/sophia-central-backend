import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { CreateChatMessageDto, EditChatMessageDto } from './dto/create-chat-message.dto';

type AuthRequest = Request & { user: { id: string } };

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('contacts')
  contacts(@Req() request: AuthRequest) {
    return this.chat.contacts(request.user.id);
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
  create(@Req() request: AuthRequest, @Body() dto: CreateChatMessageDto) {
    return this.chat.create(request.user.id, dto);
  }

  @Patch('messages/:id')
  edit(@Req() request: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditChatMessageDto) {
    return this.chat.edit(request.user.id, id, dto.text);
  }

  @Delete('messages/:id')
  remove(@Req() request: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.remove(request.user.id, id);
  }
}