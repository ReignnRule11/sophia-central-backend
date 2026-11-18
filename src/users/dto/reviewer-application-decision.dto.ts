import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReviewerApplicationStatus } from '../entities/reviewer-application.entity';

export class ReviewerApplicationDecisionDto {
  @IsIn([
    ReviewerApplicationStatus.UNDER_REVIEW,
    ReviewerApplicationStatus.MORE_INFORMATION_REQUIRED,
    ReviewerApplicationStatus.APPROVED,
    ReviewerApplicationStatus.REJECTED,
    ReviewerApplicationStatus.SUSPENDED,
    ReviewerApplicationStatus.REVOKED,
  ])
  status!: ReviewerApplicationStatus;

  @IsOptional() @IsString() @MaxLength(3000)
  note?: string;

  @IsOptional() @IsArray() @ArrayNotEmpty() @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(160, { each: true })
  approvedExpertiseAreas?: string[];

  @IsOptional() @IsArray() @ArrayNotEmpty() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(80, { each: true })
  approvedAcademicLevels?: string[];
}
