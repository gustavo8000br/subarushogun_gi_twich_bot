import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-test-${process.pid}-${randomUUID().slice(0, 8)}`;
let pool;
let containerStarted = false;

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}

describe('PostgreSQL migration and constraint contract', () => {
  beforeAll(async () => {
    docker(['run', '--detach', '--rm', '--name', containerName,
      '--env', 'POSTGRES_USER=queuebot', '--env', 'POSTGRES_PASSWORD=isolated-test-password', '--env', 'POSTGRES_DB=queuebot',
      '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql:rw,noexec,nosuid,size=512m',
      'postgres:18.6-bookworm']);
    containerStarted = true;
    const published = docker(['port', containerName, '5432/tcp']).split(':').at(-1);
    const connectionString = `postgresql://queuebot:isolated-test-password@127.0.0.1:${published}/queuebot?schema=public`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const probe = spawnSync('docker', ['exec', containerName, 'pg_isready', '-U', 'queuebot', '-d', 'queuebot'], {
        cwd: root, encoding: 'utf8', timeout: 3000,
      });
      if (probe.status === 0) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(ready, 'isolated PostgreSQL did not become healthy').toBe(true);
    const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, DATABASE_URL: connectionString },
    });
    expect(migration.status, migration.stderr || migration.stdout).toBe(0);
    pool = new pg.Pool({ connectionString });
    await pool.query('SELECT 1');
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (containerStarted) spawnSync('docker', ['stop', containerName], { cwd: root, encoding: 'utf8', timeout: 30_000 });
  });

  it('applies versioned migrations and creates the product persistence tables', async () => {
    const { rows } = await pool.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      AND tablename IN ('queues', 'queue_keys', 'entries', 'redemptions', 'outbox', 'audit_logs', 'settings', 'oauth_credentials', 'processed_operations')
    `);
    expect(rows.map(({ tablename }) => tablename).sort()).toEqual([
      'audit_logs', 'entries', 'oauth_credentials', 'outbox', 'processed_operations',
      'queue_keys', 'queues', 'redemptions', 'settings',
    ]);
    const migrationCount = await pool.query('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL');
    expect(migrationCount.rows[0].count).toBeGreaterThan(0);
  });

  it('enforces queue key namespace, redemption, active-entry and outbox intent uniqueness in PostgreSQL', async () => {
    const { rows: queues } = await pool.query(`
      INSERT INTO queues (slug, title, cost) VALUES ('queue-one', 'Queue One', 1)
      RETURNING id
    `);
    const queueId = queues[0].id;
    await pool.query(`INSERT INTO queue_keys (key, queue_id, key_type) VALUES ('queue-one', $1, 'slug')`, [queueId]);
    await expect(pool.query(`INSERT INTO queue_keys (key, queue_id, key_type) VALUES ('queue-one', $1, 'alias')`, [queueId]))
      .rejects.toMatchObject({ code: '23505' });

    const redemptionId = `redemption-${randomUUID()}`;
    await pool.query(`INSERT INTO redemptions (redemption_id, broadcaster_id, reward_id, user_id) VALUES ($1, 'broadcaster', 'reward', 'viewer')`, [redemptionId]);
    await expect(pool.query(`INSERT INTO redemptions (redemption_id, broadcaster_id, reward_id, user_id) VALUES ($1, 'broadcaster', 'reward', 'viewer')`, [redemptionId]))
      .rejects.toMatchObject({ code: '23505' });

    const entryValues = [queueId, `user-${randomUUID()}`, redemptionId];
    await pool.query(`INSERT INTO entries (queue_id, twitch_user_id, user_login, display_name, source, redemption_id) VALUES ($1, $2, 'viewer', 'Viewer', 'redemption', $3)`, entryValues);
    await expect(pool.query(`INSERT INTO entries (queue_id, twitch_user_id, user_login, display_name, source, redemption_id) VALUES ($1, $2, 'viewer', 'Viewer', 'redemption', $3)`, entryValues))
      .rejects.toMatchObject({ code: '23505' });

    const manualUser = `manual-${randomUUID()}`;
    await expect(pool.query(`INSERT INTO entries (queue_id, twitch_user_id, user_login, display_name, source, redemption_id) VALUES ($1, $2, 'manual', 'Manual', 'manual', $3)`, [queueId, manualUser, redemptionId]))
      .rejects.toMatchObject({ code: '23514' });
    await pool.query(`INSERT INTO entries (queue_id, twitch_user_id, user_login, display_name, source, status) VALUES ($1, $2, 'manual', 'Manual', 'manual', 'completed')`, [queueId, manualUser]);
    await pool.query(`INSERT INTO entries (queue_id, twitch_user_id, user_login, display_name, source, status) VALUES ($1, $2, 'manual', 'Manual', 'manual', 'waiting')`, [queueId, manualUser]);
    await expect(pool.query(`INSERT INTO entries (queue_id, twitch_user_id, user_login, display_name, source, status) VALUES ($1, $2, 'manual', 'Manual', 'manual', 'waiting')`, [queueId, manualUser]))
      .rejects.toMatchObject({ code: '23505' });

    const idempotencyKey = `financial-${randomUUID()}`;
    await pool.query(`INSERT INTO outbox (operation_type, entity_type, idempotency_key) VALUES ('redemption.cancel', 'redemption', $1)`, [idempotencyKey]);
    await expect(pool.query(`INSERT INTO outbox (operation_type, entity_type, idempotency_key) VALUES ('redemption.cancel', 'redemption', $1)`, [idempotencyKey]))
      .rejects.toMatchObject({ code: '23505' });
  });
});
