import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class PresignedUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @IsInt()
  @Min(1)
  fileSize: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fileType: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  resourceId: string;
}
