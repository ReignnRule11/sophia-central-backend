import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from './entities/course.entity';
import { CourseTopic } from './entities/course-topic.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(CourseTopic)
    private readonly courseTopicRepository: Repository<CourseTopic>,
  ) {}

  async create(dto: CreateCourseDto): Promise<Course> {
    const course = this.courseRepository.create(dto);
    return this.courseRepository.save(course);
  }

  async findAll(institutionId?: string): Promise<Course[]> {
    const query = this.courseRepository.createQueryBuilder('course').leftJoinAndSelect('course.topics', 'topics');

    if (institutionId) {
      query.where('course.institutionId = :institutionId', { institutionId });
    }

    return query.orderBy('course.title', 'ASC').getMany();
  }

  async findOne(id: string): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: { id },
      relations: ['topics'],
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return course;
  }

  async update(id: string, dto: UpdateCourseDto): Promise<Course> {
    const course = await this.findOne(id);
    Object.assign(course, dto);
    return this.courseRepository.save(course);
  }

  async remove(id: string): Promise<void> {
    const course = await this.findOne(id);
    await this.courseRepository.remove(course);
  }

  async addTopic(courseId: string, title: string, description?: string): Promise<CourseTopic> {
    const course = await this.findOne(courseId);
    const topic = this.courseTopicRepository.create({
      title,
      description,
      course,
    });

    return this.courseTopicRepository.save(topic);
  }
}
