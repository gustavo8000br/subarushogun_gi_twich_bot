import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('runtime database URL construction', () => {
  it('reads the local secret and percent-encodes credentials without logging them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiox-db-url-'));
    try {
      const secretPath = join(directory, 'password');
      await writeFile(secretPath, 'p@ss:/?# %word\n');
      const { createDatabaseUrl } = await import('../../apps/infra/src/database-url.mjs');
      const connectionUrl = await createDatabaseUrl({ secretPath, env: {
        DATABASE_HOST: 'db', DATABASE_PORT: '5432', DATABASE_USER: 'queue bot', DATABASE_NAME: 'queue#bot',
      } });
      expect(connectionUrl).toBe('postgresql://queue%20bot:p%40ss%3A%2F%3F%23%20%25word@db:5432/queue%23bot?schema=public');
      expect(connectionUrl).not.toContain('p@ss');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('fails without disclosing an absent or empty secret', async () => {
    const { createDatabaseUrl } = await import('../../apps/infra/src/database-url.mjs');
    await expect(createDatabaseUrl({ secretPath: '/missing/local-db-password' })).rejects.toThrow();
  });
});
