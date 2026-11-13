import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '../../users/entities/user.entity';

export class ResendEmailVerificationDto {
  @IsEmail()
  email!: string;

  @IsOptional() @IsString() @MaxLength(100)
  firstName?: string;

  @IsOptional() @IsString() @MaxLength(100)
  lastName?: string;

  @IsOptional() @IsString() @MinLength(3) @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._]+$/)
  academicHandle?: string;

  @IsOptional() @IsIn([UserRole.STUDENT, UserRole.LECTURER])
  role?: UserRole;

  @IsOptional() @IsString() @MaxLength(32)
  referralCode?: string;
}
