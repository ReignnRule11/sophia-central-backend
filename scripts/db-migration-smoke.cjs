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
  try {
    const requiredTables = [
      'users', 'resources', 'institutions', 'faculties', 'departments',
      'courses', 'course_topics', 'moderation_reviews', 'point_wallets',
      'point_transactions', 'file_uploads', 'referrals', 'notifications',
      'ai_sessions', 'ai_messages', 'resource_files', 'ai_usage_logs', 'migrations',
    ];
    for (const table of requiredTables) {
      const result = await client.query('SELECT to_regclass($1) AS name', [`public.${table}`]);
      assert.ok(result.rows[0].name, `expected migrated table: ${table}`);
    }

    const applied = await client.query('SELECT name FROM migrations ORDER BY timestamp');
    const migrationNames = applied.rows.map((row) => row.name);
    assert.ok(
      migrationNames.length >= 6,
      `expected all current migrations to run; found ${migrationNames.length}`,
    );
    assert.ok(
      migrationNames.includes('AddUserSocialLinks2026102500001'),
      'user social-links migration should be applied',
    );

    const user = await client.query(
      `INSERT INTO users (email, password, "firstName", "lastName")
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [`ci-smoke-${Date.now()}@example.invalid`, 'not-a-real-password-hash', 'CI', 'Smoke'],
    );
    userId = user.rows[0].id;

    const resource = await client.query(
      `INSERT INTO resources (title, type, "moderationStatus", "uploaderId")
       VALUES ('CI migration smoke resource', 'other', 'pending', $1) RETURNING id`,
      [userId],
    );

    const session = await client.query(
      `INSERT INTO ai_sessions ("userId", "resourceId", title)
       VALUES ($1, $2, 'CI migration smoke session') RETURNING id`,
      [userId, resource.rows[0].id],
    );
    sessionId = session.rows[0].id;
    await client.query(
      `INSERT INTO ai_messages ("sessionId", role, content)
       VALUES ($1, 'user', 'migration smoke test')`,
      [sessionId],
    );

    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    const detachedSession = await client.query('SELECT "resourceId" FROM ai_sessions WHERE id = $1', [sessionId]);
    assert.equal(detachedSession.rows[0].resourceId, null, 'resource deletion should null optional AI session reference');
    const message = await client.query('SELECT id FROM ai_messages WHERE "sessionId" = $1', [sessionId]);
    assert.equal(message.rowCount, 1, 'AI session/message schema should be usable after migration');

    console.log('PostgreSQL migration smoke test passed: schema, migration history, CRUD, and FK behavior.');
  } finally {
    if (sessionId) await client.query('DELETE FROM ai_sessions WHERE id = $1', [sessionId]).catch(() => undefined);
    if (userId) await client.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => undefined);
    await client.end();
  }
}

main().catch((error) => {
  console.error('PostgreSQL migration smoke test failed.');
  console.error(error);
  process.exitCode = 1;
});
