import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { Resource, ResourceModerationStatus } from './entities/resource.entity';
import { S3Service } from '../upload/s3.service';

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly s3Service: S3Service,
  ) {}

  async create(dto: CreateResourceDto, uploaderId: string): Promise<Resource> {
    const uploader = await this.userRepository.findOne({ where: { id: uploaderId } });
    if (!uploader) throw new BadRequestException('Uploader not found');

    const resource = this.resourceRepository.create({
      ...dto,
      uploader,
      uploaderId,
      // Uploads always enter moderation; clients cannot publish directly.
      moderationStatus: ResourceModerationStatus.PENDING,
      isVerified: false,
    });

    return this.resourceRepository.save(resource);
  }

  /**
   * The shared library is approved-only for every role.
   * Lecturer-owned submissions and moderator decisions use their separate history endpoints.
   */
  async findVisibleTo(viewer: User): Promise<Resource[]> {
    if (![UserRole.STUDENT, UserRole.LECTURER, UserRole.MODERATOR, UserRole.ADMIN].includes(viewer.role)) {
      throw new ForbiddenException('You do not have access to resources.');
    }

    // The shared library is always approved-only. Moderator pending/rejected work
    // belongs in /moderation, and lecturer-owned submissions belong in /resources/mine.
    const resources = await this.resourceRepository.find({
      where: { moderationStatus: ResourceModerationStatus.APPROVED },
      relations: ['uploader'],
      order: { createdAt: 'DESC' },
    });
    // Do not expose storage URLs in list responses; file access must go through the authorized file endpoints.
    return resources.map((resource) => ({ ...resource, hasFile: Boolean(resource.fileUrl), fileUrl: undefined }) as Resource);
  }

  async findMine(uploaderId: string): Promise<Resource[]> {
    const resources = await this.resourceRepository.find({
      where: { uploaderId },
      relations: ['uploader'],
      order: { createdAt: 'DESC' },
    });
    return resources.map((resource) => ({ ...resource, hasFile: Boolean(resource.fileUrl), fileUrl: undefined }) as Resource);
  }

  async findOneForViewer(id: string, viewer: User, trackView = true): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['uploader'],
    });

    if (!resource) throw new NotFoundException('Resource not found');

    if (viewer.role === UserRole.STUDENT &&
        resource.moderationStatus !== ResourceModerationStatus.APPROVED) {
      // Do not disclose whether a private/pending resource exists.
      throw new NotFoundException('Resource not found');
    }

    if (viewer.role === UserRole.LECTURER &&
        resource.uploaderId !== viewer.id &&
        resource.moderationStatus !== ResourceModerationStatus.APPROVED) {
      throw new NotFoundException('Resource not found');
    }

    if (![UserRole.STUDENT, UserRole.LECTURER, UserRole.MODERATOR, UserRole.ADMIN].includes(viewer.role)) {
      throw new ForbiddenException('You do not have access to this resource.');
    }

    if (trackView) {
      resource.views = Number(resource.views || 0) + 1;
      await this.resourceRepository.save(resource);
    }
    // Keep storage URLs private; the reader asks the authenticated file endpoint for temporary access.
    return { ...resource, hasFile: Boolean(resource.fileUrl), fileUrl: undefined } as Resource;
  }

  async getFileUrl(id: string, viewer: User, download = false): Promise<{ url: string }> {
    const authorizedResource = await this.findOneForViewer(id, viewer, false);
    if (download && authorizedResource.downloadRestricted) throw new ForbiddenException('Downloads are disabled for this resource.');
    const resource = await this.resourceRepository.findOne({ where: { id } });
    if (!resource?.fileUrl) throw new NotFoundException('Resource file not found');
    if (download) {
      if (resource.downloadRestricted) throw new ForbiddenException('Downloads are disabled for this resource.');
      resource.downloads = Number(resource.downloads || 0) + 1;
    } else {
      resource.views = Number(resource.views || 0) + 1;
    }
    await this.resourceRepository.save(resource);
    const key = this.s3Service.getKeyFromPublicUrl(resource.fileUrl);
    if (!key) throw new ForbiddenException('This file is not stored in the authorized private storage.');
    const extension = key.split('.').pop();
    const filename = extension ? `${resource.title}.${extension}` : resource.title;
    const url = await this.s3Service.createPresignedDownloadUrl(key, filename, download ? 'attachment' : 'inline');
    return { url };
  }

  async update(id: string, dto: UpdateResourceDto): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({ where: { id } });
    if (!resource) throw new NotFoundException('Resource not found');
    Object.assign(resource, dto);
    return this.resourceRepository.save(resource);
  }

  async remove(id: string): Promise<void> {
    const resource = await this.resourceRepository.findOne({ where: { id } });
    if (!resource) throw new NotFoundException('Resource not found');
    await this.resourceRepository.remove(resource);
  }

  async findByFilters(query: Partial<Pick<Resource, 'course' | 'topic' | 'institution' | 'level' | 'type'>>) {
    const qb = this.resourceRepository
      .createQueryBuilder('resource')
      .leftJoinAndSelect('resource.uploader', 'uploader')
      .where('resource.moderationStatus = :status', {
        status: ResourceModerationStatus.APPROVED,
      });

    if (query.course) {
      qb.andWhere('LOWER(resource.course) LIKE LOWER(:course)', { course: `%${query.course}%` });
    }
    if (query.topic) {
      qb.andWhere('LOWER(resource.topic) LIKE LOWER(:topic)', { topic: `%${query.topic}%` });
    }
    if (query.institution) {
      qb.andWhere('LOWER(resource.institution) LIKE LOWER(:institution)', { institution: `%${query.institution}%` });
    }
    if (query.level) {
      qb.andWhere('LOWER(resource.level) LIKE LOWER(:level)', { level: `%${query.level}%` });
    }
    if (query.type) qb.andWhere('resource.type = :type', { type: query.type });

    return qb.orderBy('resource.createdAt', 'DESC').getMany();
  }
}
