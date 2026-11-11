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
  let resourceRepository: any;
  let s3Service: { getObjectMetadata: jest.Mock; getPublicUrl: jest.Mock; getObjectPrefix: jest.Mock };
  let transactionManager: any;
  let storageCleanup: any;
  let clamAvService: any;

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
    transactionManager = {
      findOne: jest.fn()
        .mockResolvedValueOnce({ id: resourceId, uploaderId: userId, fileUrl: null })
        .mockResolvedValueOnce(pendingUpload()),
      save: jest.fn().mockImplementation(async (_entity, value) => value),
    };
    resourceRepository = {
      findOne: jest.fn().mockResolvedValue({ id: resourceId, uploaderId: userId, fileUrl: null }),
      save: jest.fn().mockImplementation(async (value) => value),
      manager: { transaction: jest.fn(async callback => callback(transactionManager)) },
    };
    s3Service = {
      getObjectMetadata: jest.fn().mockResolvedValue({
        contentLength: dto.size,
        contentType: dto.mimetype,
      }),
      getPublicUrl: jest.fn().mockReturnValue('https://files.example.test/resources/user-1/test.pdf'),
      getObjectPrefix: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7')),
      getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7')),
    };

    clamAvService = { scan: jest.fn().mockResolvedValue({ clean: true, result: 'stream: OK' }) };
    storageCleanup = {
      enqueue: jest.fn(async () => undefined),
      enqueueWithManager: jest.fn(async () => undefined),
    };
    service = new UploadService(
      fileUploadRepository as any,
      resourceRepository as any,
      {} as any,
      s3Service as any,
      { update: jest.fn(), updateProfileImage: jest.fn() } as any,
      storageCleanup,
      clamAvService,
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
    expect(transactionManager.save).not.toHaveBeenCalled();
  });

  it('rejects a stored object whose size differs from the initiated upload', async () => {
    s3Service.getObjectMetadata.mockResolvedValueOnce({
      contentLength: dto.size + 1,
      contentType: dto.mimetype,
    });

    await expect(service.completeUpload(userId, dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(resourceRepository.save).not.toHaveBeenCalled();
    expect(transactionManager.save).not.toHaveBeenCalled();
  });

  it('rejects an object whose bytes do not match the declared MIME type', async () => {
    s3Service.getObjectPrefix.mockResolvedValueOnce(Buffer.from('not-a-pdf'));
    await expect(service.completeUpload(userId, dto)).rejects.toThrow('content does not match');
    expect(transactionManager.save).not.toHaveBeenCalled();
  });

  it('links the verified object and marks the matching pending upload completed', async () => {
    const result = await service.completeUpload(userId, dto);

    expect(result).toMatchObject({ success: true, resourceId, fileUrl: 'https://files.example.test/resources/user-1/test.pdf' });
    expect(transactionManager.save).toHaveBeenCalledTimes(2);
    expect(transactionManager.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fileUrl: key }));
    expect(transactionManager.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'scanned', scanResult: 'stream: OK' }));
  });
});


describe('UploadService.getUploadDetails', () => {
  const ownerId = 'owner-1';
  const uploadId = 'upload-1';
  const record = {
    uploadId,
    userId: ownerId,
    resourceId: 'resource-1',
    filename: 'notes.pdf',
    mimetype: 'application/pdf',
    size: 128,
    status: 'completed',
    uploadedAt: new Date('2026-11-11T10:00:00.000Z'),
    completedAt: new Date('2026-11-11T10:01:00.000Z'),
    s3Key: 'resources/owner-1/private.pdf',
    resource: { id: 'resource-1', title: 'Study notes', uploaderId: ownerId },
  };

  it('returns only safe metadata for an upload owned by the authenticated user', async () => {
    const repository = { findOne: jest.fn().mockResolvedValue(record) };
    const service = new UploadService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { scan: jest.fn() } as any,
    );

    await expect(service.getUploadDetails(ownerId, uploadId)).resolves.toEqual({
      uploadId,
      resourceId: 'resource-1',
      filename: 'notes.pdf',
      mimetype: 'application/pdf',
      size: 128,
      status: 'completed',
      uploadedAt: record.uploadedAt,
      completedAt: record.completedAt,
      resource: { id: 'resource-1', title: 'Study notes' },
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { uploadId, userId: ownerId },
      relations: ['resource'],
    });
  });

  it('does not reveal upload identifiers owned by another account', async () => {
    const repository = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new UploadService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getUploadDetails('attacker-1', uploadId)).rejects.toThrow('Upload not found');
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { uploadId, userId: 'attacker-1' },
      relations: ['resource'],
    });
  });
});
