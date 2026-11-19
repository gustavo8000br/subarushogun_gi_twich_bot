// OPS-31 P6b (FT-90, AC 40; design v2.8 3.11, DB-4, DB-7..DB-9): the live-session repository over `stream_sessions` (M4) and the
// `settings` row `live_session_policy`.
//
// LIVE-1 (owner rule 2026-11-15): the end or the start of a live never changes queues, entries or redemptions. Every statement of the
// event path (online, offline, reconciliation close) touches ONLY `stream_sessions` (and reads the `settings` row of the merge window); this
// module imports nothing from the queue repository, the financial gate or the outbox. The one write outside `stream_sessions` is the
// audited edit of the merge window (`setLivePolicy`), never reached by an event.
import { randomUUID } from 'node:crypto';
import { applyLiveEvent, DEFAULT_MERGE_MINUTES, parseMergeMinutes } from '../domain/live-session.mjs';

/**
 * First integer of the two-integer advisory lock `pg_advisory_xact_lock(class, hashtext(channel))`. PostgreSQL keeps that key space apart
 * from the single-bigint one of `lockQueue` (`hashtextextended(queueId, 0)`); the class differs from 1868787013 (the account lock) because
 * `hashtext` could return that value (DB-7). 1279870021 is the ASCII of "LIVE".
 */
export const LIVE_SESSION_LOCK_CLASS = 1_279_870_021;
export const LIVE_POLICY_KEY = 'live_session_policy';
/** Code constants (design 3.11 A/E, HYPOTHESIS values): not columns. */
export const LIVE_STALE_HOURS = 48;
export const LIVE_RETENTION_DAYS = 90;
const ROW_WINDOW = 50;
const DEFAULT_REENTRY_WINDOW_HOURS = 12;
const LIVE_REVOKED_REASON = 'revoked';

function repositoryError(code, message) {
  return Object.assign(new Error(message), { code });
}

const toRow = (record) => ({
  streamId: record.twitch_stream_id, sessionId: record.stream_session_id, startedAt: new Date(record.started_at),
  endedAt: record.ended_at === null || record.ended_at === undefined ? null : new Date(record.ended_at), source: record.source,
});

async function lockChannel(tx, broadcasterId) {
  await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(${LIVE_SESSION_LOCK_CLASS}::int, hashtext(${broadcasterId}::text))) AS channel_lock`;
}

function parsePolicy(value) {
  const stored = value && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : null;
  const minutes = parseMergeMinutes(stored?.mergeMinutes);
  if (!stored || stored.schemaVersion !== 1 || !Number.isInteger(stored.revision) || stored.revision < 0 || !minutes.ok) {
    return { schemaVersion: 1, revision: 0, mergeMinutes: DEFAULT_MERGE_MINUTES };
  }
  return { schemaVersion: 1, revision: stored.revision, mergeMinutes: minutes.value };
}

/**
 * The latest row of a channel with the start and the end of ITS session (one query).
 * @param {any} db a Prisma client or transaction
 * @param {string} broadcasterId
 */
async function readLatestView(db, broadcasterId) {
  const rows = await db.$queryRaw`
    SELECT s.twitch_stream_id, s.stream_session_id::text AS stream_session_id, s.started_at, s.ended_at, s.source,
      (SELECT min(o.started_at) FROM stream_sessions o WHERE o.broadcaster_id = s.broadcaster_id AND o.stream_session_id = s.stream_session_id) AS session_start,
      (SELECT max(o.ended_at) FROM stream_sessions o WHERE o.broadcaster_id = s.broadcaster_id AND o.stream_session_id = s.stream_session_id) AS session_end
    FROM stream_sessions s WHERE s.broadcaster_id = ${broadcasterId}
    ORDER BY s.started_at DESC, s.twitch_stream_id DESC LIMIT 1`;
  if (!rows.length) return null;
  return { ...toRow(rows[0]), sessionStart: new Date(rows[0].session_start), sessionEnd: rows[0].session_end ? new Date(rows[0].session_end) : null };
}

/**
 * Cap window (design 3.11 C, D): the start of the current session, or the hours fallback with a reason code. Never unlimited.
 * @param {any} db
 * @param {string} broadcasterId
 * @param {Date} now
 * @param {{reentryWindowHours?: number, revoked?: boolean, staleHours?: number}} [options]
 */
export async function readCapWindow(db, broadcasterId, now, { reentryWindowHours = DEFAULT_REENTRY_WINDOW_HOURS, revoked = false, staleHours = LIVE_STALE_HOURS } = {}) {
  const fallback = (reason) => ({ kind: /** @type {const} */ ('fallback'), start: new Date(now.getTime() - reentryWindowHours * 3_600_000), reason });
  const view = await readLatestView(db, broadcasterId);
  if (revoked) return { window: fallback(LIVE_REVOKED_REASON), view };
  if (!view) return { window: fallback('none_known'), view };
  if (view.endedAt === null && now.getTime() - view.startedAt.getTime() > staleHours * 3_600_000) return { window: fallback('stale'), view };
  return { window: { kind: /** @type {const} */ ('session'), start: view.sessionStart }, view };
}

/** @param {any} prisma @param {{clock?: () => Date, logEvent?: (event: Record<string, any>) => unknown, newSessionId?: () => string}} [options] */
export function createLiveSessionRepository(prisma, { clock = () => new Date(), logEvent = () => undefined, newSessionId = randomUUID } = {}) {
  const log = (event, details) => {
    try { logEvent({ event, level: 'info', source: 'twitch.live_session', details }); } catch { /* observability never changes a decision */ }
  };

  async function readMergeMinutes(tx) {
    const record = await tx.setting.findUnique({ where: { key: LIVE_POLICY_KEY } });
    return parsePolicy(record?.value).mergeMinutes;
  }

  /** Open / close under the per-channel lock in ONE short transaction; the actions come from the pure reducer. */
  async function apply(broadcasterId, event) {
    return prisma.$transaction(async (tx) => {
      await lockChannel(tx, broadcasterId);
      const mergeMinutes = await readMergeMinutes(tx);
      const rows = (await tx.$queryRaw`
        SELECT twitch_stream_id, stream_session_id::text AS stream_session_id, started_at, ended_at, source
        FROM stream_sessions WHERE broadcaster_id = ${broadcasterId}
        ORDER BY started_at DESC, twitch_stream_id DESC LIMIT ${ROW_WINDOW}`).map(toRow);
      const outcome = applyLiveEvent({ rows }, event, clock(), mergeMinutes * 60_000, newSessionId);
      let durationMs;
      // DB-7: the reducer returns "close any other open row" BEFORE "insert"; the order is kept here, one statement per action.
      for (const action of outcome.actions) {
        if (action.op === 'close') {
          const reconciled = action.source === 'reconciled';
          const closed = await tx.$queryRaw`
            UPDATE stream_sessions SET ended_at = ${action.endedAt}::timestamptz, source = CASE WHEN ${reconciled}::boolean THEN 'reconciled' ELSE source END
            WHERE broadcaster_id = ${broadcasterId} AND twitch_stream_id = ${action.streamId} AND ended_at IS NULL
            RETURNING started_at`;
          if (closed.length && outcome.decision === 'closed') durationMs = action.endedAt.getTime() - new Date(closed[0].started_at).getTime();
        } else {
          const { row } = action;
          await tx.$queryRaw`
            INSERT INTO stream_sessions (broadcaster_id, twitch_stream_id, stream_session_id, started_at, ended_at, source)
            VALUES (${broadcasterId}, ${row.streamId}, ${row.sessionId}::uuid, ${row.startedAt}::timestamptz, NULL, ${row.source})
            ON CONFLICT (broadcaster_id, twitch_stream_id) DO NOTHING
            RETURNING 1::int AS inserted`;
        }
      }
      return { decision: outcome.decision, merged: outcome.merged, reconcile: outcome.reconcile, ...(durationMs === undefined ? {} : { durationMs }) };
    });
  }

  return {
    /** @param {{broadcasterId: string, streamId: string, type: string, startedAt: Date, source?: 'event' | 'reconciled'}} input */
    applyOnline({ broadcasterId, streamId, type, startedAt, source = 'event' }) {
      return apply(broadcasterId, { kind: 'online', streamId, type, startedAt, source });
    },
    /** @param {{broadcasterId: string, streamId: string, receivedAt: Date}} input */
    applyOffline({ broadcasterId, streamId, receivedAt }) {
      return apply(broadcasterId, { kind: 'offline', streamId, receivedAt });
    },
    /** Close by reconciliation (two negative checks); `at` is the time of the first negative check. */
    applyReconcileClose({ broadcasterId, streamId, at }) {
      return apply(broadcasterId, { kind: 'reconcile_close', streamId, at });
    },
    /** The latest row of the channel (open or closed), or null. */
    async getLatest(broadcasterId) {
      const view = await readLatestView(prisma, broadcasterId);
      return view ? { streamId: view.streamId, sessionId: view.sessionId, startedAt: view.startedAt, endedAt: view.endedAt, source: view.source } : null;
    },
    async getLivePolicy() {
      const record = await prisma.setting.findUnique({ where: { key: LIVE_POLICY_KEY } });
      return parsePolicy(record?.value);
    },
    /**
     * The audited edit of the merge window (design 3.11 A, DB-4): versioned like `chat_command_policies`. A change applies only to events
     * received after it. No HTTP route or panel screen belongs to P6b (see the story).
     * @param {{expectedRevision: number, mergeMinutes: number, actorId?: string | null, origin?: string}} input
     */
    async setLivePolicy({ expectedRevision, mergeMinutes, actorId = null, origin = 'panel' }) {
      const minutes = parseMergeMinutes(mergeMinutes);
      if (!minutes.ok || !Number.isInteger(expectedRevision) || expectedRevision < 0) throw repositoryError('INVALID_LIVE_POLICY', 'The live session policy is invalid');
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(${LIVE_SESSION_LOCK_CLASS}::int, hashtext(${'setting:live-session-policy'}::text))) AS policy_lock`;
        const record = await tx.setting.findUnique({ where: { key: LIVE_POLICY_KEY } });
        const current = parsePolicy(record?.value);
        if (current.revision !== expectedRevision) throw repositoryError('LIVE_POLICY_REVISION_CONFLICT', 'The live session policy changed');
        if (current.mergeMinutes === minutes.value && record) return { ...current, changed: false };
        const next = { schemaVersion: 1, revision: current.revision + 1, mergeMinutes: minutes.value };
        await tx.setting.upsert({ where: { key: LIVE_POLICY_KEY }, create: { key: LIVE_POLICY_KEY, value: next }, update: { value: next } });
        await tx.auditLog.create({ data: {
          event: 'live_session.policy_updated', actorId, origin, reason: 'live_merge_window_changed',
          safeDetail: { mergeMinutes: next.mergeMinutes, revision: next.revision },
        } });
        return { ...next, changed: true };
      });
    },
    /**
     * The `liveSession` object of `GET /api/state` (design 3.14 item 3): `state` is `unknown` when no session is known, when the
     * events are revoked or when the open session is stale; the cap window is the one the gate would use.
     * @param {string} broadcasterId @param {{revoked?: boolean, reentryWindowHours?: number}} [options]
     */
    async describeLiveSession(broadcasterId, { revoked = false, reentryWindowHours = DEFAULT_REENTRY_WINDOW_HOURS } = {}) {
      const { window, view } = await readCapWindow(prisma, broadcasterId, clock(), { reentryWindowHours, revoked });
      const unknown = !view || revoked || window.reason === 'stale';
      return {
        state: unknown ? 'unknown' : view.endedAt === null ? 'live' : 'offline',
        startedAt: view ? view.sessionStart.toISOString() : null,
        endedAt: view && view.endedAt !== null && view.sessionEnd ? view.sessionEnd.toISOString() : null,
        source: view ? view.source : null,
        capWindow: window.kind,
        fallbackReason: window.kind === 'fallback' ? window.reason : null,
      };
    },
    /**
     * The provider that P7 hands to the financial gate as `capWindowStart` (same signature as the port of P1).
     * @param {{isRevoked?: () => boolean, staleHours?: number}} [options]
     */
    createCapWindowProvider({ isRevoked = () => false, staleHours = LIVE_STALE_HOURS } = {}) {
      return async function liveCapWindowStart(tx, broadcasterId, now, { reentryWindowHours = DEFAULT_REENTRY_WINDOW_HOURS } = {}) {
        const { window } = await readCapWindow(tx ?? prisma, broadcasterId, now, { reentryWindowHours, revoked: isRevoked(), staleHours });
        if (window.kind === 'fallback') log('live_session.cap_fallback', { reason: window.reason });
        return window;
      };
    },
    /**
     * Retention (design 3.11 E, DB-9; HYPOTHESIS 90 days): whole sessions only, never one with an open row, never the most recent
     * session of a channel. Returns the number of rows removed.
     * @param {Date} [now] @param {{retentionDays?: number}} [options]
     */
    async purgeOldSessions(now = clock(), { retentionDays = LIVE_RETENTION_DAYS } = {}) {
      const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
      const removed = await prisma.$queryRaw`
        DELETE FROM stream_sessions s
        USING (
          SELECT broadcaster_id, stream_session_id FROM (
            SELECT broadcaster_id, stream_session_id, max(ended_at) AS last_end, bool_or(ended_at IS NULL) AS has_open, max(started_at) AS last_start
            FROM stream_sessions GROUP BY broadcaster_id, stream_session_id
          ) g
          WHERE NOT g.has_open AND g.last_end < ${cutoff}::timestamptz
            AND g.last_start < (SELECT max(m.started_at) FROM stream_sessions m WHERE m.broadcaster_id = g.broadcaster_id)
        ) old
        WHERE s.broadcaster_id = old.broadcaster_id AND s.stream_session_id = old.stream_session_id
        RETURNING 1::int AS removed`;
      return removed.length;
    },
  };
}
