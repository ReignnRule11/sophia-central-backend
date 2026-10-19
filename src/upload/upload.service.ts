import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { FileUpload } from './entities/file-upload.entity';
import { Resource } from '../resources/entities/resource.entity';
import { CreateFileUploadDto } from './dto/create-file-upload.dto';
import { PointsService } from '../points/points.service';
import { S3Service } from './s3.service';

@Injectable()
export class UploadService {
  private readonly ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ];
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024;

  constructor(
    @InjectRepository(FileUpload)
    private readonly fileUploadRepository: Repository<FileUpload>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly pointsService: PointsService,
    private readonly s3Service: S3Service,
  ) {}

  async getPresignedUrl(
    userId: string,
    dto: CreateFileUploadDto,
  ): Promise<{ presignedUrl: string; key: string; uploadId: string; publicUrl: string }> {
    if (!this.ALLOWED_MIME_TYPES.includes(dto.mimetype)) {
      throw new BadRequestException(
        `File type ${dto.mimetype} not allowed. Allowed types: PDF, Word, PowerPoint, Text`,
      );
    }

    if (dto.size > this.MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds maximum of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    const resource = await this.resourceRepository.findOne({
      where: { id: dto.resourceId, uploaderId: userId },
    });

    if (!resource) {
      throw new BadRequestException('Resource not found or unauthorized');
    }

    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const ext = dto.filename.split('.').pop() || 'bin';
    const key = `resources/${userId}/${timestamp}-${random}.${ext}`;

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

    const { url, publicUrl } = await this.s3Service.createPresignedUploadUrl(key, dto.mimetype, 600);

    return {
      presignedUrl: url,
      key,
      uploadId: fileUpload.uploadId,
      publicUrl,
    };
  }

  async completeUpload(
    userId: string,
    dto: { key: string; resourceId: string; mimetype: string; size: number },
  ) {
    const resource = await this.resourceRepository.findOne({
      where: { id: dto.resourceId, uploaderId: userId },
      relations: ['uploader'],
    });

    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    const exists = await this.s3Service.checkObjectExists(dto.key);
    if (!exists) {
      throw new BadRequestException('Upload not found in object storage. Please upload the file before completing.');
    }

    const publicUrl = `${process.env.AWS_S3_BUCKET_URL || 'http://localhost:9000/sophia-central'}/${dto.key}`;
    resource.fileUrl = publicUrl;
    await this.resourceRepository.save(resource);

    const fileUpload = await this.fileUploadRepository.findOne({
      where: { s3Key: dto.key, userId },
    });

    if (fileUpload) {
      fileUpload.status = 'completed';
      fileUpload.completedAt = new Date();
      await this.fileUploadRepository.save(fileUpload);
    }

    return {
      success: true,
      resourceId: resource.id,
      fileUrl: publicUrl,
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
    if (!filePath) return false;
    return true;
  }
}
