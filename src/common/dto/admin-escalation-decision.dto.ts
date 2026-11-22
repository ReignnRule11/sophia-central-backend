import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export const ADMIN_ESCALATION_ACTIONS = ['under_review', 'awaiting_information', 'returned_to_team', 'resolved'] as const;
export type AdminEscalationAction = typeof ADMIN_ESCALATION_ACTIONS[number];

export class AdminEscalationDecisionDto {
  @IsIn(ADMIN_ESCALATION_ACTIONS)
  action!: AdminEscalationAction;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  note!: string;
}
