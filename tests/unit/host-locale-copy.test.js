import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const roots = [];
const hostLocaleScript = fileURLToPath(new URL('../../apps/infra/scripts/host-locale.sh', import.meta.url));

async function createProject(locale, catalogText) {
  const root = await mkdtemp(join(tmpdir(), 'queuebot-host-locale-'));
  roots.push(root);
  await mkdir(join(root, '.local'), { recursive: true });
  await mkdir(join(root, 'apps', 'web', 'localization', 'catalogs', 'lifecycle'), { recursive: true });
  await writeFile(join(root, '.local', 'product-locale.state'), `locale=${locale}\nrevision=3\n`);
  await writeFile(join(root, 'apps', 'web', 'localization', 'catalogs', 'lifecycle', `${locale}.tsv`), catalogText);
  return root;
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('host lifecycle localization lookup', () => {
  it('reads the selected complete locale catalog from the project files and falls back safely', async () => {
    const root = await createProject('en', 'lifecycle.setup.ready\tSetup is ready\n');
    const output = execFileSync('sh', ['-c', '. "$1"; load_product_locale "$2"; product_copy "$2" lifecycle.setup.ready fallback', 'host-copy-test', hostLocaleScript, root], { encoding: 'utf8' });
    expect(output).toBe('Setup is ready\n');
  });

  it('rejects unsafe locale path values and uses the built-in default', async () => {
    const root = await createProject('../secret', '');
    const output = execFileSync('sh', ['-c', '. "$1"; load_product_locale "$2"; printf "%s\\n" "$PRODUCT_LOCALE"; product_copy "$2" lifecycle.setup.ready Default', 'host-copy-test', hostLocaleScript, root], { encoding: 'utf8' });
    expect(output).toBe('pt-BR\nDefault\n');
  });
});
