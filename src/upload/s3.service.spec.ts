import { S3Service } from './s3.service';

describe('S3Service object-key boundary', () => {
  const originalEnv = {
    AWS_REGION: process.env.AWS_REGION,
    AWS_S3_ENDPOINT: process.env.AWS_S3_ENDPOINT,
    AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
    AWS_S3_BUCKET_URL: process.env.AWS_S3_BUCKET_URL,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  };
  let service: S3Service;

  beforeAll(() => {
    process.env.AWS_REGION = 'auto';
    process.env.AWS_S3_ENDPOINT = 'https://example-account.r2.cloudflarestorage.com';
    process.env.AWS_S3_BUCKET_NAME = 'sophia-central';
    process.env.AWS_S3_BUCKET_URL = 'https://files.example.test';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    service = new S3Service();
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('accepts canonical account-scoped object references', () => {
    const key = 'profile-images/3a6e9b37-945b-48fe-a227-236c97ad1d09/4d2a06fd-c6d5-48b8-a61b-94a03753934c.jpg';
    expect(service.getKeyFromPublicUrl(`https://files.example.test/${key}`)).toBe(key);
  });

  it('rejects keys outside the exact three-segment account-scoped structure', async () => {
    await expect(service.createPresignedDownloadUrl('resources/3a6e9b37-945b-48fe-a227-236c97ad1d09/upload-id/file.pdf')).rejects.toThrow('Invalid application storage object key');
    await expect(service.deleteObject('other-prefix/3a6e9b37-945b-48fe-a227-236c97ad1d09/file.pdf')).rejects.toThrow('Refusing to delete');
  });

  it('rejects traversal and malformed public references', () => {
    expect(service.getKeyFromPublicUrl('https://files.example.test/resources/3a6e9b37-945b-48fe-a227-236c97ad1d09/%2e%2e%2fsecret')).toBeNull();
    expect(service.getKeyFromPublicUrl('https://attacker.example.test/profile-images/3a6e9b37-945b-48fe-a227-236c97ad1d09/image.jpg')).toBeNull();
  });
});
