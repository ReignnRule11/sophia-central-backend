import { IsIn, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { ResourceModerationStatus } from '../../resources/entities/resource.entity';

export class ReviewResourceDto {
  @IsIn([
    ResourceModerationStatus.APPROVED,
    ResourceModerationStatus.REJECTED,
    ResourceModerationStatus.REVISION_REQUESTED,
  ])
  status: ResourceModerationStatus;

  @ValidateIf((value: ReviewResourceDto) =>
    value.status === ResourceModerationStatus.REJECTED ||
    value.status === ResourceModerationStatus.REVISION_REQUESTED,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note?: string;
}
