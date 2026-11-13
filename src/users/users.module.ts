import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { Institution } from '../institutions/entities/institution.entity';
import { StorageModule } from '../upload/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Institution]), StorageModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
