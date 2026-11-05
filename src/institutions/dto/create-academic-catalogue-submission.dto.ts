import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, IsUUID } from 'class-validator';
import { AcademicEntryType } from '../entities/academic-catalogue-submission.entity';

export class CreateAcademicCatalogueSubmissionDto {
  @IsIn(Object.values(AcademicEntryType)) entryType: AcademicEntryType;
  @IsString() @IsNotEmpty() @MaxLength(180) name: string;
  @IsOptional() @IsUUID() parentInstitutionId?: string;
  @IsOptional() @IsUUID() parentFacultyId?: string;
  @IsOptional() @IsUUID() parentFacultySubmissionId?: string;
  @IsOptional() @IsString() @MaxLength(100) state?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsIn(['Federal', 'State', 'Private']) ownership?: string;
}