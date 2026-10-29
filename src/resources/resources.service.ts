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

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
   * Scope resource visibility by the authenticated viewer:
   * students see approved resources only, lecturers see their own submissions,
   * and moderators/admins can inspect all resources.
   */
  async findVisibleTo(viewer: User): Promise<Resource[]> {
    if (![UserRole.STUDENT, UserRole.LECTURER, UserRole.MODERATOR, UserRole.ADMIN].includes(viewer.role)) {
      throw new ForbiddenException('You do not have access to resources.');
    }

    // The shared library is always approved-only. Moderator pending/rejected work
    // belongs in /moderation, and lecturer-owned submissions belong in /resources/mine.
    return this.resourceRepository.find({
      where: { moderationStatus: ResourceModerationStatus.APPROVED },
      relations: ['uploader'],
      order: { createdAt: 'DESC' },
    });
  }

  async findMine(uploaderId: string): Promise<Resource[]> {
    return this.resourceRepository.find({
      where: { uploaderId },
      relations: ['uploader'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOneForViewer(id: string, viewer: User): Promise<Resource> {
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

    if (viewer.role === UserRole.LECTURER && resource.uploaderId !== viewer.id) {
      throw new NotFoundException('Resource not found');
    }

    if (![UserRole.STUDENT, UserRole.LECTURER, UserRole.MODERATOR, UserRole.ADMIN].includes(viewer.role)) {
      throw new ForbiddenException('You do not have access to this resource.');
    }

    return resource;
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
