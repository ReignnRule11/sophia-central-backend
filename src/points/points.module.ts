import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointWallet } from './entities/point-wallet.entity';
import { PointTransaction } from './entities/point-transaction.entity';
import { PointsController } from './points.controller';
import { PointsService } from './points.service';
import { Referral } from '../referral/entities/referral.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PointWallet, PointTransaction, Referral, User])],
  controllers: [PointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
