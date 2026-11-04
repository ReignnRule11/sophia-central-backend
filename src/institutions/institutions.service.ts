import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Institution, Faculty, Department } from './entities';
import { CreateInstitutionDto } from './dto/create-institution.dto';
import { AcademicCatalogueSubmission, AcademicEntryStatus, AcademicEntryType } from './entities/academic-catalogue-submission.entity';
import { CreateAcademicCatalogueSubmissionDto } from './dto/create-academic-catalogue-submission.dto';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { UpdateInstitutionDto } from './dto/update-institution.dto';

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
    if (dto.entryType === AcademicEntryType.FACULTY && !dto.parentInstitutionId) throw new BadRequestException('Select the institution for this faculty.');
    if (dto.entryType === AcademicEntryType.DEPARTMENT && !dto.parentFacultyId) throw new BadRequestException('Select the faculty for this department.');
    if (dto.parentInstitutionId && !await this.institutionRepository.findOne({ where: { id: dto.parentInstitutionId } })) throw new NotFoundException('Selected institution not found.');
    if (dto.parentFacultyId && !await this.facultyRepository.findOne({ where: { id: dto.parentFacultyId } })) throw new NotFoundException('Selected faculty not found.');
    const duplicate = await this.submissionRepository.createQueryBuilder('submission')
      .where('LOWER(submission.name) = LOWER(:name)', { name: dto.name.trim() })
      .andWhere('submission.entryType = :entryType', { entryType: dto.entryType })
      .andWhere('submission.status = :status', { status: AcademicEntryStatus.PENDING }).getOne();
    if (duplicate) throw new ConflictException('A matching entry is already awaiting review.');
    const submission = this.submissionRepository.create({ ...dto, name: dto.name.trim(), country: 'Nigeria', status: AcademicEntryStatus.PENDING, submittedBy });
    return this.submissionRepository.save(submission);
  }

  async listSubmissions(status?: AcademicEntryStatus) {
    return this.submissionRepository.find({ where: status ? { status } : {}, order: { createdAt: 'ASC' } });
  }

  async reviewSubmission(id: string, reviewerId: string, status: AcademicEntryStatus, reviewNote?: string) {
    const submission = await this.submissionRepository.findOne({ where: { id } });
    if (!submission) throw new NotFoundException('Catalogue submission not found.');
    if (submission.status !== AcademicEntryStatus.PENDING) throw new ConflictException('This submission has already been reviewed.');
    if (status === AcademicEntryStatus.APPROVED) {
      if (submission.entryType === AcademicEntryType.INSTITUTION) {
        const exists = await this.institutionRepository.createQueryBuilder('i').where('LOWER(i.name) = LOWER(:name)', { name: submission.name }).getOne();
        if (!exists) await this.institutionRepository.save(this.institutionRepository.create({ name: submission.name, country: 'Nigeria', city: submission.city }));
      } else if (submission.entryType === AcademicEntryType.FACULTY) {
        const parent = await this.findOne(submission.parentInstitutionId!);
        const exists = await this.facultyRepository.createQueryBuilder('f').where('LOWER(f.name) = LOWER(:name)', { name: submission.name }).andWhere('f.institutionId = :id', { id: parent.id }).getOne();
        if (!exists) await this.createFaculty(parent.id, submission.name);
      } else {
        const parent = await this.facultyRepository.findOne({ where: { id: submission.parentFacultyId } });
        if (!parent) throw new NotFoundException('Parent faculty no longer exists.');
        const exists = await this.departmentRepository.createQueryBuilder('d').where('LOWER(d.name) = LOWER(:name)', { name: submission.name }).andWhere('d.facultyId = :id', { id: parent.id }).getOne();
        if (!exists) await this.createDepartment(parent.id, submission.name);
      }
    }
    submission.status = status;
    submission.reviewedBy = reviewerId;
    submission.reviewNote = reviewNote?.trim() || undefined;
    return this.submissionRepository.save(submission);
  }

  async create(dto: CreateInstitutionDto): Promise<Institution> {
    const institution = this.institutionRepository.create(dto);
    return this.institutionRepository.save(institution);
  }

  async findAll(): Promise<Institution[]> {
    return this.institutionRepository.find({
      relations: ['faculties', 'faculties.departments'],
    });
  }

  async findOne(id: string): Promise<Institution> {
    const institution = await this.institutionRepository.findOne({
      where: { id },
      relations: ['faculties', 'faculties.departments'],
    });

    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

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

  async createFaculty(institutionId: string, name: string): Promise<Faculty> {
    const institution = await this.findOne(institutionId);
    const faculty = this.facultyRepository.create({ name, institution });
    return this.facultyRepository.save(faculty);
  }

  async createDepartment(facultyId: string, name: string): Promise<Department> {
    const faculty = await this.facultyRepository.findOne({
      where: { id: facultyId },
      relations: ['institution'],
    });

    if (!faculty) {
      throw new NotFoundException('Faculty not found');
    }

    const department = this.departmentRepository.create({ name, faculty });
    return this.departmentRepository.save(department);
  }
}
