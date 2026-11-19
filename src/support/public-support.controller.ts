import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreatePublicSupportRequestDto } from './dto/create-public-support-request.dto';
import { SupportService } from './support.service';

@ApiTags('Public Support')
@Controller('support-requests/public')
export class PublicSupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  create(@Body() dto: CreatePublicSupportRequestDto) {
    return this.support.createPublic(dto);
  }

  @Get('verify')
  verify(@Query('token') token: string) {
    return this.support.verifyPublicEmail(token);
  }
}
