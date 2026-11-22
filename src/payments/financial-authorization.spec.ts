import { ForbiddenException } from '@nestjs/common';
import { User, UserRole } from '../users/entities/user.entity';
import { LecturerPayoutsService } from './lecturer-payouts.service';
import { PaymentsReconciliationService } from './payments-reconciliation.service';
import { PaymentsService } from './payments.service';

const nonAdminRoles = [
  UserRole.MODERATOR,
  UserRole.SUPPORT,
  UserRole.REVIEWER,
  UserRole.STUDENT,
  UserRole.LECTURER,
];

function activeUser(role: UserRole): User {
  return {
    id: 'user-1',
    role,
    isSuspended: false,
    accountStatus: 'active',
    emailVerified: true,
  } as User;
}

describe('financial service authorization', () => {
  it.each(nonAdminRoles)('denies %s access to administrator-only financial operations', async (role) => {
    const user = activeUser(role);

    // These services are created without their repositories because every operation
    // under test must reject before touching persistence or a payment provider.
    const payments = Object.create(PaymentsService.prototype) as PaymentsService;
    (payments as any).payments = {
      findOne: jest.fn().mockResolvedValue({ userId: 'another-user' }),
    };

    const payouts = Object.create(LecturerPayoutsService.prototype) as LecturerPayoutsService;
    const reconciliation = Object.create(PaymentsReconciliationService.prototype) as PaymentsReconciliationService;

    const operations = [
      payments.createRefund(user, 'payment-reference', { idempotencyKey: 'test-key-123', reason: 'test' }),
      payments.listDisputes(user),
      payments.verifyRefund(user, 'refund-id'),
      payments.verifyForUser(user, 'another-users-payment'),
      payouts.approve(user, 'payout-id'),
      payouts.verify(user, 'payout-reference'),
      payouts.reconcilePayouts(user, { from: '2026-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z' }),
      payouts.payoutReconciliationHistory(user),
      payouts.listRequests(user),
      reconciliation.reconcile(user, { from: '2026-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z' }),
      reconciliation.history(user),
    ];

    for (const operation of operations) {
      await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('allows a user to verify their own payment without granting cross-user inspection', async () => {
    const payments = Object.create(PaymentsService.prototype) as PaymentsService;
    (payments as any).payments = {
      findOne: jest.fn().mockResolvedValue({ userId: 'user-1', status: 'success' }),
    };
    (payments as any).publicPayment = jest.fn().mockReturnValue({ status: 'success' });

    await expect(payments.verifyForUser(activeUser(UserRole.MODERATOR), 'own-payment'))
      .resolves.toEqual({ status: 'success' });
  });
});
