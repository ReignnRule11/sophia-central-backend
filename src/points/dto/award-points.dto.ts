import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class AwardPointsDto {
  @IsNotEmpty()
  userId!: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
