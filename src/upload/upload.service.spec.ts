import { BadRequestException } from '@nestjs/common';
import { UploadService } from './upload.service';

describe('UploadService.completeUpload', () => {
  const userId = 'user-1';
  const resourceId = 'resource-1';
  const key = `resources/${userId}/test.pdf`;
  const dto = {
    key,
    resourceId,
    mimetype: 'application/pdf',
    size: 128,
  };

  let service: UploadService;
  let fileUploadRepository: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let resourceRepository: { findOne: jest.Mock; save: jest.Mock };
  let s3Service: { getObjectMetadata: jest.Mock; getPublicUrl: jest.Mock };

  const pendingUpload = () => ({
    id: 'upload-row-1',
    uploadId: 'upload-1',
    resourceId,
    userId,
    s3Key: key,
    mimetype: dto.mimetype,
    size: dto.size,
    status: 'pending',
    completedAt: undefined,
  });

  beforeEach(() => {
    fileUploadRepository = {
      findOne: jest.fn().mockResolvedValue(pendingUpload()),
      save: jest.fn().mockImplementation(async (value) => value),
      create: jest.fn(),
    };
    resourceRepository = {
      findOne: jest.fn().mockResolvedValue({ id: resourceId, uploaderId: userId, fileUrl: null }),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    s3Service = {
      getObjectMetadata: jest.fn().mockResolvedValue({
        contentLength: dto.size,
        contentType: dto.mimetype,
      }),
      getPublicUrl: jest.fn().mockReturnValue('https://files.example.test/resources/user-1/test.pdf'),
    };

    service = new UploadService(
      fileUploadRepository as any,
      resourceRepository as any,
      {} as any,
      s3Service as any,
      { update: jest.fn() } as any,
    );
  });

  it('rejects a key outside the authenticated user prefix', async () => {
    await expect(
      service.completeUpload(userId, { ...dto, key: 'resources/another-user/test.pdf' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fileUploadRepository.findOne).not.toHaveBeenCalled();
  });

  it('rejects when no pending upload matches the user, resource, and key', async () => {
    fileUploadRepository.findOne.mockResolvedValueOnce(null);

    await expect(service.completeUpload(userId, dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(resourceRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a stored object whose size differs from the initiated upload', async () => {
    s3Service.getObjectMetadata.mockResolvedValueOnce({
      contentLength: dto.size + 1,
      contentType: dto.mimetype,
    });

    await expect(service.completeUpload(userId, dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(resourceRepository.save).not.toHaveBeenCalled();
    expect(fileUploadRepository.save).not.toHaveBeenCalled();
  });

  it('links the verified object and marks the matching pending upload completed', async () => {
    const result = await service.completeUpload(userId, dto);

    expect(result).toMatchObject({ success: true, resourceId, fileUrl: 'https://files.example.test/resources/user-1/test.pdf' });
    expect(resourceRepository.save).toHaveBeenCalledWith(expect.objectContaining({ fileUrl: result.fileUrl }));
    expect(fileUploadRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });
});
