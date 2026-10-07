import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverCatalogBundle } from '../../apps/shared/localization/discover-catalog-bundle.mjs';

const roots = [];
const builtIns = {
  'pt-BR': 'title\tTítulo pt\ntranslation.unavailable\tIndisponível.\n',
  en: 'title\tTitle\ntranslation.unavailable\tUnavailable.\n',
  es: 'title\tTítulo es\ntranslation.unavailable\tNo disponible.\n',
};

async function makeRoot() {
  const root = await mkdtemp(join(tmpdir(), 'queuebot-catalog-bundle-'));
  roots.push(root);
  for (const moduleName of ['setup', 'community-module']) {
    const directory = join(root, moduleName);
    await mkdir(directory);
    await Promise.all(Object.entries(builtIns).map(([locale, contents]) => (
      writeFile(join(directory, `${locale}.tsv`), contents.replace('Título', moduleName))
    )));
  }
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('discoverCatalogBundle', () => {
  it('adds a locale only after every discovered module has a complete catalog', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'setup', 'de.tsv'), 'title\tEinrichtung\ntranslation.unavailable\tNicht verfügbar.\n');

    const partial = await discoverCatalogBundle(root);
    expect(partial.locales).toEqual(['en', 'es', 'pt-BR']);
    expect(partial.modules.setup.catalogs.de).toBeUndefined();

    await writeFile(join(root, 'community-module', 'de.tsv'), 'title\tChat\ntranslation.unavailable\tNicht verfügbar.\n');
    const complete = await discoverCatalogBundle(root);

    expect(complete.locales).toEqual(['de', 'en', 'es', 'pt-BR']);
    expect(complete.modules.setup.catalogs.de.title).toBe('Einrichtung');
    expect(complete.modules['community-module'].catalogs.de.title).toBe('Chat');
  });

  it('does not offer an added locale when one module has placeholder/key mismatch', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'setup', 'de.tsv'), 'title\tHallo\ntranslation.unavailable\tNicht verfügbar.\n');
    await writeFile(join(root, 'community-module', 'de.tsv'), 'title\tHallo\ntranslation.unavailable\tNicht verfügbar.\nextra.key\tExtra\n');

    const result = await discoverCatalogBundle(root);

    expect(result.locales).toEqual(['en', 'es', 'pt-BR']);
  });

  it('discovers module directories and requires the initial locales in every module', async () => {
    const root = await makeRoot();
    await mkdir(join(root, 'new-product-module'));

    await expect(discoverCatalogBundle(root))
      .rejects.toThrow('Required catalog is missing for locale pt-BR');
  });
});
