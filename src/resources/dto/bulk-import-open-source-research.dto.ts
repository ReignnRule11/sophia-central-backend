import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength, MinLength } from 'class-validator';

export class BulkImportOpenSourceResearchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(3, { each: true })
  @MaxLength(300, { each: true })
  identifiers: string[];
}
