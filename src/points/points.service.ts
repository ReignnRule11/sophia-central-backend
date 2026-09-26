import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PointWallet } from './entities/point-wallet.entity';
import { PointTransaction } from './entities/point-transaction.entity';
import { AwardPointsDto } from './dto/award-points.dto';

@Injectable()
export class PointsService {
  constructor(
    @InjectRepository(PointWallet)
    private readonly walletRepository: Repository<PointWallet>,
    @InjectRepository(PointTransaction)
    private readonly transactionRepository: Repository<PointTransaction>,
  ) {}

  async getOrCreateWallet(userId: string): Promise<PointWallet> {
    let wallet = await this.walletRepository.findOne({ where: { userId } });

    if (!wallet) {
      wallet = this.walletRepository.create({ userId, balance: 0 });
      wallet = await this.walletRepository.save(wallet);
    }

    return wallet;
  }

  async getBalance(userId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(userId);
    return wallet.balance;
  }

  async getTransactions(userId: string, limit: number = 20) {
    return this.transactionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async awardPoints(dto: AwardPointsDto) {
    const wallet = await this.getOrCreateWallet(dto.userId);
    wallet.balance += dto.amount;
    await this.walletRepository.save(wallet);

    const transaction = this.transactionRepository.create({
      userId: dto.userId,
      type: 'earned',
      amount: dto.amount,
      reason: dto.reason,
    });

    return this.transactionRepository.save(transaction);
  }
}
