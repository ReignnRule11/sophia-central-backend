import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { S3Service } from '../../../../libs/storage/src/s3.service';
import { DataSource } from 'typeorm';
import { ResourceFilesRepository } from '../../../../libs/storage/src/resource-files.repository';

class UploadRequestDto {
  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;
}

@Controller('v1/resources')
export class UploadController {
  private s3: S3Service;
  private filesRepo: ResourceFilesRepository;

  constructor(private dataSource: DataSource) {
    // In real app, inject via NestJS config/service container
    this.s3 = new S3Service(process.env.S3_REGION || 'us-east-1', process.env.S3_BUCKET || 'sophia-dev-bucket');
    this.filesRepo = new ResourceFilesRepository(this.dataSource);
  }

  @Post(':id/upload-request')
  async requestUpload(@Param('id') resourceId: string, @Body() body: UploadRequestDto, @Req() req: any) {
    // Basic validation
    if (!this.s3.validateUploadFilename(body.filename)) {
      return { error: 'unsupported file type' };
    }

    const key = `resources/${resourceId}/${Date.now()}-${body.filename}`;
    const url = await this.s3.generatePresignedUploadUrl({ key, contentType: body.contentType });

    // Create pending resource_files record so scanner/worker can pick it up
    try {
      const uploadedBy = req?.user?.id ?? null;
      const fileRecord = await this.filesRepo.createPending({ resourceId, s3Key: key, filename: body.filename, contentType: body.contentType, uploadedBy });

      return { uploadUrl: url, key, fileId: fileRecord.id };
    } catch (err) {
      // If DB write fails, log and still return presigned url but mark in response
      console.error('Failed to create resource_files record', err);
      return { uploadUrl: url, key, warning: 'failed to persist file metadata' };
    }
  }
}
