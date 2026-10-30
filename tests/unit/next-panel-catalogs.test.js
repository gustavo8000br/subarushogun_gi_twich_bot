import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTsvCatalog } from '../../apps/shared/localization/tsv-catalog.mjs';
import { normalizeCatalogBundle, translatePanel } from '../../apps/frontend/lib/i18n/panel-catalogs.mjs';

describe('Next runtime panel catalogs', () => {
  it('explains partial, in-progress, and unknown health states in all shipped locales', () => {
    const expected = {
      en: 'Partial, in progress, or unknown',
      es: 'Parcial, en curso o desconocido',
      'pt-BR': 'Parcial, em andamento ou desconhecido',
    };
    const actual = Object.fromEntries(Object.entries({ en: 'en', es: 'es', 'pt-BR': 'pt-BR' }).map(([locale, file]) => {
      const catalog = parseTsvCatalog(readFileSync(new URL(`../../apps/shared/localization/catalogs/panel/${file}.tsv`, import.meta.url), 'utf8'));
      return [locale, catalog['panel.health.legend.partial']];
    }));
    expect(actual).toEqual(expected);
  });

  it('accepts every complete runtime locale and translates from the selected module', () => {
    const bundle = normalizeCatalogBundle({
      locales: ['pt-BR', 'en', 'es'],
      modules: { panel: { catalogs: {
        'pt-BR': { 'panel.navigation.overview': 'Visão geral' },
        en: { 'panel.navigation.overview': 'Overview' },
        es: { 'panel.navigation.overview': 'Vista general' },
      } } },
    });
    expect(bundle.locales).toEqual(['pt-BR', 'en', 'es']);
    expect(translatePanel(bundle.catalogs, 'es', 'panel.navigation.overview')).toBe('Vista general');
  });

  it('rejects incomplete or malformed API responses instead of silently inventing catalogs', () => {
    expect(() => normalizeCatalogBundle(null)).toThrow('invalid');
    expect(() => normalizeCatalogBundle({ locales: ['fr'], modules: { panel: { catalogs: {} } } })).toThrow('invalid');
    expect(() => normalizeCatalogBundle({ locales: [], modules: { panel: { catalogs: {} } } })).toThrow('empty');
  });

  it('uses the shared safe unavailable message for missing product keys', () => {
    expect(translatePanel({ 'pt-BR': { 'translation.unavailable': 'Texto indisponível.' } }, 'pt-BR', 'missing.key')).toBe('Texto indisponível.');
  });

  it('interpolates only allowlisted viewer values for accessible queue action names', () => {
    const catalogs = { 'pt-BR': {
      'translation.unavailable': 'Texto indisponível.',
      'panel.entry.action.call_aria': 'Chamar {user}',
    } };
    expect(translatePanel(catalogs, 'pt-BR', 'panel.entry.action.call_aria', { values: { user: 'Viewer' } }))
      .toBe('Chamar Viewer');
    expect(translatePanel(catalogs, 'pt-BR', 'panel.entry.action.call_aria', { values: { user: 'Viewer', token: 'secret' } }))
      .toBe('Texto indisponível.');
  });
});
