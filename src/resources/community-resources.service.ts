import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { S3Service } from '../upload/s3.service';
import { CreateResourceDto } from './dto/create-resource.dto';
import { Resource, ResourceModerationStatus } from './entities/resource.entity';
import { UserActivityEvent } from '../analytics/entities/user-activity-event.entity';

@Injectable()
export class CommunityResourcesService {
  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly storage: S3Service,
  ) {}

  async create(dto: CreateResourceDto, uploaderId: string): Promise<Resource> {
    if (dto.rightsConfirmed !== true) {
      throw new BadRequestException('You must confirm that you have the right to share this material.');
    }
    const uploader = await this.users.findOne({ where: { id: uploaderId } });
    if (!uploader) throw new NotFoundException('Contributor not found');
    if (![UserRole.STUDENT, UserRole.LECTURER].includes(uploader.role)) {
      throw new BadRequestException('Only students and lecturers can contribute resources.');
    }
    if (!uploader.institutionId) throw new BadRequestException('Complete your catalogue-backed institution setup before uploading academic materials.');
    const resource = this.resources.create({
      ...dto,
      uploader,
      uploaderId,
      uploaderInstitutionId: uploader.institutionId ?? null,
      rightsConfirmed: true,
      rightsConfirmedAt: new Date(),
      moderationStatus: ResourceModerationStatus.PENDING,
      isVerified: false,
    });
    return this.resources.manager.transaction(async (manager) => {
      const saved = await manager.save(Resource, resource);
      await manager.save(UserActivityEvent, manager.create(UserActivityEvent, {
        userId: uploader.id,
        institutionId: uploader.institutionId ?? null,
        eventType: 'upload',
        resourceId: saved.id,
      }));
      return saved;
    });
  }

  async findPublic(query: Record<string, string>) {
    const qb = this.resources.createQueryBuilder('resource')
      .leftJoin('resource.uploader', 'uploader')
      .addSelect(['uploader.id', 'uploader.firstName', 'uploader.lastName', 'uploader.academicHandle'])
      .where('resource.moderationStatus = :status', { status: ResourceModerationStatus.APPROVED })
      .andWhere('resource.rightsConfirmed = true');
    const departmentOnly = query.departmentOnly === '1' || query.departmentOnly === 'true';
    const filters: Array<[string, string]> = [
      ['course', 'course'], ['topic', 'topic'], ['institution', 'institution'],
      ['faculty', 'faculty'], ['department', 'department'], ['level', 'level'],
    ];
    if (departmentOnly && !['institution', 'faculty', 'department'].every((key) => query[key]?.trim())) {
      throw new BadRequestException('Institution, faculty and department are required for department-scoped browsing.');
    }
    for (const [parameter, column] of filters) {
      const value = query[parameter]?.trim();
      if (!value) continue;
      if (departmentOnly && ['institution', 'faculty', 'department'].includes(parameter)) {
        const uploaderColumn = parameter;
        qb.andWhere(
          `(LOWER(resource.${column}) = LOWER(:${parameter}) OR (resource.${column} IS NULL AND LOWER(uploader.${uploaderColumn}) = LOWER(:${parameter})))`,
          { [parameter]: value },
        );
      } else {
        qb.andWhere(`LOWER(resource.${column}) LIKE LOWER(:${parameter})`, { [parameter]: `%${value}%` });
      }
    }
    if (query.q?.trim()) {
      qb.andWhere('(resource.title ILIKE :q OR resource.description ILIKE :q OR resource.course ILIKE :q OR resource.topic ILIKE :q)', { q: `%${query.q.trim()}%` });
    }
    if (query.type) qb.andWhere('resource.type = :type', { type: query.type });
    if (query.license) qb.andWhere('resource.license = :license', { license: query.license });
    const page = Math.max(1, Number.parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit || '20', 10) || 20));
    const [items, total] = await qb.orderBy('resource.createdAt', 'DESC')
      .skip((page - 1) * limit).take(limit).getManyAndCount();
    return {
      items: items.map((item) => ({
        ...item,
        fileUrl: undefined,
        hasFile: Boolean(item.fileUrl),
        uploader: item.uploader ? {
          id: item.uploader.id,
          displayName: [item.uploader.firstName, item.uploader.lastName].filter(Boolean).join(' ') || item.uploader.academicHandle || 'Community contributor',
        } : undefined,
      })),
      page, limit, total, totalPages: Math.ceil(total / limit),
    };
  }

  async findPublicOne(id: string) {
    const resource = await this.resources.findOne({
      where: { id, moderationStatus: ResourceModerationStatus.APPROVED, rightsConfirmed: true },
      relations: ['uploader'],
    });
    if (!resource) throw new NotFoundException('Public resource not found');
    return {
      ...resource,
      fileUrl: undefined,
      hasFile: Boolean(resource.fileUrl),
      uploader: resource.uploader ? {
        id: resource.uploader.id,
        displayName: [resource.uploader.firstName, resource.uploader.lastName].filter(Boolean).join(' ') || resource.uploader.academicHandle || 'Community contributor',
      } : undefined,
    };
  }

  async getPublicFileUrl(id: string) {
    const resource = await this.resources.findOne({
      where: { id, moderationStatus: ResourceModerationStatus.APPROVED, rightsConfirmed: true },
    });
    if (!resource?.fileUrl) throw new NotFoundException('Public resource file not found');
    const key = this.storage.getKeyFromPublicUrl(resource.fileUrl);
    if (!key) throw new NotFoundException('Public resource file not found');
    const extension = key.split('.').pop();
    const filename = extension ? `${resource.title}.${extension}` : resource.title;
    const [url, metadata] = await Promise.all([
      this.storage.createPresignedDownloadUrl(key, filename, 'inline'),
      this.storage.getObjectMetadata(key),
    ]);
    return { url, filename, contentType: metadata?.contentType, license: resource.license, attribution: resource.attribution };
  }
}
