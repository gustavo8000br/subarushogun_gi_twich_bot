// OPS-22 FT-54 (UX plan 2.3): the pt-BR deletion family and the widget queue texts use "recompensa" (reward) and "resgate"
// (redemption) and never the English word "reward"; the singular and plural of each key keep the same placeholders.
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function catalog(locale) {
  const text = await readFile(new URL(`../../apps/shared/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8');
  return new Map(text.split('\n').filter(Boolean).map((line) => { const i = line.indexOf('\t'); return [line.slice(0, i), line.slice(i + 1)]; }));
}

const FAMILY = [
  'panel.queue.confirm.delete_local.one', 'panel.queue.confirm.delete_local.many', 'panel.queue.confirm.delete_local.other',
  'panel.queue.confirm.delete_converted.one', 'panel.queue.confirm.delete_converted.many', 'panel.queue.confirm.delete_converted.other',
  'panel.operation.confirm.continue_delete', 'panel.queue.confirm.retry_delete_converted', 'panel.queue.confirm.retry_delete_converted_diverged',
  'panel.queue.status.pending_local_delete', 'panel.queue.status.pending_local_delete_diverged',
  'panel.queue.delete.pending', 'panel.queue.delete.done',
  'panel.queue.delete.cancel.already_deleted', 'panel.queue.delete.cancel.reward_absent', 'panel.queue.delete.cancel.reward_diverged',
  'panel.queue.delete.cancel.reward_not_paused', 'panel.queue.delete.cancel.unverified', 'panel.queue.delete.cancel.processing',
  'panel.widget.queue_label', 'panel.widget.source.help',
];

describe('FT-54 term rule (pt-BR)', () => {
  it('AC-F54-2: no value of the deletion family or the widget queue texts contains the English word reward', async () => {
    const panel = await catalog('pt-BR');
    for (const key of FAMILY) {
      expect(panel.has(key), key).toBe(true);
      expect(panel.get(key), key).not.toMatch(/\brewards?\b/i);
    }
  });

  it('every `panel.queue.delete.*` and `panel.queue.confirm.delete*` value is covered by the scan (no key escapes the family list)', async () => {
    const panel = await catalog('pt-BR');
    for (const [key, value] of panel) {
      if (/^panel\.queue\.(delete\.|confirm\.delete)/.test(key)) expect(value, key).not.toMatch(/\brewards?\b/i);
    }
  });

  it('UX final texts of the singular family (AC-F54-1)', async () => {
    const panel = await catalog('pt-BR');
    expect(panel.get('panel.queue.confirm.delete_local.one')).toBe('Excluir a fila local “{title}”? {count} entrada ativa será removida. Não há recompensa nem resgate da Twitch vinculados a esta fila.');
    expect(panel.get('panel.queue.confirm.delete_local.many')).toBe('Excluir a fila local “{title}”? {count} entradas ativas serão removidas. Não há recompensa nem resgate da Twitch vinculados a esta fila.');
    expect(panel.get('panel.queue.confirm.delete_local.other')).toBe(panel.get('panel.queue.confirm.delete_local.many'));
    expect(panel.get('panel.queue.confirm.delete_converted.one')).toContain('A recompensa da Twitch permanecerá');
    expect(panel.get('panel.widget.queue_label')).toBe('Fila / recompensa vinculada');
    expect(panel.get('panel.widget.source.help')).toBe('Para exibir dados de uma fila, selecione a fila específica abaixo. A recompensa de Pontos do Canal vinculada é selecionada junto com ela, quando houver.');
  });

  it('AC-F54-3: singular and plural forms of each key keep the same placeholders in en, es and pt-BR', async () => {
    for (const locale of ['en', 'es', 'pt-BR']) {
      const panel = await catalog(locale);
      for (const base of ['panel.queue.confirm.delete_local', 'panel.queue.confirm.delete_converted']) {
        const placeholders = (key) => [...new Set((panel.get(key) ?? '').match(/\{[a-z]+\}/g) ?? [])].sort().join(',');
        const forms = locale === 'en' ? ['one', 'other'] : ['one', 'many', 'other'];
        for (const form of forms) expect(placeholders(`${base}.${form}`), `${locale} ${base}.${form}`).toBe(placeholders(`${base}.other`));
      }
    }
  });

  it('optional es parity (UX 2.3): delete_converted names the synchronization requests like en and pt-BR', async () => {
    const es = await catalog('es');
    for (const form of ['one', 'many', 'other']) expect(es.get(`panel.queue.confirm.delete_converted.${form}`), form).toContain('solicitudes de sincronización con Twitch');
  });
});
