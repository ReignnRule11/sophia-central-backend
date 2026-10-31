import { Injectable } from '@nestjs/common';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StoredObjectMetadata {
  contentLength: number | undefined;
  contentType: string | undefined;
}

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
      publicUrl: this.getPublicUrl(key),
    };
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  async createPresignedDownloadUrl(key: string, filename?: string, disposition: 'inline' | 'attachment' = 'inline', expiresIn = 300): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ...(filename ? { ResponseContentDisposition: `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}` } : {}),
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  getKeyFromPublicUrl(value: string): string | null {
    try {
      const parsed = new URL(value);
      const base = new URL(this.publicBaseUrl);
      if (parsed.host !== base.host) return null;
      const basePath = base.pathname.replace(/\/$/, '');
      const pathname = decodeURIComponent(parsed.pathname);
      if (!pathname.startsWith(`${basePath}/`)) return null;
      const key = pathname.slice(basePath.length + 1);
      return key && !key.split('/').includes('..') ? key : null;
    } catch { return null; }
  }

  async uploadPublicObject(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
    return this.getPublicUrl(key);
  }

  async getObjectMetadata(key: string): Promise<StoredObjectMetadata | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      return {
        contentLength: response.ContentLength,
        contentType: response.ContentType,
      };
    } catch {
      return null;
    }
  }

  async checkObjectExists(key: string): Promise<boolean> {
    return (await this.getObjectMetadata(key)) !== null;
  }
}
