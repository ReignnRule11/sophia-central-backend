import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { InstitutionType } from '../entities/institution.entity';

export class CreateInstitutionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  ownership?: string;

  @IsOptional()
  @IsIn(Object.values(InstitutionType))
  institutionType?: InstitutionType;
}

export class UpdateInstitutionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;
}
