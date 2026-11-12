import { ArrayNotEmpty, ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetReviewerAccessDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  expertiseAreas?: string[];
}
