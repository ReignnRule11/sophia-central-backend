import { IsNotEmpty, IsNumber, IsString, Max, Min } from 'class-validator';

export class CompleteFileUploadDto {
  @IsNotEmpty()
  @IsString()
  key: string;

  @IsNotEmpty()
  @IsString()
  resourceId: string;

  @IsNotEmpty()
  @IsString()
  mimetype: string;

  @IsNumber()
  @Min(1)
  @Max(52428800)
  size: number;
}

export class CompleteProfileImageUploadDto {
  @IsNotEmpty()
  @IsString()
  key: string;

  @IsNotEmpty()
  @IsString()
  mimetype: string;

  @IsNumber()
  @Min(1)
  @Max(5242880)
  size: number;
}
