import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SocialLinksDto } from './social-links.dto';

export class TeachingAssignmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  courseName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  courseCode!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(80, { each: true })
  levels!: string[];
}

export class OnboardingDto {
  @IsUUID()
  institutionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  institution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  faculty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  program?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(160, { each: true })
  coursesTaught?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeachingAssignmentDto)
  teachingAssignments?: TeachingAssignmentDto[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  studyLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9](?:[a-zA-Z0-9._]*[a-zA-Z0-9])$/, { message: 'Academic handle must start and end with a letter or number and contain only letters, numbers, periods, or underscores' })
  academicHandle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  socialHandle?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SocialLinksDto)
  socialLinks?: SocialLinksDto;
}
