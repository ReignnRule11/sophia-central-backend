import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateRefundDto {
  @IsString()
  @MaxLength(64)
  idempotencyKey!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000000)
  amountMinor?: number;

  @IsString()
  @MaxLength(500)
  reason!: string;
}
