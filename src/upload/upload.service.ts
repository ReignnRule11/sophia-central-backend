import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { CreateProfileImageUploadDto } from './dto/create-profile-image-upload.dto';
import { CompleteProfileImageUploadDto } from './dto/complete-file-upload.dto';
import { FileUpload } from './entities/file-upload.entity';
import { Resource } from '../resources/entities/resource.entity';
import { CreateFileUploadDto } from './dto/create-file-upload.dto';
import { CompleteFileUploadDto } from './dto/complete-file-upload.dto';
import { PointsService } from '../points/points.service';
import { S3Service } from './s3.service';

type SupportAttachmentFile = { mimetype: string; size: number; buffer: Buffer };

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
    private readonly usersService: UsersService,
  ) {}

  async uploadSupportAttachment(userId: string, file: SupportAttachmentFile) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!file || !allowed.includes(file.mimetype)) throw new BadRequestException('Support attachments must be JPG, PNG, or WebP images');
    if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new BadRequestException('Support images must be smaller than 5 MB');
    const ext = file.mimetype === 'image/jpeg' ? 'jpg' : file.mimetype === 'image/png' ? 'png' : 'webp';
    const key = `support-attachments/${userId}/${crypto.randomUUID()}.${ext}`;
    const url = await this.s3Service.uploadPublicObject(key, file.buffer, file.mimetype);
    return { url, key };
  }

  async getProfileImagePresignedUrl(userId: string, dto: CreateProfileImageUploadDto) {
    const types = ['image/jpeg', 'image/png', 'image/webp'];
    if (!types.includes(dto.mimetype)) throw new BadRequestException('Profile images must be JPG, PNG, or WebP');
    if (!Number.isInteger(dto.size) || dto.size < 1 || dto.size > 5 * 1024 * 1024) throw new BadRequestException('Profile image must be smaller than 5 MB');
    const ext = dto.mimetype === 'image/jpeg' ? 'jpg' : dto.mimetype === 'image/png' ? 'png' : 'webp';
    const key = 'profile-images/' + userId + '/' + crypto.randomUUID() + '.' + ext;
    const signed = await this.s3Service.createPresignedUploadUrl(key, dto.mimetype, 600);
    return { presignedUrl: signed.url, key, publicUrl: signed.publicUrl };
  }

  async getProfileImageUrl(userId: string): Promise<{ url: string | null }> {
    const user = await this.usersService.findOne(userId);
    if (!user?.profileImage) return { url: null };
    const key = this.s3Service.getKeyFromPublicUrl(user.profileImage);
    return { url: key ? await this.s3Service.createPresignedDownloadUrl(key) : user.profileImage };
  }

  async completeProfileImageUpload(userId: string, dto: CompleteProfileImageUploadDto) {
    const types = ['image/jpeg', 'image/png', 'image/webp'];
    if (!types.includes(dto.mimetype)) throw new BadRequestException('Profile images must be JPG, PNG, or WebP');
    if (!Number.isInteger(dto.size) || dto.size < 1 || dto.size > 5 * 1024 * 1024) throw new BadRequestException('Profile image must be smaller than 5 MB');
    if (!dto.key.startsWith('profile-images/' + userId + '/')) throw new BadRequestException('Invalid profile image key');
    const stored = await this.s3Service.getObjectMetadata(dto.key);
    if (!stored || stored.contentLength !== dto.size || stored.contentType !== dto.mimetype) throw new BadRequestException('Uploaded profile image could not be verified');
    const profileImage = this.s3Service.getPublicUrl(dto.key);
    const user = await this.usersService.update(userId, { profileImage });
    const { password: _password, ...safeUser } = user;
    return { success: true, profileImage, user: safeUser };
  }

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

  async completeUpload(userId: string, dto: CompleteFileUploadDto) {
    if (!this.ALLOWED_MIME_TYPES.includes(dto.mimetype)) {
      throw new BadRequestException('File type is not allowed');
    }
    if (!Number.isInteger(dto.size) || dto.size < 1 || dto.size > this.MAX_FILE_SIZE) {
      throw new BadRequestException('File size is invalid or exceeds the 50 MB limit');
    }
    if (!dto.key.startsWith(`resources/${userId}/`)) {
      throw new BadRequestException('Upload key is invalid for this user');
    }

    const resource = await this.resourceRepository.findOne({
      where: { id: dto.resourceId, uploaderId: userId },
    });
    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    // A completion request must match an upload initiated for this exact user/resource.
    const fileUpload = await this.fileUploadRepository.findOne({
      where: {
        s3Key: dto.key,
        resourceId: dto.resourceId,
        userId,
        status: 'pending',
      },
    });
    if (!fileUpload) {
      throw new BadRequestException('No pending upload matches this resource and storage key');
    }
    if (fileUpload.mimetype !== dto.mimetype || Number(fileUpload.size) !== dto.size) {
      throw new BadRequestException('Upload metadata does not match the initiated upload');
    }

    const storedObject = await this.s3Service.getObjectMetadata(dto.key);
    if (!storedObject) {
      throw new BadRequestException('Upload not found in object storage. Please upload the file before completing.');
    }
    if (storedObject.contentLength !== dto.size) {
      throw new BadRequestException('Stored file size does not match the initiated upload');
    }
    if (storedObject.contentType !== dto.mimetype) {
      throw new BadRequestException('Stored file content type does not match the initiated upload');
    }

    const publicUrl = this.s3Service.getPublicUrl(dto.key);
    resource.fileUrl = publicUrl;
    await this.resourceRepository.save(resource);

    fileUpload.status = 'completed';
    fileUpload.completedAt = new Date();
    await this.fileUploadRepository.save(fileUpload);

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
