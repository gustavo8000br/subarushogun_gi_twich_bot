// OPS-31 P2 (AC 1-5, design 7): the `chat.notice` rows of the outbox. A notice is informational (never money): it is written
// in the SAME transaction as the queue change that causes it (callers hold the queue advisory lock), but it is never a
// condition for that change and a missing answer from Twitch only expires it. No foreign key to entries or redemptions is
// set, so the financial code that walks those tables never meets a notice; the payload carries only what the text needs.
import { CHAT_NOTICE_KINDS, isChatNoticeKind } from '../domain/chat-notice-composer.mjs';

export const CHAT_NOTICE_OPERATION = 'chat.notice';
/** Merge window of the aggregated kinds (design 7.2; configuration, 15 s proposed). */
export const CHAT_NOTICE_MERGE_WINDOW_MS = 15_000;
/** Few attempts and a short expiry for informational notices, then status `expired` (design 7.2). */
export const CHAT_NOTICE_LIMITS = Object.freeze({
  1: Object.freeze({ maxAttempts: 3, ttlMs: 5 * 60_000 }),
  2: Object.freeze({ maxAttempts: 2, ttlMs: 2 * 60_000 }),
});
/** More than this many pending "joined" notices of one queue are sent as one "joined_many" summary. */
export const CHAT_NOTICE_JOIN_SUMMARY_THRESHOLD = 3;
const AGGREGATED = new Set(['queue_closed', 'queue_reopened', 'cleared']);
const OPPOSITE = { queue_closed: 'queue_reopened', queue_reopened: 'queue_closed' };

function positive(value) { return Number.isInteger(value) && value >= 0 ? value : 0; }

/**
 * Write one notice if the queue switch for its kind is on. Returns `{status}`; never throws for "off".
 * @param {any} tx Prisma transaction client (the queue advisory lock is already held by the caller)
 * @param {{kind: string, queue: Record<string, any>, now: Date, entryId?: string|null, entryVersion?: number, redemptionId?: string|null,
 *   user?: string|null, position?: number, count?: number}} input
 */
export async function enqueueChatNotice(tx, { kind, queue, now, entryId = null, entryVersion = 0, redemptionId = null, user = null, position = 0, count = 0 }) {
  if (!isChatNoticeKind(kind)) return { status: 'unknown_kind' };
  const definition = CHAT_NOTICE_KINDS[kind];
  if (!queue || queue[definition.switch] !== true) return { status: 'switched_off' };
  const limits = CHAT_NOTICE_LIMITS[definition.priority];
  const windowStart = Math.floor(now.getTime() / CHAT_NOTICE_MERGE_WINDOW_MS) * CHAT_NOTICE_MERGE_WINDOW_MS;
  let idempotencyKey;
  if (AGGREGATED.has(kind)) idempotencyKey = `chat.notice:${kind}:${queue.id}:${windowStart}`;
  else if (redemptionId && kind.startsWith('refused_')) idempotencyKey = `chat.notice:${kind}:${redemptionId}`;
  else idempotencyKey = `chat.notice:${kind}:${entryId}:${entryVersion}`;

  if (OPPOSITE[kind]) {
    // Latest wins: a close followed by a reopen inside the window leaves only the reopen to say.
    await tx.outbox.updateMany({
      where: { operationType: CHAT_NOTICE_OPERATION, entityId: queue.id, status: { in: ['pending', 'retry'] }, payload: { path: ['kind'], equals: OPPOSITE[kind] } },
      data: { status: 'cancelled', lastError: 'notice_superseded' },
    });
  }
  const existing = await tx.outbox.findUnique({ where: { idempotencyKey } });
  if (existing) {
    if (kind === 'cleared' && ['pending', 'retry'].includes(existing.status)) {
      const previous = existing.payload && typeof existing.payload === 'object' ? existing.payload : {};
      await tx.outbox.update({ where: { id: existing.id }, data: { payload: { ...previous, count: positive(previous.count) + positive(count) } } });
      return { status: 'merged' };
    }
    if (existing.status === 'cancelled' && existing.lastError === 'notice_superseded') {
      await tx.outbox.update({ where: { id: existing.id }, data: { status: 'pending', attempts: 0, lastError: null, nextAttemptAt: now } });
      return { status: 'revived' };
    }
    return { status: 'duplicate' };
  }
  await tx.outbox.create({ data: {
    operationType: CHAT_NOTICE_OPERATION, entityType: 'queue', entityId: queue.id, idempotencyKey,
    nextAttemptAt: now,
    payload: {
      kind, queueId: queue.id, priority: definition.priority, maxAttempts: limits.maxAttempts,
      expiresAt: new Date(now.getTime() + limits.ttlMs).toISOString(),
      ...(user ? { user: String(user) } : {}), ...(position ? { position: positive(position) } : {}), ...(count ? { count: positive(count) } : {}),
    },
  } });
  return { status: 'enqueued' };
}

function payloadOf(row) { return row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {}; }

/**
 * Repository methods for the notice worker. `transact` and `prisma` come from the queue repository factory.
 * @param {{prisma: any, transact: (callback: (tx: any) => Promise<any>) => Promise<any>, clock: () => Date}} deps
 */
export function createChatNoticeStore({ prisma, transact, clock }) {
  return {
    /**
     * Claim the next due notice (priority 1 before 2, then oldest). Expired rows met on the way become `expired`.
     * Pending "joined" notices of the same queue are claimed together when there are more than the summary threshold.
     */
    async claimNextChatNotice({ now = clock(), leaseMs = 30_000 } = {}) {
      for (let guard = 0; guard < 20; guard += 1) {
        const claimed = await transact(async (tx) => {
          const leaseUntil = new Date(now.getTime() + leaseMs);
          const rows = await tx.$queryRaw`
            WITH candidate AS (
              SELECT id FROM outbox
              WHERE operation_type = 'chat.notice'
                AND ((status IN ('pending', 'retry') AND next_attempt_at <= ${now}) OR (status = 'processing' AND lease_until <= ${now}))
              ORDER BY COALESCE((payload->>'priority')::int, 2) ASC, next_attempt_at ASC, created_at ASC
              FOR UPDATE SKIP LOCKED
              LIMIT 1
            )
            UPDATE outbox AS task
            SET status = 'processing', attempts = task.attempts + 1, lease_until = ${leaseUntil}, lease_token = gen_random_uuid(), updated_at = ${now}
            FROM candidate WHERE task.id = candidate.id
            RETURNING task.id, task.attempts, task.lease_token AS "leaseToken", task.payload, task.entity_id AS "queueId"
          `;
          const task = rows[0];
          if (!task) return { done: true, task: null };
          const payload = payloadOf(task);
          const expiresAt = Date.parse(payload.expiresAt ?? '');
          if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) {
            await tx.outbox.update({ where: { id: task.id }, data: { status: 'expired', lastError: 'notice_expired', leaseToken: null, leaseUntil: null } });
            return { done: false, task: null };
          }
          const ids = [task.id];
          let count = 1;
          if (payload.kind === 'joined') {
            const siblings = await tx.outbox.findMany({
              where: {
                operationType: CHAT_NOTICE_OPERATION, entityId: task.queueId, id: { not: task.id }, status: { in: ['pending', 'retry'] },
                nextAttemptAt: { lte: now }, payload: { path: ['kind'], equals: 'joined' },
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 500, select: { id: true },
            });
            if (siblings.length + 1 > CHAT_NOTICE_JOIN_SUMMARY_THRESHOLD) {
              await tx.outbox.updateMany({ where: { id: { in: siblings.map(({ id }) => id) }, status: { in: ['pending', 'retry'] } }, data: {
                status: 'processing', attempts: { increment: 1 }, leaseUntil, leaseToken: task.leaseToken,
              } });
              ids.push(...siblings.map(({ id }) => id));
              count = ids.length;
            }
          }
          const queue = task.queueId ? await tx.queue.findUnique({ where: { id: task.queueId } }) : null;
          return { done: true, task: { id: task.id, ids, attempts: task.attempts, leaseToken: task.leaseToken, payload, queue, summaryCount: count } };
        });
        if (claimed.done) return claimed.task;
      }
      return null;
    },

    /** @param {string[]|string} ids */
    async finishChatNotice(ids, { status, errorCode = null, nextAttemptAt = null, leaseToken = null }) {
      const list = Array.isArray(ids) ? ids : [ids];
      return prisma.outbox.updateMany({
        where: { id: { in: list }, operationType: CHAT_NOTICE_OPERATION, status: 'processing', ...(leaseToken ? { leaseToken } : {}) },
        data: { status, lastError: errorCode, leaseToken: null, leaseUntil: null, ...(status === 'retry' && nextAttemptAt instanceof Date ? { nextAttemptAt } : {}) },
      });
    },
  };
}
