import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ConfirmEmailVerificationDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  token!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
