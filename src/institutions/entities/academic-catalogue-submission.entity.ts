import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { InstitutionType } from './institution.entity';

export enum AcademicEntryType { INSTITUTION = 'institution', FACULTY = 'faculty', DEPARTMENT = 'department' }
export enum AcademicEntryStatus { PENDING = 'pending', APPROVED = 'approved', REJECTED = 'rejected' }

@Entity({ name: 'academic_catalogue_submissions' })
export class AcademicCatalogueSubmission {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) entryType: AcademicEntryType;
  @Column({ type: 'varchar' }) name: string;
  @Column({ type: 'varchar', nullable: true }) parentInstitutionId?: string;
  @Column({ type: 'varchar', nullable: true }) parentInstitutionSubmissionId?: string;
  @Column({ type: 'varchar', nullable: true }) parentFacultyId?: string;
  @Column({ type: 'varchar', nullable: true }) parentFacultySubmissionId?: string;
  @Column({ type: 'varchar', nullable: true }) country?: string;
  @Column({ type: 'varchar', nullable: true }) state?: string;
  @Column({ type: 'varchar', nullable: true }) city?: string;
  @Column({ type: 'varchar', nullable: true }) ownership?: string;
  @Column({ type: 'varchar', default: InstitutionType.UNIVERSITY }) institutionType: InstitutionType;
  @Column({ type: 'varchar', default: AcademicEntryStatus.PENDING }) status: AcademicEntryStatus;
  @Column({ type: 'uuid' }) submittedBy: string;
  @Column({ type: 'uuid', nullable: true }) reviewedBy?: string;
  @Column({ type: 'text', nullable: true }) reviewNote?: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}