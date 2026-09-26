import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Institution, Faculty, Department } from './entities';
import { CreateInstitutionDto } from './dto/create-institution.dto';
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
  ) {}

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
