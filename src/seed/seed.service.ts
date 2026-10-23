import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { Resource, ResourceType, ResourceModerationStatus } from '../resources/entities/resource.entity';

@Injectable()
export class SeedService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
  ) {}

  async seed() {
    const existingUsers = await this.userRepository.count();
    if (existingUsers === 0) {
      const admin = this.userRepository.create({
        email: 'admin@sophia-central.com',
        password: '$2a$10$F7Vq1d7Jv5fK7t4w4Yg0dOs3p5fQ4ObK7N3wGOnXmHLUQFvC5a8jO',
        firstName: 'Sophia',
        lastName: 'Admin',
        role: UserRole.ADMIN,
        isVerified: true,
      });

      const lecturer = this.userRepository.create({
        email: 'lecturer@sophia-central.com',
        password: '$2a$10$F7Vq1d7Jv5fK7t4w4Yg0dOs3p5fQ4ObK7N3wGOnXmHLUQFvC5a8jO',
        firstName: 'Ada',
        lastName: 'Professor',
        role: UserRole.LECTURER,
        isVerified: true,
      });

      const student = this.userRepository.create({
        email: 'student@sophia-central.com',
        password: '$2a$10$F7Vq1d7Jv5fK7t4w4Yg0dOs3p5fQ4ObK7N3wGOnXmHLUQFvC5a8jO',
        firstName: 'Ayomide',
        lastName: 'Student',
        role: UserRole.STUDENT,
        isVerified: true,
      });

      await this.userRepository.save([admin, lecturer, student]);
    }

    const existingResources = await this.resourceRepository.count();
    if (existingResources === 0) {
      const users = await this.userRepository.find();
      const studentUser = users.find((u) => u.role === UserRole.STUDENT);
      const lecturerUser = users.find((u) => u.role === UserRole.LECTURER);

      const sampleResources = [
        {
          title: 'Introduction to Computer Programming',
          description: 'Lecture notes covering introductory programming concepts.',
          type: ResourceType.LECTURE_NOTES,
          course: 'Computer Science 101',
          topic: 'Programming Fundamentals',
          institution: 'University of Lagos',
          level: '100',
          fileUrl: 'https://example.com/programming-notes.pdf',
          isVerified: true,
          moderationStatus: ResourceModerationStatus.APPROVED,
          uploaderId: lecturerUser?.id ?? studentUser?.id ?? users[0].id,
          views: 140,
          downloads: 100,
        },
        {
          title: 'Microeconomics Past Questions 2018-2023',
          description: 'A curated set of past microeconomics exam questions.',
          type: ResourceType.PAST_QUESTION,
          course: 'Economics',
          topic: 'Microeconomics',
          institution: 'Ahmadu Bello University',
          level: '200',
          fileUrl: 'https://example.com/micro-economics-past-questions.pdf',
          isVerified: true,
          moderationStatus: 'approved',
          uploaderId: studentUser?.id ?? users[0].id,
          views: 98,
          downloads: 80,
        },
        {
          title: 'Final Year Project Guide',
          description: 'Step-by-step guide for selecting, writing, and defending a final-year project.',
          type: ResourceType.PROJECT,
          course: 'Final Year Project',
          topic: 'Project Planning',
          institution: 'University of Ibadan',
          level: '400',
          fileUrl: 'https://example.com/fyp-guide.pdf',
          isVerified: true,
          moderationStatus: 'approved',
          uploaderId: lecturerUser?.id ?? users[0].id,
          views: 120,
          downloads: 65,
        },
      ];

      await this.resourceRepository.save(
        sampleResources.map((resource) => this.resourceRepository.create(resource)),
      );
    }
  }
}
