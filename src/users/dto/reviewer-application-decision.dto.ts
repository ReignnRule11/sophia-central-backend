import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
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
}
