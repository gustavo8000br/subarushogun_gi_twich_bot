// OPS-31 X1 (A0, security): the audit/actor identity of the local panel session.
//
// The local session id IS the value of the session cookie (a bearer secret, `http/local-session.mjs`), so it must never be written to
// the database, a log or an export. Everything that records "who did it" (audit_logs.actor_id, refund_list_members.created_by,
// idempotency keys, settings `updatedBy`, challenge records) uses this derived, non-reversible, per-session reference instead:
// 16 hex chars (64 bits) of SHA-256 over a fixed application prefix and the session id. It introduces no new secret; the 256-bit
// random id cannot be recovered from it, and it is useless as a cookie because sessions are looked up by the exact id.
import { createHash } from 'node:crypto';

const ACTOR_PREFIX = 'queuebot:panel-actor:v1:';

/** @param {string} sessionId @returns {string} e.g. `panel_0123456789abcdef` */
export function sessionActorId(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) throw new TypeError('A session id is required to derive an actor id');
  return `panel_${createHash('sha256').update(ACTOR_PREFIX + sessionId).digest('hex').slice(0, 16)}`;
}
