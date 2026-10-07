import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverCatalogModule } from '../../apps/shared/localization/discover-catalog-module.mjs';

const roots = [];

async function makeCatalogRoot() {
  const root = await mkdtemp(join(tmpdir(), 'queuebot-catalogs-'));
  roots.push(root);
  const moduleRoot = join(root, 'setup');
  await mkdir(moduleRoot);
  await Promise.all([
    writeFile(join(moduleRoot, 'pt-BR.tsv'), 'setup.title\tConfiguração\nsetup.callback.success_message\tCanal {channel}\nsetup.callback.return_message\tRetorno em {seconds}\ntranslation.unavailable\tIndisponível.\n'),
    writeFile(join(moduleRoot, 'en.tsv'), 'setup.title\tSetup\nsetup.callback.success_message\tChannel {channel}\nsetup.callback.return_message\tReturn in {seconds}\ntranslation.unavailable\tUnavailable.\n'),
    writeFile(join(moduleRoot, 'es.tsv'), 'setup.title\tConfiguración\nsetup.callback.success_message\tCanal {channel}\nsetup.callback.return_message\tVolver en {seconds}\ntranslation.unavailable\tNo disponible.\n'),
  ]);
  return { root, moduleRoot };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('discoverCatalogModule', () => {
  it('validates first-party chat catalog placeholders against the product allowlist', async () => {
    const catalogRoot = fileURLToPath(new URL('../../apps/web/localization/catalogs/', import.meta.url));
    const result = await discoverCatalogModule(catalogRoot, 'chat');
    expect(result.catalogs['pt-BR']['chat.account.current']).toContain('{label}');
    expect(result.catalogs.en['chat.ping.response']).toContain('{version}');
  });

  it('discovers a complete new locale file without a code registry change', async () => {
    const { root, moduleRoot } = await makeCatalogRoot();
    await writeFile(join(moduleRoot, 'de.tsv'), 'setup.title\tEinrichtung\nsetup.callback.success_message\tKanal {channel}\nsetup.callback.return_message\tZurück in {seconds}\ntranslation.unavailable\tNicht verfügbar.\n');

    const result = await discoverCatalogModule(root, 'setup');

    expect(result.locales).toEqual(['de', 'en', 'es', 'pt-BR']);
    expect(result.catalogs.de['setup.title']).toBe('Einrichtung');
    expect(result.rejectedLocales).toEqual([]);
  });

  it('does not expose an additional locale with incomplete keys', async () => {
    const { root, moduleRoot } = await makeCatalogRoot();
    await writeFile(join(moduleRoot, 'de.tsv'), 'setup.title\tEinrichtung\n');

    const result = await discoverCatalogModule(root, 'setup');

    expect(result.locales).toEqual(['en', 'es', 'pt-BR']);
    expect(result.rejectedLocales).toEqual([{ locale: 'de', reason: 'invalid-catalog' }]);
  });

  it('requires all initial locales and fails without revealing filesystem paths', async () => {
    const { root, moduleRoot } = await makeCatalogRoot();
    await rm(join(moduleRoot, 'es.tsv'));

    await expect(discoverCatalogModule(root, 'setup'))
      .rejects.toThrow('Required catalog is missing for locale es');
  });

  it('rejects module names that could escape the catalog root', async () => {
    const { root } = await makeCatalogRoot();

    await expect(discoverCatalogModule(root, '../setup'))
      .rejects.toThrow('Invalid catalog module identifier');
  });
});
