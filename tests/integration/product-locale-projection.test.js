import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProductLocaleProjection, writeProductLocaleProjection } from '../../apps/infra/src/product-locale-projection.mjs';

const roots = [];

async function createStatePath() {
  const root = await mkdtemp(join(tmpdir(), 'queuebot-locale-state-'));
  roots.push(root);
  return join(root, '.local', 'product-locale.state');
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('host product-locale projection', () => {
  it('writes a strict canonical locale/revision snapshot that host tools can read', async () => {
    const path = await createStatePath();
    await writeProductLocaleProjection(path, { locale: 'es', revision: 4 });
    await expect(readFile(path, 'utf8')).resolves.toBe('locale=es\nrevision=4\n');
    await expect(readProductLocaleProjection(path)).resolves.toEqual({ locale: 'es', revision: 4 });
  });

  it('atomically advances the snapshot while retaining the last valid offline fallback', async () => {
    const path = await createStatePath();
    await writeProductLocaleProjection(path, { locale: 'pt-BR', revision: 1 });
    await writeProductLocaleProjection(path, { locale: 'en', revision: 2 });
    await expect(readProductLocaleProjection(path)).resolves.toEqual({ locale: 'en', revision: 2 });
    await expect(readProductLocaleProjection(`${path}.last-valid`)).resolves.toEqual({ locale: 'pt-BR', revision: 1 });
  });

  it('rejects malformed state and falls back to the prior valid projection without exposing file content', async () => {
    const path = await createStatePath();
    await writeProductLocaleProjection(path, { locale: 'en', revision: 2 });
    await import('node:fs/promises').then(({ writeFile }) => writeFile(path, 'client_secret=do-not-show\n'));
    await expect(readProductLocaleProjection(path)).resolves.toEqual({ locale: 'en', revision: 2 });
    await expect(writeProductLocaleProjection(path, { locale: 'not a locale', revision: 3 })).rejects.toMatchObject({ code: 'INVALID_PRODUCT_LOCALE_PROJECTION' });
  });
});
