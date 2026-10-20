import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class SocialSignInDto {
  @IsIn(['google', 'apple', 'twitter', 'linkedin', 'instagram'])
  provider: 'google' | 'apple' | 'twitter' | 'linkedin' | 'instagram';

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  socialHandle?: string;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsString()
  institution?: string;

  @IsOptional()
  @IsString()
  faculty?: string;

  @IsOptional()
  @IsString()
  department?: string;
}
