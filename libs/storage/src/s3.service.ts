import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface PresignOptions {
  key: string;
  contentType: string;
  expiresIn?: number; // seconds
}

export class S3Service {
  private client: S3Client;
  private bucket: string;

  constructor(region: string, bucket: string, credentials?: any) {
    this.client = new S3Client({ region, credentials });
    this.bucket = bucket;
  }

  async generatePresignedUploadUrl(opts: PresignOptions) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: opts.key,
      ContentType: opts.contentType,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn: opts.expiresIn ?? 60 * 5 });
    return url;
  }

  // Placeholder for server-side verification (e.g., check file ext/size before issuing URL)
  validateUploadFilename(filename: string) {
    // Basic validation: allowed extensions
    const allowed = ['.pdf', '.docx', '.pptx', '.txt', '.png', '.jpg', '.jpeg'];
    return allowed.some(ext => filename.toLowerCase().endsWith(ext));
  }
}
