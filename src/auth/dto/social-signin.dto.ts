import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SocialSignInDto {
  @IsIn(['google', 'apple'])
  provider: 'google' | 'apple';

  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  idToken: string;
}
