import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class SubmitReviewerApplicationDto {
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(160, { each: true })
  qualifications!: string[];

  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(120, { each: true })
  expertiseAreas!: string[];

  @IsOptional() @IsString() @MaxLength(160)
  institution?: string;

  @IsOptional() @IsString() @MaxLength(160)
  faculty?: string;

  @IsOptional() @IsString() @MaxLength(160)
  department?: string;

  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(80, { each: true })
  academicLevels!: string[];

  @IsString() @MinLength(30) @MaxLength(5000)
  reviewExperience!: string;

  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true }) @MaxLength(2048, { each: true })
  supportingDocuments?: string[];

  @IsString() @MinLength(20) @MaxLength(3000)
  conflictDeclaration!: string;

  @IsBoolean()
  policyAccepted!: boolean;
}
