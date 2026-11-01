import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { CreateChatMessageDto, EditChatMessageDto } from './dto/create-chat-message.dto';
type AuthRequest = Request & { user: { id: string } };
@Controller('chat') @UseGuards(JwtAuthGuard)
export class ChatController {
 constructor(private readonly chat: ChatService) {}
 @Get('group/messages') group(@Req() r:AuthRequest,@Query('limit') l?:string,@Query('before') b?:string){return this.chat.history(r.user.id,'group',undefined,l,b);}
 @Get('direct/:userId/messages') direct(@Req() r:AuthRequest,@Param('userId',ParseUUIDPipe) u:string,@Query('limit') l?:string,@Query('before') b?:string){return this.chat.history(r.user.id,'direct',u,l,b);}
 @Post('messages') create(@Req() r:AuthRequest,@Body() d:CreateChatMessageDto){return this.chat.create(r.user.id,d);}
 @Patch('messages/:id') edit(@Req() r:AuthRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:EditChatMessageDto){return this.chat.edit(r.user.id,id,d.text);}
 @Delete('messages/:id') remove(@Req() r:AuthRequest,@Param('id',ParseUUIDPipe) id:string){return this.chat.remove(r.user.id,id);}
}