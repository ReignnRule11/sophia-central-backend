import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Institution } from '../../institutions/entities/institution.entity';

@Entity({ name: 'courses' })
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  code?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ nullable: true })
  level?: string;

  @Column({ nullable: true })
  institutionId?: string;

  @ManyToOne(() => Institution, (institution) => institution.courses, { nullable: true, onDelete: 'SET NULL' })
  institution?: Institution;

  @OneToMany(() => CourseTopic, (topic) => topic.course)
  topics: CourseTopic[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
