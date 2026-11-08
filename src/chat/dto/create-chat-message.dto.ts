import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateChatMessageDto {
  @IsIn(['group', 'direct'])
  kind!: 'group' | 'direct';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  recipientId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  voiceKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  stickerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  replyToMessageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  forwardMessageId?: string;
}

export class EditChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}

export class CreateVoiceUploadDto {
  @IsString()
  @IsIn(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav'])
  mimetype!: string;

  @IsInt()
  @Min(1)
  @Max(12582912)
  size!: number;
}