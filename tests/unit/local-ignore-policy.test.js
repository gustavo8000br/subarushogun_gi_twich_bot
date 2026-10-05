import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));

describe('local operational file exclusions', () => {
  it('ignores runtime secrets, local data, backups, dumps and real env files', () => {
    const ignore = readFileSync(`${root}/.gitignore`, 'utf8');
    for (const entry of ['runtime-secrets/', 'data/', 'backups/', '*.dump', '*.sql', '.env']) {
      expect(ignore.split(/\r?\n/)).toContain(entry);
    }
  });

  it('keeps the AIOX environment example available as framework scaffolding', () => {
    const ignore = readFileSync(`${root}/.gitignore`, 'utf8');
    expect(ignore).not.toMatch(/^\.env\.example\s*$/m);
  });

  it('keeps versioned Prisma migrations out of the global SQL-file ignore rule', () => {
    const ignore = readFileSync(`${root}/.gitignore`, 'utf8');
    expect(ignore.split(/\r?\n/)).toContain('!apps/api/prisma/migrations/**/*.sql');
  });
});
