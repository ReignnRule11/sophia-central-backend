import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DecideResourceAppealDto {
  @IsIn(['under_review', 'accepted', 'rejected'])
  status!: 'under_review' | 'accepted' | 'rejected';

  @IsOptional() @IsString() @MinLength(10) @MaxLength(3000)
  note?: string;
}
