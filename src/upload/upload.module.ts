import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { FileUpload } from './entities/file-upload.entity';
import { Resource } from '../resources/entities/resource.entity';
import { PointsModule } from '../points/points.module';
import { S3Service } from './s3.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FileUpload, Resource]),
    PointsModule,
    UsersModule,
  ],
  controllers: [UploadController],
  providers: [UploadService, S3Service],
  exports: [UploadService, S3Service],
})
export class UploadModule {}
