import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { FileUpload } from './entities/file-upload.entity';
import { Resource } from '../resources/entities/resource.entity';
import { CreateFileUploadDto } from './dto/create-file-upload.dto';
import { PointsService } from '../points/points.service';

@Injectable()
export class UploadService {
  private s3Client: any;
  private readonly ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ];
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  constructor(
    @InjectRepository(FileUpload)
    private readonly fileUploadRepository: Repository<FileUpload>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly configService: ConfigService,
    private readonly pointsService: PointsService,
  ) {
    this.initializeS3();
  }

  private initializeS3() {
    // Initialize S3 client (AWS SDK v3 or compatible)
    // For local development, you can use MinIO or LocalStack
    // Example configuration:
    // this.s3Client = new S3Client({
    //   region: this.configService.get('AWS_REGION'),
    //   credentials: {
    //     accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
    //     secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
    //   },
    // });
  }

  async getPresignedUrl(
    userId: string,
    dto: CreateFileUploadDto,
  ): Promise<{ presignedUrl: string; key: string; uploadId: string }> {
    // Validate file type
    if (!this.ALLOWED_MIME_TYPES.includes(dto.mimetype)) {
      throw new BadRequestException(
        `File type ${dto.mimetype} not allowed. Allowed types: PDF, Word, PowerPoint, Text`,
      );
    }

    // Validate file size
    if (dto.size > this.MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds maximum of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    // Verify resource exists and belongs to user
    const resource = await this.resourceRepository.findOne({
      where: { id: dto.resourceId, uploaderId: userId },
    });

    if (!resource) {
      throw new BadRequestException('Resource not found or unauthorized');
    }

    // Generate unique key
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const ext = dto.filename.split('.').pop();
    const key = `resources/${userId}/${timestamp}-${random}.${ext}`;

    // Create file upload record
    const fileUpload = this.fileUploadRepository.create({
      uploadId: crypto.randomUUID(),
      resourceId: dto.resourceId,
      userId,
      filename: dto.filename,
      mimetype: dto.mimetype,
      size: dto.size,
      s3Key: key,
      status: 'pending',
    });

    await this.fileUploadRepository.save(fileUpload);

    // Generate presigned URL (mock implementation)
    // In production, use AWS S3 SDK to generate actual presigned URLs
    const presignedUrl = `${this.configService.get('AWS_S3_BUCKET_URL')}/upload?key=${key}&uploadId=${fileUpload.uploadId}`;

    return {
      presignedUrl,
      key,
      uploadId: fileUpload.uploadId,
    };
  }

  async completeUpload(
    userId: string,
    dto: { key: string; resourceId: string; mimetype: string; size: number },
  ) {
    // Find resource
    const resource = await this.resourceRepository.findOne({
      where: { id: dto.resourceId, uploaderId: userId },
      relations: ['uploader'],
    });

    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    // Update resource with file URL
    const fileUrl = `${this.configService.get('AWS_S3_BUCKET_URL')}/${dto.key}`;
    resource.fileUrl = fileUrl;
    await this.resourceRepository.save(resource);

    // Find and update file upload record
    const fileUpload = await this.fileUploadRepository.findOne({
      where: { s3Key: dto.key, userId },
    });

    if (fileUpload) {
      fileUpload.status = 'completed';
      fileUpload.completedAt = new Date();
      await this.fileUploadRepository.save(fileUpload);
    }

    // Award points for upload (if approved later)
    // Points can be conditional on resource approval

    return {
      success: true,
      resourceId: resource.id,
      fileUrl,
      message: 'File uploaded successfully',
    };
  }

  async getUploadDetails(uploadId: string) {
    const fileUpload = await this.fileUploadRepository.findOne({
      where: { uploadId },
      relations: ['resource'],
    });

    if (!fileUpload) {
      throw new NotFoundException('Upload not found');
    }

    return fileUpload;
  }

  async validateAndScanFile(filePath: string): Promise<boolean> {
    // Implement virus/malware scanning here
    // Options:
    // 1. ClamAV integration
    // 2. VirusTotal API
    // 3. AWS Macie
    // For MVP, return true (assume safe)
    return true;
  }
}
