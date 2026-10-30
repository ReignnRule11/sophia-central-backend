import { IsNotEmpty, IsString, IsNumber, Min, Max } from 'class-validator';

export class CreateFileUploadDto {
  @IsNotEmpty()
  @IsString()
  resourceId: string;

  @IsNotEmpty()
  @IsString()
  filename: string;

  @IsNotEmpty()
  @IsString()
  mimetype: string;

  @IsNumber()
  @Min(1)
  @Max(52428800) // 50MB in bytes
  size: number;
}

export class CreateProfileImageUploadDto {
  @IsNotEmpty()
  @IsString()
  filename: string;

  @IsNotEmpty()
  @IsString()
  mimetype: string;

  @IsNumber()
  @Min(1)
  @Max(5242880)
  size: number;
}
