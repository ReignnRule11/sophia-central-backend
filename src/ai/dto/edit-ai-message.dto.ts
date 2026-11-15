import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class EditAiMessageDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(4000)
  question: string;
}
