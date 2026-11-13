import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Institution } from '../institutions/entities/institution.entity';

describe('UsersService institution identity updates', () => {
  let service: UsersService;
  let manager: any;
  let dataSource: any;
  let usersRepository: any;
  const existingUser = {
    id: 'student-1',
    role: 'student',
    isProfileComplete: true,
    institution: 'Old University',
    institutionId: null,
    faculty: 'Arts',
    department: 'History',
  };
  const catalogueInstitution = {
    id: 'institution-new',
    name: 'New University',
    institutionCode: 'NEWUNI',
    institutionType: 'university',
  };

  beforeEach(() => {
    manager = {
      findOne: jest.fn(async (entity) => entity === Institution ? { ...catalogueInstitution } : { ...existingUser }),
      query: jest.fn(),
      save: jest.fn(async (_entity, value) => value),
      createQueryBuilder: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(async callback => callback(manager)),
    };
    usersRepository = { exist: jest.fn().mockResolvedValue(false) };
    service = new UsersService(usersRepository as Repository<User>, {} as Repository<Institution>, dataSource as DataSource, {} as any);
  });

  it('assigns a permanent ID when a legacy account selects a catalogue institution', async () => {
    const updated = await service.update('student-1', {
      institutionId: catalogueInstitution.id,
      institution: catalogueInstitution.name,
      faculty: 'Engineering',
      department: 'Mechanical Engineering',
    });

    expect(updated).toMatchObject({
      institutionId: catalogueInstitution.id,
      institution: catalogueInstitution.name,
      faculty: 'Engineering',
      department: 'Mechanical Engineering',
    });
    expect(updated.uniqueId).toMatch(/^SC-UNI-NEWUNI-STU-[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('rejects a manually typed institution without a catalogue reference', async () => {
    await expect(service.update('student-1', {
      institution: 'Unlisted University',
      faculty: 'School of Computing',
      department: 'Software Engineering',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('requires faculty and department when assigning a catalogue institution', async () => {
    await expect(service.update('student-1', {
      institutionId: catalogueInstitution.id,
      institution: catalogueInstitution.name,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });
});
