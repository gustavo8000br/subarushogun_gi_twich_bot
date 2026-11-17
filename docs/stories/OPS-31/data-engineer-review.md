# OPS-31 — Database review (`@data-engineer`): answers, model, concurrency

[Português (pt-BR)](../../pt-BR/stories/OPS-31/data-engineer-review.md)

**Author:** `@data-engineer` (Dara) — **Date:** 2026-11-11 — **Mode:** YOLO (owner absent; decisions marked `[AUTO-DECISION]`).
**Input:** [architect-design.md](architect-design.md) (D-31-1..D-31-11, section 10 questions) — **Story:** [story.md](story.md).
**Evidence class:** static reading of `apps/api/prisma/schema.prisma`, the migration names and the last migration, and `apps/api/src/persistence/queue-repository.mjs` (lock helpers, `claimNext`, `applyEntryTransition`, `moveWaitingEntry`, financial key use). Compose uses `postgres:18.6-bookworm`. **Nothing was executed**: no DDL applied, no migration written, no Docker, no query. All SQL below is **reference, NOT APPLIED**.

## 0. Findings that change the architect's outline

| # | Finding | Effect |
|---|---|---|
| F1 | The notice switches and the new outbox status `expired` are needed by FT-71 (first slice), but the architect puts all columns in the FT-74 migration. | **Two migrations**: M1 with FT-71 (notice switches, `expired` status), M2 with FT-74 (settlement, groups, own list, redemption columns, indexes, guards). |
| F2 | Aggregated notice key `chat.notice:{kind}:{queueId}` is `UNIQUE` forever (`outbox.idempotency_key`): once the first notice is sent, a later burst of the same kind on the same queue can never insert. | Key must carry a merge window: `chat.notice:{kind}:{queueId}:{windowStart}` (window start = `floor(now / 15 s)`, a configuration value). Two summaries across a boundary are accepted; `@dev` confirms against AC 4. |
| F3 | The financial key is always `financial:{redemptionId}` in every writer found (lines 387, 843, 1882, 1902, 2372, 2560 of the repository). | The partial unique index per `redemption_id` is safe on existing rows (no duplicate can exist) and adds protection when a future writer builds another key. |
| F4 | The existing `financial-worker` path `lockProcessingFinancialTask` locks the **outbox row first, without the queue lock**; `lockProcessingRewardTask` locks queue first, then outbox. This is the accepted inversion of TS-20. | The settlement path must not add a third edge: see section 4.3. |
| F5 | New notice defaults "on" would make every existing queue start sending new chat messages after the upgrade. | DB default is `false` for existing rows; the queue creation path sets `true` explicitly. Existing queues behave exactly as today. |
| F6 | `expected_status` on `redemptions` is already written in the same transaction as the financial row. | It is the single-table witness of "intent exists": the cross-table constraint 3 of D-31-7 becomes a `CHECK` on `redemptions` alone (Q2). |

## 1. Answers to the seven questions

**Q1. Four booleans or a text array?** `[AUTO-DECISION]` **Four booleans** on `queues` (`refund_group_subscriber`, `_moderator`, `_vip`, `_own_list`), default `false`. Reason: the set is fixed and small; no array operator is needed in any query; the snapshot is four columns; same style as the three existing refund switches; a new group is an `ADD COLUMN` plus a code change anyway (new scope, new lookup). The broadcaster group is implicit (always a member when a group is on; no column). The API exposes the set as a list.

**Q2. Stored `settlement_state` or derived? How to guarantee constraint 3?** **Stored**, with a single-table `CHECK` that uses `expected_status` as the witness of the intent (F6):
- `settlement_state IN ('held_for_service','awaiting_choice','check_group')` requires `expected_status IS NULL` and `remote_status = 'UNFULFILLED'`;
- `settlement_state = 'intent_recorded'` requires `expected_status IS NOT NULL`;
- `none` is unconstrained (all legacy rows).

Why not a view: the pending list, the deletion blocker and the card count read the state by queue; a derived value needs a join to `outbox` on every read and cannot be indexed. Why not a deferred constraint trigger across `redemptions` and `outbox`: it adds a hidden cross-table rule that Prisma does not model and the unit tests cannot see. The residual gap (`expected_status` set but no outbox row) is exactly the gap that exists today for `expected_status`; the isolated-PostgreSQL test in section 6 proves the two are written together. **Two small guard triggers** on `redemptions` are recommended (one function), because they protect two irreversible invariants against any future code path: (a) `settlement_state = 'intent_recorded'` is absorbing; (b) a conclusive `group_decision` (`eligible`, `not_eligible`) never changes. The application still uses guarded `UPDATE ... WHERE` (compare-and-set) as the primary mechanism; the trigger is the net.

**Q3. Partial unique index per `redemption_id`: safe with existing rows?** **Yes** (F3). `CREATE UNIQUE INDEX outbox_financial_redemption_uidx ON outbox (redemption_id) WHERE operation_type IN ('redemption.cancel','redemption.fulfill')`. Every writer builds `financial:{id}`, whose `UNIQUE` already forbids two rows per redemption, so no existing duplicate is possible; `@dev` runs a duplicate probe before the index (`SELECT redemption_id FROM outbox WHERE operation_type IN (...) GROUP BY 1 HAVING count(*) > 1`) in the migration as a guard that fails loudly. Rows of other types with a `redemption_id` are excluded by the predicate. Build on the current table size is instant for practical purposes; plain `CREATE INDEX` inside the Prisma migration is acceptable (outbox is small; confirm the row count in the dry-run, and use the non-`CONCURRENTLY` form because Prisma runs migrations in a transaction).

**Q4. May `no_show→waiting` and `called→waiting` reuse the position renumbering without a new index?** **Yes.** `moveWaitingEntry` already reads all waiting rows ordered by `(priority_class, position, created_at, id)` under the queue lock and rewrites every `position` with no unique index on `position`; the same helper can insert the returning entry after the first waiting one. No new index. Two points for `@dev`: (a) the transition must clear `called_at`, `call_notified_at`, `call_deadline_at`, `call_acknowledged_at`; (b) for `no_show→waiting` the partial unique index `entries_active_user_per_queue` (`queue_id, twitch_user_id` where status in waiting/called/in_progress) **already refuses** a restore when the viewer has another active entry (`P2002`), so AC "viewer has no other active entry" is guaranteed by the database; map `P2002` to a stable code. The "no terminal intent" rule is read from `redemptions.settlement_state <> 'intent_recorded'` and `expected_status IS NULL` in the same transaction.

**Q5. Own list unique on the user id alone or channel plus user id?** `[AUTO-DECISION]` **User id alone.** One installation has one broadcaster (architect D-31-7); a `broadcaster_id` column would be `NOT NULL` data that may not exist before authorization. Future multi-channel is `ADD COLUMN broadcaster_id` plus swapping the unique index in one migration, with a trivial backfill from `oauth_credentials.broadcaster_id`. Reopen only with a second real channel.

**Q6. Retention when OPS-32 purges user ids at day 7.**
- The new decision columns hold **no** user id (`matched_group` says `own_list`, never who). Nothing in them must be purged.
- Ids live in `entries.twitch_user_id/user_login/display_name/uid`, `redemptions.user_id` (`NOT NULL`) and the own list. Audit carries internal ids and codes only.
- **Rule for OPS-32:** purge the ids of a redemption **only** when `settlement_state IN ('none','intent_recorded')` and its financial task (if any) is terminal. A redemption in `check_group` needs `user_id` for the retry lookup; `awaiting_choice` needs it for the outcome notice. Because `redemptions.user_id` is `NOT NULL`, purge means pseudonymize (overwrite with a fixed placeholder), decided in OPS-32.
- The day-7 "keep" policy of OPS-32 therefore keeps ids of kept items; OPS-32 must show that to the streamer or cap it. Not an OPS-31 blocker.
- The own list is **not** purged by queue archive or deletion; it is removed only by the streamer (remove, clear all) or with the channel data.
- Notices: `chat.notice` rows in `confirmed`/`expired` older than 7 days are deleted by the existing outbox housekeeping (to be added by `@dev`; they carry no id, payload has codes and counts plus entry internal ids).

**Q7. Rollback with queues already in `refund_on_end`.** The migrations are additive (new columns with constant defaults, a new table, indexes, triggers); old code ignores them, so an **application** rollback never needs a database rollback. A **database** rollback is allowed only while the feature has not been used:
1. `M2-down` begins with a guard that raises an exception if any queue has `settlement = 'refund_on_end'` or any redemption has `settlement_state <> 'none'` or the own list is not empty. Under the guard it drops triggers, indexes, constraints, columns and the table, in reverse order.
2. After the first use it is **roll-forward only**: held redemptions are `UNFULFILLED` on Twitch and invisible to the old code; the way out is to resolve them with the choices of the panel (refund or fulfill), then set the queues back to `fulfill_on_start`, then the guard passes.
3. The API refuses `refund_on_end` until FT-76 exists (architect section 6), so no production queue can reach this state before the money slice.
4. Before M2 in any real environment: `pg_dump` (never a backup table in the database). `M1-down` is a plain drop of four columns and the restoration of the old outbox status check.

## 2. Proposed model (reference DDL, NOT APPLIED)

### 2.1 Migration M1 — with FT-71 (notices)

```sql
-- REFERENCE, NOT APPLIED
ALTER TABLE "queues"
  ADD COLUMN "notice_joined"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notice_refusal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notice_state"   BOOLEAN NOT NULL DEFAULT false,   -- paused/closed/reopened/reorder/cleared (aggregated)
  ADD COLUMN "notice_outcome" BOOLEAN NOT NULL DEFAULT false;   -- service end, no-show, skip, restore, points

ALTER TABLE "outbox" DROP CONSTRAINT "outbox_status_check";
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_status_check" CHECK ("status" IN
  ('pending','processing','retry','confirmed','conflict','unknown','failed','cancelled','resolved_manual','cancel_verification','expired'))
  NOT VALID;
ALTER TABLE "outbox" VALIDATE CONSTRAINT "outbox_status_check";
```

The four groups of switches are a proposal; `@ux-design-expert` fixes the grouping, the columns follow. `chat.notice` needs no new column: `expires_at` travels in the payload and the worker checks it when claiming (the claim already filters by `status` and `next_attempt_at` through `outbox_status_next_attempt_at_idx`). `expired` is not a financial status: `claimNext` of the financial worker selects only the two financial types, so it never sees it.

### 2.2 Migration M2 — with FT-74 (settlement)

```sql
-- REFERENCE, NOT APPLIED
-- queues
ALTER TABLE "queues"
  ADD COLUMN "settlement" TEXT NOT NULL DEFAULT 'fulfill_on_start',
  ADD COLUMN "refund_group_subscriber" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refund_group_moderator"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refund_group_vip"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refund_group_own_list"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "queues" ADD CONSTRAINT "queues_settlement_check"
  CHECK ("settlement" IN ('fulfill_on_start','refund_on_end'));

-- redemptions (the table that grows: constraints NOT VALID, then VALIDATE)
ALTER TABLE "redemptions"
  ADD COLUMN "settlement_state" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "group_decision" TEXT,
  ADD COLUMN "matched_group" TEXT,
  ADD COLUMN "settlement_mode" TEXT,
  ADD COLUMN "group_checked_at" TIMESTAMPTZ(3),
  ADD COLUMN "group_unknown_reason" TEXT;

ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settlement_values_check" CHECK (
  "settlement_state" IN ('none','held_for_service','awaiting_choice','check_group','intent_recorded','settled_external')  -- DB-20: six states
  AND ("group_decision" IS NULL OR "group_decision" IN ('eligible','not_eligible','unknown'))
  AND ("matched_group" IS NULL OR "matched_group" IN ('broadcaster','own_list','moderator','vip','subscriber'))
  AND ("settlement_mode" IS NULL OR "settlement_mode" IN ('fulfill_on_start','refund_on_end'))
  AND ("group_unknown_reason" IS NULL OR "group_unknown_reason" IN
    ('scope_missing','unauthorized','forbidden','rate_limited','twitch_unavailable','timeout','malformed_response','channel_not_eligible','lookup_error'))
) NOT VALID;

ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_decision_shape_check" CHECK (
  ("group_decision" IS NULL AND "matched_group" IS NULL AND "group_unknown_reason" IS NULL
     AND "group_checked_at" IS NULL AND "settlement_mode" IS NULL)
  OR ("group_decision" IS NOT NULL AND "group_checked_at" IS NOT NULL AND "settlement_mode" IS NOT NULL
     AND ("matched_group" IS NOT NULL) = ("group_decision" = 'eligible')
     AND ("group_unknown_reason" IS NOT NULL) = ("group_decision" = 'unknown'))
) NOT VALID;

ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settlement_state_check" CHECK (
  ("settlement_state" NOT IN ('held_for_service','awaiting_choice') OR "group_decision" = 'eligible')
  AND ("settlement_state" <> 'check_group' OR "group_decision" = 'unknown')
  AND ("settlement_state" NOT IN ('held_for_service','awaiting_choice','check_group')
        OR ("expected_status" IS NULL AND "remote_status" = 'UNFULFILLED'))
  AND ("settlement_state" <> 'intent_recorded' OR "expected_status" IS NOT NULL)
) NOT VALID;
-- then: VALIDATE CONSTRAINT for the three (SHARE UPDATE EXCLUSIVE lock, no write block)

-- one financial task per redemption (Q3)
CREATE UNIQUE INDEX "outbox_financial_redemption_uidx" ON "outbox"("redemption_id")
  WHERE "operation_type" IN ('redemption.cancel','redemption.fulfill');

-- pending list, deletion blocker, card count (section 3)
CREATE INDEX "redemptions_pending_settlement_idx" ON "redemptions"("queue_id","redeemed_at","redemption_id")
  WHERE "settlement_state" IN ('held_for_service','awaiting_choice','check_group');

-- own list, one per channel (Q5)
CREATE TABLE "refund_list_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "twitch_user_id" TEXT NOT NULL UNIQUE CHECK ("twitch_user_id" ~ '^[0-9]{1,20}$'),
  "label" TEXT CHECK ("label" IS NULL OR char_length("label") BETWEEN 1 AND 60),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "created_by" TEXT
);

-- guard triggers (Q2): absorbing intent, immutable conclusive decision
CREATE FUNCTION redemptions_settlement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.settlement_state = 'intent_recorded' AND NEW.settlement_state <> 'intent_recorded' THEN
    RAISE EXCEPTION 'settlement_state intent_recorded is absorbing' USING ERRCODE = '23514';
  END IF;
  IF OLD.group_decision IN ('eligible','not_eligible') AND NEW.group_decision IS DISTINCT FROM OLD.group_decision THEN
    RAISE EXCEPTION 'conclusive group_decision is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER redemptions_settlement_guard BEFORE UPDATE OF settlement_state, group_decision ON "redemptions"
  FOR EACH ROW EXECUTE FUNCTION redemptions_settlement_guard();
```

Notes:
- **Compatibility.** On PostgreSQL 18 (compose image) `ADD COLUMN` with a constant default is a metadata change: no table rewrite. Inline `CHECK` on `ADD COLUMN` is avoided on `redemptions`; the constraints are `NOT VALID` then `VALIDATE` so the scan does not block writes. The existing rows already satisfy every constraint (state `none`, all new columns `NULL`), so validation cannot fail. `queues` is tiny and takes inline constraints.
- **No backfill.** Existing redemptions stay `none` with a `NULL` decision; this is exactly today's behavior. Redemptions whose entry closed with the switch off and that stayed `UNFULFILLED` (residue R2) are **not** touched; OPS-31 does not change normal entries.
- **Defaults are the safe ones:** `fulfill_on_start`, all groups off, state `none`, notices off for old queues (F5).
- **Prisma.** Add the columns and the table to `schema.prisma`; partial indexes, triggers and constraints stay in migration SQL (the file already documents that Prisma 6.19 cannot express partial indexes). `prisma migrate diff` must show no drift after the SQL is hand-added; `@dev` confirms.
- **Foreign keys.** None new: the own list is standalone; `redemptions` keep their `queue_id` FK (`Restrict`).
- **Audit.** No schema change. New events are strings; `safe_detail` carries codes and counts only. `refund_list.*` events carry a count, never a user id or label. `actor_id` keeps today's type.

### 2.3 Twitch numeric ids and masking

Ids are `TEXT` with a numeric `CHECK` in the new table; the existing tables are not altered (a scan for no gain). Logs and audit never carry `twitch_user_id`, login, display name or label; the label is returned only by the authenticated panel endpoint. Group lookup code passes ids to Helix and discards them; the batch result returns counts. A log-capture test in section 6 asserts it.

## 3. Real queries and the indexes that serve them

| # | Query | Frequency | Served by | New index? |
|---|---|---|---|---|
| Q-a | Pending decisions of one queue (`settlement_state IN (3 states) AND queue_id = ?` ordered by `redeemed_at`) | Every panel refresh of the queue | `redemptions_pending_settlement_idx` (partial) | Yes |
| Q-b | Deletion blocker: `EXISTS` pending for the queue | Each deletion step / wait | same | No (shared) |
| Q-c | Count of pending for the queue card | Panel list | same | No (shared) |
| Q-d | Own list membership by user id | Each lookup (at most one per redemption decision; batch: `= ANY(ids)`) | `UNIQUE (twitch_user_id)` | Yes (the unique) |
| Q-e | Financial task by redemption | Every transition | `outbox_financial_redemption_uidx` and the existing key unique | Yes (guarantee, not speed) |
| Q-f | Batch prepare: active redemption entries of the queue without a stored decision | Clear/delete | existing `entries(queue_id, status, priority_class, position)`; join to `redemptions` by primary key | No |
| Q-g | Waiting renumbering for skip/restore | Per action | existing entries index | No |
| Q-h | Notice claim and expiry | Chat worker | existing `outbox(status, next_attempt_at)` | No |
| Q-i | Retention: purge by archived queue (OPS-32) | Daily | none before a measurement | No |

The pending index is partial: the pending set is small (people waiting for the streamer) while `redemptions` grows without bound, so a full index would carry mostly dead rows. No index on `group_decision` or `matched_group`: no query filters by them. No other index is proposed before a measurement.

## 4. Concurrency

### 4.1 Isolation level

`[AUTO-DECISION]` **Keep READ COMMITTED** (Prisma default; nothing in the repository sets another level). Correctness comes from three things, not from the isolation level:
1. the per-queue advisory lock (`lockQueue`), taken first in every transaction of this feature;
2. **re-read after the lock**, then guarded writes (compare-and-set): `UPDATE redemptions SET ... WHERE redemption_id = $1 AND settlement_state = $expected` and a check of the affected row count;
3. the constraints: unique financial key, unique financial-per-redemption index, state `CHECK`s, guard trigger.

`SERIALIZABLE` is rejected: it would add `40001` retries to every path, protect nothing the lock does not, and the lock already serializes per queue. `REPEATABLE READ` is rejected for a worse reason: a snapshot taken before the lock wait would be stale after it.

### 4.2 Advisory lock vs `FOR UPDATE SKIP LOCKED`

- **Advisory lock per queue** is the tool for the critical section "decide and write the single terminal intent": it blocks and waits, so the second request sees the first one's result and takes the "already done / contradictory" branch. It also covers rows that do not exist yet (the financial row is inserted inside the section).
- **`SKIP LOCKED` is wrong here**: skipping would drop a streamer's action or a batch member silently. It stays where it belongs, in `claimNext` (work claiming, where skipping is the point).
- **Add `SELECT ... FROM redemptions WHERE redemption_id = $1 FOR UPDATE`** after the queue lock when a path decides for one redemption: cheap defense for a path that misses the queue lock (the reconciliation path takes it, but a future one may not). The row lock is the second layer; the unique indexes are the third.

### 4.3 Lock order and deadlocks

Mandatory order for every OPS-31 transaction: **queue advisory lock → `redemptions` row(s) → insert of the new `outbox` row**, never `FOR UPDATE` on an **existing** financial outbox row (it is only read without a lock to detect the recorded intent; the code at line 2304 already reads it that way). Reasons:
- It matches `lockProcessingRewardTask` (queue, then outbox) and `requestQueueDeletion`.
- The financial worker path (`lockProcessingFinancialTask`, outbox row first, no queue lock) and `retryOutboxManually` are the known inversion of TS-20. Settlement code takes only an insert on `outbox`, which waits on nobody but a concurrent insert of the **same** key, and that concurrent insert is behind the queue lock. So settlement adds no edge to the TS-20 cycle.
- Batches order their row locks by `redemption_id` (`... WHERE redemption_id = ANY($ids) ORDER BY redemption_id FOR UPDATE`) so two paths on overlapping sets lock in the same order. Two batches on the same queue are serialized by the advisory lock anyway; the ordering protects against a future path that locks rows without the queue lock.
- `SET LOCAL lock_timeout = '5s'` on settlement transactions: a wait never becomes a hang; `55P03` and `40P01` map to a generic retryable error with `referenceId`. The TS-20 probe is extended (section 6) to include a settlement transaction.
- The Twitch lookup runs **outside** every transaction (architect D-31-2); no lock is held across network I/O.

### 4.4 Race fulfill x cancel (and its siblings)

Each transaction of the pair does: lock queue; lock the redemption row; re-read entry (`version`) and `settlement_state`; if `intent_recorded` (or `expected_status` set) take the "already done / contradictory" branch (audit `settlement.contradictory_request`, no write); otherwise guarded `UPDATE ... SET settlement_state='intent_recorded', expected_status=...` plus `INSERT INTO outbox ... ON CONFLICT ("idempotency_key") DO NOTHING RETURNING id`. If the insert returns no row the transaction treats it as "already done" and does not touch the state. Outcome for any pair: exactly one financial row, the loser gets a stable answer, never a 500.

Idempotency: panel operation key (`ProcessedOperation`) replays the stored response; the financial key is idempotent by `ON CONFLICT DO NOTHING`; the decision write is a guarded `UPDATE ... WHERE group_decision IS NULL OR (group_decision = 'unknown' AND settlement_state = 'check_group')`.

### 4.5 Batch (AC 26)

- **Step 1 (prepare):** lookups in chunks of 100 outside any transaction; then one short transaction **per chunk** (queue lock, re-read, guarded decision writes, set-based with `UNNEST`), so a slow Twitch never holds the lock and a failed chunk does not lose the others. Decisions written are immutable and stay valid even if the streamer abandons step 2.
- **Step 2 (confirm):** **one transaction**: queue lock; compare the confirmation snapshot (existing mechanism); set-based `UPDATE redemptions ... FROM unnest(...)` for the members by the chosen action; set-based `INSERT INTO outbox ... ON CONFLICT DO NOTHING RETURNING redemption_id` (the returned count is the number of requested tasks; conflicts count as "already decided"); close the entries; audit rows per outcome with counts. `check_group` items are excluded by the `WHERE` of the update (batch never decides them). `statement_timeout` and `lock_timeout` bound the step; if a queue can exceed a few thousand active redemptions, `@dev` measures one transaction before splitting (not assumed).
- **Race batch x single action:** serialized by the queue lock; the loser re-reads, sees the new state or a stale snapshot, and refuses with the existing stale-snapshot code.
- **Race batch x worker:** the worker never takes the queue lock for confirm/retry paths and only touches existing outbox rows; settlement only inserts new rows. No shared lock edge.

## 5. Compatibility

**OPS-22 (outbox and financial recovery) — no change.**
- `redemption.cancel`/`redemption.fulfill`, key `financial:{redemptionId}`, `claimNext`, leases, `unknown`/`conflict`/`failed`, manual resolution, `cancel_verification`: untouched. A held redemption has no outbox row, so the worker cannot claim it by construction.
- The only edit to a shared object is the outbox status `CHECK` (M1 adds `expired`, for `chat.notice` only). `claimNext` filters by the two financial types; the OPS-22 status list in the panel does not change.
- Reconciliation that observes a remote terminal status on a held redemption must set `expected_status` and `settlement_state = 'intent_recorded'` together (the `CHECK` fails loudly otherwise). `@dev` confirms the reconciliation write at line 2630.
- A redemption leaves `check_group` exactly when the financial row is created (the `CHECK` on `expected_status` makes the two mutually exclusive).

**OPS-32 ("Old queues", 7 days).**
- Archiving is a flag on the queue; the pending list reads by `redemptions.queue_id` through the partial index, so pending decisions stay visible and actionable in an archived queue. Deletion stays blocked while any of the three states exists (D-31-6 rule 4).
- The day-7 default policy (refund, keep, fulfill) is a **caller** of the same transition with a system actor and origin; same guarded updates, same `ON CONFLICT DO NOTHING`, so it is idempotent and safe if the streamer acts at the same moment (queue lock).
- Id purge follows the Q6 rule. No conflict with the model; the "keep" policy retains ids by design.
- Restarting a queue into a new one copies the configuration (including the four group flags and `settlement`) and never the redemption columns; the own list is per channel, so it is not copied.

## 6. Integration test plan (isolated PostgreSQL, real migrations, disposable instance)

**Barrier technique (deterministic, no sleeps):** two independent connections; each runs the real repository function up to a test seam placed after the queue lock and before the intent write; the test releases both with a shared promise and, before releasing, polls `pg_locks`/`pg_stat_activity` (`wait_event_type = 'Lock'`, `wait_event = 'advisory'`) until one backend is observed waiting on the advisory lock. This proves the serialization instead of assuming it.

| New file | Cases |
|---|---|
| `tests/integration/settlement-migration-postgres.test.js` | M1 and M2 apply on a database with existing queues/redemptions/outbox rows; old rows keep `fulfill_on_start`, `none`, `NULL`; notices default off; each `CHECK` refuses its invalid row (decision shape, state vs decision, state vs `expected_status`, `remote_status`, own-list id format, label length); guard trigger refuses `intent_recorded` leaving and a conclusive decision change; `VALIDATE` passes; `M2-down` guard refuses when the feature was used and passes when not; `prisma migrate diff` reports no drift |
| `tests/integration/settlement-race-postgres.test.js` | Barrier pairs: conclude x remove(no refund); two opposite choices; start x remove; two "retry now"; clear x conclude; two identical choices (idempotent, one task); timer no-show x panel choice. Each: exactly one financial row, `expected_status` matches the winner, loser gets the stable code, one `settlement.contradictory_request` only when the choices differ, no `40P01`/`40001` |
| same file | **Lock bypassed** (raw SQL transactions, no advisory lock): second insert with the same key refused by the key unique; second insert with a **different** key (`financial:R:x`) refused by `outbox_financial_redemption_uidx`; this proves the index adds what the key does not |
| `tests/integration/settlement-batch-postgres.test.js` | AC 26: counts by outcome; `check_group` never decided by the batch; stale snapshot refused; batch x single action; batch x batch on the same queue; `ON CONFLICT` counted as "already decided"; set-based statement count independent of N (assert the number of statements for 10 and 500 items) |
| `tests/integration/settlement-deadlock-postgres.test.js` | TS-20 probe extended: `retryOutboxManually` x `requestQueueDeletion` x a settlement transaction in all orders: each ends with commit or `40P01`/`55P03` mapped to a generic error, never a hang (bounded by `lock_timeout`) |
| `tests/integration/settlement-ops22-compat-postgres.test.js` | Held redemption is never claimed by `claimNext`; concurrent worker confirm of another task while settlement runs; reconciliation observing a remote terminal on a held row sets `expected_status` and `intent_recorded` together; `check_group` and financial `unknown` are mutually exclusive |
| `tests/integration/settlement-deletion-postgres.test.js` | Deletion stays in `deleting` while any of the three states exists; archived queue still lists pending; restart copies config but not redemption columns |
| `tests/integration/settlement-skip-restore-postgres.test.js` | `called→waiting` and `no_show→waiting`: position after the first waiting entry, call timestamps cleared, `P2002` mapped when another active entry exists, refused when `intent_recorded` |
| `tests/integration/chat-notice-outbox-postgres.test.js` | Merge window key (F2): burst in one window writes one row; next window inserts a new one; `expired` accepted by the status `CHECK`; financial worker ignores `chat.notice` |
| log-capture assertion inside the files above | Captured logs and `audit_logs.safe_detail` contain no user id, login, display name or label |

Classes stay separate (project rule): these are PostgreSQL integration tests; unit tests of the rules and Twurple fakes are `@qa`'s other classes (architect section 7).

## 7. Risks and what `@dev` must confirm

| # | Risk | Mitigation | Owner |
|---|---|---|---|
| R1 | Two migrations instead of one (F1) change the slice plan | Documented here; FT-71 carries M1, FT-74 carries M2 | `@po`/`@dev` accept |
| R2 | Notice merge window (F2) can produce two summaries across a boundary | Window is configuration; test fixes behavior; AC 4 wording "per burst" | `@dev` confirm |
| R3 | Guard trigger is hidden logic | One function, two rules, covered by migration test; the app still uses guarded `UPDATE` first | `@dev` confirm acceptable; else drop and keep tests |
| R4 | `prisma migrate diff` drift with hand-added partial indexes/triggers | Already the project's practice (converted tombstone index) | `@dev` run in dry-run |
| R5 | Reconciliation (line 2630) and the other `expected_status` writers must set both fields | The `CHECK` fails loudly; test in compat file | `@dev` |
| R6 | A very large batch in one transaction | Set-based SQL, `lock_timeout`/`statement_timeout`; measure before splitting | `@dev`/`@qa` |
| R7 | Own list cap (500) is app-level only | Count under a dedicated advisory lock inside the add transaction | `@dev` |
| R8 | Rollback after first use is roll-forward only | Guarded down script; API refuses `refund_on_end` before FT-76 | `@dev` |
| R9 | Retention of ids for kept (`check_group`/`awaiting_choice`) items | Q6 rule; OPS-32 must display it | OPS-32 |
| R10 | PG18 behavior for `NOT VALID`/`VALIDATE` inside Prisma's migration transaction | Run in the isolated instance; fall back to inline checks (tables are small today) | `@dev` |

Depends on `@dev` before FT-74: items R2, R3, R4, R5, R10 plus a row-count of `outbox` and `redemptions` in a representative database. Depends on the owner: nothing new.

## 8. Score

**8.8 / 10** for the model against the 9.0 goal. Strong: single-table `CHECK`s that make the invariants testable, the partial unique index, no backfill, additive reversible migrations, consistent lock order that adds no deadlock edge, a deterministic barrier plan. Withheld 0.2 because nothing was executed: R3, R4, R10 and the statement behavior on PG18 are unproven, and F2 changes an architect rule. Reaches 9.0 once `@dev` confirms those on the isolated instance and `@qa` runs the plan of section 6.

## 9. Review of design v2.2 (M1..M4, policy, live session) — 2026-11-15

**Author:** `@data-engineer` (Dara) — **Mode:** YOLO — **Input:** [architect-design-v2.md](architect-design-v2.md) (3.10, 3.11, 3.12, 10, 18), [decisions-for-owner.md](decisions-for-owner.md), sections 0-8 above.
**Evidence class:** static reading in the worktree `.local/ops31-wt` of `apps/api/prisma/schema.prisma:1-207`, the 13 migrations under `apps/api/prisma/migrations/`, and `apps/api/src/persistence/queue-repository.mjs` (lock helpers, settings use, external-status writers). **Nothing was executed**: no DDL applied, no migration written, no Docker, no query, no `EXPLAIN`. All SQL here is **reference, NOT APPLIED**. Anything not read in code is marked **HYPOTHESIS**.
**Owner decisions used as fact:** Q-3 (a refund without a live counts against the LAST session), Q-4 (only `type=live` opens a session), merge window configurable (default 10 min), LIVE-1 (the end of a live does not change queues, entries or redemptions), per-queue policy S1..S5 (default `wait`).

### 9.1 Verdict and score

**Score of the data plan: 8.5 / 10 as written (below the 9.0 minimum). Projected 9.3 once corrections C1, C2, C3 and C4 of 9.3 are accepted and the test plan of 9.4 runs green on an isolated PostgreSQL 18.** Nothing is executed, so the projection is not a result.

Why 8.5. Strong: all four migrations are additive, constant-default, no backfill and each has a defined down; `stream_sessions` touches no existing table and has no foreign key (LIVE-1 is structural, item 6); the cap reuses `redemptions.user_id` instead of a new personal-data store; the lock order of 4.3 is kept and the session code adds no lock edge. Withheld: one contradiction that would fail at runtime (DB-1: the `CHECK` of section 2.2 forbids `awaiting_choice` without an `eligible` decision, but v2.1 needs it for non-members); a false lock claim about `NOT VALID`/`VALIDATE` inside one migration transaction (DB-2); a behavior window between M3 and P7 for queues created in that period (DB-3); three under-specified points (`refunded_at` population, failed refund, merge-window location). No Critical finding.

### 9.2 Answers

**Item 1 — M3 (policy columns, `settlement_policy_rev`, two-step `DEFAULT`, `legacy` backfill).**
- *Order inside the migration* (design v2:477): (1) one `ALTER TABLE "queues" ADD COLUMN ...` with all seven columns (one `ACCESS EXCLUSIVE`, metadata only); (2) `ALTER COLUMN settlement_on_close_switch_off SET DEFAULT 'wait'` (but see DB-3: recommended to move to P7); (3) `ADD CONSTRAINT ... CHECK ... NOT VALID` for the closed sets and ranges; (4) `VALIDATE`; (5) on `redemptions`: `ADD COLUMN "refunded_at" TIMESTAMPTZ(3)` (nullable, no default) and the partial index. The M3 DDL must **not** reference M2 columns (`settlement_state`), so M3 stays DDL-independent of M2; the coupling is semantic only (`wait` needs `awaiting_choice`).
- *Locks on PostgreSQL 18:* `ADD COLUMN` with a constant default and `SET DEFAULT` are catalog-only (no table rewrite; since PG 11 the default is stored as the column's "missing value"). They still take `ACCESS EXCLUSIVE` on `queues` briefly and queue behind any open transaction that touched `queues`; set `lock_timeout` in the migration and run with the app stopped (no `lock_timeout` or `statement_timeout` exists in `queue-repository.mjs`; the 4.3 plan introduces them). `CREATE INDEX` on `redemptions` (not `CONCURRENTLY`) takes `SHARE`, blocks writes and scans the whole table once even though the predicate is false for every row. `redemptions` is the only table that grows: measure its row count in the dry-run. `CONCURRENTLY` needs its own single-statement migration file (**HYPOTHESIS**: Prisma sends a file as one implicit transaction; to be checked in the dry-run).
- *Safety with real data:* the constant default **is** the backfill. Existing rows read `legacy` without being rewritten (**test it**: `pg_class.relfilenode` of `queues` and `redemptions` is identical before and after, `pg_attribute.atthasmissing` is true for the new columns, `count(*) WHERE settlement_on_close_switch_off = 'legacy'` equals the queue count). The second `SET DEFAULT` does not touch existing rows. `prisma migrate diff` shows no drift only after that statement, because `schema.prisma` will declare the final default (**HYPOTHESIS** to confirm in the dry-run).
- *Reversal:* `DROP INDEX`, `DROP CONSTRAINT`, `DROP COLUMN` (loses the policy values and the refund timestamps only). **Guard** (new, DB-6): refuse when any redemption has `refunded_at IS NOT NULL`, or any redemption is in `awaiting_choice`/`held_for_service`/`check_group`, or any queue has `settlement = 'refund_on_end'`. Without the guard, dropping the columns silently turns every `wait` queue back into today's `legacy` behavior (the deletion re-list refunds residue, design v2:241) while M2 states remain. Down file name: the project already uses `rollback.sql` in the migration folder (`20261014230000_outbox_deletion_cancel_verification/rollback.sql`); design v2:480 says `down.sql`: align to `rollback.sql`.
- *Window finding:* see DB-3.
- Optional net: a trigger on `queues` that refuses `settlement_on_close_switch_off` going from a non-`legacy` value back to `legacy` (the "one-way door" of design v2:225). Application compare-and-set on `settlement_policy_rev` (`UPDATE ... WHERE id = $1 AND settlement_policy_rev = $2`) is the primary mechanism; no trigger is needed for the rev.

**Item 2 — `refunded_at`, partial index, nulling job, failed refund.**
- *Index:* `CREATE INDEX redemptions_refunded_cap_idx ON redemptions (queue_id, user_id, refunded_at) WHERE refunded_at IS NOT NULL`. The count `WHERE queue_id = $1 AND user_id = $2 AND refunded_at >= $3` implies the predicate (strict operator), so the planner can use it. The index holds only rows refunded within the horizon (bounded by the 72 h job or the last session), so it is tiny and the count under the queue lock is a short index range scan (expected: microseconds to low milliseconds; **HYPOTHESIS until `EXPLAIN (ANALYZE, BUFFERS)` on a synthetic 1M-row `redemptions`**). Batch (S4, panel clear): one set-based `GROUP BY user_id` with `user_id = ANY($ids)`. Capture the window start with one `SELECT` and pass it as a literal, so a concurrent session write cannot give two different starts inside one transaction (READ COMMITTED). No lock edge: the settlement transaction only reads `stream_sessions`.
- *Optional CHECK (NOT VALID then VALIDATE):* `CHECK (refunded_at IS NULL OR expected_status = 'CANCELED')`. Existing rows satisfy it (all NULL). Uses only existing columns. Caveat: `applyEntryTransition` with `origin=external` writes `expectedStatus: null` (`queue-repository.mjs:2355`); that path is guarded for rows with an intent (`:2303-2307`), and the CHECK would fail loudly otherwise: a feature, to be covered by a test.
- *Nulling job (72 h):* horizon `COALESCE(LEAST(now() - interval '72 hours', last_session_start), now() - interval '72 hours')` (`LEAST` ignores `NULL`; the `COALESCE` makes the no-session case explicit). One batched statement `UPDATE redemptions SET refunded_at = NULL WHERE redemption_id IN (SELECT redemption_id FROM redemptions WHERE refunded_at IS NOT NULL AND refunded_at < $horizon LIMIT 500 FOR UPDATE SKIP LOCKED)`. `SKIP LOCKED` is right **here** (housekeeping, retried next run), unlike settlement (4.2). The guard trigger of 2.2 is `BEFORE UPDATE OF settlement_state, group_decision`, so a `refunded_at`-only update does not fire it. The job needs no queue lock: a row older than the horizon has an absorbing `intent_recorded`. A long or stale open session keeps its refunds un-nulled (bounded set, harmless). The counted window `>= session_start` never reaches below the horizon because the horizon is `LEAST(72 h, session start)`. The job is timer-driven only; it must **not** be called from the `stream.offline` handler (LIVE-1, item 6).
- *Honest limit of the job as privacy control:* `redemptions.user_id` (NOT NULL) and `expected_status = 'CANCELED'` stay forever, so nulling `refunded_at` removes only a timestamp, not the fact that a person was refunded. The real control is the OPS-32 pseudonymization (item 7). Keep the job (cheap, bounds the index), but do not describe it as erasure.
- *Failed refund:* **count at the moment of the intent and do not give budget back** (recommended; `@po` confirms). Reason (database): giving it back means a write to `redemptions` from the financial worker path, which locks the outbox row first and takes no queue lock (`queue-repository.mjs:69-75`, `confirm` at `:2416`, `:2454`), a new lock edge in the TS-20 inversion. The conservative side costs nothing: over the cap a refund only waits for the streamer (design v2:221), so no money is lost. `resolved_manual` with `remoteConfirmed: false` is counted the same way.
- *Open semantic point:* which refunds set `refunded_at` is not defined (design v2:274 says "the refund intent"): the cap-governed ones only (end of service, policy `refund`), or also the streamer's panel refunds and the refusal cancels? Proposal: set it for every `redemption.cancel` intent with a person-visible refund cause (`group_refund_on_end`, policy `refund`, streamer choice `refund`), not for refusal cancels (no entry was served). `@architect`/`@po` decide (DB-5).

**Item 3 — M4 `stream_sessions`.**
- *Table (reference):* `broadcaster_id text NOT NULL`, `twitch_stream_id text NOT NULL`, `stream_session_id uuid NOT NULL`, `started_at timestamptz(3) NOT NULL`, `ended_at timestamptz(3) NULL`, `source text NOT NULL CHECK (source IN ('event','reconciled'))`, `created_at timestamptz(3) NOT NULL DEFAULT now()`. **Primary key `(broadcaster_id, twitch_stream_id)`** (the design lists no key; this is the deduplication key and replaces a surrogate id). `CHECK (ended_at IS NULL OR ended_at >= started_at)`, `CHECK (char_length(twitch_stream_id) BETWEEN 1 AND 64)`, same for `broadcaster_id` (do not assume digits: **HYPOTHESIS**). No foreign key to any table.
- *Indexes (3, all tiny: a few rows per day, about 300 in 90 days):* the PK; `UNIQUE (broadcaster_id) WHERE ended_at IS NULL` (one open row per channel); `(broadcaster_id, started_at DESC, twitch_stream_id DESC)` for "latest session" and the deterministic order of design v2:269. No index for the purge (sequential scan on a table this size).
- *Duplicate `online`:* `INSERT ... ON CONFLICT (broadcaster_id, twitch_stream_id) DO NOTHING` names one arbiter. A violation of the **other** unique index (the partial one) is not absorbed by it and raises `23505`. So the order inside the transaction is fixed: close the other open row first, then insert; and the per-channel lock is mandatory, not an optimization.
- *Per-channel lock:* `pg_advisory_xact_lock(<class>, hashtext(broadcaster_id))` in the **two-int** form. PostgreSQL keeps the two-int and the single-bigint key spaces apart, so it cannot collide with `lockQueue` (`hashtextextended(queueId, 0)`, `queue-repository.mjs:36-38`); use a **new class constant different from `1868787013`** (the account lock, `:80-82`), because `hashtext` could return `1`. Collisions between channels would only serialize them. The session transaction never takes a queue lock and no queue transaction takes the channel lock (it reads `stream_sessions` without lock), so there is no lock edge.
- *Atomic merge* (one short transaction, READ COMMITTED, under the channel lock): (1) ignore if `type <> 'live'`; (2) take the lock; (3) read the previous row `max(started_at, twitch_stream_id)` with `started_at <= T`; (4) `UPDATE ... SET ended_at = GREATEST(started_at, T), source = 'reconciled' WHERE ended_at IS NULL` for any other open row; (5) `stream_session_id` := the previous row's if it ended and `T - ended_at <= merge window` (inclusive) or was just closed in (4), else `gen_random_uuid()`; (6) `INSERT ... ON CONFLICT DO NOTHING`. Repeated delivery stops at (6). Close: `UPDATE ... WHERE twitch_stream_id = $1 AND ended_at IS NULL` is idempotent by itself. A late `online` of an **earlier** stream than an already stored row can invalidate the `stream_session_id` of the later rows; the design does not say what happens (DB-8): recompute the ids of rows with `started_at >=` the inserted one inside the same transaction, or document it as accepted.
- *Retention:* delete **whole sessions** (never a row of a session whose other rows stay, which would move the session start): sessions whose last `ended_at` is older than 90 days, never the most recent session and never one with an open row. One statement on the same timer as the nulling job. Stale open rows are closed by reconciliation/fusion, not by the purge.
- *Where to keep the merge window and `reentry_window_hours`:* the schema has **no channel-settings table** (`schema.prisma:1-207`; `OAuthCredential` at `:161` holds credentials, one row per client; `Setting` at `:154` is a key/`JSONB` store). Recommend a **`settings` row** `live_session_policy` = `{ schemaVersion: 1, revision, mergeMinutes }`, an absent row meaning 10, following the existing precedent of `chat_command_policies` (versioned JSON, `lockScopedOperation`, audit; `queue-repository.mjs:96-98`, `:315-338`). Then M4 contains **one new table and no `ALTER` of an existing table**, the setting needs no migration or backfill, "a change applies only to events received after it" is natural, and M4-down is `DROP TABLE` plus deleting the key. Defence in depth (optional): a `CHECK` on `settings` using `CASE WHEN key = 'live_session_policy' THEN jsonb_typeof(value->'mergeMinutes') = 'number' AND (value->>'mergeMinutes')::numeric BETWEEN 1 AND 60 ELSE true END` (use `CASE`, because SQL does not guarantee short-circuit in `AND`). `reentry_window_hours` stays on `queues` (M3, per queue: it is the fallback of a per-queue cap). Confirm delay (30 s), stale hours (48), retention (90 d) are code/config constants, not columns (not streamer settings).

**Item 4 — `CHECK`s of the old review versus the new states.**
- **Yes, one ties them:** `redemptions_settlement_state_check` in section 2.2 (`settlement_state NOT IN ('held_for_service','awaiting_choice') OR group_decision = 'eligible'`, line 113 above) forbids `awaiting_choice` without an `eligible` decision. Design v2:91 and 3.10 need `awaiting_choice` also for non-members and with `group_decision` NULL or `not_eligible` (S1 `wait` on any redemption, `legacy_residue`, cap, S2..S4). It would fail with `23514` in P7. `redemptions_decision_shape_check` (lines 104-110) is compatible (a NULL decision is allowed). **Fix (DB-1):** keep `held_for_service` eligible-only; `awaiting_choice` requires only `expected_status IS NULL AND remote_status = 'UNFULFILLED'`.
- *New state `settled_external`:* add it to the value list in `redemptions_settlement_values_check`; add `CHECK (settlement_state <> 'settled_external' OR (expected_status IS NULL AND remote_status IN ('FULFILLED','CANCELED')))`; extend the guard trigger so `OLD.settlement_state IN ('intent_recorded','settled_external')` is absorbing (lines 139-148 above). These constraints exist only in the **unapplied** M2 draft, so no applied object changes: write the final M2 directly.
- *Writers that must set both fields in one statement* (else the new `CHECK` fails loudly, R5): `recordExternalRedemptionState` writes `remoteStatus` at `queue-repository.mjs:2713`; `applyEntryTransition` external writes `remoteStatus` and `expectedStatus: null` at `:2355`.
- *Enums:* none in this schema (text plus `CHECK`), so no `ALTER TYPE`. *Outbox:* the `outbox_status_check` set does not change for `settled_external` (no task is created). *"financial_state":* no column or field with that name exists in the schema or in `apps/api/src`; the financial state lives in `outbox.status` (unchanged) and `redemptions.sync_status`, which has no `CHECK` (`foundation/migration.sql:58`) and needs no change.
- Reconcile M1: the reference M1 of section 2.1 has four notice columns; design v2:466 has five (`notice_joined`, `notice_service`, `notice_state`, `notice_reordered`, `notice_points`). The design wins; the 2.1 DDL must be regenerated. Its status list already includes `resolved_manual` and `cancel_verification`, matching the current constraint (`20261014230000_outbox_deletion_cancel_verification/migration.sql:2-3`).

**Item 5 — Reversal order and isolated applicability.**
- *Apply order:* M1, M2, M3, M4 (P2, P5, P5b, P6b). *Down order:* M4, M3, M2, M1, strictly reverse, to keep `_prisma_migrations` history linear, even though M1 and M4 are independent of the others and M3 is DDL-independent of M2 (if its `CHECK` uses existing columns only). Each down is `prisma db execute --file rollback.sql` then `prisma migrate resolve --rolled-back` (**HYPOTHESIS** on the exact flow for Prisma 6.19.3, as design v2:480). Only one migration (`20261014230000...`) has a `rollback.sql` today: the convention exists but is not yet general.
- *Each migration alone on real data:* M1 yes (five booleans default `false`, outbox constraint re-created from the **current** list). M2 yes (all new columns `NULL`/`none`, all constraints satisfied by existing rows; the partial unique index on `outbox(redemption_id)` is safe because `financial:{id}` is already unique, review Q3; run the duplicate probe anyway). M3 yes (item 1). M4 yes (new table only). No migration needs a backfill or drops data when applied; downs lose only data created by the feature, which is why the guards exist.
- *M1-down:* map `expired` to `cancelled` (not `unknown`, not `retry`: these are chat notices, never money) with `last_error = 'notice_expired_rolled_back'`, and cancel pending/retry/processing `chat.notice` rows so an old worker never sees an operation type it does not know. This follows the `rollback.sql` precedent and replaces the "refuse while any row is `expired`" of design v2:475.
- *Lock claim to correct (DB-2):* line 154 above says `NOT VALID` then `VALIDATE` avoids blocking writes. Inside **one** migration the `ACCESS EXCLUSIVE` taken by `DROP/ADD CONSTRAINT` is held until the transaction ends, `VALIDATE` included, so the scan blocks everything on `outbox` and `redemptions`. The benefit exists only if `VALIDATE` is a separate migration (second transaction). For the beta (no active users, app stopped) a single migration is acceptable if the row counts are measured in the dry-run; otherwise split M2 into M2a (add `NOT VALID`) and M2b (`VALIDATE`). **HYPOTHESIS:** PostgreSQL runs a multi-statement simple query as one implicit transaction; confirm with `log_lock_waits` in the dry-run.

**Item 6 — LIVE-1 in the database (structural guarantee).**
Layers, strongest first: (a) `stream_sessions` has **no foreign key in either direction, no trigger, no rule, no view, no `ON DELETE` action**; every existing foreign key is `ON DELETE RESTRICT` (`schema.prisma:54,82,83,104,128,129,147-149,203`), so no cascade can reach a queue from any table. A catalog test makes this permanent: `pg_constraint` has no `contype = 'f'` row with `conrelid` or `confrelid` = `stream_sessions`; `pg_trigger` has no non-internal trigger on it; `pg_rewrite`/`pg_depend` show no view over it. (b) The session module has no import of the queue repository (static test, design v2:309). (c) Mutation test with **write counters**, stronger than a checksum: `pg_stat_force_next_flush()` then compare `n_tup_ins/upd/del` of `queues`, `entries`, `redemptions`, `outbox`, `audit_logs` before and after `offline`, reconciliation close, new `online` and merge (**HYPOTHESIS** on exact counter timing in PG 18; confirm in the instance). A checksum misses a no-op `UPDATE`; the counters do not. (d) A separate database role for the session module is **not** recommended now: the product uses one `DATABASE_URL` and one `PrismaClient`, so a role would need a second pool and secret for a table that already has no relation to queues. Revisit only if a second role exists for other reasons.
Test table name: the design says `queue_entries` (design v2:311); the table is `entries` (`schema.prisma:60`). The nulling job of item 2 and the purge must be disabled or excluded in that test, because they are timer jobs unrelated to the end of a live.

**Item 7 — Personal data of the cap counter.**
Acceptable with three changes. (1) No new identifier is stored: `user_id` is already `NOT NULL` in `redemptions` (`schema.prisma:97`) for an unbounded time; `refunded_at` adds a timestamp of a behavior (refunded) that `expected_status = 'CANCELED'` already reveals without time. The partial index copies `user_id` only for recent refunds. (2) Retention: the 72 h/last-session nulling bounds the **timestamp**, not the link; real minimization is OPS-32's pseudonymization of `redemptions.user_id`. OPS-32 must set `refunded_at = NULL` in the same statement, otherwise rows inside the horizon would share one placeholder id and look like one person to the cap. (3) The privacy statement (`@po`) names `refunded_at` and says the session table has no person. Nothing to change in logs/audit (codes and counts only, review 2.3). Right to erasure: deleting the redemption row deletes `refunded_at`.

**Item 8 — Test plan:** section 9.4.

### 9.3 Findings and corrections to `@architect`

| # | Severity | Finding | Evidence | Correction |
|---|---|---|---|---|
| DB-1 | High | `redemptions_settlement_state_check` ties `awaiting_choice` to `group_decision = 'eligible'`; v2.1 needs it for non-members and NULL decisions. Fails with `23514` in P7 | review line 113; design v2:91, 470 | **C1:** `held_for_service` eligible-only; `awaiting_choice` needs only `expected_status IS NULL` and `remote_status = 'UNFULFILLED'`; write the final M2 (still unapplied) |
| DB-2 | Medium | `NOT VALID` + `VALIDATE` in one migration keeps `ACCESS EXCLUSIVE` until commit; the "does not block writes" claim is false | review line 154; design v2:476 | **C2:** state it correctly; split M2a/M2b or accept a stopped-app window with measured row counts |
| DB-3 | Medium | M3 sets `DEFAULT 'wait'` at once, so queues created between M3 and P7 are labeled `wait` but behave `legacy`, then change behavior when P7 turns enforcement on (conflicts with "existing queues behave exactly as today", G6) | design v2:225, 234, 550 | **C3:** keep the DB default `legacy` through P5b; creation code writes `legacy` until P7; P7 ships a one-statement migration `SET DEFAULT 'wait'` and writes `wait` for new queues. Restart/clone of a queue (review section 5) must not copy `legacy` into a new queue |
| DB-4 | Medium | Merge-window location open; the schema has no channel table | design v2:264, 290; `schema.prisma:154,161` | **C4:** `settings` row `live_session_policy` (item 3); M4 = one table, no `ALTER` of an existing table |
| DB-5 | Medium | `refunded_at` population and failed-refund behavior undefined | design v2:274, 290 | **C5:** list the causes that set it (item 2); count at intent, no budget returned on `failed`/`resolved_manual`; `@po` confirms |
| DB-6 | Medium | M3-down has no guard; dropping the columns after P7 reverts queues to `legacy` silently | design v2:477 | **C6:** guard (item 1); strict reverse down order; `rollback.sql` naming |
| DB-7 | Low | Per-channel lock key space unspecified; `queue_entries` name wrong in the LIVE-1 test; `ON CONFLICT` does not absorb the partial unique index | design v2:271, 311 | **C7:** two-int lock with a new class; test on `entries`; fixed order close-then-insert |
| DB-8 | Low | A late `online` of an earlier stream can change the session of later rows; no rule | design v2:269-270 | **C8:** recompute in the same transaction, or document as accepted |
| DB-9 | Low | `stream_sessions` has no key, no `ended_at >= started_at` check, no purge-by-session rule | design v2:255-262, 283 | **C9:** composite PK, checks, whole-session purge (item 3) |
| DB-10 | Low | M1: four vs five columns between documents; M1-down "refuse if `expired`" is stricter than needed | review 2.1; design v2:466, 475 | **C10:** regenerate 2.1 from the design; M1-down maps `expired` to `cancelled` |
| DB-11 | Low | No `lock_timeout`/`statement_timeout` exists in `queue-repository.mjs`; the plan assumes them | `queue-repository.mjs` (no match) | **C11:** introduce them as a P0/P1 task with its own test (the TS-20 probe) before M2 |

### 9.4 Database test plan (isolated PostgreSQL 18, real migrations, disposable instance; never the dev volume)

New files (naming follows section 6):
1. `tests/integration/ops31-migrations-postgres.test.js`. Seed the current head (13 migrations): queues in several modes, entries, redemptions (all remote statuses), outbox rows in every status, settings, audit; record per table the row count and the `md5` of the ordered `row_to_json` of the pre-existing columns.
   - *Forward, one at a time:* apply M1, M2, M3, M4; after each, assert that the pre-existing columns checksum is unchanged, `pg_constraint.convalidated` is true, defaults are as designed and `prisma migrate diff` (migrations to datamodel) is empty.
   - *No rewrite:* `pg_class.relfilenode` of `queues`, `redemptions`, `outbox` identical before and after M1/M2/M3; `atthasmissing` true for the constant-default columns; after M3 every existing queue reads `legacy` and a queue inserted afterwards reads the then-current default (`legacy` until P7, `wait` after the P7 migration).
   - *Isolation matrix:* each migration alone on the head where independent (M1, M4, M3 without M2, M2 alone); M3 after M2.
   - *Constraints:* each refuses its invalid row (closed sets, ranges, decision shape, `held_for_service` needs `eligible`, **`awaiting_choice` accepts NULL and `not_eligible` decisions (DB-1 regression)**, `settled_external` needs `expected_status IS NULL` and a terminal remote status, `ended_at >= started_at`, `refunded_at` requires `CANCELED`); guard trigger: `intent_recorded` and `settled_external` absorbing, conclusive decision immutable, a `refunded_at`-only update does not fire it.
   - *Down, strict reverse:* M4, M3, M2, M1 each on seeded data; guards refuse after simulated use (refunded rows, pending states, non-empty own list) and pass before; after M3-down every pre-existing column checksum equals the original; M1-down leaves no `expired` row and no pending `chat.notice`.
   - *Lock behavior:* with `log_lock_waits` and a concurrent writer, record the lock levels and how long each migration holds them on `queues`, `redemptions`, `outbox`; compare one-file M2 against M2a/M2b; record the row counts used.
2. `tests/integration/ops31-cap-postgres.test.js` (barrier technique of section 6, proven by `pg_locks`). Invariant: "automatic refunds of one person in one queue inside the window never exceed the cap, in any interleaving". Only one active entry per person per queue exists (`entries_active_user_per_queue`), so two simultaneous automatic refunds of the same person cannot occur; the real race is automatic against manual. Fixture: cap 1, person U with an old `awaiting_choice` entry E0 and a held entry E1; run "end of service E1" against "streamer refunds E0" in both orders: either E1 refunds and the streamer's choice also goes (never blocked), or the streamer's choice lands first and E1 becomes `awaiting_choice` (`reentry_cap`); never two automatic refunds. Also: two different people at the boundary do not block each other; cap `NULL` never blocks; window edges (equal to start, 1 ms before, fallback hours); set-based batch with `user_id = ANY` equals the per-row result; `EXPLAIN (ANALYZE, BUFFERS)` on a synthetic 1M-row `redemptions` records the plan as evidence, not as a time assertion.
3. `tests/integration/ops31-refunded-at-job-postgres.test.js`: nulling horizon with no session, open session, closed last session, stale open session, session older than 72 h (nothing inside the session is nulled); batch with `SKIP LOCKED` while another transaction holds a row; the job is not called from the `offline` path.
4. `tests/integration/ops31-live-session-postgres.test.js`: (a) two connections deliver the **same** `online` (barrier): one row, one session, no error; (b) two **different** `online` ids at once: exactly one open row, the loser waits and then closes/merges or gets `23505` mapped to a retry; never an unhandled error and never two open rows; (c) `online` and `offline` of one id at once, both orders: final state closed, `ended_at >= started_at`; (d) `offline` of an unknown id writes nothing; (e) merge boundary (equal to the window, +1 ms, -1 ms), lost `offline`, late `online` of an earlier stream (DB-8), type `rerun` writes nothing; (f) retention by whole session keeps the latest and any open one; (g) **LIVE-1:** catalog assertions (no FK/trigger/rule/view on `stream_sessions`) and write-counter deltas of zero on `queues`, `entries`, `redemptions`, `outbox`, `audit_logs` across `offline`, reconciliation close, new `online`; (h) M4 up/down with existing rows in all other tables untouched; absent `settings` key means 10.
5. Log/audit capture inside the files above: no user id, login, display name, stream title or label.

Evidence classes stay separate: these are PostgreSQL integration tests; Twurple fakes and the reducer belong to the `@qa` FX/TW classes. A real Twitch run is P8 run C.

### 9.5 What was not read

`queue-repository.mjs` outside lines 30-100, 315-345, 2296-2312, 2700-2716 and the searches above; the panel code; `reconciliation.mjs` and `integration.mjs`; the pt-BR halves of the other specialist documents; the compose files (a single database role is assumed from the single `DATABASE_URL`: **HYPOTHESIS**); the Prisma 6.19.3 and PostgreSQL 18 behaviors marked **HYPOTHESIS** above. Prisma's default interactive-transaction timeout (5 s) was not re-checked and matters for the batch of 3.6.

### 9.6 Status of the corrections (2026-11-15)

Applied by `@architect` in [architect-design-v2.md](architect-design-v2.md) v2.3 (documents only; no DDL written or applied): DB-1 (section 10 deltas, 3.2 rule 5), DB-2 (M2a/M2b, split chosen), DB-3 (S1 default `legacy` until P7, P7 migration `SET DEFAULT 'wait'`), DB-4 (`settings` row `live_session_policy`, M4 is one table), DB-5 (owner DECIDED: cap counted at the intent, no budget back, no extra worker write, over the cap the refund waits), DB-6 (M3-down guard, strict reverse order M4, M3, M2, M1, `rollback.sql`), DB-7 (two-integer channel lock with a new class, test on `entries`, close-then-insert), DB-8 (late `online` of an older stream ignored and logged), DB-9 (composite primary key, `ended_at >= started_at`, whole-session purge), DB-10 (five columns in M1, M1-down maps `expired` to `cancelled`), DB-11 (`lock_timeout`/`statement_timeout` per migration and in P0). Q-3 and Q-4 are owner decisions. The projected score of 9.3 is still a projection until the plan of 9.4 runs on an isolated PostgreSQL 18.

### 9.7 Re-evaluation of design v2.3 (2026-11-15)

**Author:** `@data-engineer` (Dara) — **Mode:** YOLO — **Input:** [architect-design-v2.md](architect-design-v2.md) v2.3 (3.2, 3.10, 3.11, 3.12, 10, 13, 14, 18) against DB-1..DB-11 of 9.3. **Evidence class:** static reading of the design only (sections 1-14 and 18 read; the pt-BR twin was only checked for parity of key terms: `M2a`, `SET DEFAULT 'wait'`, `live_session_policy`, `rollback.sql`, `late_online_ignored`, `1868787013` have the same counts in both files). No code, migration or SQL was read again or executed; nothing was run against any database. Line numbers of `queue-repository.mjs` are those already in 9.2.

**Score: 9.2 / 10 (meets the 9.0 goal).** All eleven findings are closed in the design text and no regression of High or Medium severity was found. Five Low residuals (N-1..N-5 below) do not block the score. It is a document score: nothing is executed, so R3, R4, R10, the PostgreSQL 18 lock behavior and the Prisma flow stay **HYPOTHESIS** until `@dev` and `@qa` run the plan of 9.4.

**Verification of each correction**

| # | Verdict | Where in v2.3 | Note |
|---|---|---|---|
| DB-1 | Closed | 3.2 rule 5; section 10 row "v2.1" | `held_for_service` needs `eligible`, `expected_status IS NULL`, `UNFULFILLED`; `awaiting_choice` needs only `expected_status IS NULL` and `UNFULFILLED`. Compatible with S1 `wait`, `legacy_residue`, the cap and S2..S4. `settled_external` and the absorbing trigger kept (section 10, first row). Regression test in 13 (v2.3 Migrations) and in 9.4 |
| DB-2 | Closed | Section 10 "M2a and M2b" | False claim withdrawn, split chosen. M2b = `VALIDATE` only, own transaction, `SHARE UPDATE EXCLUSIVE`. One-file alternative allowed only with measured counts. The plain `CREATE UNIQUE INDEX` on `outbox` still takes `SHARE`; acceptable with the app stopped (see N-1) |
| DB-3 | Closed | 3.10 "Why existing queues are not touched"; M3 text; P7 | DB default and creation code stay `legacy` until P7; P7 ships the one-statement `SET DEFAULT 'wait'`; clone/restart writes the then-current default; test in 13 covers "queue after M3 reads `legacy`" |
| DB-4 | Closed | 3.11 A; M4 text | `settings` row `live_session_policy`, absent = 10; M4 = one table, no `ALTER`; optional `CASE` check kept |
| DB-5 | Closed | 3.11 C2; 4 (gate); 13 | Count at the intent, `refunded_at` only for person-visible causes, no budget back on `failed`/`resolved_manual`, no worker write (no new lock edge), over the cap `awaiting_choice` (`reentry_cap`) and never a fulfill, a streamer panel refund still passes and counts. Tests present |
| DB-6 | Closed | Section 10 M3 and "Reversibility" | Guard text matches 9.2; `rollback.sql`; strict reverse order M4, M3, M2, M1 with M2b-down a no-op |
| DB-7 | Closed | 3.11 B rule 5; 13 | Two-integer lock, new class different from `1868787013`, `pg_locks` test, table `entries`, close-then-insert, `23505` mapped in the PG test |
| DB-8 | Closed | 3.11 B rule 3; 3.12 log event | Late `online` of an older stream ignored and logged; stored `stream_session_id` never changes. Conservative (stricter cap). Accepted |
| DB-9 | Closed | 3.11 A; M4 text; E | Composite PK, `ended_at >= started_at`, id length checks, whole-session purge keeping the latest and any open session; nulling horizon `LEAST(now - 72 h, last session start)` |
| DB-10 | Closed | Section 10 M1 and row 2 | Five columns; M1-down maps `expired` to `cancelled` and cancels pending `chat.notice` |
| DB-11 | Closed | Section 10 "Timeouts per migration"; P0 | `lock_timeout`/`statement_timeout` per migration and in the repository transactions with the TS-20 probe, before M2 |

**Regression search.** Checked: (a) the DB-1 `CHECK` against the state diagram (every arrow into `awaiting_choice` has `expected_status IS NULL` and `UNFULFILLED`; `awaiting_choice --> none` on restore keeps the decision); (b) `settled_external` from `awaiting_choice` for a non-member satisfies the new `CHECK`; (c) `refunded_at` against the guard trigger (a `refunded_at`-only update does not fire it) and the optional `refunded_at => CANCELED` `CHECK` (rows with an intent are absorbing, so the external writer that sets `expected_status` to NULL is already guarded); (d) lock edges: the channel lock has its own key space, no transaction takes both a channel and a queue lock, the worker adds no write to `redemptions` for the cap; (e) the nulling horizon against Q-3 (values inside the last session are kept, a bounded set); (f) apply order M1, M2a, M2b, M3, M4 against package order P2, P5, P5b, P6b. No contradiction found.

**Open findings (all Low; none blocks the 9.0)**

| # | Severity | Finding | What is missing |
|---|---|---|---|
| N-1 | Low | M3 lists closed-set `CHECK`s on `queues` as `NOT VALID` then `VALIDATE` in one file (fine, few rows), but section 10 row "v2.1" also lists the optional `refunded_at => CANCELED` `CHECK` with `NOT VALID` then `VALIDATE` without saying where it lives. If it sits in M3 on `redemptions` (the only large table), the DB-2 lesson applies: its `VALIDATE` must be a separate file (M3b) or the row count must be measured. The partial unique index on `outbox` (M2a) and the partial index on `redemptions` (M3) take `SHARE` once | One sentence: drop the optional `CHECK`, or put its `VALIDATE` after M3 as its own migration; record the `outbox` and `redemptions` row counts in the dry-run |
| N-2 | Low | The P7 migration `SET DEFAULT 'wait'` is not in the apply/revert list of "Reversibility" (M1, M2a, M2b, M3, M4) and has no stated down | Name it (for example M3b), give it `rollback.sql` = `SET DEFAULT 'legacy'` and put it first in the strict reverse order (after P7 it runs before M4-down), so `_prisma_migrations` stays linear |
| N-3 | Low | Section 10 says every migration starts with `SET LOCAL lock_timeout`/`statement_timeout`. `SET LOCAL` only works inside a transaction; whether Prisma wraps a file in one is a stated HYPOTHESIS. The Prisma interactive-transaction timeout (5 s) for the batch of 3.6 is still unchecked (9.5) | In the dry-run, confirm the wrapping with `log_lock_waits`; if a file is not transactional use plain `SET` then `RESET`. `@dev` checks the 5 s timeout before P7 |
| N-4 | Low | Sections 2.1 and 2.2 of this review still hold the superseded DDL (four notice columns, the `awaiting_choice` tie to `eligible` at line 113, the false `NOT VALID` claim at line 154). Design section 10 says the deltas win, but a reader of 2.2 alone would copy the old text | When P2 and P5 start, `@data-engineer` regenerates the final M1 and M2a DDL from the design (not applied) and marks 2.1 and 2.2 superseded. Not done here: implementation-package work; this task asked only for the re-evaluation |
| N-5 | Low | Until P7 the API refuses only S1 values other than `legacy` (3.10 "Editing the policy"). S2..S4 can be stored as `refund` or `fulfill` and S5 as a number before P7 while nothing enforces them, so a setting can look active while inert (the concern 3.10 solved for S1) | Either refuse S2..S5 changes with `SETTLEMENT_MODE_UNAVAILABLE` until P7, or document them as accepted and inert and let `@ux` mark them. No money effect either way |

**Conclusion.** Data plan: 9.2 / 10 as a design; projected 9.4 once `@dev` confirms the HYPOTHESES on an isolated PostgreSQL 18 and `@qa` runs 9.4 green. Recommended before P5: close N-1 and N-2 with one sentence each in section 10 (`@architect`); N-3 to N-5 can wait for the packages. No finding blocks the continuation to `@ux-design-expert`, `@po` and `@qa`.

### 9.8 Review of the M2a columns `settlement_cause` and `settled_external_at` and of AC 34-41 (design v2.4, 2026-11-15)

**Author:** `@data-engineer` (Dara) — **Mode:** YOLO — **Input:** [architect-design-v2.md](architect-design-v2.md) (3.13 A, B, F; section 10, row "v2.4", M2a, M2b, M3, M3a, M3b, "Reversibility"), [story.md](story.md) AC 34-41, 9.2-9.7 above. **Evidence class:** static reading of the design, of the AC text and of `apps/api/prisma/schema.prisma:60-109` (`Entry.redemptionId` is `@unique`; `Redemption` has no `entry_id`; `queue_id` is nullable). Nothing was executed; all SQL below is **reference, NOT APPLIED**. `ux-plan-v2.md` and `po-validation.md` were not read in detail (they are inputs of other gates); the pt-BR twin is kept in sync with this text.

**Score: 9.3 / 10 (meets the 9.0 goal).** The two columns and the index are confirmed. One Medium gap (DB-12: the rules "stored only while `awaiting_choice`" and "cleared when it leaves" have no `CHECK` in the design) and five Low points. None blocks P5 once DB-12 is written into the M2a text. Projected 9.5 after the plan of 9.4 plus 9.8 runs green on an isolated PostgreSQL 18; the projection is not a result.

**1. Confirmation of the M2a objects**

| Object | Verdict | Note |
|---|---|---|
| `settlement_cause text NULL` | Confirmed | Nullable, no default: metadata only, no rewrite on PostgreSQL 18. Closed set of five (`policy_wait`, `cannot_ask`, `chat_clear`, `legacy_residue`, `reentry_cap`). The numbers of the cap line are not stored (correct: computed at read time from `refunded_at`) |
| `settled_external_at timestamptz(3) NULL` | Confirmed | Same type as the other timestamps of `redemptions` (`Timestamptz(3)`); `outcome` needs no column (`remote_status` already says `FULFILLED` or `CANCELED`); `displayName` comes from `entries` through `entries.redemption_id` (unique), no copy |
| History index `(queue_id, settled_external_at DESC) WHERE settlement_state = 'settled_external'` | Confirmed with a correction (DB-14) | Add the tie-break `redemption_id DESC` |
| Pending list (at most 200) | Confirmed, served by the existing pending index | See DB-15 |

**Reference DDL (replaces the v2.4 row; goes into the M2a regeneration of N-4)**
```sql
-- REFERENCE, NOT APPLIED. M2a: nullable, no default (catalog only)
ALTER TABLE "redemptions"
  ADD COLUMN "settlement_cause"   TEXT,
  ADD COLUMN "settled_external_at" TIMESTAMPTZ(3);

ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settlement_cause_check" CHECK (
  ("settlement_cause" IS NULL OR "settlement_cause" IN
     ('policy_wait','cannot_ask','chat_clear','legacy_residue','reentry_cap'))
  AND ("settlement_state" = 'awaiting_choice' OR "settlement_cause" IS NULL)
) NOT VALID;

ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settled_external_check" CHECK (
  ("settlement_state" = 'settled_external') = ("settled_external_at" IS NOT NULL)
) NOT VALID;

CREATE INDEX "redemptions_settled_external_idx"
  ON "redemptions" ("queue_id", "settled_external_at" DESC, "redemption_id" DESC)
  WHERE "settlement_state" = 'settled_external';
-- M2b: VALIDATE CONSTRAINT for the two above (now five constraints in M2b), own transaction
```

**2. Coherence with the rest of the plan**
- *DB-1 state `CHECK`:* independent. `awaiting_choice` still needs only `expected_status IS NULL` and `remote_status = 'UNFULFILLED'`; the cause constraint adds a column rule and does not touch the state shape. `settled_external` keeps `expected_status IS NULL` and `remote_status IN ('FULFILLED','CANCELED')`; the new biconditional adds that `settled_external_at` is set exactly then. Existing rows satisfy both (state `none`, both columns `NULL`), so M2b cannot fail.
- *Transitions:* entering `awaiting_choice` from `none`, `held_for_service` or `check_group` writes the cause; leaving to `none` (restore), `intent_recorded` (choice) or `settled_external` writes `NULL` in the same statement, otherwise the `CHECK` fails loudly (a feature). The external writers (`recordExternalRedemptionState`, `queue-repository.mjs:2713`; `applyEntryTransition` external, `:2355`) must set state, `remote_status`, `expected_status = NULL`, `settled_external_at` and clear the cause in one statement. `check_group` and `held_for_service` hold no cause.
- *Guard trigger:* `settled_external` is already absorbing. Add `settled_external_at` to the `UPDATE OF` list and refuse changing it once set, so the history order cannot be rewritten. The trigger does not need to enforce the cause; the `CHECK` does.
- *M3, M3a, M3b:* no M3 DDL references the new columns (verified in the text of M3, M3a, M3b); the M3a `CHECK` (`refunded_at => CANCELED`) cannot conflict, since a `settled_external` row has `expected_status IS NULL` and never carries `refunded_at`. The M3-down guard needs no new state.
- *Rollback:* M2-down drops, in this order, the guard trigger and function, the two indexes added here, the constraints (including unvalidated ones, so M2a-down works even if M2b never ran), then the columns. M2b-down stays a no-op. The M2-down guard "refuses after first use" already covers these columns, since `settled_external` and `awaiting_choice` are states other than `none`; the only data lost is what the feature created. Strict reverse order unchanged (M3b, M4, M3a, M3, M2, M1).
- *Locks:* both `ADD COLUMN` are catalog-only; `ADD CONSTRAINT ... NOT VALID` is a short `ACCESS EXCLUSIVE`; `CREATE INDEX` takes `SHARE` and scans once with a false predicate (record the `redemptions` row count in the dry-run, as for the other M2a indexes). No new lock edge: the cause and the time are written by statements that already hold the queue lock.
- *Personal data:* a timestamp and a closed code; no identifier. Erasure of a redemption removes both. OPS-32 pseudonymization of `user_id` does not need to touch them.

**3. Findings and corrections to `@architect`**

| # | Severity | Finding | Correction |
|---|---|---|---|
| DB-12 | Medium | Design 3.13 A says the cause is cleared when the row leaves `awaiting_choice`, and section 10 says the closed set has a `CHECK`, but nothing makes the column `NULL` outside `awaiting_choice`; a stale `reentry_cap` on a settled row would show a wrong line and survive into the history | Constraint `redemptions_settlement_cause_check` above (closed set **and** cause only in `awaiting_choice`), `NOT VALID` in M2a, validated in M2b. Decision for `@architect`: also require `awaiting_choice => cause NOT NULL`? Recommended yes after P7; before P7, if any writer of P1-P6 enters `awaiting_choice` without a cause, keep it nullable and let the API map `NULL` to a generic cause line (never to a guessed code) |
| DB-13 | Low | `settled_external_at` has no coherence rule with the state and is mutable | Biconditional constraint above; add the column to the guard trigger list (immutable once set) |
| DB-14 | Low | The history index orders by `settled_external_at` only; ties (same millisecond) give a non-deterministic "latest 20" | Add `redemption_id DESC` to the index and to the `ORDER BY` of the route (same pattern as M4) |
| DB-15 | Low | The pending list reads a three-state index but wants two states (`held_for_service` is not a decision), so held rows are scanned and discarded; and `GET /api/state` computes the count per queue on every poll | **HYPOTHESIS** that it is cheap (held rows are bounded by the live queue). Measure with `EXPLAIN (ANALYZE, BUFFERS)` on a synthetic 1M-row table; add a second partial index on the two states only if the plan shows waste. Compute the counts for all queues of the state response in one grouped query, not one query per queue |
| DB-16 | Low | `items` stops at 200 but `total` is the badge number; if the pending set exceeds 200 the list and the badge disagree silently | `total` is a real count, not the length of `items`; add a `truncated` flag (or document that the badge can exceed the list) |
| DB-17 | Low | Section 10 keeps "Payload `settlementCause` code in financial outbox rows (no column)" next to the new column `settlement_cause`; two names for related facts | State that the payload, when present, uses the same closed list, or drop the payload copy (the audit row `settlement.transition` already carries the cause) |

**4. Review of AC 34-41 for data**

| AC | Verdict | Gap |
|---|---|---|
| 34 | OK | Policy columns, defaults and ranges match M3 (cap `smallint NULL` 1-20, window `smallint` 1-72 default 12, closed sets, S1 default `legacy` until M3b). Evidence should list the range `CHECK`s explicitly (cap 0 and 21, window 0 and 73) |
| 35 | OK | Compare-and-set on `settlement_policy_rev` covered by the two-edit race. Evidence should add that the rev increments in the same `UPDATE` as the values (no read-then-write) |
| 36 | OK | No data object; nothing missing |
| 37 | Gap | Evidence names the state `CHECK`s but not the cause: add closed set, `NULL` outside `awaiting_choice`, cleared on every exit (restore, choice, `settled_external`), `settled_external_at` biconditional and immutability (DB-12, DB-13). The AC sentence is correct and needs no change |
| 38 | Gap | "Uses the pending and `settled_external_at` partial indexes" is not testable on small tables (the planner chooses a sequential scan): the evidence should be an `EXPLAIN` on a synthetic volume (plan as evidence, no time assertion), with deterministic order including the tie-break (DB-14) and `total` versus `truncated` (DB-16). Also state that the route works for a queue with `queue_id` rows only (redemptions with `queue_id NULL` never appear) |
| 39 | Gap | The evidence omits the 72 h `refunded_at` nulling job and its horizon (tested in 9.4 item 3, but not named in the AC); add it, and the count query plan on the partial index |
| 40 | Gap | The evidence omits retention by whole session (90 days, keeps the latest and any open one) and the `live_session_policy` range 1-60 (validation in code plus the optional `CHECK`); add both. Catalog assertions for LIVE-1 (no foreign key, trigger, rule or view on `stream_sessions`) are in 9.4 item 4(g) and could be cited |
| 41 | OK | No data object |

**5. Additions to the test plan of 9.4** (file `tests/integration/ops31-migrations-postgres.test.js` unless noted)
1. Cause `CHECK`: each of the five codes accepted only with `awaiting_choice`; an unknown code refused; a code with any other state refused; `awaiting_choice` with `NULL` accepted (or refused if DB-12's stricter form is adopted).
2. Exit matrix: `awaiting_choice` to `none`, to `intent_recorded` and to `settled_external` each fails if the cause is not cleared in the same statement.
3. `settled_external` without `settled_external_at`, and `settled_external_at` on another state, are both refused; changing `settled_external_at` after it is set is refused by the trigger.
4. M2a alone, then M2b: `convalidated` true for the five constraints; M2-down on seeded data removes both columns, the index, the constraints and the trigger, and the checksum of the pre-existing columns equals the original; M2a-down works with M2b not applied.
5. `ops31-pending-decisions-postgres.test.js`: 201 pending rows give `items` 200, `total` 201, `truncated` true; history of 25 rows returns the latest 20 with ties broken by `redemption_id`; `held_for_service` is neither listed nor counted; `EXPLAIN` on a synthetic 1M-row `redemptions` recorded as evidence of the two partial indexes.

**Conclusion.** The two columns and the history index are right for the data model; accept them with DB-12 and DB-13 written into the M2a text (they are one `CHECK` and one trigger column each), and DB-14 to DB-17 handled in P5/P7. DB-12 to DB-14 should be closed before P5 starts; DB-15 to DB-17 can wait for P7. No finding blocks the continuation.

### 9.9 Review of M2a (six causes), M3 (cap settings, `refund_origin`) and M3a (design v2.6, 2026-11-15)

**Author:** `@data-engineer` (Dara) — **Mode:** YOLO — **Input:** [architect-design-v2.md](architect-design-v2.md) v2.6 (3.14 C and F, 3.15 B-D and F, section 10 rows "v2.5" and "v2.6", M2a, M2b, M3, M3a, "Reversibility", section 18 item 8), [story.md](story.md) AC 35, 37, 39, 9.8 above and the trigger style of 2.2. **Evidence class:** static reading only. Nothing was executed; all SQL below is **reference, NOT APPLIED**. The pt-BR twin of the design was not re-read; this section and its pt-BR twin are kept in sync.

**Score: 9.4 / 10 (meets the 9.0 goal).** DB-12, DB-13 and DB-14 are closed in the design text (strict cause biconditional, `settled_external_at` biconditional and immutability, tie-break index) and the sixth code is present in the constraint of 3.14 C and in section 10. The `refund_origin` model is sound. Four Low findings (DB-18..DB-21), none blocks P5 or P5b. This is a document score; lock times and plans stay **HYPOTHESIS** until the dry-run and the plan of 9.4 run.

**1. Answers to the two open questions of `@architect` (3.15 D, section 18 item 8)**

| Question | Decision | Reason |
|---|---|---|
| `refund_origin` as an `INCLUDE` column of the refunded index `(queue_id, user_id, refunded_at) WHERE refunded_at IS NOT NULL`? | **No.** Keep the index as designed | One person has at most a few rows in one window (cap at most 20, window at most 72 h), so the origin filter runs on a handful of heap rows. An index-only scan needs all-visible pages and `redemptions` rows are updated by settlement, so the visibility map would rarely cover the recent pages: the heap would be visited anyway. `INCLUDE` widens every entry and the 72 h nulling job already rewrites entries. Revisit only if the `EXPLAIN (ANALYZE, BUFFERS)` of 9.4 on a synthetic volume shows `Heap Fetches` dominating a measured hot count; that would be a new index migration, not an edit of M3 |
| Does the guard trigger freeze `refund_origin` once set? | **Yes, together with `refunded_at`, in a separate small trigger, with one exception: both may go back to `NULL` (the 72 h nulling job)** | A flip `automatic` to `streamer` (or a shifted `refunded_at`) would silently change the cap count and therefore money behavior; the `CHECK` does not see old versus new values. The exception is already forced to be joint by the `CHECK`. A separate function avoids making M3 redefine the M2 guard function (M3 stays free of M2 objects, the coupling rule of section 10) |

Reference DDL of the trigger (goes in M3, after the columns and the `CHECK`):
```sql
-- REFERENCE, NOT APPLIED
CREATE FUNCTION redemptions_refund_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.refunded_at IS NOT NULL AND NEW.refunded_at IS NOT NULL
     AND NEW.refunded_at IS DISTINCT FROM OLD.refunded_at THEN
    RAISE EXCEPTION 'refunded_at is immutable once set' USING ERRCODE = '23514';
  END IF;
  IF OLD.refund_origin IS NOT NULL AND NEW.refund_origin IS NOT NULL
     AND NEW.refund_origin <> OLD.refund_origin THEN
    RAISE EXCEPTION 'refund_origin is immutable once set' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;   -- NULL -> value (first write) and value -> NULL (nulling job) pass
END $$;
CREATE TRIGGER redemptions_refund_guard BEFORE UPDATE OF refunded_at, refund_origin
  ON "redemptions" FOR EACH ROW EXECUTE FUNCTION redemptions_refund_guard();
```

**2. Reference DDL — M2a (six causes, DB-12..DB-14)** (replaces the fragment of 9.8; the rest of 2.2 stands, with DB-20)
```sql
-- REFERENCE, NOT APPLIED. M2a, redemptions: nullable, no default (catalog only)
ALTER TABLE "redemptions"
  ADD COLUMN "settlement_cause"    TEXT,
  ADD COLUMN "settled_external_at" TIMESTAMPTZ(3);

ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settlement_cause_check" CHECK (
  ("settlement_cause" IS NULL OR "settlement_cause" IN
     ('policy_wait','cannot_ask','chat_clear','legacy_residue','reentry_cap','batch_deferred'))
  AND (("settlement_state" = 'awaiting_choice') = ("settlement_cause" IS NOT NULL))
) NOT VALID;                                           -- DB-12 (strict form)

ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settled_external_check" CHECK (
  ("settlement_state" = 'settled_external') = ("settled_external_at" IS NOT NULL)
) NOT VALID;                                           -- DB-13

CREATE INDEX "redemptions_settled_external_idx"        -- DB-14 (see DB-18 for where it runs)
  ON "redemptions" ("queue_id", "settled_external_at" DESC, "redemption_id" DESC)
  WHERE "settlement_state" = 'settled_external';

-- guard trigger, last statement of M2a (final form: replaces the 2.2 function and trigger)
CREATE FUNCTION redemptions_settlement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.settlement_state IN ('intent_recorded','settled_external')
     AND NEW.settlement_state <> OLD.settlement_state THEN
    RAISE EXCEPTION 'settlement_state % is absorbing', OLD.settlement_state USING ERRCODE = '23514';
  END IF;
  IF OLD.group_decision IN ('eligible','not_eligible')
     AND NEW.group_decision IS DISTINCT FROM OLD.group_decision THEN
    RAISE EXCEPTION 'conclusive group_decision is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.settled_external_at IS NOT NULL
     AND NEW.settled_external_at IS DISTINCT FROM OLD.settled_external_at THEN
    RAISE EXCEPTION 'settled_external_at is immutable once set' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER redemptions_settlement_guard
  BEFORE UPDATE OF settlement_state, group_decision, settled_external_at ON "redemptions"
  FOR EACH ROW EXECUTE FUNCTION redemptions_settlement_guard();
```
Notes: `settlement_state` is `NOT NULL`, so the biconditionals never see `NULL`. Existing rows (`none`, both columns `NULL`) satisfy every constraint, so M2b cannot fail. The six-code list is the only change from 9.8 (`batch_deferred`; the strict form was adopted in 3.14 C).

**M2b** (own file, own transaction; `SHARE UPDATE EXCLUSIVE`): `VALIDATE CONSTRAINT` for the three DE 2.2 constraints, `redemptions_settlement_cause_check` and `redemptions_settled_external_check` (five), and the `outbox` status `CHECK` if it is re-created `NOT VALID`.

**M2 down** (inside `rollback.sql`, after the existing guard of DE Q7), in this order:
```sql
-- REFERENCE, NOT APPLIED
DROP TRIGGER  IF EXISTS redemptions_settlement_guard ON "redemptions";
DROP FUNCTION IF EXISTS redemptions_settlement_guard();
DROP INDEX    IF EXISTS "redemptions_settled_external_idx";   -- and the other M2a indexes
ALTER TABLE "redemptions"
  DROP CONSTRAINT IF EXISTS "redemptions_settlement_cause_check",
  DROP CONSTRAINT IF EXISTS "redemptions_settled_external_check";   -- unvalidated ones too
ALTER TABLE "redemptions"
  DROP COLUMN IF EXISTS "settlement_cause",
  DROP COLUMN IF EXISTS "settled_external_at";
-- then the other M2 columns, as in DE 2.2; M2b-down is a no-op
```

**3. Reference DDL — M3 (cap settings, `refund_origin`)** (the other M3 columns and `CHECK`s of section 10 stand and are not repeated)
```sql
-- REFERENCE, NOT APPLIED. M3, queues: one ALTER, metadata only (constant defaults, no rewrite)
ALTER TABLE "queues"
  /* ... settlement_on_*, reentry_refund_cap, reentry_window_hours, settlement_policy_rev ... */
  ADD COLUMN "reentry_cap_hold"          TEXT    NOT NULL DEFAULT 'after_n',
  ADD COLUMN "reentry_cap_counts_manual" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "queues" ADD CONSTRAINT "queues_reentry_cap_hold_check"
  CHECK ("reentry_cap_hold" IN ('after_n','at_n'));        -- plain, see DB-19

-- M3, redemptions
ALTER TABLE "redemptions"
  ADD COLUMN "refunded_at"   TIMESTAMPTZ(3),
  ADD COLUMN "refund_origin" TEXT;
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_refund_origin_check" CHECK (
  (("refund_origin" IS NULL) = ("refunded_at" IS NULL))
  AND ("refund_origin" IS NULL OR "refund_origin" IN ('automatic','streamer'))
) NOT VALID;
-- + the optional refunded_at => CANCELED CHECK, NOT VALID, only if adopted
-- + the trigger of section 1, then the partial index (see DB-18):
CREATE INDEX "redemptions_refunded_idx" ON "redemptions" ("queue_id","user_id","refunded_at")
  WHERE "refunded_at" IS NOT NULL;

-- M3a (always present since v2.6), own file and transaction
ALTER TABLE "redemptions" VALIDATE CONSTRAINT "redemptions_refund_origin_check";
-- + VALIDATE of the optional refunded_at CHECK if adopted
```
No default and no backfill: no row has `refunded_at` before M3, so the constraint holds by construction and M3a only costs a scan (record the `redemptions` row count and the `VALIDATE` time in the dry-run). `NOT VALID` already checks every new or updated row from M3 on.

**M3 down** (guard first, then objects in dependency order; `rollback.sql`):
```sql
-- REFERENCE, NOT APPLIED
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "redemptions" WHERE "refunded_at" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "redemptions"
                WHERE "settlement_state" IN ('awaiting_choice','held_for_service','check_group'))
     OR EXISTS (SELECT 1 FROM "queues" WHERE "settlement" = 'refund_on_end') THEN
    RAISE EXCEPTION 'M3 down refused: settlement data in use' USING ERRCODE = '55000';
  END IF;
END $$;                                      -- unchanged guard; refund_origin is set only with refunded_at
DROP TRIGGER  IF EXISTS redemptions_refund_guard ON "redemptions";   -- before the columns: it depends on them
DROP FUNCTION IF EXISTS redemptions_refund_guard();
DROP INDEX    IF EXISTS "redemptions_refunded_idx";
ALTER TABLE "redemptions"
  DROP CONSTRAINT IF EXISTS "redemptions_refund_origin_check",
  DROP COLUMN IF EXISTS "refund_origin",
  DROP COLUMN IF EXISTS "refunded_at";
ALTER TABLE "queues"
  DROP CONSTRAINT IF EXISTS "queues_reentry_cap_hold_check",
  DROP COLUMN IF EXISTS "reentry_cap_hold",
  DROP COLUMN IF EXISTS "reentry_cap_counts_manual";
-- + the other M3 columns of section 10; M3a-down is a no-op
```
The `DROP COLUMN` of a column named in a trigger's `UPDATE OF` list fails without `CASCADE`, hence the explicit trigger drop first. `refund_origin` needs no guard of its own: it is `NULL` whenever `refunded_at` is (the `CHECK`).

**4. Order.** Apply: M1, M2a, M2b, M3, M3a, M4 and, with P7, M3b. Revert, strict reverse: M3b, M4, M3a, M3, M2, M1 (M2b-down and M3a-down are no-ops). Confirmed as written in section 10; M3a exists in every case.

**5. Findings and corrections**

| # | Severity | Finding | Correction |
|---|---|---|---|
| DB-18 | Low | M2a and M3 create indexes on `redemptions` in the same file as the `ALTER TABLE`. The `ACCESS EXCLUSIVE` of the `ALTER` lasts until the file ends, so the index scan (`SHARE`, which already blocks writes) now also blocks reads. Same lesson as DB-2, for indexes | Either run the `redemptions` index builds in the validate file (M2b, M3a: the file then reads "validate and index"; nothing reads these indexes before P7), or keep them and record the lock times of the dry-run with the app stopped (already the plan). Recommended: move them; `CREATE INDEX CONCURRENTLY` is not needed with the app stopped and is **HYPOTHESIS** under Prisma's implicit transaction |
| DB-19 | Low | Section 10 asks the `queues` closed-set `CHECK`s to be `NOT VALID` then `VALIDATE` in one file. On a table with few rows, in the same transaction, this gives nothing over a plain `ADD CONSTRAINT` (the `ACCESS EXCLUSIVE` is held anyway) | Plain `ADD CONSTRAINT` for `queues`; keep `NOT VALID` plus a separate `VALIDATE` only for `redemptions` and `outbox` |
| DB-20 | Low | DE 2.2 `redemptions_settlement_values_check` still lists five states, without `settled_external` (line 96); copying 2.2 would make the first `settled_external` write fail with `23514` | The M2a regeneration (N-4) must list six states and use the DB-1 forms of the state `CHECK`; the test of 9.8 item 3 (write `settled_external`) catches it. Not copy-safe: 2.2 stays marked superseded |
| DB-21 | Low | The design leaves the trigger and `INCLUDE` open (3.15 D) | Closed in section 1: no `INCLUDE`; a separate trigger freezes `refunded_at` and `refund_origin`, with the joint `NULL` exception. `@architect` records it in section 10 |

DB-15, DB-16, DB-17 (3.14 F) are **confirmed as P7 work**: DB-15 (one grouped count query, `EXPLAIN` on 1M rows, second index only if the plan shows waste), DB-16 (`total` is a real count, `truncated` flag), DB-17 (the `settlementCause` payload uses the same closed list or is dropped). None touches M2a, M3 or M3a. DB-12..DB-14 should be reported closed in the next index of the story.

**6. Additions to the test plan of 9.4 and 9.8** (`tests/integration/ops31-migrations-postgres.test.js`)
1. Cause `CHECK` with six codes: each accepted only in `awaiting_choice`; `batch_deferred` accepted; an unknown code refused; `awaiting_choice` with `NULL` cause refused (strict form); a code on any other state refused.
2. `refund_origin` `CHECK` matrix: origin and `refunded_at` both `NULL` or both set; a value outside the set refused; origin without `refunded_at` and the reverse refused.
3. `redemptions_refund_guard`: changing origin or `refunded_at` after set is refused (`23514`); first write `NULL` to value passes; the nulling job statement (both to `NULL`) passes.
4. `queues`: `reentry_cap_hold` outside the set refused; defaults on a pre-existing row read `after_n` and `true`.
5. M3 up on seeded data, then M3a: `convalidated` true; M3 down refused with any `refunded_at` set and works when none; after M3 down, `redemptions` and `queues` checksums of the original columns equal; the trigger is gone; reverse order M3b, M4, M3a, M3, M2, M1 leaves `_prisma_migrations` linear.
6. `EXPLAIN` of the count query with and without the origin filter on a synthetic volume, as evidence of the partial index (plan, no time assertion).

**Conclusion.** M2a with six causes, M3 with the two cap settings and `refund_origin`, and M3a always present are right for the data model. Record DB-18..DB-21 in section 10 (one sentence each); none blocks P5 or P5b. Projected 9.5 after the plan runs green on an isolated PostgreSQL 18; the projection is not a result.
