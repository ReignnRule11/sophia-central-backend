import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

function blankStringToUndefined({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

export class SocialLinksDto {
  @Transform(blankStringToUndefined)
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  linkedin?: string;

  @Transform(blankStringToUndefined)
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  instagram?: string;

  @Transform(blankStringToUndefined)
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  twitter?: string;
}
