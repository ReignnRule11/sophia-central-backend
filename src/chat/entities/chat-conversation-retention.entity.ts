import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type ChatRetentionPeriod = '90_days' | '7_days' | '24_hours' | 'off';

@Entity({ name: 'chat_conversation_retentions' })
export class ChatConversationRetention {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  roomKey!: string;

  @Column({ type: 'varchar', length: 12, default: '90_days' })
  retentionPeriod!: ChatRetentionPeriod;

  @Column({ type: 'uuid', nullable: true })
  updatedBy?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
