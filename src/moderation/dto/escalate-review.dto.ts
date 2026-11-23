import { IsString, MaxLength, MinLength } from 'class-validator';

export class EscalateReviewDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason!: string;
}
