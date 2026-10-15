import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PANEL_PLACEHOLDERS } from '../../apps/web/panel-catalog.mjs';
import { translateCatalog } from '../../apps/shared/browser/translate-catalog.mjs';

const catalog = {
  'pt-BR': {
    'translation.unavailable': 'Texto indisponível.',
    'panel.reward.candidate_counts': '{compatible} compatíveis de {total}.',
    'panel.reward.mismatch_summary': 'Diferenças: {reasons}.',
    'panel.reward.mismatch.title': 'Nomes diferentes ({count})',
    'panel.queue.confirm.archive_local_uncertain_final': 'Confirmação final: excluir “{title}” do painel mesmo assim?',
  },
};
const shippedPanelCatalogs = Object.fromEntries(await Promise.all(['en', 'es', 'pt-BR'].map(async (locale) => {
  const contents = await readFile(new URL(`../../apps/web/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8');
  const entries = Object.fromEntries(contents.trim().split('\n').map((line) => {
    const separator = line.indexOf('\t');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
  return [locale, entries];
})));

describe('runtime panel interpolation allowlist', () => {
  it('allows only the documented candidate and reward mismatch placeholders', () => {
    expect(translateCatalog(catalog, 'pt-BR', 'panel.reward.candidate_counts', {
      values: { compatible: 1, total: 6 }, placeholders: PANEL_PLACEHOLDERS,
    })).toBe('1 compatíveis de 6.');
    expect(translateCatalog(catalog, 'pt-BR', 'panel.reward.mismatch_summary', {
      values: { reasons: 'nome diferente (5)' }, placeholders: PANEL_PLACEHOLDERS,
    })).toBe('Diferenças: nome diferente (5).');
    expect(translateCatalog(catalog, 'pt-BR', 'panel.reward.mismatch.title', {
      values: { count: 5 }, placeholders: PANEL_PLACEHOLDERS,
    })).toBe('Nomes diferentes (5)');
  });

  it('allows the documented viewer placeholder in the default queue call message', () => {
    const callCatalog = { 'pt-BR': { 'translation.unavailable': 'Texto indisponível.', 'panel.queue_settings.call_message_default': '{user}, sua vez!' } };
    expect(translateCatalog(callCatalog, 'pt-BR', 'panel.queue_settings.call_message_default', {
      values: { user: 'Viewer' }, placeholders: PANEL_PLACEHOLDERS,
    })).toBe('Viewer, sua vez!');
  });

  it.each(['en', 'es', 'pt-BR'])('renders the queue title in the shipped %s final local deletion confirmation', (locale) => {
    const message = translateCatalog(shippedPanelCatalogs, locale, 'panel.queue.confirm.archive_local_uncertain_final', {
      values: { title: 'Fila teste' }, placeholders: PANEL_PLACEHOLDERS,
    });
    expect(message).not.toContain('unavailable');
    expect(message).toContain('Fila teste');
  });

  it('rejects unexpected interpolation values for these panel messages', () => {
    expect(translateCatalog(catalog, 'pt-BR', 'panel.reward.mismatch_summary', {
      values: { reasons: 'x', token: 'secret' }, placeholders: PANEL_PLACEHOLDERS,
    })).toBe('Texto indisponível.');
  });
});
