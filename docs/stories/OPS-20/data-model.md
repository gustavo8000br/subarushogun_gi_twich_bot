# OPS-20 — Data model and migration plan (refund eligibility)

[Português brasileiro](../../pt-BR/stories/OPS-20/data-model.md)

**Author:** `@data-engineer` (Dara), 2026-10-21. **Story:** [story.md](story.md), issue [#76](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/76). **Research:** [research.md](research.md).
**Nature:** planning gate only. No migration file, code, database or Docker command was created or executed. Every statement about current behavior comes from a read-only reading of `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*`, `apps/api/src/persistence/queue-repository.mjs`, `apps/api/src/domain/entry-transitions.mjs` and `apps/api/src/outbox/financial-worker.mjs` on branch `feat/ops-15-next-panel`. Target engine: `postgres:18.6-bookworm` (`compose.yaml`), Prisma 6.19.

## 0. Baseline facts used by this design

| Fact | Source |
|---|---|
| Queue settings are typed columns with `TEXT` + named `CHECK` (no PG enums): `queue_mode`, `reward_origin`, `mode_transition_status`, plus cross-column consistency checks. | `20261007190000_queue_admission_modes` |
| Refund policy: three Booleans `refund_if_removed_while_called` (default `true`), `refund_on_no_show` (`false`), `refund_if_viewer_leaves_while_called` (`false`). | `schema.prisma` |
| One financial intent per redemption is enforced by `outbox.idempotency_key` UNIQUE = `financial:{redemption_id}`, shared by `redemption.cancel` and `redemption.fulfill`. | `createCancellationIntent()`; `queue-repository.mjs` lines 236–252 |
| `createCancellationIntent()` sets `redemptions.expected_status = 'CANCELED'`, `sync_status = 'pending'` and inserts the outbox row in the same transaction. | same |
| Clear (`queue_cleared`), delete (`queue_deleted`) and waiting removal always yield `request_cancel` (`queueRemovalOverridesRefundPolicy`). | `entry-transitions.mjs` line 48 |
| `audit_logs` is append-only with `actor_id`, `origin`, `reason`, `safe_detail` JSONB; each transition already writes `policySnapshot` and `financialDecision`. | foundation migration; repository |
| Outbox statuses include `unknown`, `resolved_manual`, `cancel_verification`. | `20261014230000_outbox_deletion_cancel_verification` |

## 1. Queue-level policy columns

All new columns follow the existing convention: `TEXT`/`BOOLEAN`, `NOT NULL`, constant default, named `CHECK`. No PostgreSQL `ENUM` type (a value change would need `ALTER TYPE`, and the project never uses them).

| Column (DB) | Prisma field | Type | Default | Meaning |
|---|---|---|---|---|
| `refund_eligibility` | `refundEligibility` | `TEXT NOT NULL` | `'everyone'` | `everyone` \| `subscribers` \| `nobody` (AC 1, AC 16) |
| `refund_include_broadcaster` | `refundIncludeBroadcaster` | `BOOLEAN NOT NULL` | `false` | streamer's own account eligible under `subscribers` (AC 2, owner decision 1) |
| `refund_include_moderators` | `refundIncludeModerators` | `BOOLEAN NOT NULL` | `false` | moderators eligible under `subscribers` |
| `refund_include_vips` | `refundIncludeVips` | `BOOLEAN NOT NULL` | `false` | VIPs eligible under `subscribers` |
| `refund_count_gifted_subs` | `refundCountGiftedSubs` | `BOOLEAN NOT NULL` | `true` | gifted subscriptions count as subscriber (AC 3) |
| `refund_non_eligible_handling` | `refundNonEligibleHandling` | `TEXT NOT NULL` | `'keep_unfulfilled'` | `keep_unfulfilled` (stay UNFULFILLED until the streamer decides) \| `auto_fulfill` (mark FULFILLED automatically) — owner decision on Q3, revision 2 |

Constraints:

```sql
CONSTRAINT "queues_refund_eligibility_check"
  CHECK ("refund_eligibility" IN ('everyone', 'subscribers', 'nobody')),
CONSTRAINT "queues_refund_non_eligible_handling_check"
  CHECK ("refund_non_eligible_handling" IN ('keep_unfulfilled', 'auto_fulfill'))
```

- **Default `keep_unfulfilled` (revision 2).** Official fact (research, Verification round 2 §2): a redemption can be updated only while UNFULFILLED, so FULFILLED can never be refunded by the API. With the default rule `everyone` no redemption is ever non-eligible, so neither value changes current behavior; `keep_unfulfilled` is chosen because it is the only reversible option (the streamer can still refund or serve later), while `auto_fulfill` is irreversible and must be an explicit opt-in. Not coupled by CHECK to `refund_eligibility` (inert under `everyone`, same reasoning as the audience flags).

- **No minimum-tier column.** Minimum tier is out of MVP (PO recommendation, pending `@architect`). The tier is still stored on every decision (section 2), so a later `refund_min_subscriber_tier TEXT NULL CHECK (IN ('1000','2000','3000'))` needs no backfill.
- **Audience flags are not coupled to the rule by CHECK.** [AUTO-DECISION] Should flags be forced to defaults when the rule is not `subscribers`? → No (reason: switching `subscribers` → `everyone` → `subscribers` must keep the streamer's choices; flags are inert outside `subscribers`, and the domain ignores them there; a CHECK would force destructive writes).
- **Not coupled to `queue_mode` by CHECK.** [AUTO-DECISION] Should `manual_only` force `everyone`? → No (reason: `manual_only` queues converted from `channel_points` keep `reward_id` and historical redemptions that can still be refunded on clear/delete, per `queues_mode_reward_origin_consistency_check`; the panel hides the option, but the stored rule must keep applying to those redemptions). This is consistent with the existing checks, which only constrain `reward_origin`/`reward_id`/`cost`.
- Defaults reproduce today's eligibility exactly: `everyone` means "eligible whenever a trigger asks", which is the current behavior. Per-trigger Booleans stay unchanged and keep deciding **when** (AC 4).

## 2. Per-redemption refund eligibility decision (new table)

### 2.1 Table `refund_eligibility_decisions` (Prisma `RefundEligibilityDecision`)

One row per redemption that reached a refund decision point. It is the durable record that is written **before** any financial outbox row (AC 5) and that holds the pending state when status is unknown (AC 7).

| Column | Type | Null | Notes |
|---|---|---|---|
| `redemption_id` | `TEXT` PK, FK → `redemptions(redemption_id)` `ON DELETE RESTRICT` | no | PK enforces "decided once per redemption" |
| `queue_id` | `UUID` FK → `queues(id)` `ON DELETE RESTRICT` | no | denormalized for per-queue panel lists and clear counts |
| `entry_id` | `UUID` FK → `entries(id)` `ON DELETE RESTRICT` | yes | entry that triggered the decision |
| `trigger` | `TEXT` | no | `removed_waiting` \| `removed_while_called` \| `viewer_left_called` \| `no_show` \| `queue_cleared` \| `queue_deleted` |
| `check_batch_id` | `UUID` | yes | groups a clear/delete batch; result counts by outcome (AC 11–12) |
| `rule_snapshot` | `JSONB` | no | `{refundEligibility, includeBroadcaster, includeModerators, includeVips, countGiftedSubs, nonEligibleHandling, version}`; CHECK `jsonb_typeof = 'object'` (AC 6) |
| `decision` | `TEXT` | no | `eligible` \| `not_eligible` \| `unknown` (AC 5 names) |
| `subscriber_status` | `TEXT` | no | `subscriber` \| `not_subscriber` \| `unknown` \| `not_checked` |
| `subscriber_tier` | `TEXT` | yes | `1000` \| `2000` \| `3000` (stored per decision even though min tier is out of MVP) |
| `subscriber_is_gift` | `BOOLEAN` | yes | gift flag only; **no gifter id/login/name** |
| `audience_match` | `TEXT` | yes | `broadcaster` \| `moderator` \| `vip` when the eligibility came from an audience flag |
| `status_source` | `TEXT` | no | `not_required` (everyone/nobody) \| `broadcaster_self` \| `helix_subscriptions` \| `helix_moderators` \| `helix_vips` |
| `status_checked_at` | `TIMESTAMPTZ(3)` | yes | moment of the Twitch answer (or of the decision when `not_required`) |
| `unknown_reason` | `TEXT` | yes | code only: `scope_missing` \| `unauthorized` \| `forbidden` \| `rate_limited` \| `server_error` \| `timeout` \| `malformed_response` \| `lookup_error` \| `channel_ineligible` \| `check_pending` (D1: initial queued state of the async check) |
| `check_attempts` | `INTEGER` | no | default `0`, `>= 0`; incremented once per **executed** check attempt (D1), not when queued |
| `next_check_at` | `TIMESTAMPTZ(3)` | yes | D2: panel "checking until"; set only while `resolution = 'pending_check'`, written in the same transaction that (re)schedules the check task |
| `resolution` | `TEXT` | no | `pending_check` (unknown) \| `awaiting_streamer` (not eligible, kept UNFULFILLED) \| `refund_requested` \| `fulfill_requested` (served) — see 2.4 |
| `resolution_batch_id` | `UUID` | yes | groups a manual batch action ("mark as served"); see 2.4 |
| `resolved_by` | `TEXT` | yes | `system` \| `streamer` \| `moderator` |
| `resolved_actor_id` | `TEXT` | yes | panel actor id (same semantics as `audit_logs.actor_id`); never logged |
| `override_reason` | `TEXT` | yes | free text, `char_length BETWEEN 1 AND 280`, no control characters; DB-only, never in logs or `safe_detail` |
| `resolved_at` | `TIMESTAMPTZ(3)` | yes | |
| `version` | `INTEGER` | no | default `1`, `> 0`, optimistic locking like `queues.version` |
| `created_at` / `updated_at` | `TIMESTAMPTZ(3)` | no | |

### 2.2 CHECK constraints (named, same style as `queues_*_check`)

1. Domain checks for `trigger`, `decision`, `subscriber_status`, `status_source`, `unknown_reason`, `resolution`, `resolved_by`, `audience_match`, `subscriber_tier`.
2. `decision_unknown_reason_check`: `(decision = 'unknown') = (unknown_reason IS NOT NULL)` — the reason code exists only for unknown (AC 6).
3. `subscriber_detail_check`: `subscriber_status = 'subscriber'` ⇔ `subscriber_tier IS NOT NULL AND subscriber_is_gift IS NOT NULL`; otherwise both NULL.
4. `known_status_source_check`: `subscriber_status IN ('subscriber','not_subscriber')` ⇒ `status_source = 'helix_subscriptions' AND status_checked_at IS NOT NULL` (AC 5: known status only from a valid response).
5. `not_required_check`: `status_source = 'not_required'` ⇒ `subscriber_status = 'not_checked' AND decision <> 'unknown'`.
6. `resolution_consistency_check` (revision 2):
   - `resolution IN ('pending_check','awaiting_streamer')` ⇔ `resolved_by IS NULL AND resolved_at IS NULL`;
   - `resolution = 'pending_check'` ⇒ `decision = 'unknown'`; `resolution = 'awaiting_streamer'` ⇒ `decision = 'not_eligible' AND rule_snapshot->>'nonEligibleHandling' = 'keep_unfulfilled'`;
   - `resolved_by = 'system'` ⇒ `decision <> 'unknown' AND override_reason IS NULL AND resolved_actor_id IS NULL` (unknown is never auto-resolved, AC 7/14);
   - `resolved_by IN ('streamer','moderator')` ⇒ `resolved_actor_id IS NOT NULL AND override_reason IS NOT NULL` (AC 8).
7. `system_resolution_matches_decision_check`: `resolved_by = 'system'` ⇒ `(decision = 'eligible' AND resolution = 'refund_requested') OR (decision = 'not_eligible' AND resolution = 'fulfill_requested' AND rule_snapshot->>'nonEligibleHandling' = 'auto_fulfill')`.
8. `override_resolution_check`: `resolved_by IN ('streamer','moderator')` ⇒ `resolution IN ('refund_requested','fulfill_requested')`; `resolution_batch_id IS NOT NULL` ⇒ `resolved_by IN ('streamer','moderator')`.

The `decision` and snapshot columns are never updated after insert except `unknown` → re-check result (application rule plus test; a trigger is not proposed, to keep the project's "constraints, no triggers" style — open question Q5).

### 2.3 Relation to the FND-3 outbox and the one-financial-intent rule

- Write order inside one transaction: entry transition → `refund_eligibility_decisions` INSERT (`ON CONFLICT (redemption_id) DO NOTHING`, then read) → if `resolution = 'refund_requested'`, `createCancellationIntent()` with the **unchanged** key `financial:{redemption_id}` → `audit_logs` event.
- `unknown` creates **no** outbox row and leaves `redemptions.expected_status` NULL. The pending state lives only in the decision row (`resolution = 'pending_check'`, or `awaiting_streamer` for kept non-eligible rows), so it can never become `request_cancel` or `no_operation` silently (AC 14). [AUTO-DECISION] New outbox status `awaiting_eligibility` vs. decision row → decision row (reason: outbox stays pure Twitch I/O with leases; no change to `outbox_status_check`; the worker cannot pick it up by mistake). `@architect` confirms (Q1).
- Manual override (AC 8): see 2.4 for the UNFULFILLED guard. The unique `financial:` key guarantees no duplicate refund: if an intent already exists (cancel **or** fulfill), the override is rejected as `already_has_financial_intent` and only audited. Reversing `refund_requested` or `fulfill_requested` after the task exists is not possible at the data layer (Q2).
- Non-eligible handling (AC 13) is now a per-queue setting (owner decision, revision 2); see 2.4.
- Grouped Update Redemption Status calls (≤ 50 ids, one reward) remain a worker optimization: rows stay one per redemption, each with its own result; no schema change needed. A 404 maps to the existing outbox handling, never to `CANCELED`.
- `audit_logs` keeps the history: `refund.eligibility_decided`, `refund.eligibility_rechecked`, `refund.override_applied`, `refund.override_rejected`, with `safe_detail` limited to codes (decision, status, tier, is_gift, source, reason code). No free-text reason, UID, gifter data or token in `safe_detail`.

### 2.4 Non-eligible handling, served/refund override and batch "mark as served" (revision 2)

| Situation | `resolution` | Outbox effect (one intent per redemption, key `financial:{redemption_id}`) |
|---|---|---|
| eligible | `refund_requested` (system) | `redemption.cancel` → CANCELED |
| not eligible + `auto_fulfill` | `fulfill_requested` (system) | `redemption.fulfill` → FULFILLED; refund forever impossible (official) |
| not eligible + `keep_unfulfilled` | `awaiting_streamer` | none; `expected_status` NULL |
| unknown | `pending_check` | none; `expected_status` NULL |
| override "refund" from `awaiting_streamer`/`pending_check` | `refund_requested` (streamer/moderator) | `redemption.cancel` |
| override "mark as served" from `awaiting_streamer`/`pending_check` | `fulfill_requested` (streamer/moderator) | `redemption.fulfill` |

- **UNFULFILLED guard for every override.** One transaction: `SELECT … FROM redemptions WHERE redemption_id = $1 FOR UPDATE`; then `UPDATE refund_eligibility_decisions … WHERE redemption_id = $1 AND version = $2 AND resolution IN ('pending_check','awaiting_streamer') AND EXISTS (SELECT 1 FROM redemptions r WHERE r.redemption_id = $1 AND r.remote_status = 'UNFULFILLED' AND r.expected_status IS NULL) AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.idempotency_key = 'financial:' || $1)`; 0 rows → rejected (`not_unfulfilled`, `already_has_financial_intent` or `stale_version`) and audited; 1 row → create the intent with the same key. A cross-table CHECK is impossible, so the guard is a conditional write plus tests. If Twitch then answers 404 (not UNFULFILLED remotely), the existing outbox handling applies; it is never reported as a refund.
- **Batch "mark as served" is idempotent and audited.** The request carries a client `resolution_batch_id` (UUID). The operation is recorded in `processed_operations` with key `refund.mark_served:{resolution_batch_id}`; a repeat returns the stored result. Each row is updated with the same guarded `UPDATE` (rows already resolved are skipped and counted, never re-written); one `redemption.fulfill` per redemption via the `financial:` key (the worker may group ≤ 50 ids of one `reward_id` per call, verified, still recording per-redemption results). Audit: one `refund.batch_mark_served` event (counts only) plus one `refund.override_applied`/`refund.override_rejected` per redemption.
- **Reward deletion turns UNFULFILLED into FULFILLED (official).** Queue delete must stay blocked (existing deletion gating, now also counting `pending_check`/`awaiting_streamer` rows of the queue) until those rows are resolved, otherwise a pending refund is silently lost.
- `everyone` default never produces `awaiting_streamer`, so existing queues keep today's outbox output.

### 2.5 Architect gate deltas (D1–D3) and OD-1

- **D1:** `unknown_reason = 'check_pending'` is the state written by the decision transaction (no Twitch call inside it, see [architecture.md](architecture.md)); `decision_unknown_reason_check` stays true. The worker replaces it with a known result or a real reason code. `check_attempts` counts executed attempts.
- **D2:** [AUTO-DECISION] column vs. the check task's `next_attempt_at` → column `next_check_at` (reason: the panel lists read one table through the pending index without joining `outbox`, which has no `redemption_id` index; drift is prevented by writing both in the same transaction and by test 29). New CHECK `next_check_pending_check`: `next_check_at IS NULL OR resolution = 'pending_check'`.
- **D3:** `outbox.operation_type` has **no** CHECK today (foundation migration), so there is nothing to register at the database level; `refund.eligibility_check` (key `eligibility:{redemption_id}:{round}`, `entity_type = 'redemption'`, `redemption_id` set) is accepted as is. Existing financial counters already filter `operation_type IN ('redemption.cancel','redemption.fulfill')`, so the check task is excluded from them; the financial worker's `claimNext` must filter the same way (application, test 30). Deletion gating counts decision rows (`pending_check`/`awaiting_streamer`), not check tasks. No outbox schema change; no new outbox index (the existing `(status, next_attempt_at)` index serves the check worker's claim).
- **Guarded worker write:** the worker applies its answer with `UPDATE … WHERE redemption_id = $1 AND resolution = 'pending_check' AND version = $v`; an override that resolved the row first leaves 0 rows, so the answer is dropped (architecture note).
- **OD-1 (owner): audience options are additive.** A subscriber is eligible regardless of being a moderator/VIP; the flags only add eligibility for non-subscribers. Consequences: `audience_match` is filled only when eligibility came from a flag (`subscriber_status = 'not_subscriber'`); moderator/VIP lookups run only when the matching flag is on and the viewer is not a subscriber; default configuration needs only `channel:read:subscriptions`. No schema change.

## 3. Indexes

| Index | Purpose |
|---|---|
| PK `refund_eligibility_decisions(redemption_id)` | idempotent insert, join with `redemptions`/`outbox` |
| `refund_eligibility_decisions_queue_pending_idx` ON `(queue_id, resolution, created_at)` WHERE `resolution IN ('pending_check','awaiting_streamer')` | panel lists "pending check" and "awaiting decision" per queue, retry scan, deletion gating count |
| `refund_eligibility_decisions_resolution_batch_idx` ON `(resolution_batch_id)` WHERE `resolution_batch_id IS NOT NULL` | batch "mark as served" result lookup |
| `refund_eligibility_decisions_check_batch_idx` ON `(check_batch_id, decision)` WHERE `check_batch_id IS NOT NULL` | clear/delete outcome counts (eligible / not eligible / pending) |
| `refund_eligibility_decisions_entry_id_idx` ON `(entry_id)` | FK lookup (RESTRICT checks) |

Clear batching (≤ 100 `user_id` per Get Broadcaster Subscriptions, ≤ 50 ids per Update Redemption Status, both unverified per research §5) needs no new index on `entries`: the clear already reads active entries through `entries_queue_id_status_position_idx`; distinct `twitch_user_id` values are chunked in memory. `redemptions` is read by PK. No index on `queues` policy columns (never filtered).

## 4. Migration plan (expand → migrate → contract)

| Phase | Migration | Content | Behavior |
|---|---|---|---|
| **Expand** | `2026MMDDhhmmss_refund_eligibility_policy` | `ALTER TABLE queues ADD COLUMN …` × 6 with constant defaults + `queues_refund_eligibility_check` + `queues_refund_non_eligible_handling_check`; `CREATE TABLE refund_eligibility_decisions` + CHECKs + FKs + 4 indexes | unchanged: no code reads them yet |
| **Migrate** | none (no data step) | existing rows get `everyone`/`false`/`false`/`false`/`true`/`keep_unfulfilled` from the defaults; no backfill of historical redemptions (decisions exist only from the first post-deploy decision) | code ships reading the rule; `everyone` keeps today's results |
| **Contract** | none planned | the three per-trigger Booleans stay (they still mean "when"); `queueRemovalOverridesRefundPolicy` is removed in code, not schema | — |

Lock and duration (PG 18): `ADD COLUMN … NOT NULL DEFAULT <constant>` is metadata-only (no rewrite) but needs a brief `ACCESS EXCLUSIVE` on `queues`; the new `CHECK` validates by scan on a table with a handful of rows (milliseconds). `CREATE TABLE` with FKs takes `SHARE ROW EXCLUSIVE` on `redemptions`, `queues`, `entries` briefly; the new table is empty, so index creation is instant (no `CONCURRENTLY` needed, and Prisma migrations run in a transaction anyway). The migration should start with `SET LOCAL lock_timeout = '5s'` so a long worker transaction makes it fail fast instead of queueing every API write behind it. Risk: **low**.

## 5. Snapshot and rollback

- **Before apply:** `pg_dump --format=custom` of the target database (no backup tables in the database), plus `prisma migrate status` recorded. Development/test use disposable databases only; active volumes are never touched.
- **Rollback (forward-only, as Prisma has no down migrations):** a new migration that runs `DROP TABLE refund_eligibility_decisions;` and `ALTER TABLE queues DROP CONSTRAINT queues_refund_eligibility_check, DROP CONSTRAINT queues_refund_non_eligible_handling_check, DROP COLUMN …` × 6, deployed together with the previous code. **Data loss on rollback:** streamer choices and decision audit rows; pending `unknown` decisions would lose their marker, so before rollback list `resolution IN ('pending_check','awaiting_streamer')` rows and resolve them manually. Outbox rows already created are untouched and keep their FND-3 semantics. Dropping requires explicit owner approval at that time (not given here).
- Code-only rollback (keep schema, old code) is safe: old code ignores the new columns and table.

## 6. RLS

Not applicable. The project uses self-hosted PostgreSQL accessed only by the API through Prisma with one application role; there is no Supabase, PostgREST or client-side database access, so no per-row end-user identity exists at the database. Authorization (streamer vs. moderator for overrides) is enforced in the API, and is recorded in `resolved_by`/`resolved_actor_id`. If direct database access by untrusted roles is ever introduced, RLS must be revisited.

## 7. SQL-level integration tests (disposable PostgreSQL 18, real Prisma migrations)

All tests run against an isolated database created for the run, after `prisma migrate deploy` of every migration; no SQLite, no Prisma mocks; Twitch only through fakes at the adapter boundary.

1. **Migration on populated data:** apply all migrations up to the previous one, insert queues in every mode (`channel_points`, `manual_only` with `none`, converted `manual_only`), apply the new migration, assert every row has `everyone`/`false`/`false`/`false`/`true`/`keep_unfulfilled` and other columns unchanged.
2. `queues_refund_eligibility_check` rejects any value outside the three; NULL rejected on all five columns.
3. Default preservation: with `everyone`, waiting removal, clear, delete, removed-while-called (`true`), no-show (`false`/`true`), viewer-leaves produce exactly the same outbox rows as before (golden comparison with current tests).
4. `nobody`: every trigger writes `decision = not_eligible`, `status_source = not_required`, no `redemption.cancel` row.
5. `subscribers` + fake subscriber (tier 1000/2000/3000, gift true/false): `eligible`, tier and gift stored; outbox row created in the same transaction.
6. `refund_count_gifted_subs = false` + gifted sub → `not_eligible`, `is_gift = true` stored.
7. Broadcaster self, moderator, VIP with each flag on/off → expected decision and `audience_match`/`status_source`.
8. Unknown for each reason code (missing scope, 401, 403, 429, 5xx, timeout, malformed, channel ineligible): decision row `pending_check`, **no** outbox row, `expected_status` NULL.
9. CHECK matrix for section 2.2 (each forbidden combination rejected by PostgreSQL, e.g. `subscriber` without tier, `unknown` without reason, `system` resolving `unknown`, override without actor/reason, reason > 280 chars).
10. Idempotency: concurrent double decision for the same redemption (two transactions) yields one row and one `financial:` outbox row.
11. Re-check of `unknown` → known result updates the row once, increments `check_attempts`, creates the outbox row once.
12. Manual override refund on `awaiting_streamer` and on `pending_check`: one cancel intent; second override and override after an existing cancel/fulfill intent rejected and audited; stale `version` rejected.
13. Manual "mark as served" on `pending_check`: one `redemption.fulfill` row; audited with role and bounded reason.
14. Clear of > 100 redemption entries (e.g. 230): one shared `check_batch_id`, counts by decision match the fake answers, partial 429 leaves only the affected rows `pending_check`.
15. Delete (`queue_deleted`) through the converted-queue path goes through the rule and keeps the deletion gating (`refundsRequested` > 0 → pending deletion).
16. `audit_logs.safe_detail` and logs contain no override text, UID, gifter data or token (assert on stored JSON and captured logs).
17. FK `RESTRICT`: redemption/queue/entry with a decision cannot be hard-deleted.
18. Rollback migration on a disposable copy: drop succeeds, previous code paths' tests still pass.
19. `queues_refund_non_eligible_handling_check` rejects other values and NULL; default `keep_unfulfilled` on existing rows.
20. `subscribers` + non-subscriber + `keep_unfulfilled` → `awaiting_streamer`, no outbox row, `expected_status` NULL; with `auto_fulfill` → `fulfill_requested` by `system` and exactly one `redemption.fulfill` row under `financial:`.
21. CHECK rules 6–8 (revision 2): `awaiting_streamer` with `auto_fulfill` snapshot rejected; `system` + `fulfill_requested` with `keep_unfulfilled` snapshot rejected; override with `resolution_batch_id` but `resolved_by = 'system'` rejected.
22. UNFULFILLED guard: refund override rejected when `remote_status` is `FULFILLED`/`CANCELED`, when `expected_status` is set, or when a `financial:` row exists; zero rows changed, rejection audited.
23. Concurrent refund override vs. "mark as served" on the same redemption (two transactions): exactly one wins, one financial intent.
24. Batch "mark as served" over 120 rows (mixed `awaiting_streamer`, `pending_check`, already resolved): one `fulfill` per eligible row, resolved rows skipped and counted, one batch audit event plus per-row events; replay with the same `resolution_batch_id` changes nothing and returns the stored result.
25. Queue delete with `awaiting_streamer`/`pending_check` rows stays pending (deletion gating) until they are resolved.
26. Default preservation with `everyone` + either handling value: no `awaiting_streamer` or `fulfill_requested` rows are ever produced.
27. D1: the decision transaction writes `pending_check` + `check_pending` + `check_attempts = 0` + one `refund.eligibility_check` row (`eligibility:{id}:0`) and no financial row; each executed attempt increments `check_attempts` once.
28. Worker vs. override race: override resolves first → worker's guarded update changes 0 rows, no second financial intent.
29. D2: `next_check_at` set with the check task schedule and cleared on resolution; CHECK rejects `next_check_at` on a resolved row.
30. D3: `refund.eligibility_check` rows are excluded from financial counters and from the financial worker's claim; queue deletion gating counts the decision rows.
31. OD-1: moderator/VIP who is a subscriber is `eligible` with flags off and `audience_match` NULL; non-subscriber moderator with flag on → `eligible`, `audience_match = 'moderator'`; no moderator/VIP lookup when flags are off.
32. Q5: immutability of `decision`/`rule_snapshot` after a known result (application path rejects; test asserts unchanged values).

## 8. Assumptions

- A1. One reward per queue, and a redemption belongs to one queue (current schema).
- A2. Panel actors are the streamer or moderators, and the API can tell which (`resolved_by`). If the panel has a single operator identity today, `moderator` is unused until roles exist.
- A3. Twitch limits (100 `user_id`, 50 ids) are as stated in research and unverified; the schema does not depend on them.
- A4. Historical redemptions get no backfilled decision rows.

## 9. Risks

- R1. Converted `manual_only` queues keep refunding by rule while the option is hidden (mitigation: panel shows the rule read-only for converted queues — UX).
- R2. `auto_fulfill` consumes the single financial key and makes any later refund impossible (official); the panel must say so before the streamer enables it (UX). Deleting a reward also turns UNFULFILLED into FULFILLED (official), hence the deletion gating in 2.4.
- R3. `pending_check`/`awaiting_streamer` rows can accumulate if the streamer never acts; needs a panel list and maybe an age alert (index provided).
- R4. Rollback loses audit rows; snapshot is mandatory.

## 10. Open questions for `@architect`

- Q1. Confirm the pending marker lives in the decision table, not in a new outbox status.
- Q2. May an override reverse a `refund_requested` whose cancel task is still `pending`/`retry` (cancel the outbox task first) or never?
- Q3. **Resolved (owner, revision 2):** per-queue `refund_non_eligible_handling`, default `keep_unfulfilled` (see 1 and 2.4). Remaining for `@architect`: confirm the default and that converted `manual_only` queues use the same setting.
- Q4. **Answered (architect):** worker operation `refund.eligibility_check`, key `eligibility:{redemption_id}:{round}`; see 2.5.
- Q5. Enforce immutability of `decision`/snapshot with a trigger, or keep it in the application plus tests?
- Q6. Confirm minimum tier stays out of MVP (no queue column now; tier is stored per decision).

Q1–Q6 were answered in [architecture.md](architecture.md) (Q1, Q3, Q6 confirmed; Q2 never in MVP; Q4 worker; Q5 application plus tests).

**Data-engineer re-check after architect gate (2026-10-21):** GO. D1–D3 and OD-1 applied (one new column `next_check_at`, one new CHECK, `check_pending` reason code, tests 27–32). Nothing in the architect note is infeasible in PostgreSQL; D3 needs no database change because `outbox.operation_type` has no CHECK. No migration created.
