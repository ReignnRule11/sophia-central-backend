import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(320)
  identifier: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
