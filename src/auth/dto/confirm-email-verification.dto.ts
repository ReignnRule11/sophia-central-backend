import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConfirmEmailVerificationDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  token!: string;
}
