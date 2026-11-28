import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class VerifyAccountReactivationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  identifier!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
