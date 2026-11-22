import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource, ResourceModerationStatus } from '../resources/entities/resource.entity';

type PublicSearchResource = Pick<
  Resource,
  | 'id' | 'title' | 'description' | 'type' | 'course' | 'topic'
  | 'institution' | 'faculty' | 'department' | 'level' | 'tags'
  | 'license' | 'attribution' | 'sourceUrl' | 'pricingMode'
  | 'priceAmount' | 'customPriceStatus' | 'createdAt' | 'fileUrl'
> & {
  uploader?: { id: string; firstName?: string; lastName?: string; academicHandle?: string } | null;
};

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
  ) {}

  async search(filters: { q?: string; course?: string; institution?: string; level?: string; type?: string }) {
    const { q, course, institution, level, type } = filters;
    const query = this.resourceRepository
      .createQueryBuilder('resource')
      .leftJoin('resource.uploader', 'uploader')
      .where('resource.isVerified = :isVerified', { isVerified: true })
      .andWhere('resource.moderationStatus = :moderationStatus', { moderationStatus: ResourceModerationStatus.APPROVED })
      .andWhere('resource.rightsConfirmed = :rightsConfirmed', { rightsConfirmed: true });

    // Select an explicit public projection; never hydrate the complete User entity.
    query.select([
      'resource.id',
      'resource.title',
      'resource.description',
      'resource.type',
      'resource.course',
      'resource.topic',
      'resource.institution',
      'resource.faculty',
      'resource.department',
      'resource.level',
      'resource.tags',
      'resource.license',
      'resource.attribution',
      'resource.sourceUrl',
      'resource.pricingMode',
      'resource.priceAmount',
      'resource.customPriceStatus',
      'resource.createdAt',
      'resource.fileUrl',
    ]).addSelect(['uploader.id', 'uploader.firstName', 'uploader.lastName', 'uploader.academicHandle']);

    if (q) {
      query.andWhere(
        '(LOWER(resource.title) LIKE LOWER(:q) OR LOWER(resource.description) LIKE LOWER(:q) OR LOWER(resource.topic) LIKE LOWER(:q) OR LOWER(resource.course) LIKE LOWER(:q) OR LOWER(uploader.firstName) LIKE LOWER(:q) OR LOWER(uploader.lastName) LIKE LOWER(:q) OR LOWER(uploader.department) LIKE LOWER(:q) OR LOWER(uploader.faculty) LIKE LOWER(:q))',
        { q: `%${q}%` },
      );
    }
    if (course) query.andWhere('LOWER(resource.course) LIKE LOWER(:course)', { course: `%${course}%` });
    if (institution) query.andWhere('LOWER(resource.institution) LIKE LOWER(:institution)', { institution: `%${institution}%` });
    if (level) query.andWhere('LOWER(resource.level) LIKE LOWER(:level)', { level: `%${level}%` });
    if (type) query.andWhere('resource.type = :type', { type });

    const resources = await query.orderBy('resource.createdAt', 'DESC').getMany() as PublicSearchResource[];
    return resources.map((resource) => ({
      id: resource.id,
      title: resource.title,
      description: resource.description,
      type: resource.type,
      course: resource.course,
      topic: resource.topic,
      institution: resource.institution,
      faculty: resource.faculty,
      department: resource.department,
      level: resource.level,
      tags: resource.tags,
      license: resource.license,
      attribution: resource.attribution,
      sourceUrl: resource.sourceUrl,
      pricingMode: resource.pricingMode,
      priceAmount: resource.priceAmount,
      customPriceStatus: resource.customPriceStatus,
      createdAt: resource.createdAt,
      hasFile: Boolean(resource.fileUrl),
      uploader: resource.uploader ? {
        id: resource.uploader.id,
        displayName: [resource.uploader.firstName, resource.uploader.lastName].filter(Boolean).join(' ') || resource.uploader.academicHandle || 'Community contributor',
      } : undefined,
    }));
  }
}
