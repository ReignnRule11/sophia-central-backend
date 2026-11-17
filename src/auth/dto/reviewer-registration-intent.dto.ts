import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ReviewerRegistrationIntentDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._]+$/)
  academicHandle!: string;
}
