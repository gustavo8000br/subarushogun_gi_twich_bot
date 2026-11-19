// OPS-31 P6b (FT-90, AC 40; design v2.8 3.11 B 6, 3.12): the worker-side live-session service with a FAKE repository and a FAKE Twitch
// adapter: event handling, reconciliation (start / reconnect / periodic), the two-negative close, the `unknown` rule, single-flight, the
// revocation flag, the offline-without-id path and the log hygiene (no stream id, title, login or viewer id in any log line).
import { describe, expect, it, vi } from 'vitest';
import { createLiveSessionService, LIVE_CONFIRM_DELAY_MS, LIVE_REVOKED_FLAG } from '../../apps/api/src/twitch/live-session-service.mjs';

const T0 = new Date('2030-01-01T12:00:00.000Z');
const BROADCASTER = 'broadcaster-777';

function harness({ latest = null, results = {}, twitchAnswers = [], now = T0 } = {}) {
  const calls = [];
  const state = { latest, now: new Date(now) };
  const repository = {
    applyOnline: vi.fn(async (input) => { calls.push(['online', input]); return results.online ?? { decision: 'opened', merged: false, reconcile: false }; }),
    applyOffline: vi.fn(async (input) => { calls.push(['offline', input]); return results.offline ?? { decision: 'closed', merged: false, reconcile: false }; }),
    applyReconcileClose: vi.fn(async (input) => { calls.push(['reconcile_close', input]); return results.close ?? { decision: 'closed', merged: false, reconcile: false }; }),
    getLatest: vi.fn(async () => state.latest),
  };
  const answers = [...twitchAnswers];
  const twitch = { getCurrentStream: vi.fn(async () => { const next = answers.shift(); if (next instanceof Error) throw next; return next ?? { state: 'unknown', reason: 'lookup_error' }; }) };
  const logs = [];
  const sleeps = [];
  const sleep = vi.fn(async (ms) => { sleeps.push(ms); state.now = new Date(state.now.getTime() + ms); });
  const service = createLiveSessionService({
    repository, getTwitch: () => twitch, broadcasterId: BROADCASTER, clock: () => state.now, sleep,
    logEvent: (event) => logs.push(event),
  });
  return { service, repository, twitch, logs, sleeps, sleep, calls, state };
}
const openRow = (extra = {}) => ({ streamId: 'stream-open-1', sessionId: 'sess-1', startedAt: new Date('2030-01-01T09:00:00.000Z'), endedAt: null, source: 'event', ...extra });
const closedRow = (extra = {}) => openRow({ endedAt: new Date('2030-01-01T10:00:00.000Z'), ...extra });
const live = (extra = {}) => ({ state: 'live', id: 'stream-helix-9', type: 'live', startedAt: new Date('2030-01-01T11:30:00.000Z'), ...extra });
const logged = (logs, event) => logs.filter((entry) => entry.event === event);

describe('OPS-31 P6b live-session service: events (FX)', () => {
  it('online passes the stream to the repository and logs `live_session.opened {source, merged}`', async () => {
    const h = harness({ results: { online: { decision: 'opened', merged: true, reconcile: false } } });
    await h.service.onOnline({ streamId: 's1', type: 'live', startedAt: T0 });
    expect(h.repository.applyOnline).toHaveBeenCalledWith({ broadcasterId: BROADCASTER, streamId: 's1', type: 'live', startedAt: T0, source: 'event' });
    expect(logged(h.logs, 'live_session.opened')).toEqual([expect.objectContaining({ details: { source: 'event', merged: true } })]);
  });

  it.each([
    ['ignored_type', 'live_session.ignored_type'], ['duplicate_ignored', 'live_session.duplicate_ignored'], ['late_online_ignored', 'live_session.late_online_ignored'],
  ])('online decision %s logs %s', async (decision, event) => {
    const h = harness({ results: { online: { decision, merged: false, reconcile: false } } });
    await h.service.onOnline({ streamId: 's1', type: decision === 'ignored_type' ? 'rerun' : 'live', startedAt: T0 });
    expect(logged(h.logs, event)).toHaveLength(1);
    if (decision === 'ignored_type') expect(logged(h.logs, event)[0].details).toEqual({ type: 'rerun' });
  });

  it('an unexpected type string is logged as `other` (closed list, no free text)', async () => {
    const h = harness({ results: { online: { decision: 'ignored_type', merged: false, reconcile: false } } });
    await h.service.onOnline({ streamId: 's1', type: 'My secret title', startedAt: T0 });
    expect(logged(h.logs, 'live_session.ignored_type')[0].details).toEqual({ type: 'other' });
  });

  it('offline with a stream id closes via the repository at the receive time and logs `closed {source, durationBucket}`', async () => {
    const h = harness({ latest: openRow() });
    await h.service.onOffline({ streamId: 'stream-open-1', receivedAt: T0 });
    expect(h.repository.applyOffline).toHaveBeenCalledWith({ broadcasterId: BROADCASTER, streamId: 'stream-open-1', receivedAt: T0 });
    expect(logged(h.logs, 'live_session.closed')).toEqual([expect.objectContaining({ details: expect.objectContaining({ source: 'event', durationBucket: expect.any(String) }) })]);
  });

  it('offline of an unknown id writes nothing and asks for exactly one reconciliation', async () => {
    const h = harness({ results: { offline: { decision: 'unknown_stream', merged: false, reconcile: true } }, twitchAnswers: [{ state: 'unknown', reason: 'timeout' }] });
    await h.service.onOffline({ streamId: 'sX', receivedAt: T0 });
    expect(h.twitch.getCurrentStream).toHaveBeenCalledTimes(1);
    expect(h.repository.applyReconcileClose).not.toHaveBeenCalled();
    expect(logged(h.logs, 'live_session.reconcile')[0].details).toEqual({ trigger: 'unknown_offline', result: 'unknown' });
  });

  it('offline WITHOUT a stream id (Twurple exposes none) never closes directly: it asks for the two-check reconciliation', async () => {
    const h = harness({ latest: openRow(), twitchAnswers: [{ state: 'offline' }, { state: 'offline' }] });
    await h.service.onOffline({ streamId: null, receivedAt: new Date('2030-01-01T11:55:00.000Z') });
    expect(h.repository.applyOffline).not.toHaveBeenCalled();
    expect(h.repository.applyReconcileClose).toHaveBeenCalledWith({ broadcasterId: BROADCASTER, streamId: 'stream-open-1', at: new Date('2030-01-01T11:55:00.000Z') });
  });

  it('an offline without id while Helix still says live changes nothing', async () => {
    const h = harness({ latest: openRow(), twitchAnswers: [live({ id: 'stream-open-1' })] });
    await h.service.onOffline({ streamId: null, receivedAt: T0 });
    expect(h.repository.applyReconcileClose).not.toHaveBeenCalled();
    expect(logged(h.logs, 'live_session.reconcile')[0].details.result).toBe('unchanged');
  });

  it('a repository failure propagates to the runtime dispatch (which isolates it) and its message is never logged', async () => {
    const h = harness();
    h.repository.applyOnline.mockRejectedValueOnce(new Error('db down: password=hunter2'));
    await expect(h.service.onOnline({ streamId: 's1', type: 'live', startedAt: T0 })).rejects.toThrow();
    expect(JSON.stringify(h.logs)).not.toMatch(/hunter2/);
  });
});

describe('OPS-31 P6b live-session service: reconciliation (TW40-02, FX)', () => {
  it('live and no open session: opens one with source `reconciled` and the Helix id/start', async () => {
    const h = harness({ latest: null, twitchAnswers: [live()] });
    const result = await h.service.reconcile('startup');
    expect(h.repository.applyOnline).toHaveBeenCalledWith({ broadcasterId: BROADCASTER, streamId: 'stream-helix-9', type: 'live', startedAt: new Date('2030-01-01T11:30:00.000Z'), source: 'reconciled' });
    expect(result).toBe('opened');
    expect(logged(h.logs, 'live_session.reconcile')[0].details).toEqual({ trigger: 'startup', result: 'opened' });
  });

  it('live with the same id as the open row: unchanged (no write)', async () => {
    const h = harness({ latest: openRow(), twitchAnswers: [live({ id: 'stream-open-1' })] });
    expect(await h.service.reconcile('periodic')).toBe('unchanged');
    expect(h.repository.applyOnline).not.toHaveBeenCalled();
  });

  it('live with ANOTHER id than the open row: delegated to the repository (it closes the old row first, then opens)', async () => {
    const h = harness({ latest: openRow(), twitchAnswers: [live()] });
    expect(await h.service.reconcile('reconnect')).toBe('opened');
    expect(h.repository.applyOnline).toHaveBeenCalledTimes(1);
  });

  it('a Helix type other than `live` is ignored (Q-4): no write, logged as ignored_type', async () => {
    const h = harness({ latest: null, twitchAnswers: [live({ type: 'rerun' })] });
    expect(await h.service.reconcile('startup')).toBe('unchanged');
    expect(h.repository.applyOnline).not.toHaveBeenCalled();
    expect(logged(h.logs, 'live_session.ignored_type')).toHaveLength(1);
  });

  it('offline and no open session: unchanged', async () => {
    const h = harness({ latest: closedRow(), twitchAnswers: [{ state: 'offline' }] });
    expect(await h.service.reconcile('periodic')).toBe('unchanged');
    expect(h.twitch.getCurrentStream).toHaveBeenCalledTimes(1);
  });

  it('offline and an open session: waits the confirmation delay, checks again, closes ONLY after two negatives (close time = first negative)', async () => {
    const h = harness({ latest: openRow(), twitchAnswers: [{ state: 'offline' }, { state: 'offline' }] });
    const result = await h.service.reconcile('periodic');
    expect(result).toBe('closed');
    expect(h.sleeps).toEqual([LIVE_CONFIRM_DELAY_MS]);
    expect(LIVE_CONFIRM_DELAY_MS).toBe(30_000);
    expect(h.repository.applyReconcileClose).toHaveBeenCalledWith({ broadcasterId: BROADCASTER, streamId: 'stream-open-1', at: T0 });
  });

  it('ONE negative never closes: the second check says live, so nothing is written', async () => {
    const h = harness({ latest: openRow(), twitchAnswers: [{ state: 'offline' }, live({ id: 'stream-open-1' })] });
    expect(await h.service.reconcile('periodic')).toBe('unchanged');
    expect(h.repository.applyReconcileClose).not.toHaveBeenCalled();
  });

  it.each([
    ['the first check is unknown', [{ state: 'unknown', reason: 'timeout' }]],
    ['an error between the two negatives resets the count', [{ state: 'offline' }, { state: 'unknown', reason: 'twitch_unavailable' }]],
    ['the check throws', [new Error('network')]],
  ])('%s: nothing closes and the result is unknown', async (_label, answers) => {
    const h = harness({ latest: openRow(), twitchAnswers: answers });
    expect(await h.service.reconcile('periodic')).toBe('unknown');
    expect(h.repository.applyReconcileClose).not.toHaveBeenCalled();
  });

  it('a null right after an online is treated as possibly stale: no close and no second call (Twurple warns Helix can lag)', async () => {
    const recent = openRow({ startedAt: new Date(T0.getTime() - 20_000) });
    const h = harness({ latest: recent, twitchAnswers: [{ state: 'offline' }] });
    expect(await h.service.reconcile('periodic')).toBe('unchanged');
    expect(h.repository.applyReconcileClose).not.toHaveBeenCalled();
    expect(h.sleeps).toEqual([]);
  });

  it('is single-flight: concurrent calls share one run (one Helix call)', async () => {
    const h = harness({ latest: null, twitchAnswers: [live()] });
    const [a, b] = await Promise.all([h.service.reconcile('startup'), h.service.reconcile('periodic')]);
    expect(a).toBe(b);
    expect(h.twitch.getCurrentStream).toHaveBeenCalledTimes(1);
  });

  it('works without a Twitch adapter (not yet created): unknown, nothing written', async () => {
    const h = harness();
    const service = createLiveSessionService({ repository: h.repository, getTwitch: () => null, broadcasterId: BROADCASTER, logEvent: () => undefined });
    expect(await service.reconcile('startup')).toBe('unknown');
  });
});

describe('OPS-31 P6b live-session service: revocation flag (U40-04)', () => {
  it('markRevoked sets the flag; it clears only after a new subscription AND one good reconciliation', async () => {
    const h = harness({ latest: null, twitchAnswers: [{ state: 'unknown', reason: 'timeout' }, { state: 'offline' }, { state: 'offline' }] });
    expect(h.service.isRevoked()).toBe(false);
    h.service.markRevoked();
    expect(h.service.isRevoked()).toBe(true);
    await h.service.reconcile('periodic'); // unknown, no subscription yet
    expect(h.service.isRevoked()).toBe(true);
    await h.service.reconcile('periodic'); // good answer but no new subscription noted yet
    expect(h.service.isRevoked()).toBe(true);
    h.service.noteSubscribed();
    expect(h.service.isRevoked()).toBe(true); // still needs one good reconciliation
    await h.service.reconcile('reconnect');
    expect(h.service.isRevoked()).toBe(false);
    expect(LIVE_REVOKED_FLAG).toBe('revoked');
  });

  it('noteSubscribed without a revocation changes nothing', () => {
    const h = harness();
    h.service.noteSubscribed();
    expect(h.service.isRevoked()).toBe(false);
  });
});

describe('OPS-31 P6b live-session service: log hygiene', () => {
  it('no log line contains a stream id, the broadcaster id, a title or a login', async () => {
    const h = harness({ latest: openRow(), results: { online: { decision: 'opened', merged: false, reconcile: false } }, twitchAnswers: [{ state: 'offline' }, { state: 'offline' }, live({ id: 'stream-helix-9' })] });
    await h.service.onOnline({ streamId: 'stream-open-1', type: 'live', startedAt: T0 });
    await h.service.onOffline({ streamId: 'stream-open-1', receivedAt: T0 });
    await h.service.reconcile('periodic');
    const text = JSON.stringify(h.logs);
    for (const secret of ['stream-open-1', 'stream-helix-9', BROADCASTER, 'sess-1']) expect(text).not.toContain(secret);
    expect(h.logs.length).toBeGreaterThan(0);
    for (const entry of h.logs) expect(entry.source).toBe('twitch.live_session');
  });
});
