import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SetSecurityQuestionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(48)
  questionId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(128)
  answer!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentAnswer?: string;
}
