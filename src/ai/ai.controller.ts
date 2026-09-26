import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { AiService } from './ai.service';
import { AskAiDto } from './dto/ask-ai.dto';

@ApiTags('AI Study Assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('ask')
  @ApiOperation({ summary: 'Ask a question about academic material' })
  ask(@Body() dto: AskAiDto, @CurrentUser() user: User) {
    return this.aiService.ask(dto, user.id);
  }
}
