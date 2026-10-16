import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { AiService } from './ai.service';
import { AskQuestionDto } from './dto/ask-question.dto';
import { SummarizeResourceDto } from './dto/summarize-resource.dto';

@ApiTags('AI Assistant')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chat with AI tutor about course material' })
  async askQuestion(
    @CurrentUser() user: User,
    @Body() dto: AskQuestionDto,
  ) {
    return this.aiService.processQuestion(user.id, dto);
  }

  @Post('summarize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI summary of a resource' })
  async summarizeResource(
    @CurrentUser() user: User,
    @Body() dto: SummarizeResourceDto,
  ) {
    return this.aiService.summarizeResource(user.id, dto);
  }

  @Get('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI chat session history' })
  async getSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: User,
  ) {
    return this.aiService.getSession(sessionId, user.id);
  }

  @Get('usage/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI usage stats for user' })
  async getUsage(@Param('userId') userId: string, @CurrentUser() user: User) {
    return this.aiService.getUsageStats(userId, user.id);
  }
}
