import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

describe('Next frontend tooling boundaries', () => {
  it('provides a root development command that starts the combined runtime', async () => {
    const packageJson = JSON.parse(await readFile(`${repositoryRoot}/package.json`, 'utf8'));

    expect(packageJson.scripts.dev).toBe('node apps/frontend/scripts/dev-server.mjs');
  });

  it('excludes generated Next artifacts from repository JavaScript type checks', async () => {
    const config = JSON.parse(await readFile(`${repositoryRoot}/tsconfig.json`, 'utf8'));

    expect(config.exclude).toContain('apps/frontend/.next');
    expect(config.exclude).toContain('apps/frontend/out');
  });
});
