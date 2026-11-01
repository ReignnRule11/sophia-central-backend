import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class CreateChatMessageDto {
 @IsIn(['group', 'direct']) kind!: 'group' | 'direct';
 @IsOptional() @IsString() @MaxLength(64) recipientId?: string;
 @IsOptional() @IsString() @MinLength(1) @MaxLength(4000) text?: string;
 @IsOptional() @IsString() @MaxLength(512) voiceKey?: string;
}
export class EditChatMessageDto {
 @IsString() @MinLength(1) @MaxLength(4000) text!: string;
}