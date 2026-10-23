import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3StorageService } from './s3-storage.service';
import { StorageController } from './storage.controller';

@Module({
  providers: [S3StorageService, ConfigService],
  controllers: [StorageController],
  exports: [S3StorageService],
})
export class StorageModule {}
