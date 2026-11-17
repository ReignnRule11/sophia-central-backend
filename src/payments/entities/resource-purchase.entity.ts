import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'resource_purchases' })
@Index('UQ_resource_purchases_user_resource', ['userId', 'resourceId'], { unique: true })
@Index('UQ_resource_purchases_payment', ['paymentId'], { unique: true })
export class ResourcePurchase {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) userId!: string;
  @Column({ type: 'uuid' }) resourceId!: string;
  @Column({ type: 'uuid' }) paymentId!: string;
  @Column({ type: 'timestamptz' }) purchasedAt!: Date;
  @CreateDateColumn() createdAt!: Date;
}
