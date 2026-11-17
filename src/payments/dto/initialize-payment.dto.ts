import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class InitializePaymentDto {
  @IsIn(['wisdom_points_topup', 'resource_purchase'])
  purpose!: 'wisdom_points_topup' | 'resource_purchase';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  packageId?: string;

  @IsOptional()
  @IsUUID()
  resourceId?: string;
}
