import { IsNotEmpty, IsObject, IsString, MaxLength } from 'class-validator';

export class SavePreAccountProgressDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(4096)
  preAccountToken!: string;

  @IsObject()
  progress!: Record<string, unknown>;
}
