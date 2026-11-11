import { StorageCleanupService } from './storage-cleanup.service';

describe('StorageCleanupService enqueue safety', () => {
  const makeService = () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const dataSource = { manager } as any;
    const s3 = {
      getKeyFromPublicUrl: jest.fn((value: string) => {
        if (value === 'https://cdn.example.test/profile-images/user/photo.png') return 'profile-images/user/photo.png';
        return null;
      }),
    } as any;
    return { service: new StorageCleanupService(dataSource, s3), manager, s3 };
  };

  it('queues an object only from an application-owned storage prefix', async () => {
    const { service, manager } = makeService();
    await service.enqueueWithManager(manager as any, 'profile-images/user/photo.png', 'profile-replaced');
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query.mock.calls[0][0]).toContain('INSERT INTO storage_cleanup_jobs');
    expect(manager.query.mock.calls[0][1][0]).toBe('profile-images/user/photo.png');
  });

  it('converts an application public URL into its object key', async () => {
    const { service, manager } = makeService();
    await service.enqueueWithManager(manager as any, 'https://cdn.example.test/profile-images/user/photo.png', 'profile-replaced');
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query.mock.calls[0][1][0]).toBe('profile-images/user/photo.png');
  });

  it('does not queue external URLs or keys outside application prefixes', async () => {
    const { service, manager } = makeService();
    await service.enqueueWithManager(manager as any, 'https://external.example/image.png', 'external');
    await service.enqueueWithManager(manager as any, 'private-backups/db.dump', 'not-owned');
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('rejects path traversal keys', async () => {
    const { service, manager } = makeService();
    await service.enqueueWithManager(manager as any, 'resources/user/../../other/file.pdf', 'invalid');
    expect(manager.query).not.toHaveBeenCalled();
  });
});

describe('StorageCleanupService claim row mapping', () => {
  const makeClaimService = (claimResult: unknown) => {
    const manager = { query: jest.fn().mockResolvedValue(claimResult) };
    const dataSource = { transaction: jest.fn(async (callback: (manager: any) => unknown) => callback(manager)) } as any;
    const service = new StorageCleanupService(dataSource, {} as any);
    return { service, manager };
  };

  it.each([
    ['TypeORM rows array', [{ id: 'job-1', object_key: 'resources/a.pdf', attempts: 4 }]],
    ['wrapped PostgreSQL rows', [[{ id: 'job-1', object_key: 'resources/a.pdf', attempts: 4 }], 1]],
    ['camel-case key fallback', [{ id: 'job-1', objectKey: 'resources/a.pdf', attempts: 4 }]],
    ['records response', { records: [{ id: 'job-1', object_key: 'resources/a.pdf', attempts: 4 }] }],
  ])('normalizes %s', async (_label, result) => {
    const { service } = makeClaimService(result);
    await expect((service as any).claimJobs()).resolves.toEqual([
      { id: 'job-1', object_key: 'resources/a.pdf', attempts: 4 },
    ]);
  });

  it('skips malformed rows rather than passing undefined keys to R2', async () => {
    const { service } = makeClaimService([{ attempts: undefined }]);
    await expect((service as any).claimJobs()).resolves.toEqual([]);
  });
});

describe('StorageCleanupService retry backoff safety', () => {
  const makeRetryService = () => {
    const dataSource = {
      manager: { query: jest.fn().mockResolvedValue([]) },
      query: jest.fn().mockResolvedValue([]),
    } as any;
    return { service: new StorageCleanupService(dataSource, {} as any), dataSource };
  };

  it.each([
    ['missing attempts', undefined, 2, 'queued'],
    ['NaN attempts', 'NaN', 2, 'queued'],
    ['numeric-string attempts', '3', 8, 'queued'],
    ['negative attempts', -4, 2, 'queued'],
    ['terminal attempt count', 20, 256, 'failed'],
  ])('uses a finite integer delay for %s', async (_label, attempts, expectedDelay, expectedStatus) => {
    const { service, dataSource } = makeRetryService();
    await (service as any).retryJob(
      { id: 'cleanup-job-1', object_key: 'resources/test/file.pdf', attempts },
      new Error('simulated R2 failure'),
    );
    expect(dataSource.query).toHaveBeenCalledTimes(1);
    const params = dataSource.query.mock.calls[0][1];
    expect(params[1]).toBe(expectedStatus);
    expect(Number.isFinite(params[2])).toBe(true);
    expect(Number.isInteger(params[2])).toBe(true);
    expect(params[2]).toBe(expectedDelay);
  });
});

describe('StorageCleanupService worker deletion boundary', () => {
  const makeWorker = (key: string) => {
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: any) => unknown) => callback({ query: jest.fn().mockResolvedValue([]) })),
    } as any;
    const s3 = { deleteObject: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new StorageCleanupService(dataSource, s3);
    jest.spyOn(service as any, 'queueExpiredPendingUploads').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'claimJobs').mockResolvedValue([{ id: 'job-1', object_key: key, attempts: 1 }]);
    jest.spyOn(service as any, 'isReferenced').mockResolvedValue(false);
    const finishJob = jest.spyOn(service as any, 'finishJob').mockResolvedValue(undefined);
    return { service, s3, finishJob };
  };

  it('protects malformed or out-of-scope persisted jobs without checking or deleting them', async () => {
    const { service, s3, finishJob } = makeWorker('private-backups/database.dump');
    await service.runBatch();
    expect(finishJob).toHaveBeenCalledWith('job-1', 'protected');
    expect(s3.deleteObject).not.toHaveBeenCalled();
    expect((service as any).isReferenced).not.toHaveBeenCalled();
  });

  it('revalidates and deletes a valid application-owned key only after the reference check', async () => {
    const { service, s3, finishJob } = makeWorker('resources/user/file.pdf');
    await service.runBatch();
    expect((service as any).isReferenced).toHaveBeenCalledWith('resources/user/file.pdf');
    expect(s3.deleteObject).toHaveBeenCalledWith('resources/user/file.pdf');
    expect(finishJob).toHaveBeenCalledWith('job-1', 'deleted');
  });

  it('protects keys with leading or trailing whitespace instead of normalizing them into a valid key', async () => {
    const { service, s3, finishJob } = makeWorker(' resources/user/file.pdf ');
    await service.runBatch();
    expect(finishJob).toHaveBeenCalledWith('job-1', 'protected');
    expect(s3.deleteObject).not.toHaveBeenCalled();
  });
});
