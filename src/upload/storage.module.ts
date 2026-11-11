import { Module } from '@nestjs/common';
import { S3Service } from './s3.service';
import { ClamAvService } from './clamav.service';
import { StorageCleanupService } from './storage-cleanup.service';

@Module({
  providers: [S3Service, StorageCleanupService, ClamAvService],
  exports: [S3Service, StorageCleanupService, ClamAvService],
})
export class StorageModule {}
