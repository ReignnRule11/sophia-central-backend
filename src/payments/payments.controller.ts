import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
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


  @Post(':reference/refunds')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate an authorized full or partial refund' })
  createRefund(@CurrentUser() user: User, @Param('reference') reference: string, @Body() dto: CreateRefundDto) {
    return this.payments.createRefund(user, reference, dto);
  }

  @Get('disputes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List recent payment disputes for authorized operators' })
  listDisputes(@CurrentUser() user: User) {
    return this.payments.listDisputes(user);
  }

  @Get('refunds/:id/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify a refund with the payment provider' })
  verifyRefund(@CurrentUser() user: User, @Param('id') id: string) {
    return this.payments.verifyRefund(user, id);
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
