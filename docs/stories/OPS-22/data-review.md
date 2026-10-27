# OPS-22 — Data review (`@data-engineer`, Dara)

[Português (pt-BR)](../../pt-BR/stories/OPS-22/data-review.md)

**Date:** 2026-10-27. **Scope:** read-only review of `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*`, `apps/api/src/outbox/financial-worker.mjs`, and the outbox/deletion methods in `apps/api/src/persistence/queue-repository.mjs`. Nothing was executed (no migration, server, test or Docker). Answers the AC 12 gate.

**Verdict: GO with conditions. No migration is required.** Conditions C1-C8 in section 6.

## 1. Does the schema support the policy without a migration?

**Yes.** Every value the policy needs already has a column or can live in `outbox.payload` (JSONB, default `{}`, unused by financial tasks today):

| Need | Where | Notes |
|------|-------|-------|
| Attempt counter | `outbox.attempts` (INT, `CHECK >= 0`) | Already incremented atomically by `claimNext` at claim time (`attempts = attempts + 1`), so a crash after claim also counts. Monotonic; never reset. |
| Next check time / growing wait | `outbox.next_attempt_at` | Already used by `retry()` and by the claim predicate. |
| Reason class / last code | `outbox.last_error` (code, <= 64) + `payload.reasonClass` | `reasonClass` enumerated: `remote_read_unrecognized`, `remote_read_transient`, `remote_not_found`, `authorization_required`. |
| `unknownSince` | `payload.firstNonConclusiveAt` (ISO-8601 UTC) | Set once on the first non-conclusive result, never overwritten. Fallback for legacy rows: `updated_at`. |
| Max attempts | Code constant `FINANCIAL_MAX_ATTEMPTS = 6` | Not per row; a column would invite drift. |
| Manual retry budget | `payload.cycleStartAttempts` (INT) | See C3: `attempts - cycleStartAttempts` is the attempts of the current cycle; total `attempts` stays monotonic for the audit trail. |
| Terminal "needs review" | existing status `unknown` + `last_error = 'attempts_exhausted'` | **Do not add a new outbox status** (`needs_review`): `outbox_status_check` (migration `202610050001_manual_outbox_resolution`) would need a DROP/ADD constraint migration. The health projection derives `needs_review` = `status='unknown'`, `degraded` = `status IN ('retry','processing')` with a non-conclusive `reasonClass`. |
| Redemption sync | `redemptions.sync_status` (TEXT, **no CHECK**) | Values already in use: `observed`, `pending`, `confirmed`, `conflict`, `unknown`, `operator_resolved`. No new value needed. |
| Deletion states (deleted / pending / blocked) | `queues.lifecycle_status` (CHECK `active/deleting/deleted`) + derived blockers | Derive "blocked" from `getQueueDeletionBlockers` (count of financial tasks in `unknown/conflict/failed/resolved_manual` for the reward); do not store a new `remote_sync_status`. `remote_sync_status` has no CHECK, so storing would also be migration-free, but a derived value has no extra transition to keep consistent. |

**Index:** the claim query filters `operation_type IN (...)`, `status IN ('pending','retry')`, `next_attempt_at <= now` and orders by `next_attempt_at`. The existing `outbox_status_next_attempt_at_idx (status, next_attempt_at)` covers it. The re-verifier **is the worker itself** (a re-check is a normal claim of a `retry` row whose first step is the read-only `getRedemptionStatus`), so no second scanner and no new index. Revisit only if `EXPLAIN` on a realistic volume shows a seq scan dominated by non-financial rows; then the candidate is a partial index `ON outbox (next_attempt_at) WHERE operation_type IN ('redemption.cancel','redemption.fulfill') AND status IN ('pending','retry')` (additive, `CREATE INDEX CONCURRENTLY`, rollback `DROP INDEX`).

**If `@architect` still insists on typed columns** (not recommended): one additive migration `ALTER TABLE outbox ADD COLUMN unknown_since timestamptz NULL, ADD COLUMN reason_class text NULL CHECK (reason_class IS NULL OR reason_class IN (...))`; no default, no backfill (NULL = legacy), rollback `DROP COLUMN` after `pg_dump` snapshot. It is not needed for any AC.

**Backfill of existing `unknown` rows:** none. Legacy `unknown` rows stay terminal until the operator uses "retry now" (audited). Automatic re-arming of legacy rows would be a data migration that confirms nothing by itself but would issue writes on old redemptions; out of scope and not recommended.

## 2. Outbox state table, atomicity, races, idempotency

### 2.1 Financial tasks (`redemption.cancel` / `redemption.fulfill`)

| From | To | Who | Guard | Changes in this story |
|------|----|-----|-------|----------------------|
| `pending`/`retry` (due) | `processing` | worker `claimNext` | `FOR UPDATE SKIP LOCKED`, new `lease_token`, `attempts+1` | none |
| `processing` (lease expired) | `processing` | worker `claimNext` | same | none (counts as an attempt) |
| `processing` | `confirmed` | worker, only after a positive read or a write response with the expected status | `status='processing' AND lease_token` | none |
| `processing` | `conflict` | worker (read shows the opposite final state) | lease | none |
| `processing` | `retry` | worker, transient or **non-conclusive read** and cycle attempts < 6 | lease | **new:** non-conclusive read (`UNKNOWN` mapping, 404 on read) goes to `retry` instead of `unknown` while under the cap |
| `processing` | `unknown` | worker, cycle attempts >= 6 with non-conclusive result | lease | **new:** `last_error='attempts_exhausted'`, terminal |
| `processing` | `unknown` | worker, 401 | lease | stays (`authorization_required`, `blocked_auth`); re-armed by re-authorization (AC 16), not by the counter |
| `processing` | `failed` | worker, permanent 4xx / unsupported | lease | none |
| `pending`/`retry`/`processing` | `unknown` | reconciliation `markRedemptionUnknown` | **none (no lease check)** | **must change, C4** |
| `pending`/`retry`/`processing`/`unknown`/`resolved_manual` | `confirmed`/`conflict` | `recordExternalRedemptionState` (EventSub/reconciliation positive terminal observation) | none | acceptable: a positive remote observation is the only thing allowed to supersede; worker's later lease write gets `count=0` |
| `unknown`/`conflict`/`failed` | `pending` | operator "retry now" `retryOutboxManually` | `status` match | **new:** set `payload.cycleStartAttempts`, audit (C3) |
| `unknown` | `resolved_manual` | operator "I verified on Twitch" | `status='unknown'` | keep; never sets `remote_status` (C5) |

Terminal today: `unknown`, `conflict`, `failed`, `resolved_manual`, `confirmed`, `cancelled`. After this story, a non-conclusive read no longer goes directly to `unknown`: it becomes `retry` up to 6 attempts; `unknown` becomes reachable only by exhaustion, 401, or (after C4) not by reconciliation during the automatic window.

### 2.2 Atomicity

Today `retry()`, `unknown()`, `conflict()` and `failed()` are single `updateMany` calls on `outbox` without touching `redemptions` or `audit_logs`; only `confirm()` updates the redemption in the same transaction. Requirement (C2): every new transition (`retry` with non-conclusive reason, exhaustion to `unknown`, manual retry, re-verification confirm) runs in **one `prisma.$transaction`** that (1) updates `outbox` with `WHERE id AND status='processing' AND lease_token=$token` and checks `count === 1`, (2) updates `redemptions.sync_status` (`pending` while retrying, `unknown` at exhaustion, `confirmed` on positive read), (3) writes the audit row. If (1) returns 0, nothing else is written. The payload merge (`firstNonConclusiveAt`, `reasonClass`) is a read-modify-write inside the same transaction after `SELECT ... FOR UPDATE` on the outbox row (same pattern as `lockProcessingRewardTask`), or a single `jsonb_set`/`||` in raw SQL; never outside the transaction.

### 2.3 Races (worker vs reconciliation vs re-verifier vs deletion)

- **Worker vs worker:** safe — `SKIP LOCKED` + per-claim `lease_token`; every outcome write is lease-guarded.
- **Re-verifier:** not a separate process (see section 1), so no new race.
- **Reconciliation vs worker (real risk, C4):** `markRedemptionUnknown` sets `unknown` on `pending/retry/processing` without a lease check and clears the lease. During the 6-attempt window this (a) steals a live lease mid-write (the worker's `confirm` then returns `false` although Twitch may have applied the write), and (b) makes the task terminal outside the counter. Fix: reconciliation must not touch rows in `processing` with `lease_until > now()`, and must not set `unknown` on financial tasks while cycle attempts < 6; it may record `redemptions.sync_status` and an audit row only.
- **Deletion vs worker:** `recordQueueDeletionRedemptions` uses `withQueueTransaction` and only creates a `redemption.cancel` when no `financial:<id>` task exists; it never rewrites an existing task's status. Safe. `prepareRewardDelete`/`completeQueueDeletion` lock the reward task and re-check blockers inside the transaction. Safe.
- **Manual resolution vs worker:** `resolveUnknownFinancialOperation` only matches `status='unknown'` (never `processing`), so it cannot race a live lease. Safe.

### 2.4 Idempotency of "cancel open redemption" at deletion

`outbox.idempotency_key` is UNIQUE and the key is `financial:<redemptionId>` for both cancel and fulfill, so at most one financial intent per redemption exists. An existing `redemption.fulfill` wins (completed service), an existing `redemption.cancel` is not duplicated, and re-running deletion is idempotent. Gap (C6): `recordQueueDeletionRedemptions` only re-points `redemptions` for an existing cancel; it does not re-arm a cancel in `unknown`. That is correct under this policy (re-arming belongs to the worker/operator), but the deletion projection must report it as a blocker.

### 2.5 Deletion after manual resolution (blocking gap, C5)

`prepareRewardDelete` and `completeQueueDeletion` treat as unresolved any redemption with `remote_status='UNFULFILLED'` **or** any financial task with `status <> 'confirmed'`. `resolveUnknownFinancialOperation` sets `resolved_manual` and `sync_status='operator_resolved'` but leaves `remote_status='UNFULFILLED'`. Result: after "I verified on Twitch" the deletion **never resumes**, contradicting AC 14. The fix must not weaken the financial invariant: manual resolution re-arms the deletion flow, which then performs AC 13 step (c) — a positive remote read (per-redemption `getRedemptionStatus` or the re-list) — and records the observed terminal status through the existing positive-observation path. `reward.delete` is issued only when no redemption of that reward is `UNFULFILLED` **by a remote read taken after the resolution**. A manual resolution alone never unblocks `reward.delete` (Delete Custom Reward would silently turn a still-`UNFULFILLED` redemption into `FULFILLED`).

## 3. `audit_logs` events (no sensitive data)

Columns used: `queue_id`, `redemption_id` (internal FK, existing practice), `event`, `actor_id` (operator only), `origin`, `previous_state`, `next_state`, `reason` (enumerated code), `safe_detail`. Never: viewer user id/login/display name, redemption body/input, tokens, headers, raw Twitch error messages, connection strings.

| Event | Origin | prev → next | `reason` | `safe_detail` |
|-------|--------|-------------|----------|---------------|
| `financial.operation_retry_scheduled` | `system` | `processing → retry` | `last_error` code | `{ operationType, attempt, cycleAttempt, maxAttempts: 6, nextAttemptAt, httpStatus, reasonClass }` |
| `financial.operation_attempts_exhausted` | `system` | `processing → unknown` | `attempts_exhausted` | `{ operationType, attempts, firstNonConclusiveAt, reasonClass }` |
| `financial.operation_confirmed_by_reverification` | `system` | `processing → confirmed` | `remote_read_positive` | `{ operationType, attempts, remoteConfirmed: true, remoteStatus }` |
| `financial.operation_retry_requested` | `panel` | `unknown/conflict/failed → pending` | `operator_retry_now` | `{ operationType, previousAttempts, cycleStartAttempts }` |
| `financial.operation_resolved_manually` (existing) | `panel` | `unknown → resolved_manual` | `operator_verified_on_twitch` | `{ remoteConfirmed: false, expectedStatus, attempts }` |
| `queue.deletion_blocked` | `system` | `deleting → deleting` | `financial_operations_need_review` | `{ blockedCount, pendingCount }` — only when the count changes, to avoid noise |
| `queue.deletion_resumed` | `system`/`panel` | `deleting → deleting` | `blockers_cleared` | `{ resolvedBy: 'remote_read' \| 'operator' }` |
| `queue.deletion_confirmed` (existing) | `system` | `deleting → deleted` | `reward_deleted_after_refunds_confirmed` / `reward_already_absent` | `{ rewardId }` (existing; keep the 404 variant distinct) |

Volume: at most 6 retry rows per task; acceptable. `twitchErrorCode` in logs (AC 10) is capped at 64 chars; same cap for `reason`.

## 4. Mandatory database tests (disposable PostgreSQL, real migrations, no Prisma mocks)

Use the existing harness: `tests/integration/queue-repository.test.js` style with `tests/helpers/isolated-postgres-image.mjs` (`postgres:18.6-bookworm`, label `queuebot.test=disposable`) and `tests/helpers/isolated-postgres-cleanup.mjs` (bounded cleanup, removes only labeled containers). Apply `prisma migrate deploy` on the full migration set; no active volume touched. Fake clock injected via the repository `clock`.

1. **Claim race:** two `PrismaClient`s call `claimNext` concurrently on one due task → exactly one row returned; the loser gets `null`; `attempts` incremented once.
2. **Stale lease:** worker A's lease expires, B reclaims; A's `retry/confirm/unknown` with the old token returns `count=0`; row reflects only B.
3. **Six attempts:** a non-conclusive read 5 times → `retry` each time with strictly increasing `next_attempt_at` (bounded by the 1 h cap) and `firstNonConclusiveAt` unchanged; the 6th → `unknown`, `last_error='attempts_exhausted'`, `redemptions.sync_status='unknown'`, one exhaustion audit row; `claimNext` at `now + 1 day` returns `null`.
4. **No confirmation without a positive read (AC 9):** after any sequence above, `SELECT` asserts no `confirmed` outbox row and `remote_status` unchanged.
5. **Positive re-verification:** attempt 3 reads the expected status → `confirmed` + `sync_status='confirmed'` + audit, in one transaction (assert all three or none by forcing a failure in step 3 of the transaction).
6. **Reconciliation vs live lease (C4):** a task in `processing` with a valid lease is untouched by `markRedemptionUnknown`; under the cap it does not become `unknown`.
7. **Manual retry:** `unknown` → `pending` with `cycleStartAttempts` = previous `attempts`, audit row with actor; `attempts` not reset.
8. **Manual resolution:** `resolved_manual`, `sync_status='operator_resolved'`, `remote_status` unchanged, audit `remoteConfirmed:false`; a later positive EventSub observation moves it to `confirmed`/`conflict`.
9. **Deletion resume (AC 14/17):** queue `deleting` with one redemption each in open, `unknown`, already `CANCELED`, already `FULFILLED`: no `reward.delete` claimable while blockers exist; after the blocker is confirmed by a read, deletion completes; after manual resolution, deletion resumes but `completeQueueDeletion` refuses while the post-resolution read still shows `UNFULFILLED`.
10. **Idempotent cancel:** running `recordQueueDeletionRedemptions` twice creates one `redemption.cancel` per redemption; an existing `redemption.fulfill` is kept.
11. **Legacy rows:** a pre-existing `unknown` row with `payload='{}'` and `attempts=1` is read correctly (fallbacks) and stays terminal until manual retry.
12. **Audit content:** for every event above, `safe_detail` keys are within the allowlist (no `userId`, `login`, `input`, token-like fields).

## 5. Impact on existing user databases and safe order

- **No DDL**, so no migration order, lock or downtime. Deploy is code-only.
- Before upgrading any non-disposable database, take a `pg_dump` snapshot (project policy; no backup tables). The dev database is disposable and is not migrated (owner rule).
- **Behavior changes on existing rows:** (a) legacy `unknown` rows remain terminal (no backfill); (b) `retry` rows with `attempts >= 6` from the old unbounded transient path become `unknown` on their next non-conclusive result — visible in Operations, never confirmed; (c) `resolved_manual` rows on a `deleting` queue start re-verification of deletion (C5) — no write until a remote read.
- **Rollback:** reverting the code is safe. Old code ignores the new payload keys, treats `retry` as before (unbounded), and accepts the new audit event names. No data repair needed.
- **Release order inside the story:** slice 1 (read mapping) first — without it every `UNFULFILLED` read stays non-conclusive and the 6 attempts are burned by the mapping bug; then slice 2; then slice 3.

## 6. Verdict

**GO with conditions. No migration.**

- **C1** No new outbox status; terminal "needs review" = `unknown` + `attempts_exhausted`; `needs_review` vs `degraded` derived in the projection.
- **C2** Every new transition is one transaction, lease-guarded (`count === 1`), updating `outbox` + `redemptions.sync_status` + `audit_logs` together; payload merge inside it.
- **C3** Cycle cap uses `attempts - payload.cycleStartAttempts`; `attempts` never reset. [AUTO-DECISION] budget granted by "retry now" → 1 attempt (reason: the owner's 6-attempt policy ends in manual handling; a fresh 6-cycle on each click would turn the manual action into an open-ended loop). `@architect` may change it to a fresh 6-cycle; the persistence design supports both.
- **C4** `markRedemptionUnknown` must not touch `processing` rows with a live lease nor set financial tasks `unknown` below the cap.
- **C5** Manual resolution never sets `remote_status` and never unblocks `reward.delete` by itself; deletion resumes into a positive remote read before the delete.
- **C6** Deletion projection counts `unknown/conflict/failed/resolved_manual` financial tasks as blockers (already true in `getQueueDeletionBlockers`) and exposes the count to Operations.
- **C7** Tests 1-12 of section 4 on isolated PostgreSQL with real migrations, Red-first.
- **C8** If any later decision needs DDL (typed columns or the partial index), it comes back to `@data-engineer` as an additive migration with snapshot, dry-run and rollback script.

**Dependencies:** `@architect` (wait values for the 6 attempts, manual-retry budget C3, deletion resume rule C5); slice 1 before slice 2; OPS-21 idempotency contract for the new mutations; `@qa` for the independent PostgreSQL run.
