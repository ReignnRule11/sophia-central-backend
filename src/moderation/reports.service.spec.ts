import { ForbiddenException } from '@nestjs/common';
import { ContentReportsService } from './reports.service';
import { ContentReportStatus } from './entities/content-report.entity';
import { UserRole } from '../users/entities/user.entity';

describe('ContentReportsService Moderator case ownership', () => {
  const manager = {
    findOne: jest.fn(),
    save: jest.fn(async (_entity, value) => value),
    query: jest.fn().mockResolvedValue([]),
  };
  const reports: any = {
    findOne: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    query: jest.fn(),
    manager: { transaction: jest.fn(async callback => callback(manager)) },
  };
  const users: any = { find: jest.fn(), findOne: jest.fn() };
  const resources: any = { findOne: jest.fn() };
  const messages: any = { findOne: jest.fn() };
  const notifications: any = { createNotification: jest.fn().mockResolvedValue(undefined) };
  let service: ContentReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ContentReportsService(reports, users, resources, messages, notifications);
  });

  const moderator: any = {
    id: 'moderator-1', email: 'moderator@sophiscentral.test', role: UserRole.MODERATOR,
    isSuspended: false, accountStatus: 'active', emailVerified: true,
  };

  it('blocks Moderator updates while a report is escalated to Admin', async () => {
    reports.findOne.mockResolvedValue({
      id: 'report-1', escalatedToRole: 'admin', status: ContentReportStatus.REVIEWING,
      assignedModeratorId: moderator.id,
    });
    await expect(service.update('report-1', moderator, { status: ContentReportStatus.ACTIONED, moderatorNote: 'Reviewed and resolved.' } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(reports.save).not.toHaveBeenCalled();
  });

  it('prevents a Moderator from changing a report assigned to another Moderator', async () => {
    reports.findOne.mockResolvedValue({
      id: 'report-1', escalatedToRole: null, status: ContentReportStatus.REVIEWING,
      assignedModeratorId: 'moderator-2',
    });
    await expect(service.update('report-1', moderator, { status: ContentReportStatus.ACTIONED, moderatorNote: 'Reviewed and resolved.' } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(reports.save).not.toHaveBeenCalled();
  });

  it('lets a Moderator claim an unassigned report and records the claim', async () => {
    const report: any = {
      id: 'report-1', status: ContentReportStatus.PENDING, assignedModeratorId: null,
      escalatedToRole: null,
    };
    manager.findOne.mockResolvedValueOnce(report).mockResolvedValueOnce(moderator);
    await expect(service.assignReport('report-1', moderator, undefined, 'I am available to investigate this report.'))
      .resolves.toMatchObject({ assignedModeratorId: moderator.id, status: ContentReportStatus.REVIEWING });
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO report_case_events'),
      expect.arrayContaining(['report-1', moderator.id, 'claimed']),
    );
  });
});
