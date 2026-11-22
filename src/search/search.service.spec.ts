import { SearchService } from './search.service';
import { ResourceModerationStatus } from '../resources/entities/resource.entity';

describe('SearchService', () => {
  const makeQueryBuilder = (rows: any[]) => ({
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  });

  it('returns only approved, rights-confirmed resources and a minimal public uploader projection', async () => {
    const row = {
      id: 'resource-1',
      title: 'Public notes',
      description: 'Course notes',
      type: 'lecture_notes',
      course: 'Biology',
      topic: 'Cells',
      institution: 'Example University',
      faculty: 'Science',
      department: 'Biology',
      level: '200',
      tags: ['cells'],
      license: 'CC-BY-4.0',
      attribution: 'Author',
      sourceUrl: 'https://example.test/source',
      pricingMode: 'free',
      priceAmount: null,
      customPriceStatus: 'not_required',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      fileUrl: 'private-storage-key',
      moderationStatus: ResourceModerationStatus.APPROVED,
      assignedReviewerId: 'internal-reviewer-id',
      reviewAssignmentId: 'internal-assignment-id',
      uploader: {
        id: 'user-1',
        firstName: 'Ada',
        lastName: 'Okafor',
        academicHandle: 'ada',
        email: 'private@example.test',
        role: 'lecturer',
        isSuspended: false,
      },
    };
    const qb = makeQueryBuilder([row]);
    const repository = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const service = new SearchService(repository as any);

    const result = await service.search({});

    expect(repository.createQueryBuilder).toHaveBeenCalledWith('resource');
    expect(qb.leftJoin).toHaveBeenCalledWith('resource.uploader', 'uploader');
    expect(qb.andWhere).toHaveBeenCalledWith(
      'resource.moderationStatus = :moderationStatus',
      { moderationStatus: ResourceModerationStatus.APPROVED },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'resource.rightsConfirmed = :rightsConfirmed',
      { rightsConfirmed: true },
    );
    expect(result).toEqual([{
      id: 'resource-1',
      title: 'Public notes',
      description: 'Course notes',
      type: 'lecture_notes',
      course: 'Biology',
      topic: 'Cells',
      institution: 'Example University',
      faculty: 'Science',
      department: 'Biology',
      level: '200',
      tags: ['cells'],
      license: 'CC-BY-4.0',
      attribution: 'Author',
      sourceUrl: 'https://example.test/source',
      pricingMode: 'free',
      priceAmount: null,
      customPriceStatus: 'not_required',
      createdAt: row.createdAt,
      hasFile: true,
      uploader: { id: 'user-1', displayName: 'Ada Okafor' },
    }]);
    expect(JSON.stringify(result)).not.toContain('private@example.test');
    expect(JSON.stringify(result)).not.toContain('internal-reviewer-id');
  });

  it('preserves search filters while restricting the returned fields', async () => {
    const qb = makeQueryBuilder([]);
    const repository = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const service = new SearchService(repository as any);

    await service.search({ q: 'biology', course: 'BIO101', institution: 'Example', level: '200', type: 'lecture_notes' });

    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('LOWER(resource.title)'), { q: '%biology%' });
    expect(qb.andWhere).toHaveBeenCalledWith('LOWER(resource.course) LIKE LOWER(:course)', { course: '%BIO101%' });
    expect(qb.andWhere).toHaveBeenCalledWith('LOWER(resource.institution) LIKE LOWER(:institution)', { institution: '%Example%' });
    expect(qb.andWhere).toHaveBeenCalledWith('LOWER(resource.level) LIKE LOWER(:level)', { level: '%200%' });
    expect(qb.andWhere).toHaveBeenCalledWith('resource.type = :type', { type: 'lecture_notes' });
  });
});
