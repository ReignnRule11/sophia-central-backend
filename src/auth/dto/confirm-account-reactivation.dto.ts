import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConfirmAccountReactivationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  confirmationToken!: string;
}
