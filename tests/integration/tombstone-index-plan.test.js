import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS, ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS, cleanupIsolatedPostgres,
} from '../helpers/isolated-postgres-cleanup.mjs';
import {
  ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS, ISOLATED_POSTGRES_IMAGE, ISOLATED_POSTGRES_LABEL, ensurePostgresImage, runDockerCommand,
} from '../helpers/isolated-postgres-image.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-plan-${process.pid}-${randomUUID().slice(0, 8)}`;
let prisma;

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}

describe('PostgreSQL converted tombstone index plan', () => {
  beforeAll(async () => {
    ensurePostgresImage();
    docker(['run', '--detach', '--rm', '--pull', 'never', '--label', ISOLATED_POSTGRES_LABEL, '--name', containerName,
      '--env', 'POSTGRES_USER=queuebot', '--env', 'POSTGRES_PASSWORD=isolated-test-password', '--env', 'POSTGRES_DB=queuebot',
      '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql:rw,noexec,nosuid,size=768m',
      ISOLATED_POSTGRES_IMAGE]);
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
      cwd: root, encoding: 'utf8', timeout: 60_000,
      env: { ...process.env, DATABASE_URL: connectionString },
    });
    expect(migration.status, migration.stderr || migration.stdout).toBe(0);
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });
  }, ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS);

  afterAll(async () => {
    await prisma?.$disconnect();
    await cleanupIsolatedPostgres({
      containerName,
      runDocker: (args) => runDockerCommand(args, { timeout: ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS }),
    });
  }, ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS);

  it('naturally selects the partial index for a bounded page in a representative mixed queue table', async () => {
    await prisma.$executeRaw`INSERT INTO queues (
      id, slug, title, cost, queue_mode, reward_id, reward_origin, mode_transition_status,
      lifecycle_status, remote_sync_status, deleted_at, is_archived, is_open, created_at, updated_at
    )
    SELECT gen_random_uuid(), 'active-' || row_number, 'Active queue', 1,
      'channel_points', 'active-reward-' || row_number, 'legacy_unknown', 'none',
      'active', 'synced', NULL, false, false, now(), now()
    FROM generate_series(1, 40000) AS row_number`;

    await prisma.$executeRaw`INSERT INTO queues (
      id, slug, title, cost, queue_mode, reward_id, reward_origin, mode_transition_status,
      lifecycle_status, remote_sync_status, deleted_at, is_archived, is_open, created_at, updated_at
    )
    SELECT gen_random_uuid(), 'tombstone-' || row_number, 'Converted tombstone', 1,
      'manual_only', 'converted-reward-' || row_number, 'bot_created', 'confirmed',
      'deleted', 'local_only', now(), true, false, now(), now()
    FROM generate_series(1, 5000) AS row_number`;
    await prisma.$executeRaw`ANALYZE queues`;

    const planRows = await prisma.$queryRaw`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT "id" FROM "queues"
      WHERE "reward_id" IS NOT NULL AND "queue_mode" = 'manual_only' AND "lifecycle_status" = 'deleted'
        AND "id" > '00000000-0000-4000-8000-000000000000'::uuid
      ORDER BY "id" ASC LIMIT 10`;
    const plan = planRows[0]['QUERY PLAN'][0];
    const nodeTypes = [];
    const indexNames = [];
    function visit(node) {
      nodeTypes.push(node['Node Type']);
      if (node['Index Name']) indexNames.push(node['Index Name']);
      for (const child of node.Plans ?? []) visit(child);
    }
    visit(plan.Plan);

    expect(plan.Plan['Actual Rows']).toBe(10);
    expect(nodeTypes.some((nodeType) => ['Index Scan', 'Index Only Scan'].includes(nodeType))).toBe(true);
    expect(indexNames).toContain('queues_converted_tombstone_reconcile_idx');
  }, 120_000);
});
