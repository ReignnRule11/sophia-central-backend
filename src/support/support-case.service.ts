import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

type SupportPriority = 'low' | 'normal' | 'high' | 'urgent';

@Injectable()
export class SupportCaseService {
  constructor(private readonly dataSource: DataSource, private readonly notifications: NotificationsService) {}

  private async assertSupport(actor: User) {
    const rows = await this.dataSource.query(
      `SELECT id, email FROM users WHERE id = $1 AND role = $2 AND "isSuspended" = false
       AND "accountStatus" = 'active' AND "emailVerified" = true AND "platformRoleStatus" = 'approved' LIMIT 1`,
      [actor.id, UserRole.SUPPORT],
    );
    if (!rows.length) throw new ForbiddenException('Only an active, verified, Admin-approved Support account can manage support cases.');
    return rows[0] as { id: string; email: string };
  }

  private async ensureCase(id: string) {
    const rows = await this.dataSource.query(
      `SELECT id, "ticketNumber", "userId", subject, category, status, priority, "assignedSupportId",
       "slaDueAt", "createdAt", "updatedAt", "resolvedAt", "closedAt", "resolutionCategory", "closureReason"
       FROM support_requests WHERE id = $1::uuid LIMIT 1`, [id],
    );
    if (!rows.length) throw new NotFoundException('Support ticket not found.');
    return rows[0];
  }

  private async event(ticketId: string, actor: { id: string; email: string }, eventType: string, details: Record<string, unknown>) {
    await this.dataSource.query(
      `INSERT INTO support_request_events ("supportRequestId", "actorId", "actorEmail", "eventType", details)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb)`,
      [ticketId, actor.id, actor.email, eventType, JSON.stringify(details)],
    );
  }

  async assignees(actor: User) {
    await this.assertSupport(actor);
    return this.dataSource.query(
      `SELECT id, "firstName", "lastName", email FROM users
       WHERE role = $1 AND "isSuspended" = false AND "accountStatus" = 'active'
       AND "emailVerified" = true AND "platformRoleStatus" = 'approved'
       ORDER BY "firstName" ASC, "lastName" ASC`,
      [UserRole.SUPPORT],
    );
  }

  async queue(actor: User, query: { status?: string; priority?: string; assigned?: string; q?: string; page?: string; limit?: string }) {
    await this.assertSupport(actor);
    const page = Math.max(1, Math.min(100000, Number.parseInt(query.page || '1', 10) || 1));
    const limit = Math.max(1, Math.min(50, Number.parseInt(query.limit || '20', 10) || 20));
    const conditions: string[] = [];
    const params: unknown[] = [];
    const add = (sql: (index: number) => string, value: unknown) => { params.push(value); conditions.push(sql(params.length)); };
    if (query.status && query.status !== 'all') add(i => `r.status = $${i}`, query.status);
    if (query.priority) {
      if (!['low', 'normal', 'high', 'urgent'].includes(query.priority)) throw new BadRequestException('Choose a valid priority filter.');
      add(i => `r.priority = $${i}`, query.priority);
    }
    if (query.assigned === 'me') add(i => `r."assignedSupportId" = $${i}::uuid`, actor.id);
    else if (query.assigned === 'unassigned') conditions.push('r."assignedSupportId" IS NULL');
    const term = query.q?.trim();
    if (term) add(i => `(r."ticketNumber" ILIKE $${i} OR r.subject ILIKE $${i} OR r.category ILIKE $${i}
      OR COALESCE(r."senderName", '') ILIKE $${i} OR COALESCE(r."senderEmail", '') ILIKE $${i}
      OR COALESCE(requester.email, '') ILIKE $${i} OR COALESCE(requester."firstName", '') ILIKE $${i}
      OR COALESCE(requester."lastName", '') ILIKE $${i})`, `%${term.slice(0, 120)}%`);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM support_requests r LEFT JOIN users requester ON requester.id = r."userId" ${where}`, params,
    );
    const offset = (page - 1) * limit;
    const rows = await this.dataSource.query(
      `SELECT r.id, r."ticketNumber", r."userId", r."requesterType", r."senderName", r."senderEmail",
        r.subject, r.category, r.description, r.status, r.priority, r."assignedSupportId",
        r."slaDueAt", r."createdAt", r."updatedAt", r."resolvedAt", r."closedAt",
        r."escalatedToRole", r."resolutionCategory", r."closureReason",
        jsonb_build_object('id', requester.id, 'firstName', requester."firstName", 'lastName', requester."lastName", 'email', requester.email, 'role', requester.role) AS requester,
        jsonb_build_object('id', assignee.id, 'firstName', assignee."firstName", 'lastName', assignee."lastName", 'email', assignee.email) AS assignee
       FROM support_requests r LEFT JOIN users requester ON requester.id = r."userId"
       LEFT JOIN users assignee ON assignee.id = r."assignedSupportId"
       ${where} ORDER BY CASE r.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
       r."slaDueAt" ASC NULLS LAST, r."createdAt" ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    const total = Number(countRows[0]?.total || 0);
    return { items: rows.map((row: Record<string, unknown>) => ({ ...row, overdue: Boolean(row.slaDueAt && new Date(String(row.slaDueAt)).getTime() < Date.now() && !['resolved', 'closed', 'concluded'].includes(String(row.status))) })), page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async assign(id: string, actor: User, assigneeId: string | null) {
    const supportActor = await this.assertSupport(actor);
    const current = await this.ensureCase(id);
    if (assigneeId) {
      const eligible = await this.dataSource.query(
        `SELECT id FROM users WHERE id = $1::uuid AND role = $2 AND "isSuspended" = false
         AND "accountStatus" = 'active' AND "emailVerified" = true AND "platformRoleStatus" = 'approved' LIMIT 1`,
        [assigneeId, UserRole.SUPPORT],
      );
      if (!eligible.length) throw new BadRequestException('Cases can only be assigned to an active, verified, Admin-approved Support account.');
    }
    await this.dataSource.query('UPDATE support_requests SET "assignedSupportId" = $2::uuid WHERE id = $1::uuid', [id, assigneeId]);
    await this.event(id, supportActor, assigneeId ? 'assigned' : 'unassigned', { previousAssigneeId: current.assignedSupportId, assignedSupportId: assigneeId });
    if (assigneeId) {
      try { await this.notifications.createNotification(assigneeId, 'support_case_assigned', 'Support case assigned to you', `Ticket ${current.ticketNumber} has been assigned to you.`, '/support'); } catch { /* assignment is durable even if notification delivery fails */ }
    }
    return this.ensureCase(id);
  }


  async resolve(id: string, actor: User, resolutionCategory: string, closureReason?: string) {
    const supportActor = await this.assertSupport(actor);
    const allowedCategories = ['resolved', 'information_provided', 'duplicate', 'unable_to_reproduce', 'user_action_required', 'other'];
    if (!allowedCategories.includes(resolutionCategory)) throw new BadRequestException('Choose a valid resolution category.');
    const current = await this.ensureCase(id);
    if (!['response_sent', 'concluded'].includes(current.status)) throw new BadRequestException('A ticket must have a response sent before it can be marked resolved.');
    if (current.resolvedAt || current.closedAt) throw new BadRequestException('This ticket is already resolved or closed.');
    const reason = closureReason?.trim() || null;
    if (reason && reason.length > 2000) throw new BadRequestException('Resolution notes must be 2,000 characters or fewer.');
    await this.dataSource.query(
      `UPDATE support_requests SET "resolvedAt" = NOW(), "resolutionCategory" = $2, "closureReason" = $3 WHERE id = $1::uuid`,
      [id, resolutionCategory, reason],
    );
    await this.event(id, supportActor, 'resolved', { resolutionCategory, closureReason: reason });
    if (current.userId) {
      try {
        await this.notifications.createNotification(
          current.userId,
          'support_request_status',
          'Your support ticket was marked resolved',
          `Ticket ${current.ticketNumber} was marked resolved by Support.`,
          '/my-activity',
        );
      } catch { /* resolution is durable even if notification delivery fails */ }
    }
    return this.ensureCase(id);
  }

  async setPriority(id: string, actor: User, priority: SupportPriority) {
    const supportActor = await this.assertSupport(actor);
    if (!['low', 'normal', 'high', 'urgent'].includes(priority)) throw new BadRequestException('Choose a valid support priority.');
    const current = await this.ensureCase(id);
    await this.dataSource.query('UPDATE support_requests SET priority = $2 WHERE id = $1::uuid', [id, priority]);
    await this.event(id, supportActor, 'priority_changed', { from: current.priority, to: priority });
    return this.ensureCase(id);
  }

  async addInternalNote(id: string, actor: User, body: string) {
    const supportActor = await this.assertSupport(actor);
    const current = await this.ensureCase(id);
    const note = body?.trim();
    if (!note || note.length > 4000) throw new BadRequestException('Internal notes must contain between 1 and 4,000 characters.');
    const rows = await this.dataSource.query(
      `INSERT INTO support_request_internal_notes ("supportRequestId", "authorId", "authorEmail", body)
       VALUES ($1::uuid, $2::uuid, $3, $4) RETURNING id, "authorId", "authorEmail", body, "createdAt"`,
      [id, supportActor.id, supportActor.email, note],
    );
    await this.event(id, supportActor, 'internal_note_added', { noteId: rows[0].id });
    return { ticketNumber: current.ticketNumber, note: rows[0] };
  }

  async notes(id: string, actor: User) {
    await this.assertSupport(actor);
    await this.ensureCase(id);
    return this.dataSource.query(
      `SELECT id, "authorId", "authorEmail", body, "createdAt" FROM support_request_internal_notes
       WHERE "supportRequestId" = $1::uuid ORDER BY "createdAt" ASC`, [id],
    );
  }

  async timeline(id: string, actor: User) {
    await this.assertSupport(actor);
    await this.ensureCase(id);
    return this.dataSource.query(
      `SELECT id, "actorId", "actorEmail", "eventType", details, "createdAt"
       FROM support_request_events WHERE "supportRequestId" = $1::uuid ORDER BY "createdAt" ASC`, [id],
    );
  }

  async analytics(actor: User, days = 30) {
    await this.assertSupport(actor);
    if (![7, 30, 90].includes(days)) throw new BadRequestException('Choose a 7, 30, or 90 day analytics window.');
    const [summaryRows, categoryRows, agentRows] = await Promise.all([
      this.dataSource.query(
        `SELECT
          COUNT(*) FILTER (WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 day'))::int AS "ticketsCreated",
          COUNT(*) FILTER (WHERE "concludedAt" IS NOT NULL AND "createdAt" >= NOW() - ($1::int * INTERVAL '1 day'))::int AS "responseCount",
          COUNT(*) FILTER (WHERE COALESCE("closedAt", "resolvedAt") IS NOT NULL AND "createdAt" >= NOW() - ($1::int * INTERVAL '1 day'))::int AS "resolutionCount",
          COUNT(*) FILTER (WHERE status NOT IN ('response_sent', 'concluded', 'resolved', 'closed'))::int AS "openBacklog",
          COUNT(*) FILTER (WHERE status NOT IN ('response_sent', 'concluded', 'resolved', 'closed') AND "slaDueAt" < NOW())::int AS "overdueBacklog",
          COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE("concludedAt", "resolvedAt") - "createdAt")) / 60)
            FILTER (WHERE COALESCE("concludedAt", "resolvedAt") IS NOT NULL AND "createdAt" >= NOW() - ($1::int * INTERVAL '1 day')), 0)::float AS "averageResponseMinutes",
          COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE("closedAt", "resolvedAt") - "createdAt")) / 60)
            FILTER (WHERE COALESCE("closedAt", "resolvedAt") IS NOT NULL AND "createdAt" >= NOW() - ($1::int * INTERVAL '1 day')), 0)::float AS "averageResolutionMinutes",
          COUNT(*) FILTER (WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 day') AND "escalatedToRole" IS NOT NULL)::int AS "escalatedTickets",
          COUNT(*) FILTER (WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 day'))::int AS "periodTickets"
         FROM support_requests`,
        [days],
      ),
      this.dataSource.query(
        `SELECT category, COUNT(*)::int AS count
         FROM support_requests
         WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 day')
         GROUP BY category ORDER BY count DESC, category ASC LIMIT 12`,
        [days],
      ),
      this.dataSource.query(
        `SELECT u.id, u."firstName", u."lastName", u.email,
          COUNT(r.id) FILTER (WHERE r.status NOT IN ('response_sent', 'concluded', 'resolved', 'closed'))::int AS "activeCases",
          COUNT(r.id) FILTER (WHERE COALESCE(r."closedAt", r."resolvedAt", r."concludedAt") >= NOW() - ($1::int * INTERVAL '1 day'))::int AS "completedInPeriod"
         FROM users u
         LEFT JOIN support_requests r ON r."assignedSupportId" = u.id
         WHERE u.role = $2 AND u."isSuspended" = false AND u."accountStatus" = 'active'
           AND u."emailVerified" = true AND u."platformRoleStatus" = 'approved'
         GROUP BY u.id, u."firstName", u."lastName", u.email
         ORDER BY "activeCases" DESC, "completedInPeriod" DESC, u.email ASC`,
        [days, UserRole.SUPPORT],
      ),
    ]);
    const summary = summaryRows[0] || {};
    const periodTickets = Number(summary.periodTickets || 0);
    return {
      windowDays: days,
      generatedAt: new Date().toISOString(),
      summary: {
        ticketsCreated: Number(summary.ticketsCreated || 0),
        openBacklog: Number(summary.openBacklog || 0),
        overdueBacklog: Number(summary.overdueBacklog || 0),
        averageBacklogAgeHours: Number((await this.dataSource.query(
          `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 3600), 0)::float AS value
           FROM support_requests WHERE status NOT IN ('response_sent', 'concluded', 'resolved', 'closed')`,
        ))[0]?.value || 0),
        averageResponseMinutes: Number(summary.averageResponseMinutes || 0),
        responseCount: Number(summary.responseCount || 0),
        averageResolutionMinutes: Number(summary.averageResolutionMinutes || 0),
        resolutionCount: Number(summary.resolutionCount || 0),
        escalatedTickets: Number(summary.escalatedTickets || 0),
        escalationRate: periodTickets ? Number(((Number(summary.escalatedTickets || 0) / periodTickets) * 100).toFixed(1)) : 0,
      },
      categoryTrends: categoryRows,
      agentWorkload: agentRows,
    };
  }

}
