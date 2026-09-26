import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/typeorm.config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ResourcesModule } from './resources/resources.module';
import { SearchModule } from './search/search.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { CoursesModule } from './courses/courses.module';
import { ModerationModule } from './moderation/moderation.module';
import { PointsModule } from './points/points.module';
import { AiModule } from './ai/ai.module';
import { StorageModule } from './storage/storage.module';
import { ReferralsModule } from './referrals/referrals.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SeedModule } from './seed/seed.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    TypeOrmModule.forRoot(typeOrmConfig),
    AuthModule,
    UsersModule,
    ResourcesModule,
    SearchModule,
    InstitutionsModule,
    CoursesModule,
    ModerationModule,
    PointsModule,
    AiModule,
    StorageModule,
    ReferralsModule,
    AnalyticsModule,
    SeedModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
