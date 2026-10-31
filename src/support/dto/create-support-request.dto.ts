import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateSupportRequestDto {
  @IsString()
  @MinLength(4)
  @MaxLength(180)
  subject!: string;

  @IsString()
  @IsIn(['account', 'profile', 'resources', 'payments', 'technical', 'other'])
  category!: string;

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  attachments?: string[];
}
