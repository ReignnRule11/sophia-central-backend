import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, IsUUID, IsUrl } from 'class-validator';
import { AcademicEntryType } from '../entities/academic-catalogue-submission.entity';
import { InstitutionType } from '../entities/institution.entity';

export class CreateAcademicCatalogueSubmissionDto {
  @IsIn(Object.values(AcademicEntryType)) entryType: AcademicEntryType;
  @IsString() @IsNotEmpty() @MaxLength(180) name: string;
  @IsOptional() @IsUUID() parentInstitutionId?: string;
  @IsOptional() @IsUUID() parentInstitutionSubmissionId?: string;
  @IsOptional() @IsUUID() parentFacultyId?: string;
  @IsOptional() @IsUUID() parentFacultySubmissionId?: string;
  @IsOptional() @IsString() @MaxLength(100) state?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsIn(['Federal', 'State', 'Private']) ownership?: string;
  @IsOptional() @IsIn(Object.values(InstitutionType)) institutionType?: InstitutionType;
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(2048) sourceUrl?: string;
}