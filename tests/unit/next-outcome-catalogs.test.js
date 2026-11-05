import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PANEL_PLACEHOLDERS } from '../../apps/shared/panel/panel-catalog.mjs';
import { translateCatalog } from '../../apps/shared/browser/translate-catalog.mjs';
import { catalogKeyShape } from '../../apps/shared/localization/validate-catalog-set.mjs';

const LOCALES = ['en', 'es', 'pt-BR'];
const catalogs = Object.fromEntries(LOCALES.map((locale) => [locale, Object.fromEntries(readFileSync(`apps/shared/localization/catalogs/panel/${locale}.tsv`, 'utf8').trim().split('\n').map((line) => {
  const separator = line.indexOf('\t');
  return [line.slice(0, separator), line.slice(separator + 1)];
}))]));
const categories = (locale) => new Intl.PluralRules(locale).resolvedOptions().pluralCategories.filter((category) => category !== 'zero').sort();

/** Parse the approved texts of ux-plan-ft23-ft36.md, sections 4.1 and 4.2, into { key: { en, es, 'pt-BR' } } (plural rows expanded). */
function approvedTexts() {
  const plan = readFileSync('docs/stories/OPS-22/ux-plan-ft23-ft36.md', 'utf8');
  const start = plan.indexOf('### 4.1 Amended existing keys');
  const end = plan.indexOf('Counts: 3 amended keys');
  const result = {};
  for (const line of plan.slice(start, end).split('\n')) {
    if (!line.startsWith('| `')) continue;
    const cells = line.split(' | ').map((cell) => cell.replace(/^\|\s*/, '').replace(/\s*\|$/, '').trim());
    if (cells.length !== 4) continue;
    const [keyCell, en, es, ptBR] = cells;
    const base = keyCell.match(/^`([^`]+)`/)[1];
    const text = { en, es, 'pt-BR': ptBR };
    if (base === 'panel.queue.confirm.delete') { result[`${base}.other`] = text; result[`${base}.many`] = text; continue; }
    if (base === 'panel.queue.confirm.delete.one') { result[base] = text; continue; }
    if (base === 'panel.queue.deletion.blocked.many') { result['panel.queue.deletion.blocked.many'] = text; result['panel.queue.deletion.blocked.other'] = text; continue; }
    result[base] = text;
  }
  return result;
}
const approved = approvedTexts();

const NEW_REGULAR = [
  'panel.outcome.created.channel_points', 'panel.outcome.deleted.reward', 'panel.outcome.deleted.local', 'panel.outcome.delete_pending.reward',
  'panel.queue.deletion.blocked.generic', 'panel.queue.deletion.blocked_link', 'panel.queue.deletion.cancelling',
  'panel.queue.confirm.cancel_delete_if_ok', 'panel.queue.confirm.cancel_delete_not_restored',
  'panel.queue.dialog.title.delete', 'panel.queue.dialog.title.cancel_delete', 'panel.queue.dialog.back',
  'panel.queue.delete.cancel.reward_not_paused', 'panel.queue.delete.cancel.authorization_required',
  'panel.queue.delete.cancel.pause_in_progress', 'panel.queue.delete.cancel.remote_delete_attempted',
  'panel.outcome.dismiss', 'panel.outcome.action.refresh', 'panel.outcome.refreshed',
];
const NEW_PLURAL_BASES = ['panel.queue.deletion.blocked', 'panel.queue.confirm.delete', 'panel.queue.confirm.delete_local', 'panel.queue.confirm.delete_converted'];
const AMENDED = ['panel.queue.confirm.cancel_delete', 'panel.queue.delete.cancelled'];
const REUSED = [
  'panel.queue.creation_result.created_local', 'panel.queue.creation_result.pending', 'panel.queue.creation_result.review',
  'panel.queue.creation_result.recovered', 'panel.queue.creation_result.uncertain', 'panel.queue.creation_result.open_queues',
  'panel.queue.status.pending_delete', 'panel.queue.delete.pending', 'panel.queue.delete.done',
  'panel.queue.delete.cancel.already_deleted', 'panel.queue.delete.cancel.reward_absent', 'panel.queue.delete.cancel.reward_diverged',
  'panel.queue.delete.cancel.unverified', 'panel.queue.delete.cancel.stale', 'panel.queue.delete.cancel.processing', 'panel.queue.delete.cancel.uncertain',
  'panel.queue.action.delete', 'panel.queue.action.cancel_delete', 'panel.queue.action_result.saving', 'panel.queue.action_result.uncertain',
  'panel.error.generic', 'panel.error.reference', 'panel.error.queue_not_found', 'panel.navigation.connection',
  'panel.operation.blocks_deletion', 'panel.operation.attempts_exhausted', 'panel.operation.manual_contradicted',
];

describe('L23-01: the approved texts of the shared UX plan ship in en, es and pt-BR', () => {
  it('parses the plan tables (guards the parser itself)', () => {
    expect(Object.keys(approved).length).toBeGreaterThanOrEqual(24);
    expect(approved['panel.queue.dialog.back']).toEqual({ en: 'Back', es: 'Volver', 'pt-BR': 'Voltar' });
  });

  it.each(LOCALES)('every approved key exists in %s with the approved text', (locale) => {
    for (const [key, text] of Object.entries(approved)) {
      if (locale === 'en' && key.endsWith('.many')) continue; // en has no `many` form
      expect(catalogs[locale][key], `${locale} ${key}`).toBe(text[locale]);
    }
  });

  it.each(LOCALES)('%s: regular keys exist; plural groups carry exactly the locale categories', (locale) => {
    for (const key of [...NEW_REGULAR, ...AMENDED]) expect(catalogs[locale][key], `${locale} ${key}`).toBeTypeOf('string');
    const { pluralGroups } = catalogKeyShape(catalogs[locale]);
    for (const base of NEW_PLURAL_BASES) {
      expect(pluralGroups).toContain(base);
      const present = Object.keys(catalogs[locale]).filter((key) => key.startsWith(`${base}.`) && ['zero', 'one', 'two', 'few', 'many', 'other'].includes(key.slice(base.length + 1))).map((key) => key.slice(base.length + 1)).sort();
      expect(present, `${locale} ${base}`).toEqual(categories(locale));
    }
    expect(catalogs[locale]['panel.queue.confirm.delete']).toBeUndefined();
  });

  it('L23-02: the reused keys exist in all three catalogs', () => {
    for (const locale of LOCALES) for (const key of REUSED) expect(catalogs[locale][key], `${locale} ${key}`).toBeTypeOf('string');
  });

  it('every new and amended key keeps the same placeholders in the three languages and registers {title}/{count}', () => {
    expect(PANEL_PLACEHOLDERS['panel.queue.dialog.title.delete']).toEqual(['title']);
    expect(PANEL_PLACEHOLDERS['panel.queue.dialog.title.cancel_delete']).toEqual(['title']);
    expect(PANEL_PLACEHOLDERS['panel.queue.deletion.blocked']).toEqual(['count']);
    expect(PANEL_PLACEHOLDERS['panel.queue.confirm.delete']).toEqual(['title', 'count']);
    const names = (text) => [...text.matchAll(/\{([a-z]+)\}/g)].map((match) => match[1]).sort();
    for (const key of Object.keys(catalogs['pt-BR'])) {
      if (!/^panel\.(outcome|queue\.(deletion|dialog|confirm\.(delete|cancel_delete))|queue\.delete\.cancel)/.test(key)) continue;
      for (const locale of LOCALES) if (catalogs[locale][key]) expect(names(catalogs[locale][key]), `${locale} ${key}`).toEqual(names(catalogs['pt-BR'][key]));
    }
  });

  it('plural rendering: 1 and many give distinct, correct sentences in every language', () => {
    const render = (locale, key, count) => translateCatalog(catalogs, locale, `${key}.${new Intl.PluralRules(locale).select(count)}`, { values: key === 'panel.queue.deletion.blocked' ? { count } : { title: 'Arena', count }, placeholders: PANEL_PLACEHOLDERS });
    expect(render('pt-BR', 'panel.queue.confirm.delete', 1)).toContain('1 entrada ativa será removida');
    expect(render('pt-BR', 'panel.queue.confirm.delete', 4)).toContain('4 entradas ativas serão removidas');
    expect(render('en', 'panel.queue.confirm.delete', 1)).toContain('1 active entry will be removed');
    expect(render('en', 'panel.queue.confirm.delete', 0)).toContain('0 active entries will be removed');
    expect(render('es', 'panel.queue.confirm.delete', 1)).toContain('Se quitará 1 entrada activa');
    expect(render('es', 'panel.queue.confirm.delete', 2)).toContain('Se quitarán 2 entradas activas');
    expect(render('pt-BR', 'panel.queue.deletion.blocked', 1)).toContain('1 operação precisa');
    expect(render('pt-BR', 'panel.queue.deletion.blocked', 2)).toContain('2 operações precisam');
    expect(render('en', 'panel.queue.confirm.delete_local', 1)).toContain('1 active entry will be removed');
    expect(render('es', 'panel.queue.confirm.delete_converted', 1)).toContain('Se quitará 1 entrada activa');
    expect(render('pt-BR', 'panel.queue.confirm.delete_local', 1)).toContain('1 entrada ativa será removida');
  });

  it('L23-03: the delete confirmation and the cancel texts say that removed entries do not come back', () => {
    const phrases = { en: /do not come back/, es: /no vuelven/, 'pt-BR': /não voltam/ };
    for (const locale of LOCALES) {
      for (const form of ['one', 'other', ...(locale === 'en' ? [] : ['many'])]) expect(catalogs[locale][`panel.queue.confirm.delete.${form}`]).toMatch(phrases[locale]);
      expect(catalogs[locale]['panel.queue.confirm.cancel_delete_not_restored']).toMatch(phrases[locale]);
      expect(catalogs[locale]['panel.queue.delete.cancelled']).toMatch(phrases[locale]);
    }
  });

  it('L23-05: the terminology rule (no English "reward" in new pt-BR/es text; no Portuguese or Spanish in new en text)', () => {
    const touched = Object.keys(catalogs['pt-BR']).filter((key) => [...NEW_REGULAR, ...AMENDED].includes(key) || ['panel.queue.deletion.blocked', 'panel.queue.confirm.delete'].some((base) => key.startsWith(`${base}.`) && key !== base));
    for (const key of touched) {
      expect(catalogs['pt-BR'][key], `pt-BR ${key}`).not.toMatch(/\breward\b/i);
      expect(catalogs.es[key] ?? '', `es ${key}`).not.toMatch(/\breward\b/i);
      expect(catalogs.en[key] ?? '', `en ${key}`).not.toMatch(/recompensa|exclusão|eliminación|\bfila\b/i);
    }
    expect(catalogs['pt-BR']['panel.queue.dialog.title.delete']).toContain('fila');
    expect(catalogs.es['panel.queue.dialog.title.delete']).toContain('cola');
    expect(catalogs['pt-BR']['panel.queue.delete.cancelled']).toContain('Exclusão');
    expect(catalogs.es['panel.queue.delete.cancelled']).toContain('Eliminación');
  });

  it('R1: no new text claims the reward "remains paused" or "untouched" for a deleted Channel Points queue', () => {
    for (const locale of LOCALES) {
      expect(catalogs[locale]['panel.outcome.deleted.reward']).not.toMatch(/paused|untouched|pausada|intacta/i);
      expect(catalogs[locale]['panel.outcome.delete_pending.reward']).not.toMatch(/untouched|intacta/i);
    }
  });
});
