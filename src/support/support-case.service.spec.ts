import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SupportCaseService } from './support-case.service';
import { UserRole } from '../users/entities/user.entity';

describe('SupportCaseService', () => {
  const actor = { id: 'support-1', role: UserRole.SUPPORT, email: 'support@example.test' } as any;
  let dataSource: any;
  let notifications: any;
  let service: SupportCaseService;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    notifications = { createNotification: jest.fn().mockResolvedValue(undefined) };
    service = new SupportCaseService(dataSource, notifications);
  });

  it('rejects accounts that are not currently approved Support identities', async () => {
    dataSource.query.mockResolvedValueOnce([]);
    await expect(service.queue(actor, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns a bounded, server-paginated queue and overdue indicators', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: actor.id, email: actor.email }])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ id: 'ticket-1', status: 'pending', priority: 'urgent', slaDueAt: new Date(Date.now() - 60000) }]);
    const result = await service.queue(actor, { page: '0', limit: '500', q: 'account', assigned: 'me' });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.total).toBe(1);
    expect(result.items[0].overdue).toBe(true);
    expect(dataSource.query.mock.calls[1][0]).toContain('ILIKE');
  });

  it('rejects an invalid priority before changing the ticket', async () => {
    dataSource.query.mockResolvedValueOnce([{ id: actor.id, email: actor.email }]);
    await expect(service.setPriority('ticket-1', actor, 'critical' as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('stores private internal notes and writes an audit event', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: actor.id, email: actor.email }])
      .mockResolvedValueOnce([{ id: 'ticket-1', ticketNumber: 'SUP-2026-000001' }])
      .mockResolvedValueOnce([{ id: 'note-1', body: 'Internal investigation note' }])
      .mockResolvedValueOnce([]);
    const result = await service.addInternalNote('ticket-1', actor, '  Internal investigation note  ');
    expect(result.note.body).toBe('Internal investigation note');
    expect(dataSource.query.mock.calls[2][0]).toContain('support_request_internal_notes');
    expect(dataSource.query.mock.calls[3][0]).toContain('support_request_events');
  });

  it('rejects blank internal notes', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: actor.id, email: actor.email }])
      .mockResolvedValueOnce([{ id: 'ticket-1', ticketNumber: 'SUP-2026-000001' }]);
    await expect(service.addInternalNote('ticket-1', actor, '   ')).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.query).toHaveBeenCalledTimes(2);
  });
});
