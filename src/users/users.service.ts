import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password?: string;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ nullable: true })
  socialHandle?: string;

  @Column({ nullable: true })
  profileImage?: string;

  @Column({ default: 'student' })
  role: 'student' | 'lecturer' | 'moderator' | 'admin';

  @Column({ default: 'email' })
  authProvider: 'email' | 'google' | 'apple' | 'twitter' | 'linkedin' | 'instagram';

  @Column({ nullable: true })
  institution?: string;

  @Column({ nullable: true })
  department?: string;

  @Column({ nullable: true })
  faculty?: string;

  @Column({ nullable: true })
  studyLevel?: string;

  @Column({ nullable: true })
  bio?: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ default: false })
  isProfileComplete: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
