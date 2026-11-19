import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  getQueueEntryActionFailureFeedback,
  getQueueEntryActionFeedback,
  performQueueEntryAction,
  performQueueEntryActionWithRefresh,
  QUEUE_ENTRY_REFRESH_KEYS,
} from '../../apps/frontend/features/queues/queue-entry-actions.mjs';
import { ABSENT_RESTORE_REFUSAL_KEYS, absentCountKey, readAbsentGroup } from '../../apps/frontend/features/queues/queue-absent.mjs';
import { createApiClient } from '../../apps/frontend/lib/api/client.mjs';

// OPS-31 K72-01b ("Ausentes" + "Restaurar"): unit level. The jsdom file covers the group; the browser script covers the flow.
const parse = (locale) => Object.fromEntries(readFileSync(new URL(`../../apps/shared/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8')
  .split('\n').filter((line) => line.includes('\t')).map((line) => { const i = line.indexOf('\t'); return [line.slice(0, i), line.slice(i + 1)]; }));
const catalogs = { en: parse('en'), es: parse('es'), 'pt-BR': parse('pt-BR') };

const entry = (id, over = {}) => ({ id, userId: `uid-${id}`, userLogin: id, displayName: id.toUpperCase(), status: 'waiting', priorityClass: 'standard', version: 3, ...over });
const queueWith = (entries) => [{ id: 'q1', slug: 'arena', title: 'Arena', isOpen: true, entries }];
const gone = (id, over = {}) => ({ id, userLogin: id, displayName: id.toUpperCase(), version: 4, finishedAt: '2030-03-01T10:00:00.000Z', ...over });

describe('restore request (B4)', () => {
  it('posts no_show -> waiting with the internal label operator_restore and the version of absent.entries', async () => {
    const request = vi.fn().mockResolvedValue({ id: 'e1', status: 'waiting', financialDecision: 'no_operation' });
    await performQueueEntryAction({ request, queueId: 'q1', entryId: 'e1', action: 'restore', expectedVersion: 6 });
    const [path, options] = request.mock.calls[0];
    expect(path).toBe('/api/entries/e1/transitions');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ to: 'waiting', reason: 'operator_restore', expectedVersion: 6 });
  });

  it('refuses to send without an integer version and rejects a response that is not the same waiting entry', async () => {
    const request = vi.fn().mockResolvedValue({ id: 'e1', status: 'waiting' });
    for (const expectedVersion of [undefined, 0, 2.5, '3']) {
      await expect(performQueueEntryAction({ request, queueId: 'q1', entryId: 'e1', action: 'restore', expectedVersion }))
        .rejects.toMatchObject({ code: 'INVALID_QUEUE_ENTRY_ACTION_REQUEST' });
    }
    expect(request).not.toHaveBeenCalled();
    for (const bad of [{ id: 'e1', status: 'called' }, { id: 'other', status: 'waiting' }, null]) {
      await expect(performQueueEntryAction({ request: vi.fn().mockResolvedValue(bad), queueId: 'q1', entryId: 'e1', action: 'restore', expectedVersion: 2 }))
        .rejects.toMatchObject({ code: 'INVALID_QUEUE_ENTRY_ACTION_RESPONSE' });
    }
  });
});

describe('restore success text (B4)', () => {
  it('reads user and position from the RELOADED queue, never from the transition response', async () => {
    const reloaded = queueWith([entry('a'), entry('x', { displayName: 'Back Viewer', position: 2 }), entry('b')]);
    const request = vi.fn().mockResolvedValueOnce({ id: 'x', status: 'waiting', position: 99 }).mockResolvedValueOnce(reloaded);
    const { result, queues } = await performQueueEntryActionWithRefresh({ request, queueId: 'q1', entryId: 'x', action: 'restore', expectedVersion: 4 });
    expect(getQueueEntryActionFeedback({ action: 'restore', result, queues, queueId: 'q1', entryId: 'x' })).toEqual({
      status: 'confirmed', key: 'panel.queue.entry_action_result.restored', values: { user: 'Back Viewer', position: 2 },
    });
  });

  it('falls back to the refresh_failed warning when the reload failed or the person is not waiting there', () => {
    const warning = { status: 'warning', key: 'panel.queue.entry_action_result.refresh_failed' };
    expect(getQueueEntryActionFeedback({ action: 'restore', result: {}, refreshFailed: true, queues: null, queueId: 'q1', entryId: 'x' })).toEqual(warning);
    expect(getQueueEntryActionFeedback({ action: 'restore', result: {}, queues: queueWith([entry('x', { status: 'called' })]), queueId: 'q1', entryId: 'x' })).toEqual(warning);
    expect(getQueueEntryActionFeedback({ action: 'restore', result: {}, queues: queueWith([]), queueId: 'q1', entryId: 'x' })).toEqual(warning);
  });
});

describe('restore errors (B5, B6, B7, section 4.3)', () => {
  const fail = (error) => getQueueEntryActionFailureFeedback(error, { action: 'restore' });
  it('maps each refusal reason to its own text, and an unknown or missing reason to the generic failure', () => {
    expect(fail({ code: 'ENTRY_RESTORE_NOT_ALLOWED', status: 409, reason: 'intent_recorded' })).toEqual({ status: 'error', key: 'panel.error.entry_restore_intent_recorded' });
    expect(fail({ code: 'ENTRY_RESTORE_NOT_ALLOWED', status: 409, reason: 'other_active_entry' })).toEqual({ status: 'error', key: 'panel.error.entry_restore_other_active' });
    expect(fail({ code: 'ENTRY_RESTORE_NOT_ALLOWED', status: 409 }).key).toBe('panel.queue.action_result.failed');
    expect(fail({ code: 'ENTRY_RESTORE_NOT_ALLOWED', status: 409, reason: 'Bearer secret' }).key).toBe('panel.queue.action_result.failed');
    expect([...ABSENT_RESTORE_REFUSAL_KEYS].sort()).toEqual(['panel.error.entry_restore_intent_recorded', 'panel.error.entry_restore_other_active']);
  });

  it('maps stale and invalid transitions to the conflict text, and 400/404/409 without code to the generic failure', () => {
    expect(fail({ code: 'ENTRY_VERSION_STALE', status: 409 }).key).toBe('panel.error.entry_version_stale');
    expect(fail({ code: 'INVALID_ENTRY_TRANSITION', status: 409 }).key).toBe('panel.error.entry_version_stale');
    for (const status of [400, 404, 409]) expect(fail({ status, referenceId: 'ref-1' })).toEqual({ status: 'error', key: 'panel.queue.action_result.failed', referenceId: 'ref-1' });
    expect(fail({ code: 'QUEUE_NOT_AVAILABLE', status: 409 }).key).toBe('panel.queue.action_result.failed');
  });

  it('treats network loss, 5xx and an invalid response as an uncertain action (with Refresh queue) and keeps a safe reference', () => {
    for (const error of [{ status: 0, code: 'REQUEST_FAILED' }, { status: 503 }, { code: 'INVALID_QUEUE_ENTRY_ACTION_RESPONSE' }]) {
      expect(fail({ ...error, referenceId: 'ref-9' })).toEqual({ status: 'error', key: 'panel.queue.entry_action_result.uncertain', referenceId: 'ref-9' });
    }
    expect(QUEUE_ENTRY_REFRESH_KEYS).toEqual(expect.arrayContaining(['panel.error.entry_version_stale', 'panel.queue.entry_action_result.uncertain']));
    expect(fail({ status: 500, referenceId: 'bad id with spaces' })).not.toHaveProperty('referenceId');
    expect(fail({ status: 500, message: 'secret stack' })).not.toHaveProperty('message');
  });
});

describe('HTTP client keeps the restore refusal reason from a closed list (D-7)', () => {
  const response = (body, init = {}) => ({ ok: (init.status ?? 200) < 400, status: init.status ?? 200, headers: { get: () => null }, json: async () => body });
  const attempt = async (payload) => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({ csrfToken: 'c'.repeat(64) })).mockResolvedValueOnce(response(payload, { status: 409 }));
    let failure;
    try { await createApiClient({ fetchImpl }).request('/api/entries/e/transitions', { method: 'POST', body: '{}' }); } catch (error) { failure = error; }
    return failure;
  };
  it('propagates intent_recorded and other_active_entry, drops anything else and other codes', async () => {
    expect((await attempt({ code: 'ENTRY_RESTORE_NOT_ALLOWED', reason: 'intent_recorded' })).reason).toBe('intent_recorded');
    expect((await attempt({ code: 'ENTRY_RESTORE_NOT_ALLOWED', reason: 'other_active_entry' })).reason).toBe('other_active_entry');
    expect((await attempt({ code: 'ENTRY_RESTORE_NOT_ALLOWED', reason: 'postgres://secret' })).reason).toBeUndefined();
    expect((await attempt({ code: 'ENTRY_RESTORE_NOT_ALLOWED', reason: { a: 1 } })).reason).toBeUndefined();
    expect((await attempt({ code: 'ENTRY_VERSION_STALE', reason: 'intent_recorded' })).reason).toBeUndefined();
  });
});

describe('readAbsentGroup (D-6: absent field missing or invalid = unknown, never 0)', () => {
  it('returns null when the field is missing or malformed', () => {
    const bad = [undefined, null, 'x', [], {}, { total: -1, entries: [] }, { total: 1.5, entries: [] }, { total: 1, entries: 'x' },
      { total: 1, entries: [gone('a'), gone('b')] }, // more entries than the total
      { total: 25, entries: Array.from({ length: 21 }, (_, i) => gone(`p${i}`)) },
      { total: 1, entries: [gone('a', { version: 0 })] }, { total: 1, entries: [gone('a', { version: 1.5 })] },
      { total: 1, entries: [{ ...gone('a'), id: 7 }] }, { total: 1, entries: [{ ...gone('a'), displayName: 3, userLogin: undefined }] }];
    for (const absent of bad) expect(readAbsentGroup({ absent }), JSON.stringify(absent)).toBeNull();
    expect(readAbsentGroup(null)).toBeNull();
  });

  it('keeps a valid group as is, including the empty one and one with more people than the 20 shown', () => {
    expect(readAbsentGroup({ absent: { total: 0, entries: [] } })).toEqual({ total: 0, entries: [] });
    const entries = Array.from({ length: 20 }, (_, i) => gone(`p${i}`));
    expect(readAbsentGroup({ absent: { total: 25, entries } })).toEqual({ total: 25, entries });
  });
});

describe('plural of the counter text (B13)', () => {
  it('uses the exact Intl categories of each locale, with 0 as other', () => {
    expect(absentCountKey(1, 'en')).toBe('panel.queue.absent.count.one');
    expect(absentCountKey(0, 'en')).toBe('panel.queue.absent.count.other');
    expect(absentCountKey(3, 'pt-BR')).toBe('panel.queue.absent.count.other');
    expect(absentCountKey(0, 'pt-BR')).toBe('panel.queue.absent.count.other');
    expect(absentCountKey(1_000_000, 'es')).toBe('panel.queue.absent.count.many');
    expect(absentCountKey(2, 'xx-invalid-locale-!')).toBe('panel.queue.absent.count.other');
  });
});

describe('catalog texts (B13) are exactly the approved ones in en, es and pt-BR', () => {
  const expected = {
    'panel.queue.group.absent': ['Absent', 'Ausentes', 'Ausentes'],
    'panel.queue.absent.count.one': ['{count} person absent', '{count} persona ausente', '{count} pessoa ausente'],
    'panel.queue.absent.count.other': ['{count} people absent', '{count} personas ausentes', '{count} pessoas ausentes'],
    'panel.queue.absent.empty': ['No one is absent', 'Nadie ausente', 'Ninguém ausente'],
    'panel.queue.absent.limited': ['Showing the {shown} most recent of {total}. Older ones stay in the recent history.', 'Se muestran las {shown} más recientes de {total}. Las anteriores quedan en el historial reciente.', 'Mostrando as {shown} mais recentes de {total}. As mais antigas ficam no histórico recente.'],
    'panel.entry.action.restore': ['restore', 'restaurar', 'restaurar'],
    'panel.entry.action.restore_aria': ['Restore {user} to the queue', 'Restaurar a {user} en la cola', 'Restaurar {user} na fila'],
    'panel.queue.entry_action_result.restored': ['{user} is no longer marked absent. They are back in the queue at position {position}.', '{user} ya no figura como ausente. Volvió a la cola en la posición {position}.', '{user} deixou de constar como ausente. A pessoa voltou para a fila, na posição {position}.'],
    'panel.error.entry_restore_intent_recorded': ["{user} can't be restored: the refund or completion of the Channel Points is already recorded. To return, they need a new redemption or a manual entry.", 'No se puede restaurar a {user}: la devolución o la finalización de los puntos ya quedó registrada. Para volver, necesita un nuevo canje o una inclusión manual.', 'Não é possível restaurar {user}: a devolução ou a conclusão dos pontos já foi registrada. Para voltar, a pessoa precisa de um novo resgate ou de uma inclusão manual.'],
    'panel.error.entry_restore_other_active': ["{user} can't be restored: they already have another active entry in this queue. Check the lists above.", 'No se puede restaurar a {user}: ya tiene otra entrada activa en esta cola. Revisa las listas de arriba.', 'Não é possível restaurar {user}: a pessoa já tem outra entrada ativa nesta fila. Confira as listas acima.'],
  };
  it.each(Object.entries(expected))('%s', (key, [en, es, pt]) => {
    expect(catalogs.en[key]).toBe(en);
    expect(catalogs.es[key]).toBe(es);
    expect(catalogs['pt-BR'][key]).toBe(pt);
  });
  it('es and pt-BR also carry the Intl "many" form of the counter text', () => {
    expect(catalogs.es['panel.queue.absent.count.many']).toBe('{count} personas ausentes');
    expect(catalogs['pt-BR']['panel.queue.absent.count.many']).toBe('{count} pessoas ausentes');
  });
  it('never shows the internal label "skip/pular/saltar" in the new texts', () => {
    for (const key of Object.keys(expected)) for (const locale of Object.keys(catalogs)) expect(catalogs[locale][key]).not.toMatch(/\b(skip|pular|saltar)\b/i);
  });
});
