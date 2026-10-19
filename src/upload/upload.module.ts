import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { FileUpload } from './entities/file-upload.entity';
import { Resource } from '../resources/entities/resource.entity';
import { PointsModule } from '../points/points.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FileUpload, Resource]),
    PointsModule,
  ],
  controllers: [UploadController],
  providers: [UploadService, ConfigService],
  exports: [UploadService],
})
export class UploadModule {}
