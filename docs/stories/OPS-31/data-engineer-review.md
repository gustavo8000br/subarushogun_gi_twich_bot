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
  "settlement_state" IN ('none','held_for_service','awaiting_choice','check_group','intent_recorded')
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
