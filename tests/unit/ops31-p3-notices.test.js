// OPS-31 P3 (AC 6, 7, 29; QA plan U72-01..06, L72-01, U71-12 for the name list): texts of the absent, skipped, restored and
// reordered notices, the two new transitions, the optimistic version and the new error codes of the panel routes.
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { discoverCatalogBundle } from '../../apps/shared/localization/discover-catalog-bundle.mjs';
import { resolveFirstPartyCatalogRoot } from '../../apps/shared/localization/first-party-catalogs.mjs';
import { CHAT_NOTICE_KINDS, CHAT_NOTICE_MAX_LENGTH, CHAT_NOTICE_MAX_LISTED_NAMES, composeChatNotice } from '../../apps/api/src/domain/chat-notice-composer.mjs';
import { CHAT_NOTICE_MAX_STORED_NAMES, enqueueChatNotice } from '../../apps/api/src/persistence/chat-notice-outbox.mjs';
import { decideEntryTransition } from '../../apps/api/src/domain/entry-transitions.mjs';
import { createChatNoticeWorker } from '../../apps/api/src/outbox/chat-notice-worker.mjs';
import { registerLocalSession } from '../../apps/api/src/http/local-session.mjs';
import { registerQueueRoutes } from '../../apps/api/src/http/queue-routes.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = await discoverCatalogBundle(resolveFirstPartyCatalogRoot(root), { communityCatalogRoot: `${root}.local/none/` });
const catalogs = bundle.modules.chat.catalogs;
const LOCALES = ['en', 'es', 'pt-BR'];

describe('P3 notice texts', () => {
  it('L72-01: no_show, skipped, restored and reordered resolve in the three languages with their values and no placeholder left', () => {
    const params = { user: 'Viewer', queue: 'Abyss', position: 2, names: ['ana'] };
    for (const locale of LOCALES) {
      for (const kind of ['no_show', 'skipped', 'restored', 'reordered']) {
        const text = composeChatNotice({ kind, locale, catalogs, params });
        expect(text, `${locale}/${kind}`).toBeTruthy();
        expect(text).not.toMatch(/[{}]/);
        expect(text).not.toBe(catalogs[locale]['translation.unavailable']);
        expect(text).toContain('Abyss');
        if (kind !== 'reordered') expect(text).toContain('@Viewer');
        if (kind === 'skipped' || kind === 'restored') expect(text).toContain('2');
      }
    }
    expect(composeChatNotice({ kind: 'skipped', locale: 'en', catalogs, params })).toBe('@Viewer, your turn in Abyss was moved. You are now at position 2.');
    expect(composeChatNotice({ kind: 'restored', locale: 'pt-BR', catalogs, params })).toBe('@Viewer, sua ausência foi desfeita. Você voltou à fila Abyss na posição 2.');
    expect(composeChatNotice({ kind: 'no_show', locale: 'es', catalogs, params })).toBe('@Viewer, no respondiste a la llamada en la cola Abyss y se te marcó como ausente.');
  });

  it('the service group carries absence, skip and restore; the reorder has its own switch and a lower priority', () => {
    for (const kind of ['no_show', 'skipped', 'restored']) expect(CHAT_NOTICE_KINDS[kind]).toMatchObject({ switch: 'noticeService', priority: 1 });
    expect(CHAT_NOTICE_KINDS.reordered).toMatchObject({ switch: 'noticeReordered', priority: 2 });
  });

  it('U71-12: the reorder notice lists the people who moved, whole names, then "and N more" (three languages)', () => {
    const names = Array.from({ length: 14 }, (_, index) => `viewer${index + 1}`);
    const expected = { en: ' and 4 more', es: ' y 4 más', 'pt-BR': ' e mais 4' };
    for (const locale of LOCALES) {
      const text = composeChatNotice({ kind: 'reordered', locale, catalogs, params: { queue: 'Abyss', names } });
      expect(text).toContain('@viewer1, @viewer2');
      expect(text).toContain(`@viewer${CHAT_NOTICE_MAX_LISTED_NAMES}${expected[locale]}`);
      expect(text).not.toContain('@viewer11');
    }
    const few = composeChatNotice({ kind: 'reordered', locale: 'en', catalogs, params: { queue: 'Abyss', names: ['ana', 'bia'] } });
    expect(few).toBe('The order of Abyss changed. Moved: @ana, @bia. Use the queue command to see your position.');
    expect(composeChatNotice({ kind: 'reordered', locale: 'en', catalogs, params: { queue: 'Abyss', names: ['solo'] } })).toContain('Moved: @solo.');
    expect(composeChatNotice({ kind: 'reordered', locale: 'en', catalogs, params: { queue: 'Abyss', names: [] } }))
      .toBe('The order of Abyss changed. Use the queue command to see your position.');
    expect(composeChatNotice({ kind: 'reordered', locale: 'en', catalogs, params: { queue: 'Abyss' } })).not.toContain('Moved');
  });

  it('U71-12: stays within 500 characters with multi-byte names and a long queue title, never cutting a name', () => {
    const names = Array.from({ length: 30 }, (_, index) => `${'界'.repeat(39)}${index}`);
    for (const locale of LOCALES) {
      const text = composeChatNotice({ kind: 'reordered', locale, catalogs, params: { queue: '界'.repeat(500), names } });
      expect(text, locale).toBeTruthy();
      expect(Array.from(text).length).toBeLessThanOrEqual(CHAT_NOTICE_MAX_LENGTH);
      // every listed name is whole: "@" + 39 characters + its index, never a prefix of it
      for (const mention of text.match(/@\S+/g) ?? []) expect(mention).toMatch(/^@界{39}\d+[,.]?$/);
    }
    // shrinking drops names (longest list that fits), it does not drop the notice
    const fits = composeChatNotice({ kind: 'reordered', locale: 'en', catalogs, params: { queue: 'Abyss', names } });
    expect(fits.match(/@/g).length).toBeLessThan(10);
    expect(fits).toMatch(/ and \d+ more/);
  });

  it('a name with braces or a dollar sign is shown as text, never interpreted', () => {
    const text = composeChatNotice({ kind: 'reordered', locale: 'en', catalogs, params: { queue: 'Abyss', names: ['{queue}', '$&'] } });
    expect(text).toContain('@{queue}, @$&');
  });
});

describe('P3 notice worker', () => {
  it('passes the stored names to the reorder text and sends it at priority 2 only while the switch is on', async () => {
    const sent = [];
    const finished = [];
    const task = { id: 't1', attempts: 1, leaseToken: 'l', payload: { kind: 'reordered', names: ['ana', 'bia'], maxAttempts: 2 }, queue: { title: 'Abyss', noticeReordered: true } };
    const repository = {
      claimNextChatNotice: vi.fn(async () => task), finishChatNotice: vi.fn(async (ids, state) => { finished.push(state); }),
      getProductLocale: async () => ({ locale: 'en' }),
    };
    const worker = createChatNoticeWorker({ repository, twitch: { sendChatMessage: async (text, options) => { sent.push([text, options]); return { sent: true }; } }, getChatCatalogs: async () => catalogs });
    expect(await worker.processOne()).toBe('confirmed');
    expect(sent).toEqual([['The order of Abyss changed. Moved: @ana, @bia. Use the queue command to see your position.', { priority: 2 }]]);

    task.queue.noticeReordered = false;
    expect(await worker.processOne()).toBe('cancelled');
    expect(sent).toHaveLength(1);
    expect(finished.at(-1)).toMatchObject({ status: 'cancelled', errorCode: 'notice_switched_off' });
  });

  it('does not put the viewer name or the text in the log events', async () => {
    const events = [];
    const repository = {
      claimNextChatNotice: async () => ({ id: 't', attempts: 1, leaseToken: 'l', payload: { kind: 'skipped', user: 'secretviewer', position: 2, maxAttempts: 2 }, queue: { title: 'Abyss', noticeService: true } }),
      finishChatNotice: async () => undefined, getProductLocale: async () => ({ locale: 'en' }),
    };
    const worker = createChatNoticeWorker({ repository, twitch: { sendChatMessage: async () => ({ sent: true }) }, getChatCatalogs: async () => catalogs, logEvent: (event) => events.push(event) });
    await worker.processOne();
    expect(JSON.stringify(events)).not.toMatch(/secretviewer|position 2/);
    expect(events).toEqual([{ event: 'chat.notice', kind: 'skipped', outcome: 'sent' }]);
  });
});

describe('P3 reorder notice writes (fake transaction)', () => {
  function fakeTx() {
    const rows = [];
    return {
      rows,
      outbox: {
        findUnique: async ({ where }) => rows.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null,
        create: async ({ data }) => { rows.push({ id: String(rows.length + 1), status: 'pending', ...data }); },
        update: async ({ where, data }) => { Object.assign(rows.find((row) => row.id === where.id), data); },
        updateMany: async () => ({ count: 0 }),
      },
    };
  }
  const queue = { id: 'q1', noticeReordered: true };
  const at = (seconds) => new Date(Date.UTC(2030, 0, 1, 12, 0, seconds));

  it('U71-08: moves in one window leave one row with the union of names; a new window writes a new row', async () => {
    const tx = fakeTx();
    expect(await enqueueChatNotice(tx, { kind: 'reordered', queue, now: at(1), names: ['ana', 'bia'] })).toEqual({ status: 'enqueued' });
    expect(await enqueueChatNotice(tx, { kind: 'reordered', queue, now: at(5), names: ['bia', 'caio'] })).toEqual({ status: 'merged' });
    expect(tx.rows).toHaveLength(1);
    expect(tx.rows[0].payload).toMatchObject({ kind: 'reordered', priority: 2, names: ['ana', 'bia', 'caio'] });
    expect(await enqueueChatNotice(tx, { kind: 'reordered', queue, now: at(40), names: ['dani'] })).toEqual({ status: 'enqueued' });
    expect(tx.rows).toHaveLength(2);
  });

  it('keeps at most the stored-name cap and writes nothing when the switch is off', async () => {
    const tx = fakeTx();
    const many = Array.from({ length: CHAT_NOTICE_MAX_STORED_NAMES + 20 }, (_, index) => `v${index}`);
    await enqueueChatNotice(tx, { kind: 'reordered', queue, now: at(1), names: many });
    await enqueueChatNotice(tx, { kind: 'reordered', queue, now: at(2), names: ['extra'] });
    expect(tx.rows[0].payload.names).toHaveLength(CHAT_NOTICE_MAX_STORED_NAMES);
    expect(await enqueueChatNotice(tx, { kind: 'reordered', queue: { id: 'q1', noticeReordered: false }, now: at(3), names: ['x'] })).toEqual({ status: 'switched_off' });
  });

  it('individual skip and restore notices are keyed by entry and version (a repeat of the same version is a duplicate)', async () => {
    const tx = fakeTx();
    const service = { id: 'q1', noticeService: true };
    expect(await enqueueChatNotice(tx, { kind: 'skipped', queue: service, now: at(1), entryId: 'e1', entryVersion: 4, user: 'ana', position: 2 })).toEqual({ status: 'enqueued' });
    expect(await enqueueChatNotice(tx, { kind: 'skipped', queue: service, now: at(2), entryId: 'e1', entryVersion: 4, user: 'ana', position: 2 })).toEqual({ status: 'duplicate' });
    expect(await enqueueChatNotice(tx, { kind: 'restored', queue: service, now: at(3), entryId: 'e1', entryVersion: 6, user: 'ana', position: 2 })).toEqual({ status: 'enqueued' });
    expect(tx.rows.map((row) => row.idempotencyKey)).toEqual(['chat.notice:skipped:e1:4', 'chat.notice:restored:e1:6']);
    expect(tx.rows[0].payload).toMatchObject({ kind: 'skipped', user: 'ana', position: 2, priority: 1 });
  });
});

describe('P3 transitions (domain)', () => {
  it('U72-02/U72-03: skip (called -> waiting) and restore (no_show -> waiting) are allowed for the panel with their own label, with no financial effect', () => {
    const policy = { refundOnNoShow: true, refundIfRemovedWhileCalled: true, refundIfViewerLeavesWhileCalled: true };
    expect(decideEntryTransition({ from: 'called', to: 'waiting', source: 'redemption', origin: 'panel', trigger: 'panel_action', reason: 'operator_skip', policy }))
      .toMatchObject({ accepted: true, nextStatus: 'waiting', financialDecision: 'no_operation' });
    expect(decideEntryTransition({ from: 'no_show', to: 'waiting', source: 'redemption', origin: 'panel', trigger: 'panel_action', reason: 'operator_restore', policy }))
      .toMatchObject({ accepted: true, nextStatus: 'waiting', financialDecision: 'no_operation' });
  });

  it.each([
    ['called', 'operator_restore', 'panel_action'],
    ['no_show', 'operator_skip', 'panel_action'],
    ['called', 'operator_skip', 'timer'],
    ['called', 'operator_skip', 'moderator_chat'],
    ['no_show', 'operator_restore', 'viewer'],
    ['called', null, 'panel_action'],
  ])('refuses %s -> waiting with label %s and trigger %s', (from, reason, trigger) => {
    expect(() => decideEntryTransition({ from, to: 'waiting', source: 'redemption', origin: 'panel', trigger, reason }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_ENTRY_TRANSITION' }));
  });

  it.each(['waiting', 'in_progress', 'completed', 'removed'])('%s -> waiting stays refused', (from) => {
    expect(() => decideEntryTransition({ from, to: 'waiting', origin: 'panel', trigger: 'panel_action', reason: 'operator_skip' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_ENTRY_TRANSITION' }));
  });
});

async function harness({ transitionEntry = vi.fn(), moveWaitingEntry = vi.fn() } = {}) {
  const app = Fastify();
  registerLocalSession(app, { port: 3000 });
  const repository = {
    getProductLocale: async () => ({ locale: 'pt-BR', revision: 1 }), beginPanelOperation: async () => ({ status: 'started' }), completePanelOperation: async () => true,
    moveWaitingEntry,
  };
  registerQueueRoutes(app, { repository, domainService: { transitionEntry }, integrations: { status: 'not_configured', twitch: null }, clearConfirmation: null, publicBaseUrl: 'https://localhost:3000', productVersion: 'v0.1.0-1234567-alpha' });
  const rawInject = app.inject.bind(app);
  app.inject = (options) => rawInject({ ...options, headers: { ...(options.headers ?? {}), 'idempotency-key': randomUUID() } });
  const session = await rawInject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
  const cookie = session.cookies[0];
  const headers = { host: 'localhost:3000', origin: 'https://localhost:3000', cookie: `${cookie.name}=${cookie.value}`, 'x-csrf-token': session.json().csrfToken };
  return { app, headers, transitionEntry, moveWaitingEntry };
}
const post = (h, url, payload) => h.app.inject({ method: 'POST', url, headers: h.headers, payload });

describe('P3 routes', () => {
  it('sends skip and restore as panel_action with the version the panel saw', async () => {
    const transitionEntry = vi.fn(async ({ to }) => ({ id: 'e1', status: to, financialDecision: 'no_operation' }));
    const h = await harness({ transitionEntry });
    expect((await post(h, '/api/entries/e1/transitions', { to: 'waiting', reason: 'operator_skip', expectedVersion: 7 })).statusCode).toBe(200);
    expect(transitionEntry).toHaveBeenLastCalledWith(expect.objectContaining({ to: 'waiting', reason: 'operator_skip', trigger: 'panel_action', origin: 'panel', expectedVersion: 7 }));
    expect((await post(h, '/api/entries/e1/transitions', { to: 'waiting', reason: 'operator_restore' })).statusCode).toBe(200);
    expect(transitionEntry.mock.lastCall[0]).not.toHaveProperty('expectedVersion');
    await h.app.close();
  });

  it.each([
    [{ to: 'waiting', reason: 'operator_removed' }],
    [{ to: 'waiting', reason: 'queue_cleared' }],
    [{ to: 'removed', reason: 'operator_skip' }],
    [{ to: 'waiting', reason: 'operator_skip', expectedVersion: 0 }],
    [{ to: 'waiting', reason: 'operator_skip', expectedVersion: '3' }],
    [{ to: 'waiting', reason: 'operator_skip', expectedVersion: 1.5 }],
  ])('refuses %j with 400 before the domain service', async (payload) => {
    const h = await harness();
    const response = await post(h, '/api/entries/e1/transitions', payload);
    expect(response.statusCode).toBe(400);
    expect(h.transitionEntry).not.toHaveBeenCalled();
    await h.app.close();
  });

  it('G-9: ENTRY_VERSION_STALE answers 409 with the code and the current version, no internal data', async () => {
    const transitionEntry = vi.fn().mockRejectedValue(Object.assign(new Error('private detail'), { code: 'ENTRY_VERSION_STALE', currentVersion: 9 }));
    const h = await harness({ transitionEntry });
    const response = await post(h, '/api/entries/e1/transitions', { to: 'waiting', reason: 'operator_skip', expectedVersion: 3 });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'ENTRY_VERSION_STALE', version: 9, error: 'A pessoa mudou de estado desde que a fila foi carregada. Atualize o painel.' });
    expect(response.body).not.toContain('private detail');
    await h.app.close();
  });

  it.each([
    ['intent_recorded', 'Não é possível restaurar: a devolução ou conclusão dos pontos já foi registrada.'],
    ['other_active_entry', 'Essa pessoa já tem outra entrada ativa nesta fila.'],
  ])('G-9: ENTRY_RESTORE_NOT_ALLOWED (%s) answers 409 with code and reason only', async (reason, text) => {
    const transitionEntry = vi.fn().mockRejectedValue(Object.assign(new Error('private detail'), { code: 'ENTRY_RESTORE_NOT_ALLOWED', reason }));
    const h = await harness({ transitionEntry });
    const response = await post(h, '/api/entries/e1/transitions', { to: 'waiting', reason: 'operator_restore' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'ENTRY_RESTORE_NOT_ALLOWED', reason, error: text });
    await h.app.close();
  });

  it('an unknown restore reason is not echoed', async () => {
    const transitionEntry = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'ENTRY_RESTORE_NOT_ALLOWED', reason: 'secret internal value' }));
    const h = await harness({ transitionEntry });
    const response = await post(h, '/api/entries/e1/transitions', { to: 'waiting', reason: 'operator_restore' });
    expect(response.json()).not.toHaveProperty('reason');
    expect(response.body).not.toContain('secret internal value');
    await h.app.close();
  });

  it('the panel move sends expectedVersion and a stale one answers 409 with the current version', async () => {
    const moveWaitingEntry = vi.fn()
      .mockResolvedValueOnce({ status: 'moved' })
      .mockRejectedValueOnce(Object.assign(new Error('private'), { code: 'ENTRY_VERSION_STALE', currentVersion: 5 }));
    const h = await harness({ moveWaitingEntry });
    expect((await post(h, '/api/queues/q1/move', { entryId: 'e1', position: 2, expectedVersion: 4 })).statusCode).toBe(200);
    expect(moveWaitingEntry).toHaveBeenLastCalledWith({ queueId: 'q1', entryId: 'e1', position: 2, expectedVersion: 4 });
    const stale = await post(h, '/api/queues/q1/move', { entryId: 'e1', position: 2, expectedVersion: 4 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ code: 'ENTRY_VERSION_STALE', version: 5, error: 'A pessoa mudou de estado desde que a fila foi carregada. Atualize o painel.' });
    expect((await post(h, '/api/queues/q1/move', { entryId: 'e1', position: 2, expectedVersion: 0 })).statusCode).toBe(400);
    expect((await post(h, '/api/queues/q1/move', { entryId: 'e1', position: 2 })).statusCode).toBe(200);
    expect(moveWaitingEntry.mock.lastCall[0]).not.toHaveProperty('expectedVersion');
    await h.app.close();
  });
});
