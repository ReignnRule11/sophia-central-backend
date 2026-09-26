import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

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
  private s3Client: AWS.S3;
  private bucket: string;
  private region: string;
  private maxFileSize: number = 100 * 1024 * 1024; // 100 MB
  private allowedMimeTypes = [
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
    this.bucket = this.config.get<string>('AWS_S3_BUCKET') || 'sophia-central';
    this.region = this.config.get<string>('AWS_REGION') || 'us-east-1';

    this.s3Client = new AWS.S3({
      accessKeyId: this.config.get<string>('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.config.get<string>('AWS_SECRET_ACCESS_KEY'),
      region: this.region,
    });
  }

  async getPresignedUploadUrl(req: S3UploadPresignedUrlRequest): Promise<S3UploadResponse> {
    // Validate file size
    if (req.fileSize > this.maxFileSize) {
      throw new Error(`File size exceeds maximum limit of ${this.maxFileSize / 1024 / 1024}MB`);
    }

    // Validate file type
    if (!this.allowedMimeTypes.includes(req.fileType)) {
      throw new Error('File type not allowed');
    }

    const uploadId = uuidv4();
    const key = `resources/${req.resourceId}/${uploadId}/${req.fileName}`;
    const expiresIn = 3600; // 1 hour

    try {
      const presignedUrl = this.s3Client.getSignedUrl('putObject', {
        Bucket: this.bucket,
        Key: key,
        ContentType: req.fileType,
        Expires: expiresIn,
      });

      return {
        presignedUrl,
        uploadId,
        fileName: req.fileName,
        resourceId: req.resourceId,
        expiresIn,
        bucket: this.bucket,
        key,
      };
    } catch (error) {
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  async confirmUpload(uploadId: string, resourceId: string, fileName: string): Promise<{ success: boolean; fileUrl: string }> {
    const key = `resources/${resourceId}/${uploadId}/${fileName}`;

    try {
      // Verify the file exists in S3
      await this.s3Client.headObject({ Bucket: this.bucket, Key: key }).promise();

      // Generate permanent file URL
      const fileUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

      return {
        success: true,
        fileUrl,
      };
    } catch (error) {
      throw new Error(`Failed to confirm upload: ${error.message}`);
    }
  }

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      const url = new URL(fileUrl);
      const key = url.pathname.substring(1 + this.bucket.length + 1); // Remove bucket prefix

      await this.s3Client.deleteObject({ Bucket: this.bucket, Key: key }).promise();
    } catch (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }
}
