import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ResourceLicense, ResourceType } from '../entities/resource.entity';

export class CreateResourceDto {
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsEnum(ResourceType) type: ResourceType;
  @IsOptional() @IsString() course?: string;
  @IsOptional() @IsString() topic?: string;
  @IsOptional() @IsString() institution?: string;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsBoolean() downloadRestricted?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];
  @IsEnum(ResourceLicense) license: ResourceLicense;
  @IsString() @MaxLength(300) attribution: string;
  @IsOptional() @IsUrl({ require_protocol: true }) sourceUrl?: string;
  @IsBoolean() rightsConfirmed: boolean;
}
