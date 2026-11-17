import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class OverrideModerationReviewDto {
  @IsIn(['approved', 'rejected', 'revision_requested'])
  status!: 'approved' | 'rejected' | 'revision_requested';

  @IsString() @MinLength(20) @MaxLength(3000)
  reason!: string;
}
