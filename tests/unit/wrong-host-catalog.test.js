import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadFirstPartyPanelFallback } from '../../apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs';
import { PANEL_PLACEHOLDERS } from '../../apps/shared/panel/panel-catalog.mjs';

// LA-17 (FT-67): catalog side of the wrong-host message (node environment: the loader reads the real files).
describe('wrong-host catalogs and bundled fallback (AC-17.3)', () => {
  const read = (locale) => Object.fromEntries(readFileSync(`apps/shared/localization/catalogs/panel/${locale}.tsv`, 'utf8').split('\n').filter(Boolean).map((line) => line.split('\t')));
  const placeholders = (text) => [...text.matchAll(/\{([a-z]+)\}/g)].map((match) => match[1]);

  it.each(['en', 'es', 'pt-BR'])('has both keys with the right placeholders in %s', (locale) => {
    const catalog = read(locale);
    expect(placeholders(catalog['panel.error.wrong_host'])).toEqual(['host']);
    expect(placeholders(catalog['panel.error.wrong_host_action'])).toEqual(['url']);
    expect(catalog['panel.error.wrong_host']).toContain('localhost');
  });

  it('declares the placeholders for the runtime translator', () => {
    expect(PANEL_PLACEHOLDERS['panel.error.wrong_host']).toEqual(['host']);
    expect(PANEL_PLACEHOLDERS['panel.error.wrong_host_action']).toEqual(['url']);
  });

  it('is part of the bundled first-party fallback used when the catalog request fails', async () => {
    const fallback = await loadFirstPartyPanelFallback();
    expect(fallback['pt-BR']['panel.error.wrong_host']).toBe('A sessão não vale em {host}. Este painel só funciona em localhost.');
    expect(fallback['pt-BR']['panel.error.wrong_host_action']).toBe('Abrir {url}');
  });
});
