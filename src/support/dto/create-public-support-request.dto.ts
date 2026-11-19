import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreatePublicSupportRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  institution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  faculty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  department?: string;

  @IsString()
  @IsIn(['account', 'profile', 'resources', 'payments', 'technical', 'other'])
  category!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(180)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  description!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  links?: string[];
}
