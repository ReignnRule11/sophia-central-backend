import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateContactEnquiryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @IsIn(['general', 'technical', 'academic', 'payments', 'lecturer', 'copyright', 'privacy', 'partnerships', 'feedback', 'other'])
  category!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(180)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  message!: string;

  // Honeypot: legitimate visitors leave this hidden field empty.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
