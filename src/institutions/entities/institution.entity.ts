import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity';

export enum AcademicUnitType {
  FACULTY = 'faculty',
  SCHOOL = 'school',
  COLLEGE = 'college',
}

export enum InstitutionType {
  UNIVERSITY = 'university',
  POLYTECHNIC = 'polytechnic',
  MONOTECHNIC = 'monotechnic',
  COLLEGE_OF_EDUCATION = 'college_of_education',
}

@Entity({ name: 'institutions' })
export class Institution {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  country?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  state?: string;

  @Column({ type: 'varchar', default: InstitutionType.UNIVERSITY })
  institutionType!: InstitutionType;

  @Column({ type: 'varchar', nullable: true })
  ownership?: string;

  @OneToMany(() => Faculty, (faculty) => faculty.institution)
  faculties!: Faculty[];

  @OneToMany(() => Course, (course) => course.institution)
  courses!: Course[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity({ name: 'faculties' })
export class Faculty {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'varchar', default: AcademicUnitType.FACULTY })
  unitType!: AcademicUnitType;

  @ManyToOne(() => Institution, (institution) => institution.faculties, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institutionId' })
  institution!: Institution;

  @Column()
  institutionId!: string;

  @Column({ type: 'varchar', nullable: true })
  sourceUrl?: string;

  @Column({ type: 'date', nullable: true })
  verifiedAt?: string;

  @OneToMany(() => Department, (department) => department.faculty)
  departments!: Department[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity({ name: 'departments' })
export class Department {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @ManyToOne(() => Faculty, (faculty) => faculty.departments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'facultyId' })
  faculty!: Faculty;

  @Column()
  facultyId!: string;

  @Column({ type: 'varchar', nullable: true })
  sourceUrl?: string;

  @Column({ type: 'date', nullable: true })
  verifiedAt?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
