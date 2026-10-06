import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(await readFile(new URL('../../package-lock.json', import.meta.url), 'utf8'));

describe('Prisma dependency security contract', () => {
  it('keeps Prisma CLI, client, and PostgreSQL adapter on the same pinned release', () => {
    const prismaVersions = [
      packageJson.devDependencies.prisma,
      packageJson.dependencies['@prisma/client'],
      packageJson.dependencies['@prisma/adapter-pg'],
    ];

    expect(new Set(prismaVersions).size).toBe(1);
    expect(prismaVersions[0]).toBe('6.19.3');
  });

  it('pins Prisma config to a patched deepmerge-ts release in manifest and lockfile', () => {
    expect(packageJson.overrides?.['@prisma/config']?.['deepmerge-ts']).toBe('8.0.2');
    expect(packageLock.packages['node_modules/deepmerge-ts']?.version)
      .toBe('8.0.2');
  });
});
