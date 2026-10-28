import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ResourceModerationStatus } from '../../resources/entities/resource.entity';

export class ReviewResourceDto {
  @IsEnum(ResourceModerationStatus)
  status: ResourceModerationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
