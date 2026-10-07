import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverCatalogModule } from '../../apps/shared/localization/discover-catalog-module.mjs';

describe('panel catalog contract', () => {
  it('covers every static text and accessible-label key in the panel for each first-party locale', async () => {
    const htmlPath = fileURLToPath(new URL('../../apps/web/index.html', import.meta.url));
    const catalogRoot = fileURLToPath(new URL('../../apps/web/localization/catalogs/', import.meta.url));
    const html = await readFile(htmlPath, 'utf8');
    const catalogs = await discoverCatalogModule(catalogRoot, 'panel');
    const keys = [...html.matchAll(/data-i18n(?:-[a-z-]+)?="([a-z0-9._-]+)"/g)].map((match) => match[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const locale of ['pt-BR', 'en', 'es']) {
      for (const key of keys) expect(catalogs.catalogs[locale]).toHaveProperty(key);
    }
  });
});
