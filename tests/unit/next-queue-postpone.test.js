import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  getQueueEntryActionFailureFeedback,
  getQueueEntryActionFeedback,
  performQueueEntryAction,
  performQueueEntryActionWithRefresh,
  QUEUE_ENTRY_REFRESH_KEYS,
} from '../../apps/frontend/features/queues/queue-entry-actions.mjs';

// OPS-31 K72-01a ("Adiar"): unit level. The jsdom file covers the row; the browser script covers the whole flow.
const parse = (locale) => Object.fromEntries(readFileSync(new URL(`../../apps/shared/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8')
  .split('\n').filter((line) => line.includes('\t')).map((line) => { const i = line.indexOf('\t'); return [line.slice(0, i), line.slice(i + 1)]; }));
const catalogs = { en: parse('en'), es: parse('es'), 'pt-BR': parse('pt-BR') };

const entry = (id, over = {}) => ({ id, userId: `uid-${id}`, userLogin: id, displayName: id.toUpperCase(), status: 'waiting', priorityClass: 'standard', version: 3, ...over });
const queueWith = (entries) => [{ id: 'q1', slug: 'arena', title: 'Arena', isOpen: true, entries }];

describe('postpone request (A1)', () => {
  it('posts called -> waiting with the internal label operator_skip and the version the operator saw', async () => {
    const request = vi.fn().mockResolvedValue({ id: 'e1', status: 'waiting', financialDecision: 'no_operation' });
    await performQueueEntryAction({ request, queueId: 'q1', entryId: 'e1', action: 'postpone', expectedVersion: 7 });
    expect(request).toHaveBeenCalledTimes(1);
    const [path, options] = request.mock.calls[0];
    expect(path).toBe('/api/entries/e1/transitions');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ to: 'waiting', reason: 'operator_skip', expectedVersion: 7 });
  });

  it('refuses to send without an integer version, and never sends the version for other transitions', async () => {
    const request = vi.fn().mockResolvedValue({ id: 'e1', status: 'removed' });
    for (const expectedVersion of [undefined, 0, 1.5, '3']) {
      await expect(performQueueEntryAction({ request, queueId: 'q1', entryId: 'e1', action: 'postpone', expectedVersion }))
        .rejects.toMatchObject({ code: 'INVALID_QUEUE_ENTRY_ACTION_REQUEST' });
    }
    expect(request).not.toHaveBeenCalled();
    await performQueueEntryAction({ request, queueId: 'q1', entryId: 'e1', action: 'remove', expectedVersion: 9 });
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ to: 'removed', reason: 'operator_removed' });
  });

  it('rejects a response that is not a waiting entry with the same id', async () => {
    for (const bad of [{ id: 'e1', status: 'called' }, { id: 'other', status: 'waiting' }, null]) {
      const request = vi.fn().mockResolvedValue(bad);
      await expect(performQueueEntryAction({ request, queueId: 'q1', entryId: 'e1', action: 'postpone', expectedVersion: 2 }))
        .rejects.toMatchObject({ code: 'INVALID_QUEUE_ENTRY_ACTION_RESPONSE' });
    }
  });
});

describe('postpone success text (A1-A4)', () => {
  it('reads user and position from the RELOADED queue, never from the transition response', async () => {
    const reloaded = queueWith([entry('a'), entry('c', { displayName: 'Called Viewer', position: 2 }), entry('b')]);
    const request = vi.fn()
      .mockResolvedValueOnce({ id: 'c', status: 'waiting', position: 99 })
      .mockResolvedValueOnce(reloaded);
    const { result, queues, refreshFailed } = await performQueueEntryActionWithRefresh({ request, queueId: 'q1', entryId: 'c', action: 'postpone', expectedVersion: 4 });
    expect(refreshFailed).toBe(false);
    expect(request.mock.calls[1][0]).toBe('/api/queues');
    expect(getQueueEntryActionFeedback({ action: 'postpone', result, queues, queueId: 'q1', entryId: 'c' })).toEqual({
      status: 'confirmed', key: 'panel.queue.entry_action_result.postponed', values: { user: 'Called Viewer', position: 2 },
    });
  });

  it.each([[0, 1], [1, 2], [3, 4]])('shows the global position the list reports (%i ahead -> position %i)', (_, position) => {
    const queues = queueWith([entry('c', { position })]);
    expect(getQueueEntryActionFeedback({ action: 'postpone', result: {}, queues, queueId: 'q1', entryId: 'c' }).values.position).toBe(position);
  });

  it('falls back to the refresh_failed text when the reload failed or the person is not waiting in the reloaded queue', () => {
    const fallback = { status: 'warning', key: 'panel.queue.entry_action_result.refresh_failed' };
    expect(getQueueEntryActionFeedback({ action: 'postpone', result: {}, refreshFailed: true, queues: null, queueId: 'q1', entryId: 'c' })).toEqual(fallback);
    expect(getQueueEntryActionFeedback({ action: 'postpone', result: {}, queues: queueWith([entry('c', { status: 'called', position: null })]), queueId: 'q1', entryId: 'c' })).toEqual(fallback);
    expect(getQueueEntryActionFeedback({ action: 'postpone', result: {}, queues: queueWith([]), queueId: 'q1', entryId: 'c' })).toEqual(fallback);
    expect(getQueueEntryActionFeedback({ action: 'postpone', result: {}, queues: queueWith([entry('c', { position: null })]), queueId: 'q1', entryId: 'c' })).toEqual(fallback);
  });

  it('does not promise that the chat notice was delivered', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      expect(catalog['panel.queue.entry_action_result.postponed'], locale).not.toMatch(/chat/i);
    }
  });
});

describe('postpone errors (A6, A7)', () => {
  it('maps a stale version and an invalid transition to the same conflict text; the clicked action does not matter', () => {
    for (const code of ['ENTRY_VERSION_STALE', 'INVALID_ENTRY_TRANSITION']) {
      for (const action of ['postpone', 'attend', undefined]) {
        expect(getQueueEntryActionFailureFeedback({ code, status: 409 }, { action }).key).toBe('panel.error.entry_version_stale');
      }
    }
  });

  it('maps an unknown outcome (offline, 5xx, invalid response) of a postpone to the "may have been recorded" text, keeping a safe reference', () => {
    const referenceId = '33333333-3333-4333-8333-333333333333';
    for (const error of [{ status: 0 }, { status: 500, code: 'INTERNAL_ERROR', referenceId }, { status: 503 }, { code: 'INVALID_QUEUE_ENTRY_ACTION_RESPONSE' }]) {
      expect(getQueueEntryActionFailureFeedback(error, { action: 'postpone' }).key).toBe('panel.queue.entry_action_result.uncertain');
    }
    expect(getQueueEntryActionFailureFeedback({ status: 500, referenceId }, { action: 'postpone' }).referenceId).toBe(referenceId);
    // not for other actions, which keep the generic failure
    expect(getQueueEntryActionFailureFeedback({ status: 500 }, { action: 'attend' }).key).toBe('panel.queue.action_result.failed');
  });

  it('keeps a definite refusal (400, 404, 409 without code) on the generic failure, and never leaks the server message', () => {
    for (const status of [400, 404, 409]) {
      const feedback = getQueueEntryActionFailureFeedback({ status, message: 'private detail', stack: 'at x' }, { action: 'postpone' });
      expect(feedback).toEqual({ status: 'error', key: 'panel.queue.action_result.failed' });
    }
  });

  it('offers "Refresh queue" exactly for the two keys where the list may be out of date', () => {
    expect([...QUEUE_ENTRY_REFRESH_KEYS].sort()).toEqual(['panel.error.entry_version_stale', 'panel.queue.entry_action_result.uncertain']);
  });
});

describe('postpone texts in en, es and pt-BR (A11)', () => {
  const expected = {
    en: {
      'panel.entry.action.postpone': 'postpone',
      'panel.entry.action.postpone_aria': 'Postpone {user}: they go back to the waiting list',
      'panel.queue.entry_action_result.postponed': "{user}'s turn was postponed. They stay in the queue, now at position {position}.",
      'panel.queue.entry_action_result.uncertain': 'The action may have been recorded. Refresh the queue before trying again.',
    },
    es: {
      'panel.entry.action.postpone': 'aplazar',
      'panel.entry.action.postpone_aria': 'Aplazar a {user}: vuelve a la lista de espera',
      'panel.queue.entry_action_result.postponed': 'Se aplazó el turno de {user}. Sigue en la cola, ahora en la posición {position}.',
      'panel.queue.entry_action_result.uncertain': 'Es posible que la acción se haya registrado. Actualiza la cola antes de intentarlo de nuevo.',
    },
    'pt-BR': {
      'panel.entry.action.postpone': 'adiar',
      'panel.entry.action.postpone_aria': 'Adiar {user}: volta para a lista de espera',
      'panel.queue.entry_action_result.postponed': 'A vez de {user} foi adiada. A pessoa continua na fila, agora na posição {position}.',
      'panel.queue.entry_action_result.uncertain': 'A ação pode ter sido registrada. Atualize a fila antes de tentar de novo.',
    },
  };
  it.each(Object.keys(expected))('%s carries the approved texts verbatim, and the visible label is the start of the aria-label (WCAG 2.5.3)', (locale) => {
    for (const [key, value] of Object.entries(expected[locale])) expect(catalogs[locale][key], key).toBe(value);
    expect(catalogs[locale]['panel.entry.action.postpone_aria'].toLowerCase().startsWith(catalogs[locale]['panel.entry.action.postpone'])).toBe(true);
  });

  it('never shows "pular", "skip" or "saltar" in the new texts', () => {
    for (const locale of Object.keys(expected)) {
      for (const key of Object.keys(expected.en)) expect(catalogs[locale][key], `${locale} ${key}`).not.toMatch(/pular|skip|saltar/i);
    }
  });

  it('registers the placeholders of the two new texts in the panel catalog registry', async () => {
    const { PANEL_PLACEHOLDERS } = await import('../../apps/shared/panel/panel-catalog.mjs');
    expect(PANEL_PLACEHOLDERS['panel.entry.action.postpone_aria']).toEqual(['user']);
    expect(PANEL_PLACEHOLDERS['panel.queue.entry_action_result.postponed']).toEqual(['user', 'position']);
  });
});
