import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ContentReportStatus } from '../entities/content-report.entity';

export class UpdateContentReportDto {
  @IsEnum(ContentReportStatus)
  status!: ContentReportStatus;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  moderatorNote?: string;
}
