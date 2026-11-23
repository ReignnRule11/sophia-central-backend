import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AssignReportDto {
  @IsOptional()
  @IsUUID()
  moderatorId?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}
