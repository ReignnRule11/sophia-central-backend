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
import { AiSession } from '../ai/entities/ai-session.entity';
import { AiMessage } from '../ai/entities/ai-message.entity';

const isProduction = process.env.NODE_ENV === 'production';
const requiredProductionDbVars = ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'];
if (isProduction) {
  const missing = requiredProductionDbVars.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required production database environment variables: ${missing.join(', ')}`);
  }
}

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
    AiSession,
    AiMessage,
  ],
  synchronize: !isProduction,
  logging: !isProduction,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
};
