import { Module } from '@nestjs/common';
import { S3Service } from './s3.service';
import { StorageCleanupService } from './storage-cleanup.service';

@Module({
  providers: [S3Service, StorageCleanupService],
  exports: [S3Service, StorageCleanupService],
})
export class StorageModule {}
