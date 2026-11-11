import { Injectable } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
    const region = process.env.AWS_REGION || (process.env.AWS_S3_ENDPOINT ? 'auto' : 'us-east-1');
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
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
      if (parsed.host !== base.host || parsed.username || parsed.password) return null;
      const basePath = base.pathname.replace(/\/$/, '');
      if (!parsed.pathname.startsWith(`${basePath}/`)) return null;
      const encodedKey = parsed.pathname.slice(basePath.length + 1);
      const segments = encodedKey.split('/');
      if (!segments.length || segments.some(segment => !segment)) return null;
      const decoded = segments.map(segment => decodeURIComponent(segment));
      if (decoded.some(segment => !segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes(String.fromCharCode(92)))) return null;
      const key = decoded.join('/');
      return this.isAllowedObjectKey(key) ? key : null;
    } catch { return null; }
  }

  private isAllowedObjectKey(key: string): boolean {
    if (!key || key.startsWith('/') || key.includes(String.fromCharCode(92)) || [...key].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false;
    if (key.split('/').some(part => !part || part === '.' || part === '..')) return false;
    return ['profile-images/', 'resources/', 'support-attachments/', 'voice-messages/']
      .some(prefix => key.startsWith(prefix));
  }

  async uploadPublicObject(key: string, body: Buffer, contentType: string, cacheControl?: string): Promise<string> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(cacheControl ? { CacheControl: cacheControl } : {}),
    }));
    return this.getPublicUrl(key);
  }

  async deleteObject(key: string): Promise<void> {
    if (!this.isAllowedObjectKey(key)) throw new Error('Refusing to delete an invalid or non-application storage object key');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }));
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
