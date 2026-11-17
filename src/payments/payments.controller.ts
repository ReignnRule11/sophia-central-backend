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
import { PaymentsReconciliationService } from './payments-reconciliation.service';
import { LecturerPayoutsService } from './lecturer-payouts.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly reconciliation: PaymentsReconciliationService, private readonly payouts: LecturerPayoutsService) {}

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

  @Post('reconciliation/run')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Compare local payments and refunds with Paystack without mutating financial records' })
  reconcile(@CurrentUser() user: User, @Body() body: { from: string; to: string }) {
    return this.reconciliation.reconcile(user, body);
  }

  @Get('reconciliation/history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List recent payment reconciliation reports' })
  reconciliationHistory(@CurrentUser() user: User) {
    return this.reconciliation.history(user);
  }

  @Post('payouts/beneficiary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify and save a lecturer Nigerian bank beneficiary' })
  setPayoutBeneficiary(@CurrentUser() user: User, @Body() body: { accountNumber: string; bankCode: string }) {
    return this.payouts.setBeneficiary(user, body);
  }

  @Get('payouts/balance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read available lecturer earnings after refund, dispute and payout holds' })
  payoutBalance(@CurrentUser() user: User) {
    return this.payouts.balance(user);
  }

  @Post('payouts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request a lecturer earnings payout for admin approval' })
  requestPayout(@CurrentUser() user: User, @Body() body: { amountMinor: string }) {
    return this.payouts.request(user, body.amountMinor);
  }

  @Get('payouts/requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List payout requests for authorized operators' })
  listPayoutRequests(@CurrentUser() user: User) {
    return this.payouts.listRequests(user);
  }

  @Post('payouts/:id/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve and initiate a lecturer payout transfer' })
  approvePayout(@CurrentUser() user: User, @Param('id') id: string) {
    return this.payouts.approve(user, id);
  }

  @Post('payouts/reconciliation/run')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Compare lecturer payouts with Paystack transfers without mutating financial records' })
  reconcilePayouts(@CurrentUser() user: User, @Body() body: { from: string; to: string }) {
    return this.payouts.reconcilePayouts(user, body);
  }

  @Get('payouts/reconciliation/history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List recent payout reconciliation reports' })
  payoutReconciliationHistory(@CurrentUser() user: User) {
    return this.payouts.payoutReconciliationHistory(user);
  }

  @Get('payouts/verify/:reference')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify an in-flight Paystack lecturer transfer' })
  verifyPayout(@CurrentUser() user: User, @Param('reference') reference: string) {
    return this.payouts.verify(user, reference);
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
