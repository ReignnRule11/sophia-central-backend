import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class SetReportSeverityDto {
  @IsIn(['low', 'normal', 'high', 'critical'])
  severity!: 'low' | 'normal' | 'high' | 'critical';

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}
