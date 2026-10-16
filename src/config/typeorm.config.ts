import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Resource } from '../resources/entities/resource.entity';
import { Institution, Faculty, Department } from '../institutions/entities/institution.entity';
import { Course } from '../courses/entities/course.entity';
import { CourseTopic } from '../courses/entities/course-topic.entity';
import { ModerationReview } from '../moderation/entities/moderation-review.entity';
import { PointWallet } from '../points/entities/point-wallet.entity';
import { PointTransaction } from '../points/entities/point-transaction.entity';
import { FileUpload } from '../upload/entities/file-upload.entity';
import { Referral } from '../referral/entities/referral.entity';
import { Notification } from '../notifications/entities/notification.entity';

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'sophia',
  password: process.env.DB_PASSWORD || 'sophia123',
  database: process.env.DB_DATABASE || 'sophia_central',
  entities: [
    User,
    Resource,
    Institution,
    Faculty,
    Department,
    Course,
    CourseTopic,
    ModerationReview,
    PointWallet,
    PointTransaction,
    FileUpload,
    Referral,
    Notification,
  ],
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV !== 'production',
  ssl: false,
};
