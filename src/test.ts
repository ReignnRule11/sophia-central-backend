import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Resource } from '../resources/entities/resource.entity';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
  ) {}

  async search(filters: {
    q?: string;
    course?: string;
    institution?: string;
    level?: string;
    type?: string;
  }) {
    const { q, course, institution, level, type } = filters;

    const query = this.resourceRepository
      .createQueryBuilder('resource')
      .leftJoinAndSelect('resource.uploader', 'uploader')
      .where('resource.isVerified = :isVerified', { isVerified: true });

    if (q) {
      query.andWhere(
        '(LOWER(resource.title) LIKE LOWER(:q) OR LOWER(resource.description) LIKE LOWER(:q) OR LOWER(resource.topic) LIKE LOWER(:q) OR LOWER(resource.course) LIKE LOWER(:q))',
        { q: `%${q}%` },
      );
    }

    if (course) {
      query.andWhere('LOWER(resource.course) LIKE LOWER(:course)', {
        course: `%${course}%`,
      });
    }

    if (institution) {
      query.andWhere('LOWER(resource.institution) LIKE LOWER(:institution)', {
        institution: `%${institution}%`,
      });
    }

    if (level) {
      query.andWhere('LOWER(resource.level) LIKE LOWER(:level)', {
        level: `%${level}%`,
      });
    }

    if (type) {
      query.andWhere('resource.type = :type', { type });
    }

    return query.orderBy('resource.createdAt', 'DESC').getMany();
  }
}
