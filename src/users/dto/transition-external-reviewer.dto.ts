import { ArrayNotEmpty, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TeachingAssignmentDto } from '../../auth/dto/onboarding.dto';
import { UserRole } from '../entities/user.entity';

export class TransitionExternalReviewerDto {
  @IsIn([UserRole.STUDENT, UserRole.LECTURER])
  targetRole!: UserRole.STUDENT | UserRole.LECTURER;

  @IsUUID()
  institutionId!: string;

  @IsString() @MinLength(2) @MaxLength(160)
  faculty!: string;

  @IsString() @MinLength(2) @MaxLength(160)
  department!: string;

  @IsOptional() @IsString() @MaxLength(160)
  program?: string;

  @IsOptional() @IsString() @MaxLength(80)
  studyLevel?: string;

  @IsOptional() @IsArray() @ArrayNotEmpty() @IsString({ each: true }) @IsNotEmpty({ each: true }) @MaxLength(160, { each: true })
  coursesTaught?: string[];

  @IsOptional() @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => TeachingAssignmentDto)
  teachingAssignments?: TeachingAssignmentDto[];
}
