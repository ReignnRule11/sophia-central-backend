import { Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const endpoint = process.env.AWS_S3_ENDPOINT;
    const bucketName = process.env.AWS_S3_BUCKET_NAME || 'sophia-central';

    this.bucketName = bucketName;
    this.publicBaseUrl = process.env.AWS_S3_BUCKET_URL || `https://${bucketName}.s3.${region}.amazonaws.com`;

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: !!endpoint,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  async createPresignedUploadUrl(key: string, contentType: string, expiresIn = 600) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });

    return {
      url,
      key,
      bucket: this.bucketName,
      publicUrl: `${this.publicBaseUrl}/${key}`,
    };
  }

  async checkObjectExists(key: string) {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
