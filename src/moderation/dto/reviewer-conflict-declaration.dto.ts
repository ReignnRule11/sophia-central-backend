import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ReviewerConflictDeclarationDto {
  @IsIn(['no_conflict', 'recuse'])
  declaration!: 'no_conflict' | 'recuse';

  @IsOptional() @IsString() @MinLength(10) @MaxLength(2000)
  reason?: string;
}
