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
    await service.enqueueWithManager(
      manager as any,
      'https://cdn.example.test/profile-images/user/photo.png',
      'profile-replaced',
    );

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
