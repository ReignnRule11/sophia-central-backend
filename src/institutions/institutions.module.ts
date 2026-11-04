import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstitutionsController } from './institutions.controller';
import { InstitutionsService } from './institutions.service';
import { Institution, Faculty, Department } from './entities';
import { AcademicCatalogueSubmission } from './entities/academic-catalogue-submission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Institution, Faculty, Department, AcademicCatalogueSubmission])],
  controllers: [InstitutionsController],
  providers: [InstitutionsService],
  exports: [InstitutionsService],
})
export class InstitutionsModule {}
