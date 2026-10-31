import { IsString, MaxLength, MinLength } from 'class-validator';

export class ConcludeSupportRequestDto {
  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  resolutionMessage!: string;
}
