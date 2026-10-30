import { IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateProfileImageUploadDto {
  @IsString()
  @MaxLength(255)
  filename!: string;

  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimetype!: string;

  @IsInt()
  @Min(1)
  @Max(5242880)
  size!: number;
}
