import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AskAiDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  question: string;

  @IsOptional()
  @IsString()
  resourceId?: string;
}
