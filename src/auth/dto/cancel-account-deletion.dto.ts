import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelAccountDeletionDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(128)
  securityAnswer!: string;
}
