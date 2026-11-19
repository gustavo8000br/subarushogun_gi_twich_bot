// OPS-31 P6b (FT-90, AC 40; design v2.8 3.11 B, 3.12): the pure live-session reducer. No I/O, no clock, no queue repository.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyLiveEvent, DEFAULT_MERGE_MINUTES, MERGE_MINUTES_RANGE, parseMergeMinutes } from '../../apps/api/src/domain/live-session.mjs';

const at = (iso) => new Date(`2030-01-01T${iso}.000Z`);
const WINDOW = 10 * 60_000;
const ids = () => { let n = 0; return () => `new-session-${++n}`; };
const row = (streamId, sessionId, start, end = null, source = 'event') => ({ streamId, sessionId, startedAt: at(start), endedAt: end ? at(end) : null, source });
const online = (streamId, start, extra = {}) => ({ kind: 'online', streamId, type: 'live', startedAt: at(start), ...extra });
const offline = (streamId, received) => ({ kind: 'offline', streamId, receivedAt: at(received) });
const codeOf = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };
const run = (rows, event, now = '12:00:00', window = WINDOW) => applyLiveEvent({ rows }, event, at(now), window, ids());

describe('OPS-31 P6b live-session reducer (U40-01)', () => {
  it('opens a first session from a `live` online with a new session id', () => {
    const result = run([], online('s1', '10:00:00'));
    expect(result.decision).toBe('opened');
    expect(result.merged).toBe(false);
    expect(result.actions).toEqual([{ op: 'open', row: { streamId: 's1', sessionId: 'new-session-1', startedAt: at('10:00:00'), endedAt: null, source: 'event' } }]);
  });

  it.each(['rerun', 'premiere', 'playlist', 'watch_party', '', undefined, 'LIVE'])('only type `live` opens a session: %s is ignored and writes nothing (Q-4)', (type) => {
    const result = run([], online('s1', '10:00:00', { type }));
    expect(result).toMatchObject({ decision: 'ignored_type', actions: [], reconcile: false });
  });

  it('a duplicate online (same id, open or closed) changes nothing', () => {
    expect(run([row('s1', 'A', '10:00:00')], online('s1', '10:00:00'))).toMatchObject({ decision: 'duplicate_ignored', actions: [] });
    expect(run([row('s1', 'A', '10:00:00', '10:30:00')], online('s1', '10:00:00'))).toMatchObject({ decision: 'duplicate_ignored', actions: [] });
  });

  it('offline closes the open row at the receive time; a duplicate offline changes nothing', () => {
    const rows = [row('s1', 'A', '10:00:00')];
    expect(run(rows, offline('s1', '11:00:00')).actions).toEqual([{ op: 'close', streamId: 's1', endedAt: at('11:00:00') }]);
    expect(run([row('s1', 'A', '10:00:00', '11:00:00')], offline('s1', '11:05:00'))).toMatchObject({ decision: 'duplicate_ignored', actions: [] });
  });

  it('offline before online (unknown id): no write and one reconciliation is requested', () => {
    expect(run([], offline('sX', '11:00:00'))).toMatchObject({ decision: 'unknown_stream', actions: [], reconcile: true });
    expect(run([row('s1', 'A', '10:00:00')], offline('sX', '11:00:00'))).toMatchObject({ decision: 'unknown_stream', actions: [], reconcile: true });
  });

  it('merge boundary is inclusive: equal joins, +1 s opens a new session, -1 s joins', () => {
    const rows = [row('s1', 'A', '10:00:00', '11:00:00')];
    expect(run(rows, online('s2', '11:10:00'))).toMatchObject({ decision: 'opened', merged: true });
    expect(run(rows, online('s2', '11:10:00')).actions[0].row.sessionId).toBe('A');
    expect(run(rows, online('s2', '11:09:59')).actions[0].row.sessionId).toBe('A');
    const outside = run(rows, online('s2', '11:10:01'));
    expect(outside.merged).toBe(false);
    expect(outside.actions[0].row.sessionId).toBe('new-session-1');
  });

  it('the window comes from the argument (1 minute and 60 minutes)', () => {
    const rows = [row('s1', 'A', '10:00:00', '11:00:00')];
    expect(run(rows, online('s2', '11:01:01'), '12:00:00', 60_000).merged).toBe(false);
    expect(run(rows, online('s2', '11:01:00'), '12:00:00', 60_000).merged).toBe(true);
    expect(run(rows, online('s2', '12:00:00'), '12:00:00', 3_600_000).merged).toBe(true);
  });

  it('an online whose start precedes the end of the previous row (offline arrived first) still merges', () => {
    const rows = [row('s1', 'A', '10:00:00', '11:00:05')];
    const result = run(rows, online('s2', '11:00:00'));
    expect(result.merged).toBe(true);
    expect(result.actions[0].row.sessionId).toBe('A');
  });

  it('online while another row is open: the old row is closed FIRST (reconciled) at the new start, then the new row opens in the same session', () => {
    const rows = [row('s1', 'A', '10:00:00')];
    const result = run(rows, online('s2', '10:30:00'));
    expect(result.actions.map((action) => action.op)).toEqual(['close', 'open']);
    expect(result.actions[0]).toEqual({ op: 'close', streamId: 's1', endedAt: at('10:30:00'), source: 'reconciled' });
    expect(result.actions[1].row).toMatchObject({ streamId: 's2', sessionId: 'A', endedAt: null });
    expect(result.merged).toBe(true);
  });

  it('two online of different ids in a row never leave two open rows (the second closes the first)', () => {
    const first = run([], online('s1', '10:00:00'));
    const rowsAfterFirst = [first.actions[0].row];
    const second = run(rowsAfterFirst, online('s2', '10:00:05'));
    const opens = second.actions.filter((action) => action.op === 'open').length;
    const closes = second.actions.filter((action) => action.op === 'close').length;
    expect(opens).toBe(1);
    expect(closes).toBe(1);
    expect(second.actions[0].op).toBe('close');
  });

  it('a late online of an OLDER stream is ignored: no write and no change of any stored session id (DB-8)', () => {
    const rows = [row('s2', 'B', '12:00:00', '12:30:00'), row('s1', 'A', '10:00:00', '10:20:00')];
    const result = run(rows, online('s0', '10:50:00'), '13:00:00');
    expect(result).toMatchObject({ decision: 'late_online_ignored', actions: [], reconcile: false });
    // even when it would have fit between two rows of one session
    const joined = [row('s2', 'A', '10:40:00', '10:50:00'), row('s1', 'A', '10:00:00', '10:20:00')];
    expect(run(joined, online('s0', '10:25:00'), '13:00:00')).toMatchObject({ decision: 'late_online_ignored', actions: [] });
  });

  it('an online with the same start time as the latest row but another id is not late', () => {
    const result = run([row('s1', 'A', '10:00:00', '10:20:00')], online('s2', '10:00:00'));
    expect(result.decision).toBe('opened');
  });

  it('offline of the OLD id after the online of the new id closes only the old row, never past the next row start', () => {
    const rows = [row('s2', 'A', '10:30:00'), row('s1', 'A', '10:00:00', '10:30:00', 'reconciled')];
    // s1 is already closed: duplicate
    expect(run(rows, offline('s1', '10:40:00'))).toMatchObject({ decision: 'duplicate_ignored', actions: [] });
    // s1 still open while s2 exists in the same session (inconsistent store): close is capped at the next row start
    const odd = [row('s2', 'A', '10:30:00', '11:00:00'), row('s1', 'A', '10:00:00')];
    expect(run(odd, offline('s1', '10:45:00')).actions).toEqual([{ op: 'close', streamId: 's1', endedAt: at('10:30:00') }]);
  });

  it('offline never ends before the row started (clock skew): ended_at = GREATEST(started_at, ...)', () => {
    expect(run([row('s1', 'A', '10:00:00')], offline('s1', '09:59:00')).actions).toEqual([{ op: 'close', streamId: 's1', endedAt: at('10:00:00') }]);
  });

  it('a reconciliation open carries source reconciled; a reconciliation close is sticky reconciled and uses the first negative check time', () => {
    const opened = run([], online('s1', '10:00:00', { source: 'reconciled' }));
    expect(opened.actions[0].row.source).toBe('reconciled');
    const closed = run([row('s1', 'A', '10:00:00')], { kind: 'reconcile_close', streamId: 's1', at: at('11:00:00') });
    expect(closed.actions).toEqual([{ op: 'close', streamId: 's1', endedAt: at('11:00:00'), source: 'reconciled' }]);
    expect(run([row('s1', 'A', '10:00:00', '11:00:00')], { kind: 'reconcile_close', streamId: 's1', at: at('11:05:00') })).toMatchObject({ actions: [] });
    expect(run([], { kind: 'reconcile_close', streamId: 'zz', at: at('11:05:00') })).toMatchObject({ actions: [], decision: 'unknown_stream' });
  });

  it('is pure: the input rows are not mutated and the same input gives the same output', () => {
    const rows = Object.freeze([Object.freeze(row('s1', 'A', '10:00:00'))]);
    const first = applyLiveEvent({ rows }, online('s2', '10:30:00'), at('12:00:00'), WINDOW, ids());
    const second = applyLiveEvent({ rows }, online('s2', '10:30:00'), at('12:00:00'), WINDOW, ids());
    expect(second).toEqual(first);
  });

  it('a malformed event or window throws a code error instead of guessing', () => {
    expect(codeOf(() => run([], { kind: 'banana' }))).toBe('LIVE_EVENT_INVALID');
    expect(codeOf(() => run([], online('s1', '10:00:00'), '12:00:00', 0))).toBe('LIVE_WINDOW_INVALID');
    expect(codeOf(() => run([], { kind: 'online', streamId: '', type: 'live', startedAt: at('10:00:00') }))).toBe('LIVE_EVENT_INVALID');
    expect(codeOf(() => run([], { kind: 'online', streamId: 'x'.repeat(65), type: 'live', startedAt: at('10:00:00') }))).toBe('LIVE_EVENT_INVALID');
    expect(codeOf(() => run([], { kind: 'online', streamId: 's', type: 'live', startedAt: new Date('nope') }))).toBe('LIVE_EVENT_INVALID');
  });
});

describe('OPS-31 P6b merge-window setting validation (DB-4)', () => {
  it('default 10, range 1..60, integers only; nothing is coerced', () => {
    expect(DEFAULT_MERGE_MINUTES).toBe(10);
    expect(MERGE_MINUTES_RANGE).toEqual({ min: 1, max: 60 });
    for (const good of [1, 10, 60]) expect(parseMergeMinutes(good)).toEqual({ ok: true, value: good });
    for (const bad of [0, 61, -1, 1.5, '10', null, undefined, Number.NaN, Infinity]) expect(parseMergeMinutes(bad).ok, String(bad)).toBe(false);
  });
});

describe('OPS-31 P6b LIVE-1 static twin (U40-02)', () => {
  it('no live-session module imports the queue repository or the financial gate', () => {
    const modules = [
      'apps/api/src/domain/live-session.mjs',
      'apps/api/src/persistence/live-session-repository.mjs',
      'apps/api/src/twitch/live-session-service.mjs',
    ];
    for (const path of modules) {
      const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
      const imports = [...source.matchAll(/(?:import|from)\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
      for (const specifier of imports) {
        expect(specifier, `${path} imports ${specifier}`).not.toMatch(/queue-repository|financial-gate|queue-service|outbox/);
      }
    }
  });
});
