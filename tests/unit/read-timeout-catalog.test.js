import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadFirstPartyPanelFallback } from '../../apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs';

// LA-19 (FT-44): the timeout text exists in the three catalogs and in the bundled fallback, with no placeholders or internals.
const read = (locale) => Object.fromEntries(readFileSync(`apps/shared/localization/catalogs/panel/${locale}.tsv`, 'utf8').split('\n').filter(Boolean).map((line) => line.split('\t')));

describe('panel.error.read_timeout catalog entry', () => {
  it.each(['en', 'es', 'pt-BR'])('is present, placeholder-free and generic in %s', (locale) => {
    const text = read(locale)['panel.error.read_timeout'];
    expect(text).toBeTruthy();
    expect(text).not.toMatch(/[{}]|stack|Error|timeout|abort/i);
    expect(text).not.toBe(read(locale)['panel.error.local_load']);
  });

  it('is in the bundled fallback', async () => {
    expect((await loadFirstPartyPanelFallback())['pt-BR']['panel.error.read_timeout']).toBe('A API local não respondeu a tempo. Verifique se o serviço está em execução e atualize a página.');
  });
});
