import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { SupportService } from './support.service';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';

@ApiTags('Support')
@Controller('support-requests')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateSupportRequestDto) {
    return this.support.create(user, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() user: User) {
    return this.support.listMine(user.id);
  }
}
