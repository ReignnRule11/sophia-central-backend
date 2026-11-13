import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SocialLinksDto } from './social-links.dto';
import { UserRole } from '../../users/entities/user.entity';

export class RegisterDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  firstName: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  lastName: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  referralCode?: string;

  @IsOptional()
  @IsIn([UserRole.STUDENT, UserRole.LECTURER], { message: 'Role must be student or lecturer' })
  role?: UserRole;

  @IsUUID()
  institutionId: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  institution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  faculty?: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._]+$/, { message: 'Academic handle may contain only letters, numbers, periods, and underscores' })
  academicHandle: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  socialHandle?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SocialLinksDto)
  socialLinks?: SocialLinksDto;
}
