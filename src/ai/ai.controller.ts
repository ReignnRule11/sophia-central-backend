import { Controller, Post, Get, Param, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { AiService } from './ai.service';
import { AskQuestionDto } from './dto/ask-question.dto';
import { SummarizeResourceDto } from './dto/summarize-resource.dto';

@ApiTags('AI Assistant')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  private assertStudent(user: User): void {
    if (user.role !== UserRole.STUDENT) throw new ForbiddenException('Sophis AI is available only to student accounts.');
  }

  @Post('chat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chat with Sophis AI (students only)' })
  async askQuestion(@CurrentUser() user: User, @Body() dto: AskQuestionDto) {
    this.assertStudent(user);
    return this.aiService.processQuestion(user.id, dto);
  }

  @Post('summarize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Summarize a resource with Sophis AI (students only)' })
  async summarizeResource(@CurrentUser() user: User, @Body() dto: SummarizeResourceDto) {
    this.assertStudent(user);
    return this.aiService.summarizeResource(user.id, dto);
  }

  @Get('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getSession(@Param('sessionId') sessionId: string, @CurrentUser() user: User) {
    this.assertStudent(user);
    return this.aiService.getSession(sessionId, user.id);
  }

  @Get('usage/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getUsage(@Param('userId') userId: string, @CurrentUser() user: User) {
    this.assertStudent(user);
    return this.aiService.getUsageStats(userId, user.id);
  }
}
