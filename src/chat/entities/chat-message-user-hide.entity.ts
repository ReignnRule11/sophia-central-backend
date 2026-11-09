import { CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'chat_message_user_hides' })
@Index('idx_chat_message_user_hides_message', ['messageId'])
export class ChatMessageUserHide {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ type: 'uuid' })
  messageId!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
