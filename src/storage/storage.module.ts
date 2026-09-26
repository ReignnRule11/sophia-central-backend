import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { S3StorageService } from './s3-storage.service';
import { StorageController } from './storage.controller';

@Module({
  providers: [StorageService, S3StorageService, ConfigService],
  controllers: [StorageController],
  exports: [StorageService, S3StorageService],
})
export class StorageModule {}
