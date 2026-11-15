import { IsString, MaxLength, MinLength } from 'class-validator';

export class ImportOpenSourceResearchDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  identifier: string;
}
