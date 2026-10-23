import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Resource } from '../../resources/entities/resource.entity';

export enum UserRole {
  STUDENT = 'student',
  LECTURER = 'lecturer',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
}

export type AuthProvider = 'email' | 'google' | 'apple' | 'twitter' | 'linkedin' | 'instagram';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, type: 'varchar', length: 320 })
  email!: string;

  @Column({ nullable: true, select: false })
  password?: string;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ nullable: true })
  socialHandle?: string;

  @Column({ nullable: true })
  profileImage?: string;

  @Column({ type: 'varchar', default: UserRole.STUDENT })
  role!: UserRole;

  @Column({ type: 'varchar', default: 'email' })
  authProvider!: AuthProvider;

  @Column({ nullable: true })
  institution?: string;

  @Column({ nullable: true })
  department?: string;

  @Column({ nullable: true })
  faculty?: string;

  @Column({ nullable: true })
  studyLevel?: string;

  @Column({ nullable: true, type: 'text' })
  bio?: string;

  @Column({ default: false })
  isVerified!: boolean;

  @Column({ default: false })
  isProfileComplete!: boolean;

  @OneToMany(() => Resource, (resource) => resource.uploader)
  resources!: Resource[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
