import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverCatalogBundle } from '../../apps/shared/localization/discover-catalog-bundle.mjs';
import { validateLocalizationCatalogs } from '../../apps/infra/scripts/validate-localization.mjs';
import { loadFirstPartyPanelFallback } from '../../apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs';

// OPS-15 cutover wave 2 (FT-05/FT-40, DP-3): the first-party catalogs live next to the shared
// localization loader, and every runtime consumer resolves them through one shared constant.
const root = resolve(import.meta.dirname, '../..');
const MODULES = ['chat', 'lifecycle', 'overlay', 'panel', 'setup'];
const LOCALES = ['en', 'es', 'pt-BR'];
// Loaded per case so that, before the move, each contract fails on its own instead of the whole file.
const loadSharedCatalogPath = () => import('../../apps/shared/localization/first-party-catalogs.mjs');
const CONSUMERS = [
  'apps/api/src/server.mjs',
  'apps/infra/scripts/validate-localization.mjs',
  'apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs',
];

describe('first-party localization catalog location (OPS-15 cutover wave 2)', () => {
  it('exports one repository-root-relative catalog directory under apps/shared/localization', async () => {
    const { FIRST_PARTY_CATALOG_DIRECTORY, resolveFirstPartyCatalogRoot } = await loadSharedCatalogPath();
    expect(FIRST_PARTY_CATALOG_DIRECTORY).toBe('apps/shared/localization/catalogs');
    expect(resolveFirstPartyCatalogRoot(root)).toBe(join(root, 'apps/shared/localization/catalogs'));
  });

  it('keeps exactly the 5 first-party modules with the 3 required locales at the shared path, and none under apps/web', () => {
    const catalogRoot = join(root, 'apps/shared/localization/catalogs');
    expect(readdirSync(catalogRoot).sort()).toEqual(MODULES);
    for (const moduleName of MODULES) {
      expect(readdirSync(join(catalogRoot, moduleName)).sort(), moduleName).toEqual(LOCALES.map((locale) => `${locale}.tsv`));
    }
    expect(existsSync(join(root, 'apps/web/localization')), 'apps/web/localization must not exist').toBe(false);
  });

  it('resolves the catalog root in the API, the validator and the Next fallback only through the shared constant', () => {
    for (const consumer of CONSUMERS) {
      const source = readFileSync(join(root, consumer), 'utf8');
      expect(source, consumer).toMatch(/import \{ resolveFirstPartyCatalogRoot \} from '(?:\.\.\/)+shared\/localization\/first-party-catalogs\.mjs';/);
      expect(source, consumer).toContain('resolveFirstPartyCatalogRoot(');
      expect(source, `${consumer} must not spell the catalog path itself`).not.toMatch(/localization\/catalogs/);
    }
  });

  it('discovers the same modules and locales from the shared path', async () => {
    const { resolveFirstPartyCatalogRoot } = await loadSharedCatalogPath();
    const bundle = await discoverCatalogBundle(resolveFirstPartyCatalogRoot(root));
    expect(Object.keys(bundle.modules).sort()).toEqual(MODULES);
    expect([...bundle.locales].sort()).toEqual(LOCALES);
  });

  it('validates the shipped catalogs with the default validator root', async () => {
    const result = await validateLocalizationCatalogs([]);
    expect(result.status).toBe('valid');
    expect([...result.modules].sort()).toEqual(MODULES);
    expect([...result.locales].sort()).toEqual(LOCALES);
  });

  it('loads the Next pt-BR static fallback from the shared path', async () => {
    const fallback = await loadFirstPartyPanelFallback();
    expect(Object.keys(fallback)).toEqual(['pt-BR']);
    expect(fallback['pt-BR']['panel.navigation.overview']).toBeTypeOf('string');
    expect(fallback['pt-BR']['panel.navigation.overview'].length).toBeGreaterThan(0);
  });
});
