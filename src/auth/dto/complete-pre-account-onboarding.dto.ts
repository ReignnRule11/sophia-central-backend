import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { OnboardingDto } from './onboarding.dto';

export class CompletePreAccountOnboardingDto extends OnboardingDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(4096)
  preAccountToken!: string;
}
