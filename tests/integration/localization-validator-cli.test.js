import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const roots = [];
const script = fileURLToPath(new URL('../../apps/infra/scripts/validate-localization.mjs', import.meta.url));
const sourceCatalog = {
  'pt-BR': 'translation.unavailable\tTexto indisponível.\nhello\tOlá\n',
  en: 'translation.unavailable\tText unavailable.\nhello\tHello\n',
  es: 'translation.unavailable\tTexto no disponible.\nhello\tHola\n',
};

async function createCatalogRoot() {
  const root = await mkdtemp(join(tmpdir(), 'queuebot-catalog-cli-'));
  roots.push(root);
  const moduleRoot = join(root, 'setup');
  await mkdir(moduleRoot);
  await Promise.all(Object.entries(sourceCatalog).map(([locale, text]) => (
    writeFile(join(moduleRoot, `${locale}.tsv`), text)
  )));
  return root;
}

function runValidator(catalogRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, catalogRoot], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('localization catalog CLI validator', () => {
  it('reports module and locale coverage without printing catalog text or filesystem paths', async () => {
    const root = await createCatalogRoot();
    const result = await runValidator(root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('setup');
    expect(result.stdout).toContain('pt-BR');
    expect(result.stdout).toContain('en');
    expect(result.stdout).toContain('es');
    expect(result.stdout).not.toContain('Olá');
    expect(result.stdout).not.toContain(root);
    expect(result.stderr).toBe('');
  });

  it('exits unsuccessfully with safe output when a required locale catalog is missing', async () => {
    const root = await createCatalogRoot();
    await rm(join(root, 'setup', 'es.tsv'));
    const result = await runValidator(root);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Localization catalogs are invalid');
    expect(result.stderr).not.toContain(root);
    expect(result.stderr).not.toContain('Olá');
  });
});
