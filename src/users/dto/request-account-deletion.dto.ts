import { IsString, MaxLength, MinLength } from 'class-validator';

export class RequestAccountDeletionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(128)
  securityAnswer!: string;
}
