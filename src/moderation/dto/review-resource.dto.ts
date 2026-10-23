import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ResourceModerationStatus } from '../../resources/entities/resource.entity';

export class ReviewResourceDto {
  @IsEnum(ResourceModerationStatus)
  status: ResourceModerationStatus;

  @IsOptional()
  @IsString()
  note?: string;

  @IsNotEmpty()
  reviewerId: string;
}
