import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateResourceAppealDto {
  @IsIn(['reconsideration', 'favoritism_report'])
  appealType!: 'reconsideration' | 'favoritism_report';

  @IsString() @MinLength(20) @MaxLength(3000)
  reason!: string;
}
