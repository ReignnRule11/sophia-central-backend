import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
export enum ChatKind { GROUP = 'group', DIRECT = 'direct' }
export enum ChatContentType { TEXT = 'text', VOICE = 'voice', STICKER = 'sticker' }
@Entity({ name: 'chat_messages' })
@Index('idx_chat_messages_room_created', ['roomKey', 'createdAt'])
export class ChatMessage {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({ type: 'varchar', length: 12 }) kind!: ChatKind;
 @Column({ type: 'varchar', length: 255 }) roomKey!: string;
 @Column({ type: 'uuid', nullable: true }) senderId!: string | null;
 @Column({ type: 'varchar', length: 30 }) senderHandle!: string;
 @Column({ type: 'varchar', length: 12, default: ChatContentType.TEXT }) contentType!: ChatContentType;
 @Column({ type: 'text', nullable: true }) text?: string | null;
 @Column({ type: 'text', nullable: true }) voiceKey?: string | null;
 @Column({ type: 'varchar', length: 40, nullable: true }) stickerId?: string | null;
 @Column({ type: 'uuid', nullable: true }) replyToMessageId?: string | null;
 @Column({ type: 'uuid', nullable: true }) forwardedFromMessageId?: string | null;
 @Column({ type: 'boolean', default: false }) isDeleted!: boolean;
 @Column({ type: 'timestamp', nullable: true }) editedAt?: Date | null;
 @Column({ type: 'timestamp', nullable: true }) expiresAt?: Date | null;
 @CreateDateColumn() createdAt!: Date;
 @UpdateDateColumn() updatedAt!: Date;
}