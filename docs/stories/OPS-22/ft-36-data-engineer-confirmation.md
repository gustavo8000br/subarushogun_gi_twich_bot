# OPS-22 — FT-36 written confirmation (`@data-engineer`, Dara)

[Português (pt-BR)](../../pt-BR/stories/OPS-22/ft-36-data-engineer-confirmation.md)

**Date:** 2026-10-30. **Answers:** section 6 of [architect-review-ft36.md](architect-review-ft36.md) (seven points) and the `@data-engineer` row of the planning gates in [po-validation.md](po-validation.md).
**Evidence class:** read-only. I read `apps/api/prisma/schema.prisma`, the migration `20261014230000_outbox_deletion_cancel_verification` (with `rollback.sql`), `apps/api/src/persistence/queue-repository.mjs`, `apps/api/src/domain/queue-service.mjs`, `apps/api/src/outbox/reward-worker.mjs`, `apps/api/src/outbox/financial-worker.mjs` and `tests/integration/qra-postgres-fixtures.test.js`. I ran no migration, server, test, container or Twitch call. Everything below that depends on PostgreSQL behavior is a **claim to be proven by `@qa` on isolated PostgreSQL with the real migrations**, not a result.

## Verdict

**FT-36 needs no DDL. The `payload.cycleStartAttempts` mechanism needs no DDL.** The `@data-engineer` gate for FT-24..FT-26 and FT-36 is **CLOSED, with the conditions below** (none of them is a migration). If any condition turns out to need DDL, it comes back to me under C8 of [data-review.md](data-review.md).

| # | Point of section 6 | Decision |
|---|---|---|
| 1 | No DDL for FT-36 | **CONFIRMADO COM CONDIÇÃO** |
| 2 | Audit catalogue (`actorId`, `safeDetail` keys, new `reason` codes) | **CONFIRMADO COM CONDIÇÃO** |
| 3 | Single-transaction transitions of 1.2, including F18 | **CONFIRMADO COM CONDIÇÃO** |
| 4 | DATA C3 updated (fresh cycle of 6, 401 refund, `claimNext` payload) | **CONFIRMADO COM CONDIÇÃO** |
| 5 | DATA C6 updated (`resolved_manual` not counted) | **CONFIRMADO** |
| 6 | Catalogue names (`attempts_exhausted`, `financial.operation_retry_requested`) and DATA test 3 wording | **CONFIRMADO** |
| 7 | Tests T36-1..T36-13 added to the PostgreSQL plan | **CONFIRMADO COM CONDIÇÃO** (two existing tests must change; three tests added) |

Nothing in section 6 was **REFUTADO**. Two statements of the review need a precision (no change of decision): the "lookups are by `entity_id`" remark (see 1.3) and the cancel of a possibly-sent DELETE (see point 7, item A).

## (a) No DDL in FT-36 and in `payload.cycleStartAttempts`

### 1.1 What already exists (evidence)

- `cancel_verification` is already an allowed status: `outbox_status_check` in `20261014230000_outbox_deletion_cancel_verification/migration.sql:1-3`, with `rollback.sql` that turns the rows into `unknown` (`queue_deletion_cancel_verification_rolled_back`) before restoring the old constraint. The CHECK is table-wide, so it admits the status on **any** `operation_type` (the pause task of a blocked pause stage needs nothing new).
- `outbox.payload` is `Json @default("{}")` (`schema.prisma:117`). The keys `cancelVerification` (FT-36) and `cycleStartAttempts` (FT-25) are JSON keys: no column, no CHECK on `payload`, no backfill.
- `audit_logs.safe_detail` is `Json`, `reason` and `previous_state`/`next_state` are free `TEXT` (`schema.prisma:134-151`): new event names, reasons and keys need no DDL.
- `outbox.attempts` is `INT` with `CHECK >= 0`, incremented at claim (`queue-repository.mjs:2149` for financial tasks, `:1617` for reward tasks) and never decreased by any code path. Monotonic by construction.

### 1.2 `payload.cycleStartAttempts`: rules that keep it correct without a constraint

1. **Budget of the cycle** = `attempts - (payload.cycleStartAttempts ?? 0)`; the cap of 6 is the code constant `FINANCIAL_MAX_ATTEMPTS`. A missing key reads as 0, so every legacy row works unchanged (DATA test 11).
2. **Invariant** `0 <= cycleStartAttempts <= attempts`. No CHECK is possible on a JSON key without a generated column, and a generated column is DDL that the design does not need. The invariant is enforced in code and proven by a test: "retry now" writes `cycleStartAttempts = attempts` (never more); the 401 refund writes `min(cycleStartAttempts + 1, attempts)`.
3. **Retry now** (`retryOutboxManually`, today `queue-repository.mjs:2237-2258`) must read the row, merge the payload and update it in the **same transaction**, under `SELECT ... FOR UPDATE` on the outbox row, with the existing `WHERE id AND status = <read status>` guard and `count === 1`. Today it does a bare `updateMany` without touching `payload`; this is the line to change. The audit row `financial.operation_retry_requested` is written in the same transaction.
4. **401 refund**: `unknown(...)` is a bare lease-guarded `updateMany` today (`queue-repository.mjs:2192-2197`). The refund requires the move to `unknown('authorization_required')` and the `cycleStartAttempts` increment to be **one statement or one transaction** (`FOR UPDATE` + merge). Never two steps: a crash between them would either burn or double-refund the attempt. A 404 on a **read** (`remote_state_unavailable`) is **not** refunded: it is a real non-conclusive result of that cycle.
5. **Payload merge never replaces the object.** Always spread the current payload (`{ ...current.payload, cycleStartAttempts }`) inside the locked transaction, or use `payload || jsonb_build_object(...)`. Reason: financial payloads will also hold `firstNonConclusiveAt` and `reasonClass`, and reward payloads hold `requestMayHaveReachedTwitch`, `safeToDelete`, `deleteAfterConfirm`, `queueVersion`, `isOpen`. Dropping a key would silently re-enable a refused DELETE.
6. **`claimNext` does not return `payload`** (`RETURNING` at `queue-repository.mjs:2153-2154` lists `id, redemptionId, operationType, attempts, status, leaseToken, rewardId`). Confirmed: `@dev` adds `task.payload` to the `RETURNING` (a column of the same row, no index impact). The claim predicate and the `FOR UPDATE SKIP LOCKED` stay as they are.
7. **No "reset to 0"** and no event `financial.operation_retried_manually`: both withdrawn by the review and confirmed here.

### 1.3 Index and `entity_id` (precision on point 1)

The review says "no index is needed: the lookups are by `entity_id` and `idempotency_key`". The conclusion holds but the premise is imprecise: **`outbox` has no index on `entity_id`**. The only indexes are the primary key, the unique `idempotency_key` and `outbox_status_next_attempt_at_idx (status, next_attempt_at)` (`schema.prisma:116,130`; `202610020001_foundation/migration.sql:102`).

- `beginQueueDeletionCancellation`, `failQueueDeletionCancellation` and `confirmQueueDeletionCancellation` run `SELECT id FROM outbox WHERE entity_id = $1 AND operation_type LIKE 'reward.%' ORDER BY id FOR UPDATE` (`queue-repository.mjs:845, 876, 896`). Without an `entity_id` index this is a scan of `outbox` **while holding the per-queue advisory lock**.
- The cost is bounded: the statement runs once per operator click, the table is dominated by `redemption.*` rows (one or two per redemption), and the lock is per queue, so it does not block other queues. For a single-streamer product this is microseconds to a few milliseconds at tens of thousands of rows.
- **Decision: no DDL now.** `@qa` records an `EXPLAIN (ANALYZE, BUFFERS)` of that statement on the isolated database seeded with 50 000 `redemption.*` rows (no pass/fail threshold other than "recorded"). **If** the plan shows a sequential scan above 50 ms, the answer is an additive migration `CREATE INDEX CONCURRENTLY outbox_entity_id_idx ON outbox (entity_id) WHERE entity_id IS NOT NULL`, rollback `DROP INDEX CONCURRENTLY outbox_entity_id_idx`, with `pg_dump` snapshot first. It is a candidate, not a requirement. The partial index of DATA §1 for the financial claim stays a candidate too.

## (b) F18: re-delete after a cancel

**Confirmed with evidence.**

- `confirmRewardOpen` (`queue-repository.mjs:1683-1687`) does `tx.outbox.create` for `reward.delete` with the fixed key `queue:<id>:reward.delete`.
- `idempotency_key` is `@unique` (`schema.prisma:116`). After a cancel, the row exists as `cancelled` (`confirmQueueDeletionCancellation`, `:904-906`). The `create` raises `P2002` **inside** the transaction that also confirms the pause (`:1675-1682`): the whole transaction rolls back, the pause task is not confirmed, the queue stays `pending_close`, and the worker keeps failing on every claim. Nothing reaches the database partially (atomic), but the deletion cannot progress.
- Only `enqueueRewardDeleteIntent` (`:110-137`) handles the cancelled row (reuse: `pending`, `nextAttemptAt = now`, lease cleared, flags reset, previous attempt kept in `payload.previousCancelledAttempt`). It is used by the closed-queue path (`:836`).

**Safe correction, no DDL: reuse the single row.** In `confirmRewardOpen`, replace the `tx.outbox.create` by `enqueueRewardDeleteIntent(tx, queue.id, clock())`, inside the existing transaction.

Why reuse and not a key with a generation (`queue:<id>:reward.delete:<n>`): the code assumes **one** `reward.delete` row per queue. Evidence: `beginQueueDeletionCancellation` picks it with `rewardTasks.find(operationType === 'reward.delete')` (`:855`); the local-archive guard (`:640`); the Operations list and summary select by `operationType` and `entityId` (`:322, :348`). Two rows would make `find` pick one arbitrarily, and the cancelled one could mask the live one. The unique key is the protection that keeps the invariant; the fix keeps it.

Conditions for `@dev` and `@qa`:

1. `enqueueRewardDeleteIntent` throws `QUEUE_DELETION_NOT_READY` when a row exists that is **not** the operator-cancelled one. In `confirmRewardOpen` that throw would also roll back the pause confirmation. That case is not reachable through the new flow (a live `reward.delete` of a `deleting` queue exists only after the pause is confirmed, and replays of `confirmRewardOpen` return `false` earlier because the pause task is no longer `processing`, `:1669`). `@dev` keeps the throw (fail closed) and `@qa` proves it with a test (T36-9b below).
2. The pause task key `queue:<id>:reward.delete.pause:<nextVersion>` (`:832`) does not collide across cycles: the version of the queue is incremented by the cancel confirm (`:909`) and by the new request, so the key of a second pause differs. Prove it in T36-9.
3. The old cancelled pause task of the previous cycle stays as history (`cancelled`). The Operations list returns it (`:322`) with status `cancelled`; the summary does not count it (`unresolvedDeletionStatuses`, `:11`). The panel must not render a `cancelled` deletion task as pending (FT-23 text, not a database matter).
4. Red test first: T36-9 fails today with `P2002`/rollback and passes after the one-line change.

## (c) Audit rows that do not record who acted

**Confirmed (F22)**: `queue.deletion_cancelled` (`:913-916`) and `queue.deletion_cancellation_not_confirmed` (`:885-889`) are written without `actorId`; only `queue.deletion_cancel_verification_requested` has it (`:865-869`). The fail row also hard-codes `origin: 'panel'`. `confirmQueueDeletionCancellation` and `failQueueDeletionCancellation` do not receive `actorId` from the service (`queue-service.mjs:75-96`): the service must pass it, and both repository methods must accept `actorId` (and `origin`).

`audit_logs.actor_id` is nullable `TEXT` (the operator's id; no viewer data). **Catalogue (owned by `@data-engineer`; final):**

| Event | `origin` | `actorId` | `previousState → nextState` | `reason` | `safeDetail` (all keys enumerated, numeric or boolean) |
|---|---|---|---|---|---|
| `queue.deletion_cancel_verification_requested` (existing) | `panel` | operator | `<status> → cancel_verification` | `operator_requested_queue_deletion_cancellation` | `rewardId`, `operationId`, `operationType`, `deletionState` (`pending`\|`blocked`), `blockReason` (enumerated code or `null`), `requestMayHaveReachedTwitch` (bool), `safeToDelete` (bool) |
| `queue.deletion_cancelled` (existing) | `panel` | operator (**new**) | `deleting → active_closed_archived` | `operator_cancelled_queue_deletion_after_reward_verification` | `rewardId`, `operationId`, `remoteSyncStatus: 'synced'`, `isPaused: true`, `cancelledTasks` (int), `financialTasksLeftRunning` (int) |
| `queue.deletion_cancellation_not_confirmed` (existing) | `panel` | operator (**new**) | `cancel_verification → <restored status or unknown>` | the `reason` code below | `rewardId`, `operationId`, `restored` (bool), `previousStatus` (enumerated outbox status) |

Notes:

- **Keep** `requestMayHaveReachedTwitch` and `safeToDelete` in the first row (they exist today, `:868`); the review's list added keys but did not say to drop these two. They are booleans and are the evidence of why the cancel was or was not allowed.
- `rewardId` is the **Twitch reward id** of the managed reward, already present in these rows today; it is not viewer data. `operationId` is the internal outbox UUID. No UID, login, display name, redemption body, token, header, raw Twitch message or connection string enters `safe_detail`.
- `blockReason` and `reason` use only the enumerated codes; `isSafeReason`-style pattern `^[a-z][a-z0-9_]{1,47}$` (`:139-141`) is the rule for any new code. The three new codes pass it (lengths 37, 40, 46): `queue_delete_cancel_reward_not_paused`, `queue_deletion_cancel_verification_stale`, `queue_deletion_cancel_verification_unavailable`.
- `queue_deletion_cancel_verification_failed` (today's code, `queue-service.mjs:77`, asserted in `qra-postgres-fixtures.test.js:518,524,528`) is **replaced** by `..._unavailable` for non-conclusive reads. Legacy rows keep the old value in `last_error` and in old audit rows: the reader (API reason mapping and panel) must accept both as the same case.
- **Refusals (409) write no audit row**, as decided in the review (nothing changed). Agreed: the structured request log carries them.
- Recommended, not required: the audit row `queue.deletion_cancelled` records the cancelled **pause** task id as `operationId` when the target was the pause task; `operationType` in the first row distinguishes the two.
- Volume: at most three rows per cancel attempt; a resume (second click on `cancel_verification`) writes **no** new first row (`:858-860` returns before the audit), which T36-7 must prove.

## (d) Catalogue of `financial.operation_retry_requested`

Final shape (`audit_logs`): `event = 'financial.operation_retry_requested'`, `origin = 'panel'`, `actorId` = operator (required, not null), `queueId` and `redemptionId` filled from the redemption (as `financial.operation_resolved_manually` does today, `queue-repository.mjs:2279-2290`), `previousState` = the status read (`unknown`, `conflict` or `failed`), `nextState = 'pending'`, `reason = 'operator_retry_now'`, `safeDetail = { operationType, previousAttempts, cycleStartAttempts }` (strings and integers only). This agrees with DATA §3 and with the review (open item 2). Rules:

- Written in the **same transaction** as the status update and the payload merge (point 3 of 1.2). If the `updateMany` returns 0, nothing is written.
- `previousAttempts` = `attempts` at the time of the click; `cycleStartAttempts` = the value written. Equal on a fresh cycle by construction; kept as two keys because the 401 refund can later make `cycleStartAttempts` differ.
- Applies to `redemption.*` tasks. For `reward.*` tasks `retryOutboxManually` also exists (`:2237`); `@dev` decides whether the same event is used (recommended: yes, with `operationType` telling them apart, and **no** `cycleStartAttempts` change, because reward tasks have no cycle cap). `@qa` asserts the key set per type.

Complete financial catalogue after FT-25/26 (unchanged names from DATA §3, plus these): `financial.operation_retry_scheduled`, `financial.operation_attempts_exhausted` (`reason = attempts_exhausted`), `financial.operation_confirmed_by_reverification`, `financial.operation_retry_requested`, `financial.operation_resolved_manually` (existing), `financial.manual_resolution_contradicted` (new, FT-26; `previousState resolved_manual → nextState pending`, `reason = remote_still_unfulfilled`, `safeDetail { operationType, attempts, cycleStartAttempts }`), `queue.deletion_blocked`, `queue.deletion_resumed`.

## (e) Indexes, locks, `FOR UPDATE` and the race with an in-flight delete

**Lock order (verified): per-queue advisory lock first, then row locks, never the other way.**

| Path | Order | Evidence |
|---|---|---|
| begin / fail / confirm of the cancel | `pg_advisory_xact_lock(hashtextextended(queueId, 0))`, then `FOR UPDATE` on all `reward.%` rows of the queue `ORDER BY id` | `withQueueTransaction` `:91-96`; `:845, :876, :896` |
| `claimNextRewardOperation` | advisory lock, then `FOR UPDATE` on the single candidate row | `:1587-1589` |
| `lockProcessingRewardTask` (every worker write: prepare/complete/retry/failed/unknown/confirm) | advisory lock (of the row's queue), then `FOR UPDATE` on the row | `:37-47` |
| financial `claimNext` | `FOR UPDATE SKIP LOCKED` on one `redemption.*` row, **no queue lock** | `:2136-2155` |

No lock-order inversion exists between these paths, so no deadlock is possible among them. The cancel locks `reward.%` rows only (`'redemption.cancel' LIKE 'reward.%'` is false), writes no `redemptions` or `redemption.*` row, and therefore never contends with the financial worker (I2 holds at the lock level too).

**The in-flight delete race, step by step:**

1. Worker claim and cancel begin both hold the queue advisory lock for their whole transaction, so they are **serialized**. Whoever commits first decides.
2. Worker first: the row is `processing`; begin refuses with `QUEUE_REWARD_OPERATION_PROCESSING` (`:852`) for any `processing` reward task, with a live **or expired** lease. Nothing changes.
3. Cancel first: the row is `cancel_verification`. The claim predicate takes only `pending/retry` or `processing` with an expired lease (`:1575-1578`), and the re-check inside the claim transaction repeats `...due` (`:1589`), so a candidate listed before the cancel is dropped. A second, independent guard: a `reward.delete` is claimable only if `queue.remoteSyncStatus = 'delete_pending'` (`:1607-1614`), and the cancel confirm sets `synced` (`:909`).
4. A worker that already holds an in-memory task but lost the race can only write through `lockProcessingRewardTask`, which requires `status = 'processing'` and the lease token (`:37-43`). A row in `cancel_verification` or `cancelled` returns `null`, so the write becomes `lease_lost`. The worker cannot overwrite the cancel.
5. **The read of `getReward` runs outside the transaction** (service `:73`), with the row in `cancel_verification` and no lock held. That is the intended design: no database lock is held during a remote call. The confirm re-takes the locks and re-checks status, queue lifecycle, `version` CAS and "no other `processing` reward task" (`:896-903`) and finishes with `updateMany ... WHERE status = 'cancel_verification'` and `count === 1` (`:904-907`) and a queue `updateMany` with `version` (`:908-911`).
6. Two concurrent cancels: serialized by the advisory lock. The second begin sees `cancel_verification` and returns `verification_required` without writing audit (`:858-860`). Two confirms: the loser finds no `cancel_verification` row and gets `QUEUE_DELETION_CANCELLATION_STALE` (the service then calls fail, which finds no row and returns `not_cancelled` without writing: `queue-service.mjs:92-95` plus `:877-879`). Idempotent.
7. **Isolation assumption:** Prisma interactive transactions run in PostgreSQL's default `READ COMMITTED`. Each statement sees what committed before it started, and the advisory lock is taken first, so the re-reads after the lock see the other side's commit. This is **the** property T36-4 must prove with two connections and a barrier; do not rely on this reading alone.
8. **Residual window (accepted by the review, confirmed here):** a worker crash leaves `processing` with an expired lease. Begin refuses until the worker reclaims it (about 30 s of lease, `leaseMs = 30_000`). A crash **between** begin and confirm leaves `cancel_verification` with no lease and no expiry: the row stays out of the worker's reach (safe, nothing is deleted) and is listed in Operations (`unresolvedDeletionStatuses`, `:11`). The way out is "repeat cancel" (resume). Nothing else is needed.

**F21 / possibly-sent DELETE (point 7, item A).** `prepareRewardDelete` writes `requestMayHaveReachedTwitch: true` and `safeToDelete: true` in the lease-guarded transaction just before `deleteReward` (`:1767` and `reward-worker.mjs:304-306`). From the data side the refusal is trivially implementable inside begin (`deletion.payload?.requestMayHaveReachedTwitch === true`, read under the same `FOR UPDATE`) and needs no DDL. **But it contradicts the existing integration test**: `tests/integration/qra-postgres-fixtures.test.js:457-488` seeds `reward.delete` `unknown` with `{ requestMayHaveReachedTwitch: true, safeToDelete: true }` and expects `status: 'cancelled'`; `:497-528` seeds `{ requestMayHaveReachedTwitch: true }` and expects the verification path. After FT-36 both seeds would be refused with `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED`. `@dev` must rewrite these two fixtures Red-first (move the cancellable cases to `requestMayHaveReachedTwitch: false` and add the refusal as a new case), and `@po`/`@architect` should be aware of the **product consequence**: every deletion that went `unknown` after a timed-out DELETE (the most common blocked case) can no longer be cancelled; the operator's way out is "retry now", where the worker reads the reward (absent → completes; present and paused → `retry` again). I do not decide the product trade-off; I only confirm that the data model supports it and that it changes behavior for **existing** rows (see (f)).

## (f) Backward compatibility of existing rows

| Existing data | After the change | Needed |
|---|---|---|
| `outbox.status = 'cancel_verification'` left by the current code (no `payload.cancelVerification`) | Resume path reads the key; **missing key → `previousStatus = 'unknown'`**, which is exactly what today's failure path writes (`:880`). No row is left unreadable. | Test T36-14 (legacy row without the key resumes and restores to `unknown`). |
| `reward.delete` `unknown` with `last_error = 'queue_deletion_cancel_verification_failed'` | Stays as is; read as the same case as `..._unavailable`. | Reason mapping accepts both (see (c)). |
| `reward.delete` with `requestMayHaveReachedTwitch: true` in `pending/retry/unknown/failed/conflict` | Cancel is **refused** from now on (behavior change). Rows are not modified. | The two fixtures above; release note in the story. |
| Audit rows `queue.deletion_cancelled` / `..._not_confirmed` with `actor_id NULL` | Stay `NULL`; **no backfill** (the actor is not recoverable and inventing it would break the audit). | Readers must tolerate `NULL`; new rows always carry it. A `queue.deletion_cancel_verification_requested` row of the same attempt carries the actor and is the way to correlate old attempts. |
| `redemption.*` rows with `payload = '{}'` | `cycleStartAttempts ?? 0`: budget = `attempts`. A legacy `unknown` row stays terminal until "retry now" (then a fresh cycle of 6). A legacy `retry` row with `attempts >= 6` becomes `unknown` on its next non-conclusive result (DATA §5) and is never confirmed. | DATA test 11 (already in the plan). |
| `cancelled` `reward.delete` rows from a past cancel | Reused by both delete paths (F18 fix); previous attempt recorded in `payload.previousCancelledAttempt`. | T36-9. |
| Old application version after a rollback of the code | Old code ignores `cancelVerification` and `cycleStartAttempts`, already knows `cancel_verification` (migration `20261014230000`) and accepts any `audit_logs.event` text. A row left in `cancel_verification` by new code is handled by the old failure path (becomes `unknown`). | None. |
| Rollback of the migration `20261014230000` itself | Unchanged (`rollback.sql` turns `cancel_verification` rows into `unknown` with `queue_deletion_cancel_verification_rolled_back` before dropping the status). It remains valid with the new restore semantics. | T36-15 runs `rollback.sql` and the migration again on the isolated database with a `cancel_verification` row present (optional, once). |

Deploy is **code-only**: no lock, no downtime, no order of operations. Before upgrading any non-disposable database, take a `pg_dump` snapshot (project policy: no backup tables in the database). The development database is disposable and is never migrated (owner rule).

## Section 6, point by point

### 1. No DDL for FT-36: CONFIRMADO COM CONDIÇÃO

Evidence: 1.1 above. Conditions: (i) the keys `cancelVerification: { previousStatus, previousLastError, requestedAt }` are written by begin **inside the locked transaction** and merged into the existing payload (never replacing it); `previousStatus` is one of `pending/retry/unknown/failed/conflict`, `requestedAt` is ISO-8601 UTC; (ii) confirm and fail **remove** the key (or move it into the audit `safeDetail`), so a later resume never reads a stale `previousStatus`; (iii) the premise about `entity_id` is corrected in 1.3 (no index exists; none is required now; `@qa` records the `EXPLAIN`).

### 2. Audit catalogue: CONFIRMADO COM CONDIÇÃO

Evidence: (c). Conditions: (i) the service passes `actorId` to confirm and fail, and both methods accept `actorId`/`origin`; (ii) T36-13 asserts the exact key set of the three events (allowlist, no extra keys) and a non-null `actorId` on all three; (iii) the three new reason codes are used verbatim; (iv) the legacy code `queue_deletion_cancel_verification_failed` is read as an alias.

### 3. Transitions of 1.2 as single guarded transactions: CONFIRMADO COM CONDIÇÃO

Every transition is one `withQueueTransaction` that already takes the queue lock and `FOR UPDATE` on the `reward.%` rows (the begin, fail and confirm do today). What `@dev` must change to meet 1.2:

1. **Restore of `previousStatus`** (replaces the unconditional `unknown` at `:880`): `updateMany({ where: { id, status: 'cancel_verification' }, data: { status: previousStatus, lastError: <code>, leaseToken: null, leaseUntil: null } })` with `count === 1`. `nextAttemptAt` is not touched by begin, so a restored `retry` keeps its schedule. Only a **conclusive** negative read (reward absent, diverged, not paused) sets `unknown`; the queue goes to `remoteSyncStatus = 'diverged'` only for `queue_delete_reward_diverged`, as today (`:881-883`).
2. **Blocked pause stage**: begin's target becomes either the `reward.delete` or, when none exists, the `reward.set_open` task with `payload.deleteAfterConfirm = true` in `unknown/failed` (a `pending/retry` pause is refused with `QUEUE_DELETION_PAUSE_IN_PROGRESS`). The three methods currently filter `operationType: 'reward.delete'` (`:877, :898`); they must take the target by `operationId` and allow those two types. Confirm cancels the target **and** every other non-final `reward.*` deletion task of that queue in the same transaction, with `updateMany ... WHERE status IN (non-final)`; the queue `updateMany` keeps the `version` CAS (`:908`). If the pause task is the target and the read says the reward is **not** paused, its `previousStatus` is restored with `queue_delete_cancel_reward_not_paused`.
3. **F18**: (b) above.
4. **I2**: the cancel's `updateMany` calls filter by `operationType IN rewardOperationTypes` and `entityId = queueId`, never by `redemptionId`. `@qa` proves it by a mutation (a cancel that also sets `redemption.*` to `cancelled` must fail T36-8) and by a row count: the number of `redemptions` and `redemption.*` rows and their statuses before and after the cancel are identical.
5. **Final-state statuses** `confirmed` and `cancelled` are never rewritten: every `WHERE` includes the expected current status.

### 4. DATA C3 updated: CONFIRMADO COM CONDIÇÃO

Written in [data-review.md](data-review.md) (C3, and DATA test 3 wording). Fresh cycle of 6; `attempts` monotonic; 401 refund via `cycleStartAttempts += 1` capped at `attempts`; legacy default 0. Conditions: 1.2 items 3-6 (single transaction, no payload replacement, `claimNext` `RETURNING` includes `payload`). Test T-C3 added to the plan: after 6 exhausted attempts, "retry now" gives exactly 6 more attempts, a 401 in the middle does not consume one, and `attempts` never decreases (compare `attempts` before and after).

### 5. DATA C6 updated: CONFIRMADO

Written in [data-review.md](data-review.md) (C6). `resolved_manual` is not in `blockingOperations`; the contradicted path re-arms it. Evidence of the current gap that FT-26 closes: `getQueueDeletionBlockers` (`:1741-1751`) puts every `UNFULFILLED` redemption whose task is not `pending/retry/processing` in `blocked`, which includes `resolved_manual`; `prepareRewardDelete` and `completeQueueDeletion` require `status: { not: 'confirmed' }` to be absent (`:1763, :1782`). The post-resolution re-list is the guard (DATA C5); a manual resolution alone never unblocks `reward.delete`.

### 6. Names: CONFIRMADO

Catalogue names: `attempts_exhausted` (outbox `last_error`, audit `reason`, projection) and `financial.operation_retry_requested`. `retry_exhausted` and `financial.operation_retried_manually` are withdrawn. DATA test 3 wording is updated to "each wait inside its bounds, `next_attempt_at` non-decreasing up to the cap".

### 7. Tests T36-1..T36-13 in the PostgreSQL plan: CONFIRMADO COM CONDIÇÃO

All thirteen are expressible with the existing disposable-PostgreSQL helpers (`tests/helpers/isolated-postgres-image.mjs`, real migrations, label `queuebot.test=disposable`, never SQLite or Prisma mocks, never an active volume). None needs DDL. Conditions for `@dev` (write them Red-first) and `@qa` (run them independently):

- **A. Fixtures that change:** `qra-postgres-fixtures.test.js:457-488` and `:497-528` (see (e), F21). Rewrite before implementing; keep the original assertions on `requestMayHaveReachedTwitch: false` rows and add T36-5 for the refusal.
- **B. T36-4 (race):** two real connections (two Prisma clients), a barrier before each call, N rounds (suggest 50): `claimNextRewardOperation` against `beginQueueDeletionCancellation`. Exactly one wins in every round; the invariant is asserted from the database after each round: `NOT (status = 'processing' AND a cancel_verification audit row exists for that attempt)`. No sleeps as synchronization.
- **C. T36-7 (crash after begin):** simulate by calling begin only, then repeat the request with the same operator and a fresh `Idempotency-Key`: resumes, executes once, writes one `..._requested` row (not two).
- **D. T36-9b (added):** force the "unexpected `reward.delete` row exists in a status other than operator-cancelled" case at `confirmRewardOpen`: it must fail closed (throw/rollback, the pause task stays `processing`) and never silently overwrite.
- **E. T36-14 (added):** a legacy `cancel_verification` row without `payload.cancelVerification` resumes and, on a non-conclusive read, restores to `unknown`.
- **F. T36-15 (added, optional once):** `rollback.sql` and the migration re-applied with a `cancel_verification` row present.
- **G. T-C3 (added):** see point 4.
- **H. T36-13 extension:** the audit key allowlist test also asserts that no `safe_detail` key matches `/user|login|name|token|header|input|body|uid/i`.
- **I.** Lock/plan evidence from 1.3 (`EXPLAIN`), recorded, not asserted.

Mutation proofs of the review stay as written; this note adds one: "restore always to `unknown` instead of `previousStatus`" must fail T36-1 variant with a non-conclusive read (the review's T36-12 covers the stale case; add the 5xx case to the same test).

## Pending for other agents

| Agent | Pending |
|---|---|
| `@po` | Record that F21 changes tested behavior (two fixtures, a stricter cancel for existing rows) and confirm the trade-off with `@architect`/owner; AC 21 wording (already requested by the review). |
| `@architect` | Nothing new. Please acknowledge the `entity_id` index precision (1.3) and the F21 consequence. |
| `@dev` | Starts only after the other gates; this note gives the exact lines (`:880`, `:1683`, `:2153`, `:2237`, the 401 `unknown`). |
| `@qa` | Add T36-9b, T36-14, T36-15 (optional), T-C3 and the `EXPLAIN` record to the plan; run all on isolated PostgreSQL. |

## Change Log

- 2026-10-30 — `@data-engineer` (Dara): written confirmation of section 6 of the architect review (7 of 7 points: 2 CONFIRMADO, 5 CONFIRMADO COM CONDIÇÃO, 0 REFUTADO); no DDL; F18 confirmed with evidence and fixed by reusing the single `reward.delete` row; audit catalogue finalized; DATA C3 and C6 and the wording of DATA test 3 updated in [data-review.md](data-review.md). Read-only analysis; no schema, migration, code, test or container was touched.

## Addendum — Orion decision supersedes F21/D-36-6 (2026-10-30)

This addendum does not rewrite the body above. On cancel with `requestMayHaveReachedTwitch` true, the body proposed refusing (`QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED`). The Orion decided (2026-10-30, see [po-validation.md](po-validation.md) and AC 21): the cancel stays allowed when a read-only `cancel_verification` read proves the exact reward exists and is paused; the refusal applies only when the read is inconclusive or negative after a DELETE attempt. The current fixtures stay valid.

Consequences:

- `@dev`: restore `previousStatus` on a non-conclusive read (as in the body); do NOT refuse when the read is positive (exists and paused); refuse with `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` only when the read is inconclusive/negative after a DELETE attempt; keep `qra-postgres-fixtures.test.js` ~:457-488 and ~:497-528 unchanged (the "rewrite the fixtures" condition no longer applies).
- `@qa`: new T36 "late DELETE after a verified cancel": the open action fails safely and the queue is not reopened without its reward; prove by mutation (remove the re-read in the open action, or reopen without a positive read, and the test must fail). Keep the refusal test for the inconclusive/negative case.
