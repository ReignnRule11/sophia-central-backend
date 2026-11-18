const assert = require('node:assert/strict');
const { Client } = require('pg');

const client = new Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
});

async function main() {
  await client.connect();
  let userId;
  let sessionId;
  let supportRequestId;
  let approvedResourceId;
  try {
    const requiredTables = [
      'users', 'resources', 'institutions', 'faculties', 'departments',
      'courses', 'course_topics', 'moderation_reviews', 'point_wallets',
      'point_transactions', 'file_uploads', 'referrals', 'notifications',
      'ai_sessions', 'ai_messages', 'resource_files', 'ai_usage_logs', 'migrations', 'password_reset_tokens', 'support_requests', 'content_reports', 'reviewer_applications', 'reviewer_application_decisions', 'academic_account_transitions', 'reviewer_conflict_declarations', 'reviewer_assignment_events',
    ];
    for (const table of requiredTables) {
      const result = await client.query('SELECT to_regclass($1) AS name', [`public.${table}`]);
      assert.ok(result.rows[0].name, `expected migrated table: ${table}`);
    }

    const identityColumn = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'uniqueId'");
    assert.equal(identityColumn.rowCount, 1, 'users.uniqueId should exist');
    const pricingColumns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'resources' AND column_name IN ('pricingMode', 'priceAmount', 'customPriceStatus', 'lastSubstantiveUpdateAt')");
    assert.equal(pricingColumns.rowCount, 4, 'resource pricing and substantive-update columns should exist');
    const lifecycleColumns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('accountStatus', 'deletionRequestedAt', 'deletionScheduledAt', 'securityQuestionId', 'securityAnswerHash')");
    assert.equal(lifecycleColumns.rowCount, 5, 'account lifecycle and security-question columns should exist');
    const ticketColumns = await client.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'support_requests' AND column_name = 'ticketNumber') OR (table_name = 'content_reports' AND column_name = 'ticketNumber') OR (table_name = 'support_requests' AND column_name = 'escalatedToRole'))");
    assert.equal(ticketColumns.rowCount, 3, 'support and report ticket references and escalation tracking should exist');
    const singleSupportRoleIndex = await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'IDX_users_single_support_role'`);
    assert.equal(singleSupportRoleIndex.rowCount, 1, 'only one dedicated Support account should be assignable');

    const globalReviewerColumn = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'isGlobalReviewer'");
    assert.equal(globalReviewerColumn.rowCount, 1, 'global academic reviewer capability column should exist');

    const applied = await client.query('SELECT name FROM migrations ORDER BY timestamp');
    const migrationNames = applied.rows.map((row) => row.name);
    assert.ok(
      migrationNames.length >= 7,
      `expected all current migrations to run; found ${migrationNames.length}`,
    );
    assert.ok(
      migrationNames.includes('AddUserSocialLinks2026102500001'),
      'user social-links migration should be applied',
    );

    assert.ok(migrationNames.includes('CreatePasswordResetTokens2026102600001'), 'password reset token migration should be applied');
    assert.ok(migrationNames.includes('CreateSupportRequests2026103100001'), 'support request migration should be applied');
    assert.ok(migrationNames.includes('SophisCommercialFoundation2026111200001'), 'Sophis commercial foundation migration should be applied');
    assert.ok(migrationNames.includes('AddAccountLifecycle2026111300001'), 'account lifecycle migration should be applied');
    assert.ok(migrationNames.includes('CreateReviewerApplications2026111700001'), 'reviewer application migration should be applied');
    assert.ok(migrationNames.includes('CreateReviewerApplicationDecisionAudit2026111700002'), 'reviewer decision audit migration should be applied');
    assert.ok(migrationNames.includes('AddAcademicAccountTransitions2026111700003'), 'academic account transition migration should be applied');
    assert.ok(migrationNames.includes('AddReviewerConflictDeclarations2026111700004'), 'reviewer conflict declaration migration should be applied');
    assert.ok(migrationNames.includes('AddResourceContributorIdentities2026111700005'), 'resource contributor identity migration should be applied');
    assert.ok(migrationNames.includes('AddReviewerApprovedScope2026111700006'), 'reviewer approved scope migration should be applied');
    assert.ok(migrationNames.includes('CreateReviewerAssignmentEvents2026111700008'), 'reviewer assignment event migration should be applied');
    assert.ok(migrationNames.includes('AddGlobalAcademicReviewerCapability2026111800001'), 'global academic reviewer capability migration should be applied');
    assert.ok(migrationNames.includes('AddSupportRoleTicketReferencesAndWorkflow2026111800003'), 'Support and report ticket workflow migration should be applied');

    const user = await client.query(
      `INSERT INTO users (email, password, "firstName", "lastName", "uniqueId")
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [`ci-smoke-${Date.now()}@example.invalid`, 'not-a-real-password-hash', 'CI', 'Smoke', `CI-CS-${Date.now()}`],
    );
    userId = user.rows[0].id;

    const resource = await client.query(
      `INSERT INTO resources (title, type, "moderationStatus", "uploaderId")
       VALUES ('CI migration smoke resource', 'other', 'pending', $1) RETURNING id`,
      [userId],
    );

    const reviewerApplication = await client.query(
      `INSERT INTO reviewer_applications ("userId", status, qualifications, "expertiseAreas", "academicLevels", "reviewExperience", "conflictDeclaration", "policyAccepted")
       VALUES ($1, 'submitted', '["MSc"]'::jsonb, '["Research methods"]'::jsonb, '["Postgraduate"]'::jsonb, 'CI reviewer experience', 'CI conflict declaration', true)
       RETURNING id`,
      [userId],
    );
    const reviewerApplicationId = reviewerApplication.rows[0].id;
    await assert.rejects(
      client.query(
        `INSERT INTO reviewer_applications ("userId", status, qualifications, "expertiseAreas", "academicLevels", "reviewExperience", "conflictDeclaration", "policyAccepted")
         VALUES ($1, 'submitted', '["MSc"]'::jsonb, '["Research methods"]'::jsonb, '["Postgraduate"]'::jsonb, 'duplicate CI reviewer experience', 'duplicate CI conflict declaration', true)`,
        [userId],
      ),
      (error) => error.code === '23505',
      'only one active reviewer application may exist per account',
    );
    const activeApplicationIndex = await client.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'UQ_reviewer_applications_one_active_per_user'`,
    );
    assert.equal(activeApplicationIndex.rowCount, 1, 'active reviewer application uniqueness index should exist');

    const auditAssignmentId = '00000000-0000-4000-8000-000000000123';
    await Promise.all([
      client.query(
        `INSERT INTO reviewer_application_decisions ("applicationId", "actorId", "fromStatus", "toStatus", note)
         VALUES ($1, $2, 'submitted', 'under_review', 'CI decision audit')`,
        [reviewerApplicationId, userId],
      ),
      client.query(
        `INSERT INTO academic_account_transitions ("userId", "fromAccountType", "toAccountType", "actorId")
         VALUES ($1, 'external_reviewer', 'student', $1)`,
        [userId],
      ),
      client.query(
        `INSERT INTO reviewer_conflict_declarations ("assignmentId", "resourceId", "reviewerId", declaration)
         VALUES ($1, $2, $3, 'no_conflict')`,
        [auditAssignmentId, resource.rows[0].id, userId],
      ),
      client.query(
        `INSERT INTO reviewer_assignment_events ("assignmentId", "resourceId", "reviewerId", "actorId", "eventType")
         VALUES ($1, $2, $3, $3, 'assigned')`,
        [auditAssignmentId, resource.rows[0].id, userId],
      ),
    ]);

    const session = await client.query(
      `INSERT INTO ai_sessions ("userId", "resourceId", title)
       VALUES ($1, $2, 'CI migration smoke session') RETURNING id`,
      [userId, resource.rows[0].id],
    );

    const approvedResource = await client.query(
      `INSERT INTO resources (title, type, "moderationStatus", "uploaderId")
       VALUES ('CI approved shared resource', 'other', 'approved', $1) RETURNING id`,
      [userId],
    );
    approvedResourceId = approvedResource.rows[0].id;
    sessionId = session.rows[0].id;
    const supportRequest = await client.query(
      `INSERT INTO support_requests (\"userId\", subject, category, description, \"ticketNumber\") VALUES ($1, 'CI support request', 'account', 'Migration smoke support request', $2) RETURNING id`,
      [userId, `SUP-CI-${Date.now()}`],
    );
    supportRequestId = supportRequest.rows[0].id;
    await client.query(
      `INSERT INTO ai_messages ("sessionId", role, content)
       VALUES ($1, 'user', 'migration smoke test')`,
      [sessionId],
    );

    const reset = await client.query(
      `INSERT INTO password_reset_tokens (\"userId\", \"tokenHash\", \"expiresAt\") VALUES ($1, $2, NOW() + INTERVAL '30 minutes') RETURNING id`,
      [userId, 'a'.repeat(64)],
    );
    assert.ok(reset.rows[0].id, 'password reset token should be insertable');

    // Remove the pending resource explicitly; approved shared content must survive account deletion.
    await client.query('DELETE FROM resources WHERE id = $1', [resource.rows[0].id]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    const immutableAuditForeignKeys = await client.query(
      `SELECT table_name, constraint_name
       FROM information_schema.table_constraints
       WHERE table_schema = 'public'
         AND constraint_type = 'FOREIGN KEY'
         AND table_name IN (
           'reviewer_application_decisions',
           'academic_account_transitions',
           'reviewer_conflict_declarations',
           'reviewer_assignment_events'
         )`,
    );
    assert.equal(immutableAuditForeignKeys.rowCount, 0, 'append-only audit records must not block account or resource deletion through foreign keys');
    const applicationDecisionAudit = await client.query('SELECT id FROM reviewer_application_decisions WHERE "applicationId" = $1', [reviewerApplicationId]);
    assert.equal(applicationDecisionAudit.rowCount, 1, 'reviewer application decision audit should survive user deletion');
    const transitionAudit = await client.query('SELECT id FROM academic_account_transitions WHERE "userId" = $1', [userId]);
    assert.equal(transitionAudit.rowCount, 1, 'academic transition audit should survive user deletion');
    const conflictAudit = await client.query('SELECT id FROM reviewer_conflict_declarations WHERE "resourceId" = $1', [resource.rows[0].id]);
    assert.equal(conflictAudit.rowCount, 1, 'conflict audit should survive resource and user deletion');
    const assignmentAudit = await client.query('SELECT id FROM reviewer_assignment_events WHERE "resourceId" = $1', [resource.rows[0].id]);
    assert.equal(assignmentAudit.rowCount, 1, 'assignment audit should survive resource and user deletion');
    const supportRow = await client.query('SELECT id FROM support_requests WHERE id = $1', [supportRequestId]);
    assert.equal(supportRow.rowCount, 0, 'deleting a user should cascade-delete support requests');
    const resetToken = await client.query('SELECT id FROM password_reset_tokens WHERE id = $1', [reset.rows[0].id]);
    assert.equal(resetToken.rowCount, 0, 'deleting a user should cascade-delete password reset tokens');
    const retainedResource = await client.query('SELECT id, "uploaderId" FROM resources WHERE id = $1', [approvedResourceId]);
    assert.equal(retainedResource.rowCount, 1, 'approved shared resources should survive uploader account deletion');
    assert.equal(retainedResource.rows[0].uploaderId, null, 'approved resource uploader identity should be anonymized');
    const detachedSession = await client.query('SELECT "resourceId" FROM ai_sessions WHERE id = $1', [sessionId]);
    assert.equal(detachedSession.rows[0].resourceId, null, 'resource deletion should null optional AI session reference');
    const message = await client.query('SELECT id FROM ai_messages WHERE "sessionId" = $1', [sessionId]);
    assert.equal(message.rowCount, 1, 'AI session/message schema should be usable after migration');

    console.log('PostgreSQL migration smoke test passed: schema, migration history, CRUD, and FK behavior.');
  } finally {
    if (sessionId) await client.query('DELETE FROM ai_sessions WHERE id = $1', [sessionId]).catch(() => undefined);
    if (approvedResourceId) await client.query('DELETE FROM resources WHERE id = $1', [approvedResourceId]).catch(() => undefined);
    if (userId) await client.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => undefined);
    await client.end();
  }
}

main().catch((error) => {
  console.error('PostgreSQL migration smoke test failed.');
  console.error(error);
  process.exitCode = 1;
});
