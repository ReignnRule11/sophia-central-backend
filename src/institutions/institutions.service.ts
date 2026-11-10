import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Institution, Faculty, Department } from './entities';
import { InstitutionType } from './entities/institution.entity';
import { CreateInstitutionDto } from './dto/create-institution.dto';
import { AcademicCatalogueSubmission, AcademicEntryStatus, AcademicEntryType } from './entities/academic-catalogue-submission.entity';
import { CreateAcademicCatalogueSubmissionDto } from './dto/create-academic-catalogue-submission.dto';
import { UpdateInstitutionDto } from './dto/update-institution.dto';
import { validateAcademicSource } from './academic-catalogue-provenance';

@Injectable()
export class InstitutionsService {
  constructor(
    @InjectRepository(Institution)
    private readonly institutionRepository: Repository<Institution>,
    @InjectRepository(Faculty)
    private readonly facultyRepository: Repository<Faculty>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(AcademicCatalogueSubmission)
    private readonly submissionRepository: Repository<AcademicCatalogueSubmission>,
  ) {}

  async submit(dto: CreateAcademicCatalogueSubmissionDto, submittedBy: string) {
    if (dto.entryType === AcademicEntryType.FACULTY && !dto.parentInstitutionId && !dto.parentInstitutionSubmissionId) {
      throw new BadRequestException('Select the institution for this faculty.');
    }
    if (dto.entryType === AcademicEntryType.DEPARTMENT && !dto.parentFacultyId && !dto.parentFacultySubmissionId) {
      throw new BadRequestException('Select the faculty for this department.');
    }

    if (dto.parentInstitutionSubmissionId) {
      const parentSubmission = await this.submissionRepository.findOne({ where: { id: dto.parentInstitutionSubmissionId } });
      if (!parentSubmission || parentSubmission.entryType !== AcademicEntryType.INSTITUTION) {
        throw new NotFoundException('Parent institution submission not found.');
      }
      if (parentSubmission.status === AcademicEntryStatus.REJECTED) {
        throw new ConflictException('The parent institution submission was rejected.');
      }
    }

    if (dto.parentInstitutionId) {
      const institution = await this.institutionRepository.findOne({ where: { id: dto.parentInstitutionId } });
      if (!institution) throw new NotFoundException('Selected institution not found.');
    }

    if (dto.parentFacultyId) {
      const faculty = await this.facultyRepository.findOne({ where: { id: dto.parentFacultyId } });
      if (!faculty) throw new NotFoundException('Selected faculty not found.');
      if (dto.parentInstitutionId && faculty.institutionId !== dto.parentInstitutionId) {
        throw new BadRequestException('The selected faculty does not belong to the selected institution.');
      }
    }

    if (dto.parentFacultySubmissionId) {
      const parentSubmission = await this.submissionRepository.findOne({ where: { id: dto.parentFacultySubmissionId } });
      if (!parentSubmission || parentSubmission.entryType !== AcademicEntryType.FACULTY) {
        throw new NotFoundException('Parent faculty submission not found.');
      }
      if (dto.parentInstitutionSubmissionId) {
        if (parentSubmission.parentInstitutionSubmissionId !== dto.parentInstitutionSubmissionId) {
          throw new BadRequestException('The pending faculty belongs to a different institution.');
        }
      } else if (parentSubmission.parentInstitutionId !== dto.parentInstitutionId) {
        throw new BadRequestException('The pending faculty belongs to a different institution.');
      }
      if (parentSubmission.status === AcademicEntryStatus.REJECTED) {
        throw new ConflictException('The parent faculty submission was rejected.');
      }
    }

    const duplicateQuery = this.submissionRepository.createQueryBuilder('submission')
      .where('LOWER(submission.name) = LOWER(:name)', { name: dto.name.trim() })
      .andWhere('submission.entryType = :entryType', { entryType: dto.entryType })
      .andWhere('submission.status = :status', { status: AcademicEntryStatus.PENDING });
    if (dto.parentInstitutionId) duplicateQuery.andWhere('submission.parentInstitutionId = :institutionId', { institutionId: dto.parentInstitutionId });
    if (dto.parentInstitutionSubmissionId) duplicateQuery.andWhere('submission.parentInstitutionSubmissionId = :institutionSubmissionId', { institutionSubmissionId: dto.parentInstitutionSubmissionId });
    if (dto.parentFacultyId) duplicateQuery.andWhere('submission.parentFacultyId = :facultyId', { facultyId: dto.parentFacultyId });
    if (dto.parentFacultySubmissionId) duplicateQuery.andWhere('submission.parentFacultySubmissionId = :facultySubmissionId', { facultySubmissionId: dto.parentFacultySubmissionId });
    const duplicate = await duplicateQuery.getOne();
    if (duplicate) return duplicate;

    const submission = this.submissionRepository.create({
      ...dto,
      institutionType: dto.institutionType ?? InstitutionType.UNIVERSITY,
      name: dto.name.trim(),
      country: 'Nigeria',
      status: AcademicEntryStatus.PENDING,
      submittedBy,
    });
    return this.submissionRepository.save(submission);
  }

  async listSubmissions(status?: AcademicEntryStatus) {
    return this.submissionRepository.find({ where: status ? { status } : {}, order: { createdAt: 'ASC' } });
  }

  async reviewSubmission(id: string, reviewerId: string, status: AcademicEntryStatus, reviewNote?: string, sourceUrl?: string, verifiedAt?: string) {
    const submission = await this.submissionRepository.findOne({ where: { id } });
    if (!submission) throw new NotFoundException('Catalogue submission not found.');
    if (submission.status !== AcademicEntryStatus.PENDING) throw new ConflictException('This submission has already been reviewed.');

    const provenance = status === AcademicEntryStatus.APPROVED && submission.entryType !== AcademicEntryType.INSTITUTION
      ? validateAcademicSource(sourceUrl ?? submission.sourceUrl, verifiedAt)
      : undefined;

    if (status === AcademicEntryStatus.APPROVED) {
      if (submission.entryType === AcademicEntryType.INSTITUTION) {
        const exists = await this.institutionRepository.createQueryBuilder('i')
          .where('LOWER(i.name) = LOWER(:name)', { name: submission.name }).getOne();
        if (!exists) {
          await this.institutionRepository.save(this.institutionRepository.create({
            name: submission.name,
            country: 'Nigeria',
            city: submission.city,
            state: submission.state,
            ownership: submission.ownership,
            institutionType: submission.institutionType ?? InstitutionType.UNIVERSITY,
          }));
        }
      } else if (submission.entryType === AcademicEntryType.FACULTY) {
        let parent: Institution | null = null;
        if (submission.parentInstitutionId) {
          parent = await this.institutionRepository.findOne({ where: { id: submission.parentInstitutionId } });
        } else if (submission.parentInstitutionSubmissionId) {
          const parentSubmission = await this.submissionRepository.findOne({ where: { id: submission.parentInstitutionSubmissionId } });
          if (!parentSubmission || parentSubmission.entryType !== AcademicEntryType.INSTITUTION) {
            throw new NotFoundException('Parent institution submission not found.');
          }
          if (parentSubmission.status !== AcademicEntryStatus.APPROVED) {
            throw new ConflictException('Approve the parent institution before approving this faculty.');
          }
          parent = await this.institutionRepository.createQueryBuilder('i')
            .where('LOWER(i.name) = LOWER(:name)', { name: parentSubmission.name }).getOne();
        }
        if (!parent) throw new NotFoundException('Parent institution not found. Approve its institution submission first.');
        // Persist the resolved institution ID so child department submissions can
        // be resolved after the parent faculty has been approved.
        submission.parentInstitutionId = parent.id;
        const exists = await this.facultyRepository.createQueryBuilder('f')
          .where('LOWER(f.name) = LOWER(:name)', { name: submission.name })
          .andWhere('f.institutionId = :id', { id: parent.id }).getOne();
        if (!exists) await this.createFaculty(parent.id, submission.name, provenance!.sourceUrl, provenance!.verifiedAt);
        else { exists.sourceUrl = provenance!.sourceUrl; exists.verifiedAt = provenance!.verifiedAt; await this.facultyRepository.save(exists); }
      } else {
        let parent: Faculty | null = null;
        if (submission.parentFacultyId) {
          parent = await this.facultyRepository.findOne({ where: { id: submission.parentFacultyId } });
        } else if (submission.parentFacultySubmissionId) {
          const parentSubmission = await this.submissionRepository.findOne({ where: { id: submission.parentFacultySubmissionId } });
          if (!parentSubmission || parentSubmission.entryType !== AcademicEntryType.FACULTY) {
            throw new NotFoundException('Parent faculty submission not found.');
          }
          if (parentSubmission.status !== AcademicEntryStatus.APPROVED) {
            throw new ConflictException('Approve the parent faculty before approving this department.');
          }
          parent = await this.facultyRepository.createQueryBuilder('f')
            .where('LOWER(f.name) = LOWER(:name)', { name: parentSubmission.name })
            .andWhere('f.institutionId = :institutionId', { institutionId: parentSubmission.parentInstitutionId })
            .getOne();
        }
        if (!parent) throw new NotFoundException('Parent faculty not found. Approve its faculty submission first.');
        const exists = await this.departmentRepository.createQueryBuilder('d')
          .where('LOWER(d.name) = LOWER(:name)', { name: submission.name })
          .andWhere('d.facultyId = :id', { id: parent.id }).getOne();
        if (!exists) await this.createDepartment(parent.id, submission.name, provenance!.sourceUrl, provenance!.verifiedAt);
        else { exists.sourceUrl = provenance!.sourceUrl; exists.verifiedAt = provenance!.verifiedAt; await this.departmentRepository.save(exists); }
      }
    }

    submission.status = status;
    submission.reviewedBy = reviewerId;
    submission.reviewNote = reviewNote?.trim() || undefined;
    if (provenance) { submission.sourceUrl = provenance.sourceUrl; submission.verifiedAt = provenance.verifiedAt; }
    return this.submissionRepository.save(submission);
  }

  async create(dto: CreateInstitutionDto): Promise<Institution> {
    const institution = this.institutionRepository.create(dto);
    return this.institutionRepository.save(institution);
  }

  async findAll(): Promise<Institution[]> {
    return this.institutionRepository.find({ relations: ['faculties', 'faculties.departments'] });
  }

  async findOne(id: string): Promise<Institution> {
    const institution = await this.institutionRepository.findOne({
      where: { id },
      relations: ['faculties', 'faculties.departments'],
    });
    if (!institution) throw new NotFoundException('Institution not found');
    return institution;
  }

  async update(id: string, dto: UpdateInstitutionDto): Promise<Institution> {
    const institution = await this.findOne(id);
    Object.assign(institution, dto);
    return this.institutionRepository.save(institution);
  }

  async remove(id: string): Promise<void> {
    const institution = await this.findOne(id);
    await this.institutionRepository.remove(institution);
  }

  async createFaculty(institutionId: string, name: string, sourceUrl?: string, verifiedAt?: string): Promise<Faculty> {
    const institution = await this.findOne(institutionId);
    const faculty = this.facultyRepository.create({ name, institution, sourceUrl, verifiedAt });
    return this.facultyRepository.save(faculty);
  }

  async createDepartment(facultyId: string, name: string, sourceUrl?: string, verifiedAt?: string): Promise<Department> {
    const faculty = await this.facultyRepository.findOne({
      where: { id: facultyId },
      relations: ['institution'],
    });
    if (!faculty) throw new NotFoundException('Faculty not found');
    const department = this.departmentRepository.create({ name, faculty, sourceUrl, verifiedAt });
    return this.departmentRepository.save(department);
  }
}