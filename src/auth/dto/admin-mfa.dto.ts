import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminMfaVerifyDto {
  @IsString()
  @IsNotEmpty()
  challengeToken!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;
}

export class AdminMfaEnrollDto extends AdminMfaVerifyDto {}
