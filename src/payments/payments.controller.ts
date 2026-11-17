import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('initialize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize a server-priced payment checkout' })
  initialize(@CurrentUser() user: User, @Body() dto: InitializePaymentDto) {
    return this.payments.initialize(user, dto);
  }

  @Get('verify/:reference')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify payment status and apply value exactly once' })
  verify(@CurrentUser() user: User, @Param('reference') reference: string) {
    return this.payments.verifyForUser(user, reference);
  }

  @Post('webhooks/:provider')
  @ApiOperation({ summary: 'Receive signed provider webhook events' })
  webhook(
    @Param('provider') provider: string,
    @Req() request: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    if (!request.rawBody) throw new Error('Raw request body is required for payment webhook signature validation.');
    return this.payments.handleWebhook(provider, request.rawBody, headers);
  }
}
