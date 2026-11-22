import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdminMfaChallengeDto {
  @IsString()
  @IsNotEmpty()
  challengeToken!: string;
}

export class AdminMfaVerifyDto extends AdminMfaChallengeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;
}
