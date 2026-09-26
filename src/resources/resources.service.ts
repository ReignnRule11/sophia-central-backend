import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { Resource } from './entities/resource.entity';

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(
    dto: CreateResourceDto,
    uploaderId: string,
  ): Promise<Resource> {
    const uploader = await this.userRepository.findOne({ where: { id: uploaderId } });
    if (!uploader) {
      throw new BadRequestException('Uploader not found');
    }

    const resource = this.resourceRepository.create({
      ...dto,
      uploader,
      uploaderId,
    });

    return this.resourceRepository.save(resource);
  }

  async findAll(): Promise<Resource[]> {
    return this.resourceRepository.find({
      relations: ['uploader'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['uploader'],
    });

    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    return resource;
  }

  async update(id: string, dto: UpdateResourceDto): Promise<Resource> {
    const resource = await this.findOne(id);
    Object.assign(resource, dto);
    return this.resourceRepository.save(resource);
  }

  async remove(id: string): Promise<void> {
    const resource = await this.findOne(id);
    await this.resourceRepository.remove(resource);
  }

  async findByFilters(query: Partial<Pick<Resource, 'course' | 'topic' | 'institution' | 'level' | 'type'>>) {
    const qb = this.resourceRepository
      .createQueryBuilder('resource')
      .leftJoinAndSelect('resource.uploader', 'uploader');

    if (query.course) {
      qb.andWhere('LOWER(resource.course) LIKE LOWER(:course)', {
        course: `%${query.course}%`,
      });
    }

    if (query.topic) {
      qb.andWhere('LOWER(resource.topic) LIKE LOWER(:topic)', {
        topic: `%${query.topic}%`,
      });
    }

    if (query.institution) {
      qb.andWhere('LOWER(resource.institution) LIKE LOWER(:institution)', {
        institution: `%${query.institution}%`,
      });
    }

    if (query.level) {
      qb.andWhere('LOWER(resource.level) LIKE LOWER(:level)', {
        level: `%${query.level}%`,
      });
    }

    if (query.type) {
      qb.andWhere('resource.type = :type', { type: query.type });
    }

    return qb.orderBy('resource.createdAt', 'DESC').getMany();
  }
}
