import { ArrayNotEmpty, IsArray, IsOptional, IsString, MaxLength, MinLength, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TeachingAssignmentUpdateDto {
  @IsString()
  @MaxLength(160)
  courseName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  courseCode?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  levels!: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  institution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  lastName?: string;

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
  programme?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  coursesTaught?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeachingAssignmentUpdateDto)
  teachingAssignments?: TeachingAssignmentUpdateDto[];

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
  @IsString()
  @MaxLength(2048)
  profileImage?: string;
}
