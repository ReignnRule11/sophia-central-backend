import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';

export class AskQuestionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(4000)
  question: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;
}
