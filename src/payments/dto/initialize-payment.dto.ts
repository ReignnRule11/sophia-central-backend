import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaymentPurpose } from '../entities/payment-transaction.entity';

export class InitializePaymentDto {
  @IsEnum(PaymentPurpose)
  purpose!: PaymentPurpose;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  packageId?: string;

  @IsOptional()
  @IsUUID()
  resourceId?: string;
}
