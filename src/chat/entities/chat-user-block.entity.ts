import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'chat_user_blocks' })
@Index('uq_chat_user_blocks_pair', ['userId', 'blockedUserId'], { unique: true })
export class ChatUserBlock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  blockedUserId!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
