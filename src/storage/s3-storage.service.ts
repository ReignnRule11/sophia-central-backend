import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export interface S3UploadPresignedUrlRequest {
  fileName: string;
  fileSize: number;
  fileType: string;
  resourceId: string;
}

export interface S3UploadResponse {
  presignedUrl: string;
  uploadId: string;
  fileName: string;
  resourceId: string;
  expiresIn: number;
  bucket: string;
  key: string;
}

@Injectable()
export class S3StorageService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint?: string;
  private readonly maxFileSize = 100 * 1024 * 1024;
  private readonly allowedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'image/jpeg',
    'image/png',
  ];

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('AWS_S3_BUCKET_NAME') || 'sophia-central';
    this.region = this.config.get<string>('AWS_REGION') || 'us-east-1';
    this.endpoint = this.config.get<string>('AWS_S3_ENDPOINT');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');

    this.s3Client = new S3Client({
      region: this.region,
      ...(this.endpoint ? { endpoint: this.endpoint, forcePathStyle: true } : {}),
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  async getPresignedUploadUrl(req: S3UploadPresignedUrlRequest): Promise<S3UploadResponse> {
    if (!Number.isInteger(req.fileSize) || req.fileSize < 1 || req.fileSize > this.maxFileSize) {
      throw new Error('File size must be between 1 byte and 100 MB');
    }
    if (!this.allowedMimeTypes.includes(req.fileType)) {
      throw new Error('File type not allowed');
    }

    const uploadId = randomUUID();
    const key = `resources/${req.resourceId}/${uploadId}/${req.fileName}`;
    const expiresIn = 900;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: req.fileType,
      ContentLength: req.fileSize,
    });
    const presignedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    return {
      presignedUrl,
      uploadId,
      fileName: req.fileName,
      resourceId: req.resourceId,
      expiresIn,
      bucket: this.bucket,
      key,
    };
  }

  async confirmUpload(uploadId: string, resourceId: string, fileName: string): Promise<{ success: boolean; fileUrl: string }> {
    const key = `resources/${resourceId}/${uploadId}/${fileName}`;
    await this.s3Client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    const fileUrl = this.endpoint
      ? `${this.endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    return { success: true, fileUrl };
  }

  async deleteFile(fileUrl: string): Promise<void> {
    const url = new URL(fileUrl);
    let key = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (this.endpoint && key.startsWith(`${this.bucket}/`)) {
      key = key.slice(this.bucket.length + 1);
    }
    if (!key || key.includes('..')) {
      throw new Error('Invalid object URL');
    }
    await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
