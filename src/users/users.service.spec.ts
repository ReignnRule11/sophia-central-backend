import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

describe('UsersService academic profile updates', () => {
  let service: UsersService;
  let manager: any;
  let dataSource: any;

  const existingUser = {
    id: 'student-1',
    role: 'student',
    isProfileComplete: true,
    institution: 'Old University',
    faculty: 'Arts',
    department: 'History',
  };

  beforeEach(() => {
    manager = {
      findOne: jest.fn(async () => ({ ...existingUser })),
      query: jest.fn(),
      save: jest.fn(async (_entity, value) => value),
      createQueryBuilder: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(async callback => callback(manager)),
    };
    service = new UsersService({} as Repository<User>, dataSource as DataSource, {} as any);
  });

  it('allows an institution change only with an approved institution and matching academic placement', async () => {
    manager.query
      .mockResolvedValueOnce([{ id: 'institution-new' }])
      .mockResolvedValueOnce([{ id: 'faculty-new' }])
      .mockResolvedValueOnce([{ id: 'department-new' }]);

    const updated = await service.update('student-1', {
      institution: 'New University',
      faculty: 'Engineering',
      department: 'Mechanical Engineering',
    });

    expect(updated).toMatchObject({
      institution: 'New University',
      faculty: 'Engineering',
      department: 'Mechanical Engineering',
    });
    expect(manager.query).toHaveBeenCalledTimes(3);
  });

  it('rejects an institution that is not in the approved catalogue', async () => {
    manager.query.mockResolvedValueOnce([]);

    await expect(service.update('student-1', {
      institution: 'Unlisted University',
      faculty: 'Science',
      department: 'Biology',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires faculty and department to be resubmitted when institution changes', async () => {
    await expect(service.update('student-1', {
      institution: 'New University',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.query).not.toHaveBeenCalled();
  });
});
