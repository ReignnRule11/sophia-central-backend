import { PointsService } from './points.service';
import { PointWallet } from './entities/point-wallet.entity';
import { PointTransaction, PointTransactionType } from './entities/point-transaction.entity';
import { ResourceRewardOutbox, ResourceRewardStatus } from './entities/resource-reward-outbox.entity';
import { User, UserRole } from '../users/entities/user.entity';

describe('PointsService resource reward outbox', () => {
  const job = {
    id: 'outbox-1',
    resourceId: 'resource-1',
    userId: 'student-1',
    status: ResourceRewardStatus.PENDING,
    attempts: 0,
    nextAttemptAt: new Date(),
  };
  const user = { id: 'student-1', role: UserRole.STUDENT, isSuspended: false };
  const wallet = { id: 'wallet-1', userId: 'student-1', balance: 15 };
  let manager: any;
  let outboxRepository: any;
  let service: PointsService;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = {
      findOne: jest.fn(async (entity: any) => {
        if (entity === ResourceRewardOutbox) return { ...job };
        if (entity === User) return user;
        if (entity === PointWallet) return { ...wallet };
        if (entity === PointTransaction) return null;
        return null;
      }),
      create: jest.fn((_entity: any, value: any) => value),
      save: jest.fn(async (_entity: any, value: any) => value),
    };
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([job]),
    };
    outboxRepository = {
      manager: { transaction: jest.fn(async (callback: any) => callback(manager)) },
      createQueryBuilder: jest.fn(() => queryBuilder),
      findOne: jest.fn().mockResolvedValue({ ...job }),
      save: jest.fn(async (value: any) => value),
    };
    service = new PointsService(
      { findOne: jest.fn() } as any,
      { findOne: jest.fn() } as any,
      outboxRepository,
      {} as any,
      { findOne: jest.fn().mockResolvedValue(user) } as any,
    );
    jest.spyOn(service, 'getOrCreateWallet').mockResolvedValue(wallet as PointWallet);
  });

  it('credits exactly 10 points and completes the outbox item atomically', async () => {
    await service.processPendingResourceRewards();

    expect(manager.save).toHaveBeenCalledWith(PointWallet, expect.objectContaining({ balance: 25 }));
    expect(manager.save).toHaveBeenCalledWith(PointTransaction, expect.objectContaining({
      userId: 'student-1',
      type: PointTransactionType.EARNED,
      amount: 10,
      reason: 'Approved resource contribution reward: resource-1',
    }));
    expect(manager.save).toHaveBeenCalledWith(ResourceRewardOutbox, expect.objectContaining({
      status: ResourceRewardStatus.COMPLETED,
      completedAt: expect.any(Date),
    }));
  });

  it('records a retry with backoff when the reward transaction fails', async () => {
    outboxRepository.manager.transaction.mockRejectedValueOnce(new Error('temporary database failure'));

    await service.processPendingResourceRewards();

    expect(outboxRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      attempts: 1,
      status: ResourceRewardStatus.PENDING,
      lastError: 'Error: temporary database failure',
      nextAttemptAt: expect.any(Date),
    }));
  });

  it('does not credit the wallet twice when the transaction already exists', async () => {
    manager.findOne.mockImplementation(async (entity: any) => {
      if (entity === ResourceRewardOutbox) return { ...job };
      if (entity === User) return user;
      if (entity === PointWallet) return { ...wallet };
      if (entity === PointTransaction) return { id: 'existing-reward' };
      return null;
    });

    await service.processPendingResourceRewards();

    expect(manager.save).not.toHaveBeenCalledWith(PointWallet, expect.anything());
    expect(manager.save).toHaveBeenCalledWith(ResourceRewardOutbox, expect.objectContaining({
      status: ResourceRewardStatus.COMPLETED,
    }));
  });
});
