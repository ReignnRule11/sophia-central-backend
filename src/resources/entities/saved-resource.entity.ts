import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Resource } from './resource.entity';

@Entity({ name: 'saved_resources' })
@Unique('UQ_saved_resources_user_resource', ['userId', 'resourceId'])
export class SavedResource {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  resource!: Resource;

  @CreateDateColumn()
  createdAt!: Date;

  // Explicit scalar FK columns make account-scoped queries straightforward.
  userId!: string;
  resourceId!: string;
}
