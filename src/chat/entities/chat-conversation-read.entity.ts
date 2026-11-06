import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'chat_conversation_reads' })
export class ChatConversationRead {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ type: 'varchar', length: 255 })
  roomKey!: string;

  @Column({ type: 'timestamp' })
  lastReadAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
