import { BadRequestException } from '@nestjs/common';
import { SupportService } from './support.service';
import { UserRole } from '../users/entities/user.entity';

describe('SupportService attachment ownership', () => {
  const user = { id: 'student-1', role: UserRole.STUDENT } as any;
  const reference = 'https://files.example.test/support-attachments/student-1/image.jpg';
  let requests: any;
  let s3: any;
  let service: SupportService;

  beforeEach(() => {
    requests = {
      create: jest.fn(value => value),
      save: jest.fn(async value => ({ id: 'request-1', ...value })),
    };
    s3 = {
      getKeyFromPublicUrl: jest.fn(value => {
        if (value === reference) return 'support-attachments/student-1/image.jpg';
        if (value === 'https://files.example.test/support-attachments/other-user/image.jpg') {
          return 'support-attachments/other-user/image.jpg';
        }
        return null;
      }),
      getObjectMetadata: jest.fn().mockResolvedValue({
        contentLength: 1024,
        contentType: 'image/jpeg',
      }),
      createPresignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example.test/support-image'),
    };
    service = new SupportService(
      requests,
      { findOne: jest.fn() } as any,
      { createNotification: jest.fn() } as any,
      s3,
    );
  });

  it('accepts only an existing attachment uploaded under the submitting account prefix', async () => {
    const result = await service.create(user, {
      subject: 'Help',
      category: 'technical',
      description: 'Please help.',
      attachments: [reference],
    } as any);

    expect(result.attachments).toEqual(['https://signed.example.test/support-image']);
    expect(s3.getObjectMetadata).toHaveBeenCalledWith('support-attachments/student-1/image.jpg');
  });

  it('rejects an attachment belonging to another account', async () => {
    await expect(service.create(user, {
      subject: 'Help',
      category: 'technical',
      description: 'Please help.',
      attachments: ['https://files.example.test/support-attachments/other-user/image.jpg'],
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(requests.save).not.toHaveBeenCalled();
  });

  it('rejects a missing or unsupported attachment object', async () => {
    s3.getObjectMetadata.mockResolvedValueOnce(null);
    await expect(service.create(user, {
      subject: 'Help',
      category: 'technical',
      description: 'Please help.',
      attachments: [reference],
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(requests.save).not.toHaveBeenCalled();
  });
});
