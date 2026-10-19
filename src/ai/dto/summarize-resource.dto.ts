import { IsNotEmpty, IsString } from 'class-validator';

export class SummarizeResourceDto {
  @IsNotEmpty()
  @IsString()
  resourceId: string;
}
