import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PANEL_PLACEHOLDERS } from '../../apps/shared/panel/panel-catalog.mjs';
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
  const contents = await readFile(new URL(`../../apps/shared/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8');
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
    const callCatalog = { 'pt-BR': { 'translation.unavailable': 'Texto indisponível.', 'panel.queue_settings.call_message_default': '{user}, use {command} para confirmar.' } };
    expect(translateCatalog(callCatalog, 'pt-BR', 'panel.queue_settings.call_message_default', {
      values: { user: 'Viewer', command: '!arena presente' }, placeholders: PANEL_PLACEHOLDERS,
    })).toBe('Viewer, use !arena presente para confirmar.');
  });

  it.each(['en', 'es', 'pt-BR'])('renders the queue title in the shipped %s final local deletion confirmation', async (locale) => {
    const contents = await readFile(new URL(`../../apps/shared/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8');
    const catalog = Object.fromEntries(contents.trim().split('\n').map((line) => {
      const separator = line.indexOf('\t');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
    const message = translateCatalog({ [locale]: catalog }, locale, 'panel.queue.confirm.archive_local_uncertain_final', {
      values: { title: 'Fila teste' }, placeholders: PANEL_PLACEHOLDERS,
    });
    expect(message).toContain('Fila teste');
    expect(message).not.toContain('unavailable');
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

  // OPS-22 FT-25: approved texts of the shared UX plan (ux-plan-ft23-ft36.md, section 4.2), in the three catalogs.
  const ft25Texts = {
    en: {
      'panel.operation.blocks_deletion': 'Blocks the deletion of “{title}”',
      'panel.operation.attempts_exhausted': 'Automatic attempts ended and Twitch confirmed nothing. Use Reconcile / retry to start a new cycle of 6 attempts, or record a manual resolution.',
      'panel.operation.manual_contradicted': 'Twitch still lists this redemption as open after your manual resolution, so automatic tracking was resumed.',
    },
    es: {
      'panel.operation.blocks_deletion': 'Bloquea la eliminación de “{title}”',
      'panel.operation.attempts_exhausted': 'Los intentos automáticos terminaron y Twitch no confirmó nada. Usa Reconciliar / reintentar para iniciar un nuevo ciclo de 6 intentos, o registra una resolución manual.',
      'panel.operation.manual_contradicted': 'Twitch sigue listando este canje como abierto tras tu resolución manual, así que se reanudó el seguimiento automático.',
    },
    'pt-BR': {
      'panel.operation.blocks_deletion': 'Bloqueia a exclusão de “{title}”',
      'panel.operation.attempts_exhausted': 'As tentativas automáticas terminaram e a Twitch não confirmou nada. Use Reconciliar / tentar novamente para iniciar um novo ciclo de 6 tentativas, ou registre uma resolução manual.',
      'panel.operation.manual_contradicted': 'A Twitch ainda lista este resgate como aberto depois da sua resolução manual, então o acompanhamento automático foi retomado.',
    },
  };

  it.each(['en', 'es', 'pt-BR'])('ships the FT-25 Operations texts in %s with registered placeholders only', (locale) => {
    for (const [key, text] of Object.entries(ft25Texts[locale])) expect(shippedPanelCatalogs[locale][key]).toBe(text);
    expect(PANEL_PLACEHOLDERS['panel.operation.blocks_deletion']).toEqual(['title']);
    expect(PANEL_PLACEHOLDERS['panel.operation.attempts_exhausted']).toBeUndefined();
    expect(PANEL_PLACEHOLDERS['panel.operation.manual_contradicted']).toBeUndefined();
    const message = translateCatalog(shippedPanelCatalogs, locale, 'panel.operation.blocks_deletion', {
      values: { title: 'Fila teste' }, placeholders: PANEL_PLACEHOLDERS,
    });
    expect(message).toContain('Fila teste');
    expect(message).not.toContain('{title}');
  });
});
