import { Controller, Post, Body, BadRequestException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { S3StorageService } from './s3-storage.service';
import { PresignedUploadDto } from './dto/presigned-upload.dto';

@ApiTags('Storage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly s3StorageService: S3StorageService) {}

  @Post('presigned-url')
  @ApiOperation({ summary: 'Get presigned URL for file upload' })
  async getPresignedUrl(@Body() dto: PresignedUploadDto) {
    try {
      return await this.s3StorageService.getPresignedUploadUrl(dto);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Storage request failed');
    }
  }

  @Post('confirm-upload')
  @ApiOperation({ summary: 'Confirm file upload completion' })
  async confirmUpload(@Body() dto: { uploadId: string; resourceId: string; fileName: string }) {
    if (!dto.uploadId || !dto.resourceId || !dto.fileName) {
      throw new BadRequestException('uploadId, resourceId, and fileName are required');
    }
    try {
      return await this.s3StorageService.confirmUpload(dto.uploadId, dto.resourceId, dto.fileName);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Upload confirmation failed');
    }
  }
}
