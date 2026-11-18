# OPS-31 — `@qa` test plan (refund by group and queue notices; FT-71..FT-78)

[Português (pt-BR)](../../pt-BR/stories/OPS-31/qa-test-plan.md)

> **Update 2026-11-15 (v2).** Sections 1-8 (Part A) are the v1 plan for AC 1-33 and stand where design v2.4 did not change them. **Part B (sections 9-24)** adds AC 34-41, packages P0..P8, gates A/B/C, the policy truth table, the cap race, the LIVE-1 mutation test, `concluir` by role, migrations and `rollback.sql`, `EXPLAIN` on a synthetic volume, DB-12..DB-17, `lock_timeout`, i18n, a11y and run C. Where Part B and Part A disagree, **Part B wins** (list in section 9). Plan only: nothing was run.

**Author:** `@qa` (Quinn), 2026-11-11. **Nature:** PLAN ONLY. No test was written or run, no Docker or dev stack was touched, no code, git or GitHub action was taken. File names are **probable** (created or extended by `@dev`); the test IDs and names are the contract, the files may move.
**Inputs:** [story](story.md) (AC 1-33; `@po` GO 9.3), [architect-design](architect-design.md) (D-31-1..D-31-11, sections 4, 7, 9), [data-engineer-review](data-engineer-review.md) (sections 4 and 6), [ux-plan](ux-plan.md) (section 10), [po-validation](po-validation.md). Format of the previous plan: [OPS-22 qa-test-plan](../OPS-22/qa-test-plan.md).
**Repository facts checked read-only:** `tests/unit` already has `chat-outbox-worker`, `chat-command-handler`, `queue-action-state`, `overlay-widget-service`, `twitch-adapter`, `twitch-http-error`, `twitch-reconciliation`; `tests/helpers/twurple-real-instances.mjs` and the isolated PostgreSQL helpers exist. **No file under `tests/` mentions the TS-20 probe or `40P01`/`pg_stat_activity`** (grep found none): the probe the `@data-engineer` wants "extended" must be located by `@dev` (it may live outside `tests/`); if it does not exist as a test, `@dev` creates it (see section 4.4).

## 1. Basis and rules

1. **Classes are separate evidence; none replaces another.** Legend: `U` unit (Vitest), `TW` fake Twurple or real Twurple classes (`twurple-real-instances`), `PG` isolated PostgreSQL with **real migrations** (disposable container, label `queuebot.test=disposable`; never SQLite, never Prisma mocks, never an active volume), `K` component (Vitest + DOM), `L` localization, `C` contract/static, `E` Chromium E2E (browser-only scripts, fixtures, no Twitch), `OBS` native OBS/CEF (OPS-25 method), `RT` real test channel (FT-78). One ID = one named test; a table-driven test counts once and says so.
2. **Test-first.** `@dev` writes every test Red before the code and records Red and Green output at each slice checkpoint in the story (no commit). `@dev` runs the tests of the slice while implementing; `@qa` re-runs everything once, independently, at the single gate (project rule). The `@qa` does not trust `@dev` output.
3. **Races use two real connections (two `PrismaClient`s) and a barrier proven in `pg_stat_activity`; 50 rounds minimum; the invariant is read back from the database after each round.** No `sleep` as synchronization. Time is injected (`clock`, fake timers, injected `random`, a test-overridable `lock_timeout`).
4. **No result is claimed outside what was run.** Every ID ends as `PASS`, `FAIL`, `NOT RUN` (with the reason) or `PENDING (needs observation window)`.
5. **Order of dependence:** FT-76 and FT-77 are validated together (architect section 6); FT-71 brings the limiter and `chat.notice`, so its tests gate FT-72/FT-76 notice tests.

## 2. AC to test matrix (all 33)

"Red today" = why the test fails before any code (all of OPS-31 is new, so most Red is a missing module, column, route or key; the specific failure is given). Executor: **D** = `@dev` during development, **Q** = `@qa` at the gate (Q always re-runs D's tests too; the column says who writes and first runs).

| AC | Evidence (class) | Suggested file(s) | Tests | Red expected | Who |
|---|---|---|---|---|---|
| 1 join notice | U, RT | `tests/unit/chat-notice-texts.test.js`, `queue-service` ext | U71-01, U71-02, RT-A1 | No `chat.notice` type: import/enqueue fails; no message after accept | D, Q |
| 2 end-of-service | U, RT | same | U71-03, RT-A2 | `concludeEntry` enqueues nothing | D, Q |
| 3 paused/closed + refusal | U, PG, RT | same; `chat-notice-outbox-postgres.test.js` | U71-04, U71-05, PG71-01, RT-A3 | Pause/close send nothing; a redemption while paused is not canceled with the new reason | D, Q |
| 4 burst/limiter | U, TW, PG, RT | `tests/unit/chat-notice-limiter.test.js` (new), `chat-outbox-worker.test.js` ext | U71-06..U71-10, U71-13, TW71-01, TW71-02, PG71-01..03, RT-A6 | No limiter module; `is_sent` today not checked; no `expired` status (CHECK refuses) | D, Q |
| 5 switches, 3 languages, no ids, 500 chars | U, L, RT | `chat-notice-texts.test.js`, catalogs | U71-11, U71-12, U71-14, L71-01, L71-02 | Keys missing; no per-queue switch column | D, Q |
| 6 no-show/skip/restore rule | U, PG, K, E, RT | `tests/unit/queue-skip-restore.test.js` (new), `settlement-skip-restore-postgres.test.js` | U72-01..U72-04, U72-06, PG72-01..03, PG72-04, K72-01, E72-01, RT-A4 | `called->waiting` and `no_show->waiting` do not exist (transition refused) | D, Q |
| 7 reorder aggregated | U, RT | same | U72-05, RT-A5 | Reorder sends nothing | D, Q |
| 8 widget "next" | U, K, E, OBS | `overlay-widget-service.test.js` ext, `tests/unit/next-widgets-page.test.jsx` ext, overlay browser script | U73-01..U73-04, K73-01, E73-01, OBS-73-01 (RT-A7) | Payload has no `next` field | D, Q (OBS: Q + Orion) |
| 9 settlement setting + groups | U, PG | `queue-settings-refund-policy.test.js` (new), `settlement-migration-postgres.test.js` | U74-01, U74-02, PG74-01..PG74-05, PG74-08 | Columns/enums absent; old queues have no `settlement` | D, Q |
| 10 own list (500, per channel) | U, PG, K, E | `own-list-service.test.js` (new), migration/own-list PG | U74-05..U74-09, PG74-06, PG74-07, K74-03, E74-02 | No own-list table/route | D, Q |
| 11 retention copy on the control | K, E, L | `next-queue-settlement-form.test.jsx` (new) | K74-01, E74-01, L74-01 | Control and key absent | D, Q |
| 12 disabled unless 4 conditions; deletion blocked | U, K, PG | policy test; deletion PG | U74-03, U74-10, K74-02, PG76-21 | Refund mode can be saved with any reward; deletion not blocked by new states | D, Q |
| 13 decision persisted once | U, TW, PG | `settlement-decision-service.test.js` (new) | U75-01, U75-05, U75-07, U75-08, PG75-01, PG75-02 | No decision columns; lookup result not stored | D, Q |
| 14 broadcaster + fixed order | U | same | U75-02, U75-03 | No decision service | D, Q |
| 15 any failure = `unknown` | U, TW | `twitch-group-lookup.test.js` (new) | U75-04, U75-05, U75-10, TW75-01, TW75-02, TW75-06 | No adapter; a 4xx would surface as a throw | D, Q |
| 16 one scope per group | U, K, RT | `twitch-oauth.test.js` ext | U75-09, U75-10, K74-02, RT-B5, RT-B13 | Optional-scope list absent | D, Q |
| 17 hold and refund at the end | U, TW, PG, RT | `settlement-transitions.test.js` (new) | U76-02, U76-04, U76-05, TW76-03, RT-B1, RT-B2 | Start fulfills every normal redemption; no hold state | D, Q |
| 18 one terminal operation | U, PG | `settlement-race-postgres.test.js` | U76-09, U76-10, PG76-01..PG76-12 | No unique per redemption; no `settlement.contradictory_request` | D, Q |
| 19 double cancel (404) with real Twurple | TW | `twitch-adapter.test.js` ext | TW76-01, TW76-02 | Second cancel surfaces as failure instead of "already done" | D, Q |
| 20 decide on cancel/skip/no-show | U, K, E, RT | `settlement-transitions.test.js`, dialog component | U76-06, U76-07, K77-03, E77-01, RT-B3, RT-B4 | No choice endpoint; "do not refund" would leave `UNFULFILLED` | D, Q |
| 21 `check_group` | U, PG, K, E, RT | `settlement-transitions.test.js`, pending-list component | U77-01..U77-05, PG77-01, PG77-02, K77-01, K77-02, E77-03, RT-B5 | State absent; start fulfills an unknown member | D, Q |
| 22 real channel | RT | this plan, section 5 | RT-A1..A7, RT-B1..B13 | n/a (verdict by class) | Q (Orion acts) |
| 23 no ids/tokens/bodies in logs | U, PG, C | canary in every file | U71-14, U74-09, U76-13, PG76-30, C-04 | Canary strings would appear in new log calls | D, Q |
| 24 docs + localization en/pt-BR | L, C | `documentation-contract`, `localization-parity` | L71-01, L71-02, L72-01, L74-01, L75-01, L77-01, C-01 | New keys/docs missing | D, Q |
| 25 seven gates | gates | section 6 | gate run | Fails until the code lints and types | D, Q |
| 26 closings without service + batch | U, TW, PG, K, E, RT | `settlement-batch-postgres.test.js` | U76-01..U76-03, U76-14..U76-16, TW75-03, TW75-04, PG76-13..PG76-20, PG76-28, K77-04, E77-02, RT-B6 | No prepare/confirm routes; clear refunds everything as today | D, Q |
| 27 re-entry abuse | PG, RT | batch/compat file | PG76-31, RT-B9, RT-B12 | n/a (documents limits; no new rule) | D, Q |
| 28 refusal refund is a separate case | U, C | transitions + text scan | U71-05, U76-12, C-02 | Refusal text shares keys with group refund | D, Q |
| 29 restore only without terminal intent | U, PG | skip-restore | U72-03, PG72-02, PG72-03 | Restore always allowed or not implemented | D, Q |
| 30 API refuses `refund_on_end` before FT-76 | U | policy test | U74-04 | Saves silently | D, Q |
| 31 cannot-ask triggers -> `awaiting_choice` | U, PG | transitions | U72-07, U76-08, PG76-07 | Timer no-show would refund or fulfill by itself | D, Q |
| 32 batch applies to members only | U, PG | batch/deletion | U76-15, PG76-14, PG76-21 | Batch also decides `check_group` | D, Q |
| 33 "returned" only after Twitch confirms | U, TW, RT | transitions + worker | U76-11, TW76-04, RT-B1, RT-B4 | Notice sent when the intent is recorded | D, Q |

## 3. Tests by slice (the contract)

### 3.1 FT-71 — notices (21)

| ID | Class | Test | AC |
|---|---|---|---|
| U71-01 | U | Joined text carries position and instruction, en/es/pt-BR (table-driven, one test) | 1, 5 |
| U71-02 | U | Exactly one message per accepted redemption; none for refused or duplicate | 1 |
| U71-03 | U | Conclusion enqueues one end-of-service notice | 2 |
| U71-04 | U | Pause, close and reopen enqueue one notice each | 3 |
| U71-05 | U | Redemption while paused/closed is `CANCELED` and the reason text is not a group-refund text | 3, 28 |
| U71-06 | U | Injected clock, 1000 enqueues: no sliding 30 s window exceeds the ceiling (80) | 4 |
| U71-07 | U | Priority 0 (your turn, command answers) never dropped or starved; reserved share holds under flood | 4 |
| U71-08 | U | Burst (clear, close, mass reorder) leaves one pending row per queue and kind (latest wins) | 4, 7 |
| U71-09 | U | Overflow notices expire (`expired`), attempts are bounded, count logged, never retried forever | 4 |
| U71-10 | U | `is_sent` false, undefined, null, missing field: all "not delivered" (table-driven) | 4 |
| U71-11 | U | Per-queue switch per kind group: off sends nothing, defaults as designed | 5 |
| U71-12 | U | Composition <= 500 chars in 3 languages, multi-byte names, long list ends with "and N more", never a cut name | 5 |
| U71-13 | U | Sender throws or notice expires: the queue/money transition is already committed and unchanged | 4 |
| U71-14 | U | Canary (uid, token, chat body) in inputs never reaches a log argument | 5, 23 |
| TW71-01 | TW | Fake Twurple chat send with `is_sent:false` + drop reason and with 429: not delivered; priority 0 retried, priority 1/2 expire | 4 |
| TW71-02 | TW | Real Twurple class parses the send response shape used for `is_sent` | 4 |
| PG71-01 | PG | `chat-notice-outbox-postgres.test.js`: burst in one window writes one row, next window a new one | 3, 4 |
| PG71-02 | PG | `expired` accepted by the outbox status CHECK; existing statuses unchanged | 4 |
| PG71-03 | PG | Financial `claimNext` never claims `chat.notice` | 4 |
| L71-01 | L | Every `chat.notice.*` key exists in en/es/pt-BR (parity) | 5, 24 |
| L71-02 | L | Placeholders and "and N more" suffix valid in 3 languages | 5, 24 |

### 3.2 FT-72 — no-show, skip, reorder (14)

| ID | Class | Test | AC |
|---|---|---|---|
| U72-01 | U | No-show: `called->no_show`, chat message with the new situation | 6 |
| U72-02 | U | Skip: `called->waiting`, position right after the first waiting entry; queue with 0 and 1 waiting entries | 6 |
| U72-03 | U | Restore `no_show->waiting` allowed only without terminal intent and without another active entry | 29 |
| U72-04 | U | Non-member keeps today's `refundOnNoShow` rules | 6 |
| U72-05 | U | Manual reorder informs affected viewers with one aggregated message | 7 |
| U72-06 | U | Skip is its own undo; entry `version` guard; restore audited | 6 |
| U72-07 | U | No-show by timer for a member -> `awaiting_choice`, nobody asked | 31 |
| PG72-01 | PG | Skip/restore position after the first waiting entry; call timestamps cleared | 6 |
| PG72-02 | PG | `P2002` mapped to a stable code when another active entry exists | 29 |
| PG72-03 | PG | Restore refused when the settlement state is `intent_recorded` | 29 |
| PG72-04 | PG | Skip x call x reorder on one queue, 50 rounds: positions contiguous, no duplicates | 6 |
| K72-01 | K | Skip/restore controls, states and focus after the action | 6 |
| E72-01 | E | Skip of a member asks nothing and states the new position | 6, 20 |
| L72-01 | L | `no_show`, `skipped`, `restored`, `reordered` keys in 3 languages | 24 |

### 3.3 FT-73 — widget "next" (7)

| ID | Class | Test | AC |
|---|---|---|---|
| U73-01 | U | Payload `next` = display name of the first waiting entry | 8 |
| U73-02 | U | No waiting entry: no `next` field (not an empty/placeholder string) | 8 |
| U73-03 | U | Payload has no user id/login; long and unicode names are safe | 8, 23 |
| U73-04 | U | Payload follows skip, restore and reorder | 8 |
| K73-01 | K | Widget renders next, absent state, ellipsis on a long name | 8 |
| E73-01 | E | Widget page at 320/390/768 px, with and without a waiting entry | 8 |
| OBS-73-01 | OBS | Native OBS/CEF per the OPS-25 method (separate class; Orion + `@qa`) | 8 |

### 3.4 FT-74 — settings, groups, own list (24)

| ID | Class | Test | AC |
|---|---|---|---|
| U74-01 | U | `settlement` default `fulfill_on_start`; allowed values and group set validated | 9 |
| U74-02 | U | Empty group set refunds nobody (decision service never called) | 9 |
| U74-03 | U | Refund mode disabled unless: reward by this product, skip-request-queue off, affiliate/partner, scope granted per group (table-driven) | 12 |
| U74-04 | U | API refuses `refund_on_end` before the FT-76 flag with a stable code | 30 |
| U74-05 | U | Own list add resolves the login once, stores numeric id + optional label only | 10 |
| U74-06 | U | 500th person accepted, 501st refused with a stable code and message | 10 |
| U74-07 | U | Remove, clear-all, duplicate add idempotent | 10 |
| U74-08 | U | Own list is per channel; deleting a queue drops only its `own_list` switch | 10 |
| U74-09 | U | Canary: login and id never logged | 10, 23 |
| U74-10 | U | Reward/queue deletion rule blocked while refundable redemptions are pending | 12 |
| PG74-01 | PG | `settlement-migration-postgres.test.js`: M1 and M2 apply over rows that already exist; old queues keep `fulfill_on_start`, `none`, `NULL` | 9 |
| PG74-02 | PG | Each CHECK refuses its invalid row (decision shape, state vs decision, state vs `expected_status`, `remote_status`, own-list id format, label length); table-driven, one test | 9, 10 |
| PG74-03 | PG | Guard trigger refuses leaving `intent_recorded` and changing a conclusive decision | 13, 18 |
| PG74-04 | PG | `VALIDATE` passes; `M2-down` guard refuses when the feature was used, passes when not | 9 |
| PG74-05 | PG | `prisma migrate diff` reports no drift | 9 |
| PG74-06 | PG | Two connections add the 500th person, 50 rounds: exactly 500 rows, one refusal (dedicated advisory lock) | 10 |
| PG74-07 | PG | Own list deleted with channel data; queue delete keeps the people | 10 |
| PG74-08 | PG | Notices default off for pre-existing queues | 5, 9 |
| K74-01 | K | "Points" block: moment radios; retention paragraph linked by `aria-describedby` | 11 |
| K74-02 | K | Disabled reasons as text; empty-set hint; "waiting for reconnection" badge; reconnect hidden while dirty | 12, 16 |
| K74-03 | K | Own list UI: add, duplicate, limit, remove (focus moves), clear-all dialog, empty text | 10 |
| L74-01 | L | Settings/own-list keys, plurals, 3 languages | 24 |
| E74-01 | E | Settings at 320/390/768 px (200% zoom at 320) | 11, 12 |
| E74-02 | E | Own list at 320/390/768 px | 10 |

### 3.5 FT-75 — lookup and scopes (20)

| ID | Class | Test | AC |
|---|---|---|---|
| U75-01 | U | Each group alone makes a member eligible (own list, moderator, VIP, subscriber, broadcaster) | 13, 14 |
| U75-02 | U | Fixed order own list, moderator, VIP, subscriber; `matched_group` is the first match | 14 |
| U75-03 | U | `user_id == broadcaster_id` eligible with zero calls | 14 |
| U75-04 | U | One failure plus one positive = eligible | 15 |
| U75-05 | U | Failure and no positive = `unknown` with the first failure's reason; all answered, none positive = `not_eligible` | 13, 15 |
| U75-06 | U | Lookup skipped for: `fulfill_on_start`, empty set, manual entry, refusal, stored decision | 13 |
| U75-07 | U | Decision is written before the first Twitch write call (call order recorded) | 13, 18 |
| U75-08 | U | Outbox retry never re-queries; only "retry now" replaces `unknown` | 13 |
| U75-09 | U | Enabling a group requests only its scope, accumulating; required list unchanged | 16 |
| U75-10 | U | Granted list from `/validate`; missing scope = `scope_missing` with zero calls | 15, 16 |
| TW75-01 | TW | 401, 403, 429, 5xx, timeout, malformed body -> reason codes (table-driven, 6 cases) | 15 |
| TW75-02 | TW | Non-affiliate channel -> `channel_not_eligible` | 15 |
| TW75-03 | TW | Chunks of 100 ids, at most one call per group per chunk | 26 |
| TW75-04 | TW | 429 waits once within the bound, then chunk `unknown(rate_limited)`; clear still succeeds | 26 |
| TW75-05 | TW | Subscription fixtures: paid, gifted and a Prime-shaped record all count (fixture level, NOT a real Prime proof) | 15 |
| TW75-06 | TW | Real Twurple error classes (`HttpStatusCodeError`) map correctly, in the same style as FT-26 | 15 |
| PG75-01 | PG | Conclusive decision immutable: a second write changes nothing | 13 |
| PG75-02 | PG | `unknown` replaced only by "retry now" and only while no intent exists | 13 |
| PG75-03 | PG | Snapshot of `settlement_mode` and groups: later settings change does not touch decided redemptions | 13 |
| L75-01 | L | Reason texts and reconnect copy in 3 languages | 24 |

### 3.6 FT-76 — hold, refund at the end, choices, batch (51)

| ID | Class | Test | AC |
|---|---|---|---|
| U76-01 | U | Trigger table, column "not a member", all 10 rows (table-driven) | 26, 28 |
| U76-02 | U | Column "member", all rows | 17, 20, 26, 31 |
| U76-03 | U | Column `unknown`, all rows | 21 |
| U76-04 | U | Start: member held (no call), non-member fulfilled | 17 |
| U76-05 | U | `redemption.cancel` is issued only on conclusion (spy on the outbox writer) | 17 |
| U76-06 | U | "Do not refund" = `redemption.fulfill` recorded in the same transaction as the choice | 20 |
| U76-07 | U | Skip asks nothing and has no financial effect | 20 |
| U76-08 | U | Non-asking triggers (timer, leave, chat removal) give `awaiting_choice`; a chat command is never accepted as a choice | 31 |
| U76-09 | U | Contradictory explicit request: stable code, `settlement.contradictory_request`, recorded outcome returned, state unchanged; automatic rule keeps the downgrade plus audit | 18 |
| U76-10 | U | Same choice repeated = "already done", one task | 18 |
| U76-11 | U | Outcome chat notice only after the worker read-verify confirms; a missing answer never produces it | 33 |
| U76-12 | U | Refusal (paused/closed/duplicate) cancels without any lookup | 28 |
| U76-13 | U | Canary: audit `safe_detail` allowlist and logs carry codes and counts only | 23 |
| U76-14 | U | Batch prepare returns counts only (non-members, members, check group) | 26 |
| U76-15 | U | Batch confirm: members only; `check_group` never decided | 32 |
| U76-16 | U | Result text says "requested/pending" until Twitch confirms | 26 |
| TW76-01 | TW | Second cancel -> Twitch 404, read `CANCELED` -> resolved already done, with the **real** Twurple redemption class | 19 |
| TW76-02 | TW | Opposite remote status found by read-verify -> OPS-22 `conflict`, no write | 18 |
| TW76-03 | TW | Held redemption: the fake records zero write calls during the whole service | 17 |
| TW76-04 | TW | After a confirmed cancel/fulfill the notice is enqueued once; none after `unknown`/`failed` | 33 |
| PG76-01..07 | PG | Race pairs, 50 rounds each (section 4.1) | 18, 31 |
| PG76-08 | PG | Lock bypassed: second insert with the same key refused by the key unique | 18 |
| PG76-09 | PG | Lock bypassed: second insert with a different key (`financial:R:x`) refused by `outbox_financial_redemption_uidx` | 18 |
| PG76-10 | PG | Barrier self-test: if the second backend is not seen waiting, the helper fails the round (cannot pass vacuously) | 18 |
| PG76-11 | PG | `expected_status` matches the winner; one financial row; loser gets a stable code | 18 |
| PG76-12 | PG | No `40P01`/`40001` in any round | 18 |
| PG76-13 | PG | Batch counts by outcome | 26 |
| PG76-14 | PG | `check_group` never decided by a batch | 32 |
| PG76-15 | PG | Stale snapshot refused | 26 |
| PG76-16 | PG | Batch x single action serialized; loser re-reads | 26 |
| PG76-17 | PG | Batch x batch on one queue (double cancel / duplicate confirm): second refused or idempotent, one task per redemption | 18, 26 |
| PG76-18 | PG | `ON CONFLICT DO NOTHING` counted as "already decided" | 26 |
| PG76-19 | PG | Statement count independent of N (10 vs 500) | 26 |
| PG76-20 | PG | N=500 batch finishes inside `statement_timeout`/`lock_timeout`; the time is recorded as a measurement, not asserted | 26 |
| PG76-21 | PG | Queue/reward deletion stays `deleting` while any redemption is `held_for_service`, `awaiting_choice` or `check_group` | 12, 32 |
| PG76-22 | PG | Archived queue still lists pending decisions | 21 |
| PG76-23 | PG | Restart copies configuration, never the redemption columns or the own list | 9 |
| PG76-24 | PG | Held redemption never claimed by `claimNext` (no outbox row) | 17 |
| PG76-25 | PG | Worker confirm of another task while settlement runs: no shared lock edge | 18 |
| PG76-26 | PG | Reconciliation observing a remote terminal on a held row sets `expected_status` and `intent_recorded` together | 18 |
| PG76-27 | PG | `check_group` and financial `unknown` are mutually exclusive (CHECK) | 21 |
| PG76-28 | PG | Clear with a failed lookup chunk: entries removed, chunk `unknown`, clear never fails | 26 |
| PG76-29 | PG | TS-20 probe extended (section 4.4) | 18 |
| PG76-30 | PG | Log capture across the files: no user id, login, display name or label in logs or `safe_detail` | 23 |
| PG76-31 | PG | Re-entry: second active entry of one person refused with refund (`duplicate_active_entry`); no automatic penalty exists | 27 |

(PG76-01..07 are the seven race tests of section 4.1, so PG76 totals 31.)

### 3.7 FT-77 — "check group" (16)

| ID | Class | Test | AC |
|---|---|---|---|
| U77-01 | U | `unknown` -> `check_group`; start does not fulfill; the service still starts | 21 |
| U77-02 | U | Four choices (retry now, refund, fulfill, keep); nothing happens without the action | 21 |
| U77-03 | U | Retry now: eligible in service -> held; eligible closed -> `awaiting_choice`; not eligible -> fulfill recorded; still unknown -> stays | 21 |
| U77-04 | U | Conclusion with an unresolved `check_group`: not decided, listed as pending | 21 |
| U77-05 | U | No chat notice is produced for "check group" | 21 |
| PG77-01 | PG | `check_group` survives the end of the service and a restart; pending list by queue index after reload | 21 |
| PG77-02 | PG | Pending batch actions touch only `check_group` items | 32 |
| K77-01 | K | Mark on the card, badge on card and navigation | 21 |
| K77-02 | K | Pending rows, hint before "Check again", stacked below 600 px | 21 |
| K77-03 | K | Decision dialog: title focused, `Esc`/Back no effect, equal buttons, none pre-armed, "(final)" wording | 20 |
| K77-04 | K | Batch dialog: radios without default, Confirm disabled with visible reason, selection reset on new snapshot | 26 |
| L77-01 | L | Dialog, batch, pending, reason keys; plurals in 3 languages | 24 |
| E77-01 | E | Decision dialog at 320/390/768 px; "already decided" on a second tab | 20 |
| E77-02 | E | Clear/delete dialogs for 0 members, only members, mixed, some unknown; says "requested", never "refunded" | 26 |
| E77-03 | E | Pending list after a clear and after a reload | 21 |
| E77-04 | E | Keyboard only, focus trap/restore, one `status` and one `alert` stay mounted | 20, 21 |

### 3.8 Cross-cutting contract (4) and totals

| ID | Class | Test | AC |
|---|---|---|---|
| C-01 | C | Bilingual docs and user guide exist (documentation contract) | 24 |
| C-02 | C | Static scan: refusal keys and group-refund keys are disjoint; `refunded` notice is reachable only from the confirmation path | 28, 33 |
| C-03 | C | New audit events (`settlement.*`) inside the `safe_detail` allowlist | 23 |
| C-04 | C | Every new route: non-2xx carries an enumerated `code`; unexpected failures return generic text with `referenceId` | 23 |

| Class | FT-71 | FT-72 | FT-73 | FT-74 | FT-75 | FT-76 | FT-77 | Cross | Total |
|---|---|---|---|---|---|---|---|---|---|
| U | 14 | 7 | 4 | 10 | 10 | 16 | 5 | 0 | **66** |
| TW | 2 | 0 | 0 | 0 | 6 | 4 | 0 | 0 | **12** |
| PG | 3 | 4 | 0 | 8 | 3 | 31 | 2 | 0 | **51** |
| K | 0 | 1 | 1 | 3 | 0 | 0 | 4 | 0 | **9** |
| L | 2 | 1 | 0 | 1 | 1 | 0 | 1 | 0 | **6** |
| E | 0 | 1 | 1 | 2 | 0 | 0 | 4 | 0 | **8** |
| C | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | **4** |
| OBS | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | **1** |
| **Total** | 21 | 14 | 7 | 24 | 20 | 51 | 16 | 4 | **157** |

Plus 20 real-channel items (RT-A1..A7, RT-B1..B13; section 5), 27 mutations (section 4.6), the existing regression suites (`compose-runtime`, `localization-parity`, `documentation-contract`, the OPS-22 fixtures) and the seven gates.

## 4. Races and concurrency

### 4.1 Terminal operation unique (the five main races, 50 rounds each, in `settlement-race-postgres.test.js`)

| # | Race | Test | Invariant read back after each round |
|---|---|---|---|
| 1 | **Fulfill x cancel:** conclusion (member -> `cancel`) x removal with "do not refund" (`fulfill`) on the same redemption | PG76-01 | Exactly one `financial:{id}` row; `expected_status` equals the winner; the loser got the stable "already decided" code; `settlement.contradictory_request` written exactly once (the choices differ) |
| 2 | **Double cancel:** two tabs with opposite choices (refund x do not refund), and two identical choices | PG76-02, PG76-06 | Opposite: one row, one audit row, recorded outcome returned to the loser. Identical: one row, both answers "done/already done", zero audit contradiction |
| 3 | **Batch:** clear/delete confirm x a single choice or conclusion, and confirm x confirm | PG76-05, PG76-16, PG76-17 | One task per redemption; loser re-reads and gets the stale-snapshot code or "already decided"; `check_group` untouched |
| 4 | **Start x removal** (member held vs non-member refund) | PG76-03 | Member: held, no row; non-member: exactly one row of the winning type; never both a fulfill and a cancel |
| 5 | **Two "retry now"** (and retry now x choice) on `check_group`; plus timer no-show x panel choice with an injected clock | PG76-04, PG76-07 | One decision stored; one transition; the timer's `awaiting_choice` loses to a panel choice or the reverse, never both |

Each round: fresh queue and redemption ids (unique per round), so rounds never share rows; the winner is **not** fixed (both orders must occur across the 50 rounds or the test records the distribution and fails if one order never occurred, which would mean the barrier is not really racing). No `40P01`, no `40001`, no generic 500 on the loser (PG76-12).

### 4.2 The barrier by `pg_stat_activity` (no `sleep`)

1. Each client gets its backend pid first (`SELECT pg_backend_pid()`).
2. Both run the real repository function up to a **test seam** placed after the queue lock and before the intent write (the architect/`@data-engineer` design allows the seam). Client A reaches the seam holding the advisory lock and waits on a promise controlled by the test.
3. Client B is started; the test **polls** `pg_stat_activity` joined with `pg_blocking_pids(pidB)` until `wait_event_type = 'Lock'`, `wait_event = 'advisory'` and `pidA` is in the blocking list. The poll is a bounded loop of query round trips (cap, then FAIL with the last state), not a timer.
4. Only then is A released. Observing B waiting proves the serialization is real instead of assumed.
5. A round where B was never seen waiting is a **failure of the round** (PG76-10 asserts the helper does this), never a skip. A suite with fewer than 50 observed-waiting rounds per race is not accepted.

### 4.3 Execution without the advisory lock (mutation by raw SQL)

PG76-08 and PG76-09 use raw SQL transactions with **no** `lockQueue`: a second insert with the same key is refused by the key unique; a second insert with a **different** key is refused by the partial unique index per redemption. Together they prove the constraint layer works when the lock layer is bypassed (D-31-3, layers 1-2). The code-level mutation M1 (section 4.5) removes the lock from the real path, and the barrier must then fail because B is never seen waiting.

### 4.4 Deadlock: the TS-20 probe extended

`settlement-deadlock-postgres.test.js` (PG76-29) takes the three transactions `retryOutboxManually`, `requestQueueDeletion` and one settlement transaction and runs all 6 orders, each started behind a barrier. Expected for every order: every transaction ends in commit or in `40P01`/`55P03` mapped to a generic retryable error with `referenceId`; nothing hangs. The server `lock_timeout` is read from a configuration constant that the test lowers (for example 500 ms) so a defect fails fast; the production value (5 s) is asserted separately as a constant. If the TS-20 probe is not found as a test, `@dev` records that and writes this file as the first probe (open point P1).

### 4.5 Clock and repetition

- Injected `clock` for the limiter, the call timer and the expiry (no real wait).
- Race rounds: **>= 50** per pair inside one run; each PostgreSQL file is run **3 times** at the gate (150+ rounds per pair). A single round failure fails the gate.
- Contended machine: timing is never asserted; only outcomes are.

### 4.6 Mandatory mutations (27; >= 12 required)

**How `@qa` reproduces them.** One at a time, serially, only at the gate and never while another agent edits the same file: (1) copy the file to be mutated into `.local/qa-ops31/backup/<id>/` (never `/tmp`) and record `sha256sum`; (2) apply the one-line mutation; (3) run **only** the named test(s) and record the failing test name and message; (4) restore the file from the copy and run `cmp` against the backup plus `git diff --stat -- <file>` equal to the pre-mutation state; (5) re-run the named test Green. A mutation that does not fail its named test is a **FAIL of the plan** (the test is weak) and blocks the gate. When another agent is active in `apps/`, the mutations run in a full copy of the tree (`cp -a` without `node_modules`, with its own `npm ci`) under `.local/`, never in the shared checkout.

| # | Mutation | Test that must fail |
|---|---|---|
| M1 | Remove the queue advisory lock from the settlement transaction | PG76-01..07 (B never seen waiting), PG76-10 |
| M2 | Drop `outbox_financial_redemption_uidx` from the migration | PG76-09, PG74-01 |
| M3 | Replace `ON CONFLICT DO NOTHING` with a plain insert | PG76-11 (loser gets an error, not a stable code), PG76-18 |
| M4 | Make the decision write unguarded (overwrite `eligible` with a later result) | PG75-01, U75-08 |
| M5 | Persist the decision after the Twitch call instead of before | U75-07, U76-05 |
| M6 | Treat any lookup failure as `not_eligible` | U75-04, U75-05, TW75-01 |
| M7 | Cancel members at service start | U76-04, U76-05, U76-02 |
| M8 | Conclusion fulfills members instead of canceling | U76-02, U76-05 |
| M9 | "Do not refund" records nothing (leaves `UNFULFILLED`) | U76-06, PG76-11 |
| M10 | Allow `no_show->waiting` after `intent_recorded` | U72-03, PG72-03 |
| M11 | Batch confirm also decides `check_group` rows | U76-15, PG76-14 |
| M12 | Drop the confirmation snapshot guard | PG76-15 |
| M13 | A contradictory request overwrites `expected_status` | U76-09, PG76-01 |
| M14 | Limiter ceiling removed or priority 0 made droppable | U71-06, U71-07 |
| M15 | Treat `is_sent` undefined as delivered | U71-10 |
| M16 | Send the "points returned" notice when the intent is recorded | U76-11, TW76-04, C-02 |
| M17 | Log the user id or login in a lookup/own-list error | U71-14, U74-09, U76-13, PG76-30 |
| M18 | Own-list cap off by one (accepts the 501st) | U74-06, PG74-06 |
| M19 | API accepts `refund_on_end` before the FT-76 flag | U74-04 |
| M20 | Queue deletion not blocked by `awaiting_choice` | PG76-21 |
| M21 | Use `SKIP LOCKED` instead of waiting in the batch decision | PG76-13, PG76-17 (a member silently dropped) |
| M22 | Accept a choice from a chat command | U76-08 |
| M23 | Call Twitch although the scope is missing | U75-10 |
| M24 | Cut messages at 500 characters in the middle of a name | U71-12 |
| M25 | Swap the group order (subscriber before own list) | U75-02 |
| M26 | Remove the guard trigger (`intent_recorded` leaves) | PG74-03 |
| M27 | Timer no-show of a member refunds or fulfills by itself | U72-07, U76-08, PG76-07 |

## 5. Real tests in the test channel (FT-78, AC 22)

**Authorization and limits.** Only the exclusive SubaruShogun test channel (owner authorization of 2026-11-05). `@qa` creates queues and rewards through the product (rewards created by this product only). The Orion acts in Chrome: redemptions and chat messages; when the `@qa` has no authenticated browser to the real backend, the Orion also clicks the panel buttons following the sheet and reports what is visible. `@qa` verifies through the database, the product's own read-verify and the audit rows, **counts and reason codes only**; no token, header, user id or chat body is copied into the evidence. No password, no `sudo`, no secrets in the sheet.

### 5.1 Two runs, as in the architect plan

- **Run A (after FT-71..FT-73): notices.**
- **Run B (after FT-74..FT-77): money.** Never run B before the single local gate is green (a defect in money code must not meet a real redemption).

### 5.2 Two accounts

The groups are tested with **two viewer accounts in the Orion's Chrome**: account X (with a role) and account Y (no role). Roles are cheap to create without paying: the **own list** makes X a member with no Twitch role; X can also be made moderator and VIP by the broadcaster in the test channel (`/mod`, `/vip`, reversible).

| Needs both accounts (X member, Y non-member, same queue) | One account is enough |
|---|---|
| RT-B1 + RT-B2 compared in one queue (member held, non-member fulfilled at start) | RT-A1, RT-A2, RT-A3 (pause/refusal), RT-B9 (limit), RT-B5 (check group), RT-B8, RT-B11 |
| Ordering and notices with two real viewers (RT-A4 can use manual entries instead) | RT-B3, RT-B4 (member choice) |

Decision (fallback if only one account is available): flip the same account between member and non-member by adding/removing it from the own list between two redemptions. The money logic is fully exercised this way; what is lost (two distinct viewers in one queue) is covered by manual entries and recorded as such. Whether two accounts exist is an open point (P3).

### 5.3 Scripts

| ID | Run | Script (Orion / `@qa`) | Expected | Closes |
|---|---|---|---|---|
| RT-A1 | A | Y redeems; chat shows the joined notice | One message, position and instruction, channel language, <= 500 chars | AC 1, 5 |
| RT-A2 | A | Serve to the end | One end-of-service message | AC 2 |
| RT-A3 | A | Pause, Y redeems; close, Y redeems; reopen | Redemptions `CANCELED` (points back), reason text; one notice per state | AC 3, 28 |
| RT-A4 | A | Manual entries; no-show, skip, restore from the panel | One message each with the new situation | AC 6 |
| RT-A5 | A | Reorder several; clear | One aggregated message for reorder, one for clear | AC 4, 7 |
| RT-A6 | A | Burst: 30+ manual entries, clear, call; count chat messages in the window | Never above the ceiling; "your turn" delivered; overflow notices expired, not stuck | AC 4 |
| RT-A7 | A | Widget "next" in native OBS | Shown with a waiting entry; nothing misleading without | AC 8 (OBS class) |
| RT-B1 | B | X (own list) redeems; Twitch queue view during service; conclude | `UNFULFILLED` during the whole service, `CANCELED` after conclusion, points back; chat "returned" only after read-verify | AC 17, 33 |
| RT-B2 | B | Y redeems in the same queue | Fulfilled at start; no refund | AC 17 |
| RT-B3 | B | X redeems, removed with "do not refund (final)" | Redemption `FULFILLED`; no points back | AC 20 |
| RT-B4 | B | X redeems, removed with "refund" | `CANCELED` immediately; chat tells the person after confirmation | AC 20, 33 |
| RT-B5 | B | Enable VIP without its scope: X redeems -> "check group"; reconnect (owner) -> retry now | `check_group`, no fulfill; then held | AC 15, 16, 21 |
| RT-B6 | B | Clear with members and a non-member | Prepare shows counts; confirm applies one choice; chat summary; text says "requested" until confirmed | AC 26, 32 |
| RT-B7 | B | X made moderator, then VIP (Orion in Chrome), groups enabled one at a time | Matched by that group; subscriber group **not run** (see 5.5) | AC 14 |
| RT-B8 | B | Leave one `UNFULFILLED` redemption; record the timestamp; read again after 24 h and after 7 days | Result recorded as observed or `PENDING`; never invented | Real item 1 |
| RT-B9 | B | Reward limit 1 per person per stream; X redeems, concluded (`CANCELED`), redeems again | Whether the limit/cooldown is restored; recorded | Real item 2, AC 27 |
| RT-B10 | B | After any app-made cancel/fulfill, read the reconciliation observation counts | Whether `redemption.update` arrives for our own change | Real item 3 |
| RT-B11 | B | Repeat RT-B1/RT-B4 with the channel offline; one repeat while live if the owner streams | Cancel works offline; chat notice behavior offline recorded | AC 17, 20 |
| RT-B12 | B | X redeems twice in a row | Second refused with refund (`duplicate_active_entry`); no penalty | AC 27 |
| RT-B13 | B | Owner reconnects with a new scope; compare granted scopes in `/validate` before/after (names only) | Whether the second authorization carries only the new scope or the whole set | Real item 6 |

### 5.4 What only a real test closes

Expiry of an `UNFULFILLED` redemption (RT-B8, needs time), restoration of the reward limits after `CANCELED` (RT-B9), whether our own changes fire `redemption.update` (RT-B10), cancel with the streamer offline (RT-B11), per-person limit (RT-B9, RT-B12), and the content of the second authorization (RT-B13, owner-gated).

### 5.5 What cannot be proven in this environment, and how it is declared

| Item | Why not | Declaration |
|---|---|---|
| **Prime** (real item 4) | Needs an account with an active Prime subscription | `NOT RUN`. Only TW75-05 (fixture) exists. The user guide and release note say "subscribers (paid and gifted)"; Prime "is expected to count, not verified in a real channel". Item stays open in the story (not closed) |
| **Subscriber group in general** | Needs a paid or gifted subscription (money) | `NOT RUN` for the real class; unit/fake only. The panel keeps the group available; the guide states it was not verified live |
| **Streamer in the three lists** (real item 5) | The rule `user_id == broadcaster_id` (AC 14) makes eligibility independent of the lists, and the broadcaster may be unable to redeem on their own channel | `NOT RUN`; recorded as "no impact on correctness". If the Orion finds the broadcaster can redeem, RT-B1 is repeated with the broadcaster |
| **Second authorization** (real item 6) | Needs the owner to log in and consent; the plan forbids passwords | `PENDING (owner)`; the Orion tries it only with an already logged-in session. Closed only by observation |
| **Expiry of `UNFULFILLED`** | Needs elapsed time beyond a session | `PENDING (observation window)` with timestamps recorded |

Verdict wording: the gate may be PASS/CONCERNS with these items declared as above; **it is never PASS with a claim of Prime, subscriber or expiry results that were not observed**.

## 6. Gates and exit criteria

Order of the single `@qa` gate:

1. `git diff --check`; `npm run lint`; `npm run typecheck` (and `typecheck:api/infra/web`); `npm run validate:localization`, `validate:version`, `validate:port-denylist`; `npm run review:static` (OpenGrep; exit code reported).
2. Full suite **3x**: `npm test` three consecutive runs, all green, no flaky test (a flaky test is a FAIL of the test, not a rerun).
3. PostgreSQL **3x per file**: the nine files (`settlement-migration`, `settlement-race`, `settlement-batch`, `settlement-deadlock`, `settlement-ops22-compat`, `settlement-deletion`, `settlement-skip-restore`, `chat-notice-outbox`, plus the own-list file if separate), each run three times on the disposable instance with real migrations; containers and volumes checked (label, project) before and after; nothing active touched.
4. Browser: the E2E scripts (settings, own list, decision dialog, batch dialogs, pending list, widget, plus `panel-layout`) at **320, 390 and 768 px** (200% zoom at 320), each 3x; contrast >= 4.5:1 measured; targets >= 44 px; keyboard only; live regions as in `ux-plan.md` section 10. Screen reader: `NOT RUN` (risk accepted by the owner). Static review of the UX and visual validation are different classes and are reported apart.
5. Localization: `validate:localization`, parity and plural forms for en, es and pt-BR; no key missing in any language.
6. Security: log canary tests green; a scan of captured logs and `audit_logs.safe_detail` finds no user id, login, token, header, chat or redemption body; chat texts carry no ids; the generic error text with `referenceId`; `git log origin/main..HEAD --format=%B | grep -c 'claude[.]ai/'` is 0 and no session URL in docs.
7. The 27 mutations (section 4.6) each fail their named test and are restored with `cmp`.
8. Race evidence: >= 50 observed-waiting rounds per race, 3x.
9. Real runs A and B with the table above (each item PASS/FAIL/NOT RUN/PENDING).
10. Score: `@qa` score **>= 9.0/10** and the `@ux-design-expert` static score stays >= 9.0 for the reviewed scope.

**What blocks the commit (any one):** a failing or flaky test; a mutation that survives; fewer than 50 observed-waiting rounds, or a race without the proof of waiting; a `40P01`/`40001`; any AC without recorded evidence by class; an AC 33 notice without confirmation; any leak in logs or chat; lint, typecheck, `review:static` or a validation script with non-zero exit; localization key missing; the retention copy (AC 11) or the "final" wording (AC 20) missing; a real-channel result claimed without the run; a session URL anywhere; score < 9.0. Verdict: PASS / CONCERNS / FAIL / WAIVED plus the list of groups ready for `@devops` (FT-76 and FT-77 together).

## 7. Risks of the plan and dependencies

| # | Risk | Depends on |
|---|---|---|
| P1 | The TS-20 probe was not found in `tests/` | `@dev` locates or writes it (first, before FT-76) |
| P2 | The test seam between the queue lock and the intent write must exist in the production code path without changing behavior | `@dev` + `@data-engineer` agree on the seam in FT-74/FT-76 |
| P3 | Two viewer accounts in the Orion's Chrome are not confirmed | Owner/Orion confirm; fallback in 5.2 |
| P4 | Real items 1, 2, 3, 6 and Prime may stay open; the DoD says "closed or recorded as pending" | Owner accepts the declaration of 5.5 |
| P5 | The Twitch broadcaster may not be able to redeem on their own channel | Observation in the real run |
| P6 | Mutations edit shared files while a `@dev` works in `apps/` | Serial execution at the gate; full copy under `.local/` otherwise |
| P7 | PostgreSQL files are slow on a contended machine (3x of nine files) | Timing is never asserted; the gate budget is planned in time, not by raising limits |
| P8 | Batch N=500 in one transaction is a measurement, not a guarantee | `@dev` measures (data-engineer R6) before any split |
| P9 | `moderation:read` is a broad scope; RT-B7 needs the owner to reconnect with it | Owner, once |
| P10 | The Twurple response of a Prime subscription is unverified | Stays a fixture assumption; declared in 5.5 |
| P11 | UX copy ("requested/pending", "final") is asserted by key presence, not by meaning | `@ux-design-expert` static review plus the visual E2E |

**Depends on `@dev`:** the seam, the Red/Green records per slice, the TS-20 probe, the catalog keys. **On `@data-engineer`:** the migration review (R2..R5, R10 of their risk table) and the constraint names used in PG76-08/09. **On the owner:** reconnect with the new scopes, two accounts or the fallback, the second authorization, and acceptance of the declarations in 5.5.

## 8. Single-gate scheme (v1; the A/B/C split of section 10 replaces it)

Slices run in the architect order (FT-71, FT-72, FT-73 beside them, FT-74, FT-75, FT-76, FT-77); `@dev` records a Red-then-Green checkpoint per slice without committing; FT-78 run A after FT-71..73 is optional before the gate only if the owner is present; run B only after the local gate. One `@qa` gate at the end (project rule), with FT-76 and FT-77 together.

---

# Part B — v2 addendum (2026-11-15): AC 34-41, packages P0..P8, gates A/B/C

**Author:** `@qa` (Quinn). **Nature:** PLAN ONLY. No test was written or run; no Docker, database, dev stack, git or GitHub action was taken. Test IDs and names are the contract; file names are **probable**. **HYPOTHESIS** marks anything that is not yet verified (by reading, by running, or by the owner). **Inputs read:** [story](story.md) (AC 34-41, packages P0..P8, amended AC 3, 4, 5, 17, 27, 30), [po-validation](po-validation.md), [architect-design-v2](architect-design-v2.md) (3.2, 3.4, 3.10-3.13, 10, 13, 14), [data-engineer-review](data-engineer-review.md) (9.3, 9.4, 9.7, 9.8: DB-1..DB-17, N-1..N-5), [ux-plan-v2](ux-plan-v2.md) (section 8 checklist). **Repository facts checked read-only today:** no file under `tests/` or `apps/` contains `resolveSettlementAction`, `stream_sessions`, `pending-decisions`, `settlement_policy_rev`, `onStreamOnline`, `lock_timeout`, `pg_stat_activity` or `40P01`; the migrations folder holds the 13 migrations of the head (last `20261014230000_outbox_deletion_cancel_verification`, the only one with a `rollback.sql`); `package.json` has `playwright-core` and **no** axe dependency. So "Red today" for every v2 test is: module, column, route, key or table missing. **Revision 2026-11-15 (Part B v2.1, design v2.6):** section 25 adds the configurable re-entry cap (`reentry_cap_hold`, `reentry_cap_counts_manual`), `refund_origin`, the sixth cause `batch_deferred`, DB-18..DB-21 and the UX cap checklist (+36 tests, +11 mutations); G-B1..G-B7 are closed (table 24.1); G-B12, G-B13 and G-B15 closed on 2026-11-15 (design v2.7/v2.8, owner decision); G-B14 open. Nothing was run; every unverified point stays **HYPOTHESIS**.

## 9. Basis of Part B and what it overrides

1. **Evidence classes (separate; none replaces another).** Part A legend stands (`U`, `TW`, `PG`, `K`, `L`, `C`, `E`, `OBS`, `RT`). Mapping to the five classes asked for the gate: *unit* = `U`, `TW`, `K`, `L`, `C`; *API/PostgreSQL 18 disposable* = `PG` and `API` (HTTP contract against the isolated instance with real migrations; the new `API` tag only marks route tests); *real service* = `SV` (new: API and worker processes started from the compose test stack against the isolated instance, Twitch replaced by the project's fake adapter; **HYPOTHESIS:** the fake-adapter stack used by `compose-runtime.test.js` can boot the worker with the new EventSub callbacks, `@dev` confirms); *browser* = `E` (Chromium scripts of the project, fixtures, no Twitch); *Twitch/OBS real* = `RT` and `OBS`. One ID = one named test; a table-driven test counts once and says so.
2. **Test-first, no commit before the gate, no `sleep`, injected clock, two real connections and a barrier proven in `pg_stat_activity`/`pg_locks`, 50 rounds minimum, invariant read back from the database**: Part A rules 2-4 stand.
3. **Part B overrides Part A in these points.**
   - *Gates.* Part A section 6 and 8 describe one gate; Part B section 10 splits it into A, B and C (project rule is one gate per story; the design recommends three; the Orion decides whether B and C merge, section 10.4).
   - *Preselection.* Any Part A test that expects "apply to the pending" to preselect the new policy value is **void**: AC 36 (owner decision 2026-11-15) says no option is preselected and the button stays disabled until an explicit choice. **Inconsistency found:** design section 13 (v2.1 Policy bullet) and 3.10 still say "preselects"; the AC wins and `@architect` should fix the design text.
   - *Migrations.* M1 has five columns; the down file is `rollback.sql` (not `down.sql`); M2 is split M2a/M2b; the strict reverse order is `M3b, M4, M3a, M3, M2, M1`.
   - *Mutations.* Part A has 27 (>= 12 required); Part B adds 39 (28 in section 21 and M56..M66 of v2.1); at the gate **>= 20 of the 39 are mandatory** (all where the code exists).
   - *Quantities.* Part A "2 x 50 rounds" per race stands; Part B adds races (section 13, 18).
4. **IDs.** New IDs carry the AC number to stay disjoint from Part A (which uses the slice number 71-78): `U34-01`, `PG39-03`, `API38-02`, `K36-01`, `E36-01`, `TW40-02`, `SV-01`, `MG-01` (migration file), `RT-C1`.

## 10. Gates A / B / C and the package map

### 10.1 AC to package to gate (all 41)

| AC | Package(s) | Gate | Main classes |
|---|---|---|---|
| 1-5, 28 | P2 | B | U, TW, PG, L, RT (run A) |
| 6, 7, 29 | P3 | B | U, PG, K, E, RT (run A) |
| 8 | P4 | B | U, K, E, OBS |
| 9-12, 30 | P5 | C | PG, U, K, E |
| 13-16 | P6 | C | U, TW, K |
| 17-21, 26, 31-33 | P7 (P0 protects 18, 26, 32) | A (P0 baseline), C | U, TW, PG, K, E, RT (run B) |
| 22, 27 | P8 | verdict by class | RT |
| 23, 24, 25 | every package | A, B and C (each gate checks its own scope) | C, L, scans |
| 34 | P1 (interface, truth table), P5b (storage), P7 (enforcement) | A, C | U, PG |
| 35 | P5b (storage and API), P7 | C | API, PG, K |
| 36 | P7 | C | API, PG, K, E |
| 37 | P5 (M2a columns and `CHECK`s), P7 (behavior) | C | PG, TW, U |
| 38 | P5b (count), P7 (route and history) | C | API, PG, K |
| 39 | P5b (`refunded_at`), P6b (window), P7 (count and cap) | C; run C in P8 | PG, U, RT |
| 40 | P6b | C; run C in P8 | U, TW, PG, SV, RT |
| 41 | P7 | C | U |

### 10.2 What each gate runs (scope; the Part A battery of section 6 applies to the scope)

| Gate | Packages | Entry condition | `@qa` runs | Real run after |
|---|---|---|---|---|
| **A** (money baseline) | P0, P1 | none (first) | existing financial suites unchanged and green (the "no behavior change" proof of P1); gate-contract tests; lock-order probe with `lock_timeout` (section 17); OpenGrep rule fixture; the Gate A mutations (Part A M1, M3, M13 and M-A1..M-A3 of section 21) | none |
| **B** (notices, skip/restore, widget) | P2, P3, P4 | Gate A green and frozen | Part A FT-71/72/73 tests, M1 up/down (section 16), limiter, i18n of the notice keys, widget on native OBS | **Run A** (RT-A1..A7) |
| **C** (policy, groups, money, live) | P5, P5b, P6, P6b, P7 | Gate B green; P7 validated on a frozen P5-P6b base (design 14) | everything of sections 11-22 plus Part A FT-74..FT-77; the full battery 3x | **Run B** (money) then **run C** (live session), owner streaming |

Each gate ends with: lint, typecheck (all four), `validate:localization`, `validate:version`, `validate:port-denylist`, `review:static` (exit code reported), full `npm test` 3x, PostgreSQL files 3x each, log/audit scan for ids, session-URL check. A red gate blocks the next package: no code of P(n+1) starts on a red gate (the same rule as "resolve blockers first").

### 10.3 Verdict wording

PASS / CONCERNS / FAIL / WAIVED per gate, with the tree fingerprint validated (AGENTS.md "Fila de gates"). Never PASS with a claim from a class that was not run. `PENDING (owner)` and `PENDING (observation window)` are legal outcomes only for `RT` items.

### 10.4 Recommendation on merging B and C

Keep **three gates**. Reasons: P7 must be validated on a frozen base (the cap and the policy read `capWindowStart`, `refunded_at` and the M2a columns); a defect in P7 should not hold up the notices of P2-P4 that the streamer can already use; run A needs B alone. If the Orion merges B and C, every check of both gates still runs, run A and run B are not merged, and the order of the real runs stays A, B, C. Cost of three gates: three batteries (3x PostgreSQL files), accepted for money code. **HYPOTHESIS:** a contended machine makes the PostgreSQL battery slow; timing is never asserted, only budgeted.

## 11. Matrix: AC 34-41 -> test case -> class -> package -> gate

"Red today": the object does not exist. `Who`: D writes and runs during development, Q re-runs independently at the gate.

### AC 34 — policy of five settings (P1, P5b, P7; gates A, C)

| ID | Class | Test | Pkg | Gate | Red today |
|---|---|---|---|---|---|
| U34-01 | U | Truth table of `resolveSettlementAction` (section 12; table-driven, counts once; every row named in the report) | P1 | A | Function missing |
| U34-02 | U | Property check over the whole (finite) domain: result is always in `{refund, fulfill, wait, rule}`; if any applicable setting is `wait` or the settings disagree then `wait`; `refund`/`fulfill` only when every applicable setting says so; the cap never produces `fulfill`; non-members and other events give `rule` | P1 | A | Missing |
| U34-03 | U | The constant provider of P1 (`legacy` S1, `wait` for the rest) leaves every existing financial test green and changes no behavior | P1 | A | n/a |
| PG34-01 | PG | M3 up on seeded data: defaults, `relfilenode` unchanged, `atthasmissing` true, every existing queue reads `legacy`, pre-existing columns checksum equal | P5b | C | Columns absent |
| PG34-02 | PG | `CHECK`s refuse: unknown value of each of S1..S4; cap 0 and 21 (accept `NULL`, 1, 20); window 0 and 73 (accept 1, 72, default 12); each refusal is its own assertion | P5b | C | Absent |
| PG34-03 | PG | A queue inserted after M3 reads `legacy`; after the M3b migration it reads `wait`; clone and restart write the then-current default, never copy `legacy` (DB-3) | P5b, P7 | C | Absent |
| PG34-04 | PG | `rollback.sql` of M3: guard refuses after simulated use (a `refunded_at` row, each pending state, a `refund_on_end` queue) and passes before; after M3-down the checksum of pre-existing columns equals the original (section 16) | P5b | C | No file |
| PG34-05 | PG | Audit rows of the resolver carry setting id, source and `policyRev`, no user identifier (log/audit scan) | P7 | C | Missing |

### AC 35 — policy edit, `expectedPolicyRev`, one-way `legacy` (P5b, P7; gate C)

| ID | Class | Test | Pkg | Gate | Red today |
|---|---|---|---|---|---|
| API35-01 | API | Stale `expectedPolicyRev` -> `SETTLEMENT_POLICY_STALE`, 409, body carries the current rev; nothing written | P5b | C | Route missing |
| API35-02 | API | S1 other than `legacy` before P7 -> `SETTLEMENT_MODE_UNAVAILABLE`, reason `policy_not_active`; after leaving `legacy`, `legacy` -> reason `legacy_not_selectable`; `GET` returns `legacySelectable`; a body that keeps `legacy` on a `legacy` queue is accepted | P5b, P7 | C | Missing |
| API35-03 | API | Edit refused on `deleting` and archived queues (stable code) | P5b | C | Missing |
| API35-04 | API | Turning on `refund_on_end` with groups on a `legacy` queue converts S1 to `wait` in the same save, audited, and says so in the response | P7 | C | Missing |
| API35-05 | API | Audit `queue.settlement_policy_changed`: closed-set before/after values, origin, no user id, no label | P5b | C | Missing |
| PG35-01 | PG | Two concurrent edits (barrier on the queue lock): exactly one wins, the loser gets `SETTLEMENT_POLICY_STALE`; the rev increments in the **same** `UPDATE` as the values (DB review: no read-then-write); 50 rounds | P5b | C | Missing |
| PG35-02 | PG | An event running during an edit sees one whole rev (old or new), never a mix; the value is read inside the queue lock (`loadSettlementPolicy` called after the lock) | P7 | C | Missing |
| PG35-03 | PG | A policy change does not touch rows already `awaiting_choice`, `held_for_service` or `check_group` (row checksum equal) | P7 | C | Missing |
| PG35-04 | PG | A clear/delete confirmation snapshot taken at rev N is stale at confirm when the rev is N+1 | P7 | C | Missing |
| API35-06 | API | **Open point N-5:** S2..S5 changed before P7 either refused with `SETTLEMENT_MODE_UNAVAILABLE` or stored as inert and marked by `@ux`. Test both branches behind one flag until `@architect`/`@po` decide | P5b | C | n/a (decision pending) |

### AC 36 — "Decide for the N waiting", no preselection (P7; gate C)

| ID | Class | Test | Pkg | Gate | Red today |
|---|---|---|---|---|---|
| API36-01 | API/PG | Missing, empty or invalid `choice` is refused and **nothing is written** (row counts, outbox, audit unchanged); there is no default | P7 | C | Missing |
| PG36-01 | PG | Each application writes `settlement.choice_recorded` with source `streamer_bulk`; a streamer choice `refund` over the cap passes and counts (not blocked by the cap) | P7 | C | Missing |
| U36-01 | U/C | Static scan: no scheduler, timer or background job reads or decides `awaiting_choice`/`check_group` (O-7: no time limit) | P7 | C | n/a |
| K36-01 | K | On open no radio is checked and the confirm button is disabled until an explicit choice; the option matching the setting only carries the tag "Matches your setting" | P7 | C | Missing |
| E36-01 | E | Browser script (separate class from K36-01): open, confirm disabled, keyboard choice, confirm, count of applied vs skipped (stale) | P7 | C | Missing |

### AC 37 — `awaiting_choice`, cause, `settled_external` (P5 columns, P7 behavior; gate C)

| ID | Class | Test | Pkg | Gate | Red today |
|---|---|---|---|---|---|
| PG37-01 | PG | State `CHECK`s (DB-1 regression): `awaiting_choice` accepts `NULL` and `not_eligible` decisions and is refused with a non-`UNFULFILLED` remote; `held_for_service` refused without `eligible` | P5 | C | Absent |
| PG37-02 | PG | **DB-12 (strict form, G-B4 closed):** cause `CHECK` with six codes (v2.6, see PG37-09): each code accepted only with `awaiting_choice`; unknown code refused; any code with another state refused; `awaiting_choice` with `NULL` cause **refused** | P5 | C | Absent |
| PG37-03 | PG | Exit matrix: `awaiting_choice` -> `none`, -> `intent_recorded`, -> `settled_external` each fails unless the cause is cleared in the same statement | P7 | C | Absent |
| PG37-04 | PG | **DB-13:** `settled_external` without `settled_external_at` and `settled_external_at` on another state are both refused; changing `settled_external_at` once set is refused by the guard trigger | P5 | C | Absent |
| PG37-05 | PG | Absorbing: `intent_recorded` and `settled_external` cannot leave; a later local request answers `SETTLEMENT_ALREADY_DECIDED` with the remote outcome and writes nothing (counts unchanged) | P7 | C | Absent |
| PG37-06 | PG | Barrier race: external settlement (`FULFILLED` or `CANCELED` observed) x local choice, 50 rounds, both orders: zero or one financial task, never two; `settled_external` has no outbox row; no `40P01`/`40001` | P7 | C | Absent |
| TW37-01 | TW | Fake Twurple: remote `FULFILLED` and `CANCELED` while the row is `held_for_service`, `awaiting_choice` or `check_group` yield `settled_external` in the statement that writes `remote_status` | P7 | C | Absent |
| PG37-07 | PG | Deletion worker re-list with an `awaiting_choice` row never creates a cancel or fulfill (mutation M35); a `legacy` queue still cancels its residue; a non-`legacy` queue writes `awaiting_choice` (`legacy_residue`) | P7 | C | Absent |
| U37-01 | U | Cause precedence: cap read only when the action is already a refund; policy `wait` gives `policy_wait` and the cap is not read (spy on the cap port) | P7 | C | Absent |
| PG37-08 | PG | `settled_external` and `check_group` create no `chat.notice` row and no catalog key exists (negative key test, section 20) | P7 | C | Absent |
| MG-04 | PG | M2a alone then M2b: five constraints `convalidated`; M2-down removes columns, indexes, constraints, trigger and function (checksum equal); M2a-down works when M2b was never applied | P5 | C | No files |

### AC 38 — pending count, route, history (P5b count, P7 route; gate C)

| ID | Class | Test | Pkg | Gate | Red today |
|---|---|---|---|---|---|
| API38-01 | API | `GET /api/state`: `pendingDecisions {awaitingChoice, checkGroup, total}` per queue; `held_for_service` not counted; a missing field is *unknown* (client contract: shows nothing, never `0`) | P5b | C | Missing |
| API38-02 | API | Route shape: `items` (oldest first, <= 200, fields and `capDetail` only for `reentry_cap`), `history` (latest 20 `settled_external`, newest first, tie-break `redemption_id DESC`, DB-14); panel session only (no session -> 401, any other credential refused); serves archived and `deleting` queues; rows with `queue_id NULL` never appear | P7 | C | Missing |
| PG38-01 | PG | 201 pending rows -> `items` 200, `total` 201, `truncated` true (DB-16: `total` is a real count, not `items.length`); history of 25 rows returns 20 and, with 25 rows in the same millisecond, the order is deterministic | P7 | C | Missing |
| PG38-02 | PG | `GET /api/state` counts for N queues come from **one grouped query** (query counter does not grow with N; **HYPOTHESIS:** Prisma query events can be counted in the test, DB-15) | P5b | C | Missing |
| PG38-03 | PG | **EXPLAIN on a synthetic volume** (section 18): pending list, count, history | P7 | C | Missing |
| K38-01 | K | Badge on the queue card and the navigation: hidden text read as "N decisions waiting"; failed request shows nothing, never `0`; error `alert` + "Try again" | P5b, P7 | C | Missing |
| C38-01 | C | Response fields: no personal data beyond `displayName` as the queue screen shows it; log scan clean | P7 | C | Missing |

### AC 39 — re-entry cap per live (P5b, P6b, P7; gate C; run C)

| ID | Class | Test | Pkg | Gate | Red today |
|---|---|---|---|---|---|
| PG39-01 | PG | **Cap race** (section 13): automatic refund x streamer refund at the boundary, both orders, 50 rounds; never two automatic refunds over the budget; v2.6: eight cells (`after_n`/`at_n` x `counts_manual` true/false x two orders), section 25.4 | P7 | C | Missing |
| PG39-02 | PG | Cap `NULL` never blocks; two different people at the boundary do not block each other; window edges (start equal, 1 ms before, fallback hours); set-based batch (`user_id = ANY`) equals the per-row result | P7 | C | Missing |
| PG39-03 | PG | `refunded_at` is written by the same statement as the `redemption.cancel` intent, only for end-of-service, policy `refund` and streamer `refund`, with `refund_origin` written in the same statement (PG39-10); a refusal cancel does not set either column | P7 | C | Missing |
| PG39-04 | PG | A refund whose task ends `failed` or `resolved_manual` (even with `remoteConfirmed:false`) still counts (DB-5); no budget returned | P7 | C | Missing |
| PG39-05 | PG | The financial worker writes nothing to `redemptions` for the cap: a **test-only statement trigger** counts statements on `redemptions` during a worker run (section 14 gives why not `pg_stat_*` alone) | P7 | C | Missing |
| PG39-06 | PG | Over the cap: the redemption goes to `awaiting_choice` (`reentry_cap`) and **never** to a fulfill; a streamer panel refund over the cap succeeds and counts | P7 | C | Missing |
| PG39-07 | PG | Fallback with fake clock: `none_known`, `revoked`, `stale` (open > 48 h, **HYPOTHESIS** value) each use the hours window and record the reason; the cap never becomes unlimited; audit `settlement.reentry_cap_hit` carries `windowKind`, no ids | P7 | C | Missing |
| PG39-08 | PG | A refund made while no live runs counts against the **last** session (Q-3); a refund inside a merge gap counts; a new live outside the merge window gives a fresh budget | P6b, P7 | C | Missing |
| PG39-09 | PG | `refunded_at` nulling job (72 h): horizon `LEAST(now - 72 h, last session start)`; nothing inside the last session is nulled; batch with `SKIP LOCKED` while another transaction holds a row; the `offline` path never calls it (DE 9.4 item 3) | P7 | C | Missing |
| U39-01 | U | The `capWindowStart` port is a constant `fallback` until P6b (P1 shape) and returns `{kind, start, reason}` | P1, P6b | A, C | Missing |
| RT-C7 | RT | Cap in the real channel (section 22) | P8 | verdict by class | n/a |

**Discrepancy to the story (for `@po`, not blocking):** AC 39 evidence says "two concurrent refunds at the limit: one passes, one waits". With the unique `entries_active_user_per_queue` a person cannot have two active entries in one queue, so two *automatic* refunds of the same person cannot race. The real race is automatic x manual (DE 9.4 item 2), which PG39-01 tests. The plan keeps the AC sentence as satisfied by PG39-01 plus the two-person case of PG39-02, and asks `@po` to reword the evidence line.

### AC 40 — live session (P6b; gate C; run C)

| ID | Class | Test | Pkg | Gate | Red today |
|---|---|---|---|---|---|
| U40-01 | U | Pure reducer `applyLiveEvent`: duplicate `online`; duplicate `offline`; `offline` before `online` (unknown id: no write, one reconcile); `offline` of the old id after the `online` of the new id; two `online` of different ids; type `rerun` (and the other non-`live` types); merge boundary equal, +1 s, -1 s (inclusive); late `online` of an older stream (ignored and logged, no stored `stream_session_id` changes); `online` while another row is open (old row closed first) | P6b | C | Missing |
| U40-02 | U/C | Static: no module of the live code imports the queue repository (LIVE-1) | P6b | C | n/a |
| U40-03 | U | Runtime wiring with the injectable `listenerFactory`: callbacks guarded by `broadcasterId`, not gated by `redemptionsEnabled`, errors isolated by `dispatch`; fake disconnect then ready triggers `reconcileLiveSession('reconnect')` **even when the channel is not eligible** | P6b | C | Missing |
| U40-04 | U | Revocation of `stream.online`/`stream.offline` takes the early branch: sets the "live events unavailable" flag, publishes the new closed `degraded` code, does **not** set `reconnect_required` and does not touch chat or reward status; the flag clears after a new subscription and one good reconciliation | P6b | C | Missing |
| TW40-01 | TW | `getCurrentStream`: live, `null`, 401, 429, 5xx, timeout (`unknown`, never closes) | P6b | C | Missing |
| TW40-02 | TW | One `null` right after `online` does not close; two consecutive negatives separated by the confirmation delay (injected, 30 s proposed) close; an error between them resets the count | P6b | C | Missing |
| PG40-01 | PG | Composite key: two connections deliver the same `online` (barrier): one row, one session, no error | P6b | C | Missing |
| PG40-02 | PG | Two **different** `online` ids at once: exactly one open row; the loser waits then closes/merges; `23505` never unhandled; close-then-insert order (DB-7) | P6b | C | Missing |
| PG40-03 | PG | `online` x `offline` of one id at once, both orders: closed, `ended_at >= started_at`; `offline` of an unknown id writes nothing; merge cases (drop and return inside and outside the window; a gap longer than the window opens a new session; a still-open row with another id is closed `reconciled`) | P6b | C | Missing |
| PG40-04 | PG | **LIVE-1 mutation test** (section 14) | P6b | C | Missing |
| PG40-05 | PG | Catalog: no foreign key, trigger, rule or view on `stream_sessions`; CHECKs refuse id length 0 and 65, `ended_at < started_at`, unknown `source` | P6b | C | Missing |
| PG40-06 | PG | Locks: the channel lock is `pg_advisory_xact_lock(class, hashtext(id))` (two-integer); `pg_locks` shows a distinct key space from `lockQueue` and from the account lock `1868787013`; the class constant differs from `1868787013`; a held channel lock never blocks `lockQueue` | P6b | C | Missing |
| PG40-07 | PG | Retention: whole sessions with last `ended_at` older than 90 days purged (**HYPOTHESIS** value), never part of a session, never the latest, never one with an open row | P6b | C | Missing |
| PG40-08 | PG | `live_session_policy` row: absent means 10; range 1-60 enforced in code (and by the optional `CASE` `CHECK` if adopted); a change applies only to events received after it | P6b | C | Missing |
| PG40-09 | PG | M4 up/down with existing rows in all other tables untouched (checksums); M4-down leaves the cap on the fallback | P6b | C | Missing |
| SV-01 | SV | Worker boot with the two new subscriptions in the fake adapter; `GET /api/state` returns `liveSession {state, startedAt, endedAt, source, capWindow, fallbackReason}`; absent before P6b | P6b | C | Missing |
| RT-C1..C8 | RT | Run C (section 22) | P8 | verdict by class | n/a |

### AC 41 — `concluir` by role (P7; gate C)

Tests in section 15 (U41-01..U41-08).

### Amended ACs 3, 4, 5, 17, 27, 30 (2026-11-15)

- AC 3 (refusal): Part A U71-04/05, PG71-01, RT-A3 stand; add **C-05** (static): refusal-reason keys and group-refund keys stay disjoint (extends C-02).
- AC 4 (limiter): a new notice kind for `waiting_decision` must pass the same limiter (Part A U71-06..10); `settled_external`, `check_group`, live start/end and the cap hit create **no** message (negative tests, section 20).
- AC 17: Part A U76-02/04/05, TW76-03, RT-B1/B2 stand with the S2/S3 rows of section 12 added.
- AC 27: Part A RT-B9/B12 stand; the cap (AC 39) is the only limit the product applies and it only makes a refund wait: PG39-06. (v2.6: the cap is configurable per queue, and "maximum N refunds per person per live" holds only for `after_n`; C39-01 and section 25.)
- AC 30: Part A U74-04 stands (API refuses `refund_on_end` before P7); P7 lifts the refusal and the S1 refusal in the same release: **API30-01** asserts that both refusals disappear together and not earlier.

## 12. Truth table of the policy S1..S5 (`U34-01`)

Domain: a queue in `refund_on_end` with at least one group enabled, reward created by the product. `rule` = today's rule through the gate (no policy). "Switch" = the matching refund switch of the queue. Rows are the contract; `@dev` may not shrink them, `@qa` extends them if the code adds an event.

**Source of the rows:** design 3.4 and 3.10. **Ambiguity closed (G-B2, design 3.14 B, v2.5):** the member column of 3.4 wins; S1 governs non-members only. Rows 7, 8 and 8b below are confirmed and are no longer HYPOTHESIS.

### 12.1 S1 — an entry closes with its refund switch **off** (no-show panel/timer, removal while called, `sair` while called)

| # | Person | Switch | S1 | S5 cap state | Expected `action` / state |
|---|---|---|---|---|---|
| 1 | non-member | on | any | any | `rule` (switch refunds; S1 not consulted) |
| 2 | non-member | off | `legacy` | any | `rule`: nothing requested; legacy residue possible (deletion re-list may refund, C8) |
| 3 | non-member | off | `wait` | any | `wait` -> `awaiting_choice`, cause `policy_wait`, cap not read |
| 4 | non-member | off | `fulfill` | any | `fulfill`; cap not read |
| 5 | non-member | off | `refund` | below cap or `NULL` | `refund` (`redemption.cancel`), `refunded_at` set at the intent |
| 6 | non-member | off | `refund` | at/over cap | `wait` -> `awaiting_choice`, cause `reentry_cap` (never `fulfill`) |
| 7 | member, panel no-show | any | any | any | `Ask`: `SETTLEMENT_CHOICE_REQUIRED` (not a policy; neither S1 nor the switch is read; confirmed) |
| 8 | member, timer / `sair` / moderator `remover` | any | any | any | `awaiting_choice`, cause `cannot_ask`, no money (confirmed) |
| 8b | member with decision `unknown`, any closing event | any | any | any | `check_group` (confirmed, design 3.14 B) |

### 12.2 S2 — direct conclusion `called -> completed` (panel, or streamer chat)

| # | Person | S2 | Cap | Expected |
|---|---|---|---|---|
| 9 | non-member | any | any | `rule`: fulfill (today, C2); S2 not consulted |
| 10 | member | `wait` | any | `awaiting_choice`, `policy_wait` |
| 11 | member | `refund` | below/`NULL` | `refund` (counts as the end of service, cause `group_refund_on_end`) |
| 12 | member | `refund` | at/over | `awaiting_choice`, `reentry_cap` |
| 13 | member | `fulfill` | any | `fulfill`; cap not read |
| 14 | member, `check_group` | any | any | stays `check_group` (AC 21) |

### 12.3 S2 x S3 — moderator `concluir` by chat on a member

S3 has no `fulfill`. The result for a moderator's direct conclusion applies **both** settings; for a moderator `concluir` on an `in_progress` held member only S3 applies (row 148 of 3.4).

| # | Event | S2 | S3 | Expected |
|---|---|---|---|---|
| 15 | direct `called -> completed` | `wait` | `wait` | `wait` |
| 16 | direct | `wait` | `refund` | `wait` (disagree) |
| 17 | direct | `refund` | `wait` | `wait` (disagree) |
| 18 | direct | `refund` | `refund` | `refund` (cap applies) |
| 19 | direct | `fulfill` | `wait` | `wait` (disagree) |
| 20 | direct | `fulfill` | `refund` | `wait` (disagree: never the more generous) |
| 21 | `in_progress -> completed`, held member | n/a | `wait` | `awaiting_choice`, `policy_wait` (S3 replaces the end-of-service refund for a moderator) |
| 22 | same | n/a | `refund` | `refund` (cap applies) |
| 23 | streamer's own chat `concluir` | any | n/a | behaves as the panel (Q-1); direct conclusion follows S2, held member follows the end-of-service refund |

### 12.4 S4 — chat `limpar`

| # | Person | S4 | Expected |
|---|---|---|---|
| 24 | non-member | any | `rule`: refund (today) |
| 25 | member | `wait` | `awaiting_choice`, `chat_clear`, counts in the reply |
| 26 | member | `refund` | `refund` (cap applies; over cap -> `reentry_cap`) |
| 27 | member | `fulfill` | `fulfill` |
| 28 | panel clear | any | not S4: batch choice of the dialog (AC 26) |

### 12.5 S5 — the cap (only on an action that is already `refund`)

| # | Count in window | Cap | Expected |
|---|---|---|---|
| 29 | any | `NULL` | refund passes, never blocked |
| 30 | cap - 1 | N | passes (this refund is the N-th) |
| 31 | cap | N | `awaiting_choice` (`reentry_cap`) with `after_n` (`count >= budget`; equality declared by AC 39 and the owner decision, no longer HYPOTHESIS); with `at_n` the budget is N-1, see section 25.1 |
| 32 | any | N, action `fulfill`/`wait` | cap not read |
| 33 | any | N, streamer panel choice `refund` | never blocked, and counts |
| 34 | any | N, refusal cancel (paused/closed/duplicate) | not counted, not blocked |
| 35 | any | N, `failed`/`resolved_manual` earlier refund | still counts |

### 12.6 Everything else

Skip, restore, reorder, arrival, refusal on import, manual entries, queues in `fulfill_on_start`, queues with no group, rewards not created by the product: `rule`, no policy. A panel choice, a restore or a skip never creates `awaiting_choice`. Each row asserts also the audit fields (`source`, setting id, `policyRev`) and the **absence** of any user identifier.

## 13. Race of the re-entry cap ceiling (`PG39-01`, file `ops31-cap-postgres.test.js`)

**Invariant:** automatic refunds of one person in one queue inside the window never exceed the cap, in any interleaving; a streamer choice is never blocked.

| Race | Fixture | Both orders must be observed | Invariant read back |
|---|---|---|---|
| R-cap-1 automatic x manual | cap 1; person U has an old `awaiting_choice` entry E0 and a held entry E1; "end of service of E1" x "streamer refunds E0" | yes | Either E1 refunds and E0's streamer choice also goes (never blocked), or the choice lands first and E1 becomes `awaiting_choice` (`reentry_cap`); never two automatic refunds |
| R-cap-2 two people | cap 1; U and V each at the boundary | n/a | neither blocks the other; each exactly one automatic refund |
| R-cap-3 policy edit x refund | cap raised/lowered by `PUT` while an automatic refund runs | yes | refund sees one whole rev (old or new); the loser of the lock waits; counts consistent |
| R-cap-4 cap `NULL` | no cap | n/a | no row ever waits for the cap |
| R-cap-5 set-based batch | batch confirm with `user_id = ANY` over several members of one person's multiple queues | n/a | equals the per-row result |

(v2.6: the full eight-cell matrix, with `counts_manual` true and false and both holds, is section 25.4; R-cap-1 is the `after_n` x `true` pair.) Mechanics: Part A section 4.2 (barrier proven by `pg_stat_activity` joined with `pg_blocking_pids`, bounded loop, a round where B was never seen waiting is a failed round), 50 rounds per race, fresh ids per round, run 3x. **Mutations:** M38 (cap read outside the lock), M37 (counted at confirmation), M39 (over cap becomes a fulfill), M40 (a failed refund returns budget). No `40P01`/`40001`/500 on the loser.

## 14. LIVE-1 mutation test (`PG40-04`, file `ops31-live-session-postgres.test.js`)

**Claim to disprove:** the end or start of a live never changes queues, entries or redemptions (owner invariant 2026-11-15).

1. **Seed** a disposable database through the real migrations: queues (active, archived, `deleting`, in each settlement mode), `entries` in every status (**the table is `entries`, not `queue_entries`**, DB-7), `redemptions` in every settlement state and remote status, financial `outbox` rows in every status, `audit_logs`, `settings`. Jobs of nulling and purge are **off**.
2. **Snapshot before**, for `entries`, `redemptions`, `queues`, the financial outbox and `audit_logs`: row count and `md5` of the ordered `row_to_json`.
3. **Counters.** Install, in the disposable database only and **not** on `stream_sessions`, `AFTER INSERT OR UPDATE OR DELETE ... FOR EACH STATEMENT` triggers that increment a counter table. Reason: a checksum misses a no-op `UPDATE`, and `pg_stat_force_next_flush()` timing in PostgreSQL 18 is a **HYPOTHESIS**; the statement triggers fire for a zero-row statement as well, so they are strictly stricter. `n_tup_ins/upd/del` after `pg_stat_force_next_flush()` is read as a **secondary** witness and is reported as such, never as the only one. A positive control writes one row to each table and must move the counters (else the harness is broken and the test fails).
4. **Drive** the live code (the real functions, not SQL): `online`, duplicate `online`, `offline`, an `offline` that arrives after a new `online`, a reconciliation close (two negatives), a new `online` inside and outside the merge window, a late `online` of an older stream, a `rerun`, a revocation.
5. **Assert** after each step and at the end: counts, checksums and counters of the five tables are identical to the snapshot; `stream_sessions` changed as the rules say; no audit row; no outbox row; the log events contain no title, login or viewer id.
6. **Static twin** `U40-02`: no import of the queue repository from the live modules.
7. **Mutation controls** (must fail the test, section 21): M43 makes the `offline` handler update `queues`; M43b makes the reconciliation close touch `entries`. If the test passes with a deliberate violation, it is rejected.

Plus the catalog assertions `PG40-05` (no FK/trigger/rule/view on `stream_sessions`) **before** the test triggers are installed.

## 15. `concluir` by role (`U41-01..08`, `chat-command-handler` tests)

The handler reads `authorized.role` (`chat-handler.mjs:356`, `:369`) and always calls `reply(...)` after `transitionEntry` (`:224-228`). Cases (table-driven per row, each row named):

| ID | Actor | Entry | Settings | Expected transition / reply |
|---|---|---|---|---|
| U41-01 | streamer | held member `in_progress` | any | end-of-service refund, exactly as the panel (Q-1) |
| U41-02 | moderator | member, `called` (direct) | S2 `wait`, S3 `wait` | `awaiting_choice`; reply `chat.queue.service_completed` (neutral); never `complete_pending`, never a points message |
| U41-03 | moderator | member, `called` | S2 `refund`, S3 `refund` | refund; reply neutral |
| U41-04 | moderator | member, `called` | S2 `fulfill`, S3 `refund` | disagree -> `wait`; neutral reply |
| U41-05 | moderator | held member `in_progress` | S3 `wait` | `awaiting_choice`, `policy_wait`; `service_completed` |
| U41-06 | streamer | member, `called` (direct) | S2 `fulfill` | follows S2 (panel-equivalent) |
| U41-07 | moderator | non-member | any | today's rule (fulfill exists); `financialDecision` as today, `complete_pending` only for `request_fulfill` |
| U41-08 | any chat actor | any | any | a choice (`refund`/`no_refund`) is never accepted from chat; the command answers the generic "use the panel" family or is unknown |
| C41-01 | static | catalog | n/a | the discarded key `chat.queue.points_waiting` does not exist in any language |

Also `financialDecision` returned by P7 for S3 is not `request_fulfill` (contract on the return value). Streamer vs moderator is distinguished only by `authorized.role`; a test sets the role without changing the user id.

## 16. Migrations, `rollback.sql` and the order of reversal (`ops31-migrations-postgres.test.js`, `MG-01..MG-12`)

Applies to Gates B (M1) and C (M2a, M2b, M3, M3a, M4, M3b). Always an isolated PostgreSQL 18 instance with real migrations; never the dev volume.

| ID | Test |
|---|---|
| MG-01 | Seed the current head (13 migrations); record per table row count and the `md5` of the ordered `row_to_json` of the pre-existing columns |
| MG-02 | Forward, one migration at a time, in package order `M1, M2a, M2b, M3, [M3a], M4, M3b`: after each, pre-existing checksum unchanged, `pg_constraint.convalidated` true, defaults as designed, `prisma migrate diff` (migrations -> datamodel) empty |
| MG-03 | No rewrite: `pg_class.relfilenode` of `queues`, `redemptions`, `outbox` identical around M1/M2/M3; `atthasmissing` true for constant-default columns |
| MG-04 | M2a alone then M2b; M2a-down with M2b not applied; cause/`settled_external_at`/state `CHECK`s (see PG37-01..04) |
| MG-05 | Isolation matrix: M1, M4 alone; M2 alone; M3 without M2; M3 after M2 |
| MG-06 | Each `CHECK` refuses its invalid row (closed sets, ranges, decision shape, `held_for_service` needs `eligible`, `awaiting_choice` accepts `NULL`/`not_eligible`, `settled_external` needs `expected_status IS NULL` and terminal remote, `ended_at >= started_at`, `refunded_at` requires `CANCELED` if M3a exists) |
| MG-07 | Guard trigger: `intent_recorded` and `settled_external` absorbing; conclusive decision immutable; a `refunded_at`-only update does not fire it; `settled_external_at` immutable once set |
| MG-08 | **Down in strict reverse order** `M3b, M4, M3a, M3, M2, M1` on the seeded database after simulated use: each guard refuses after use (refunded rows, pending states, non-empty own list, a `refund_on_end` queue) and passes before; after each down the checksum of pre-existing columns equals the original; M2b-down and M3a-down are no-ops; M3b-down runs first after P7 |
| MG-09 | M1-down: maps `expired` to `cancelled` with `last_error = 'notice_expired_rolled_back'` and cancels pending/retry/processing `chat.notice`; no `expired` row and no pending notice remain; an "old worker" fixture (status `CHECK` without `expired`) meets no unknown operation type |
| MG-10 | M4-down drops the table; the cap then uses the fallback hours (behavioral assert through `capWindowStart`); the inert `settings` key may stay |
| MG-11 | **Up-down-up:** each migration up, `rollback.sql`, up again: schema equal to the first up (`pg_dump --schema-only` diff empty); `_prisma_migrations` linear after `prisma migrate resolve --rolled-back` (**HYPOTHESIS** on the exact command flow for Prisma 6.19.3; `@data-engineer` confirms, `@qa` runs it on the disposable instance and records the real output) |
| MG-12 | Lock behavior: with `log_lock_waits` and a concurrent writer, record the lock levels and the time each migration holds them on `queues`, `redemptions`, `outbox`; compare one-file M2 with M2a/M2b; record the row counts used; every migration runs with `lock_timeout`/`statement_timeout` and a concurrent writer does not deadlock it. **HYPOTHESIS:** Prisma runs a file as one transaction, so `SET LOCAL` works (N-3); if not, plain `SET` then `RESET` |

`rollback.sql` files are executed with `prisma db execute --file` as the design says; the plan never edits a migration folder (that is `@dev`/`@data-engineer` work).

## 17. DB-12..DB-17 checks, `lock_timeout` (TS-20) and the money baseline (Gate A)

### 17.1 DB-12..DB-17

| Item | Test | Package |
|---|---|---|
| DB-12 (cause only in `awaiting_choice`, and required there) | PG37-02, PG37-03, PG37-09: strict biconditional from M2a with six codes; a row in `awaiting_choice` never has a `NULL` cause; the parameterized branch of the earlier plan is dropped (G-B4 closed) | P5, P7 |
| DB-13 (`settled_external_at` biconditional, immutable) | PG37-04 | P5 |
| DB-14 (history tie-break `redemption_id DESC`) | 25 rows in one millisecond: `ORDER BY` deterministic over 20 runs; the index definition includes the tie-break (catalog read) | P5, P7 |
| DB-15 (pending index three vs two states; grouped count) | PG38-02, PG38-03; if the plan scans and discards `held_for_service` rows, report to `@data-engineer` for the second partial index (CONCERNS, not FAIL) | P7 |
| DB-16 (`total` vs `items`, `truncated`) | PG38-01 | P7 |
| DB-17 (payload `settlementCause` vs column) | Static/contract: a financial outbox payload carrying `settlementCause` uses only the same closed list of six or the payload copy is gone; the audit row carries the cause | P7 |
| DB-18 (index builds and the lock on `redemptions`) | MG-16 (decided in design v2.7 3.16 A: indexes in M2b/M3a; G-B12 closed) | P5 |
| DB-19 (plain `CHECK`s on `queues`) | MG-17 a | P5, P5b |
| DB-20 (six states in the state `CHECK`) | MG-17 b, PG37-09 | P5 |
| DB-21 (separate guard trigger for `refunded_at` and `refund_origin`; no `INCLUDE`) | PG39-12, MG-15; `EXPLAIN` of the count with and without the origin filter (DE 9.9 item 6, section 18) | P5b, P7 |

### 17.2 `lock_timeout` and `statement_timeout` (TS-20, DB-11; P0, Gate A)

The Part A note stands: no test mentions the TS-20 probe, so `@dev` locates or writes it (`settlement-deadlock-postgres.test.js`, PG76-29).

| ID | Test |
|---|---|
| TS20-01 | Three transactions (`retryOutboxManually`, `requestQueueDeletion`, one settlement transaction) in all 6 orders behind barriers: each ends in commit, or in `40P01`/`55P03` mapped to a generic retryable error with `referenceId`; nothing hangs; `retryOutboxManually` fixed (W3-5) |
| TS20-02 | **`lock_timeout` is real:** with a test-overridable small value (for example 200 ms), a helper session holds the queue lock until the test releases it; the repository transaction fails with `55P03`, mapped to the generic localized text with `referenceId`, no stack or SQL in the body, and **no partial write** (counts equal). The assertion is on the outcome class; the timeout value is never asserted as a duration |
| TS20-03 | `statement_timeout` (`57014`) mapped the same way, with a deliberately long statement (`pg_sleep` inside the **test** helper only) |
| TS20-04 | The timeouts are set per transaction (`SET LOCAL`) and do not leak to the pooled connection used next (read `SHOW lock_timeout` on the next checkout) |
| TS20-05 | No `40P01`/`40001`/500 appears in any race of this plan (reuse as a postcondition of every race test) |

### 17.3 Gate A baseline (P0, P1)

Existing financial suites unchanged and green after P1; gate-contract tests (each of the seven callers with a held redemption returns `held_blocked`/skip; `ON CONFLICT` path returns `already_same`; contradictory returns the code); the OpenGrep rule fires on a fixture with a hand-built `financial:` key and `npm run review:static` is reported with its exit code; clear and delete with an `in_progress` entry succeed (W3-1 regression); `conflict`/`failed` audited manual exit records `remoteConfirmed:false`, shows the stored remote status for `conflict`, needs a person, and deletion resumes after it; 409 mapping table (one test per code, no free reason can force a cancel, G-14).

## 18. `EXPLAIN` on a synthetic volume (`PG38-03`, `ops31-pending-decisions-postgres.test.js`)

1. Disposable PostgreSQL 18, real migrations. `generate_series` fills `redemptions` with **1,000,000** rows with a realistic distribution (>= 99.9% state `none`; a few hundred pending and `settled_external`; several queues; `refunded_at` on a small share), then `ANALYZE`. **HYPOTHESIS:** a 1M-row load fits the budget of the disposable container; if it does not, record the row count actually used.
2. `EXPLAIN (ANALYZE, BUFFERS)` of: the pending list, the grouped pending count, the history, the cap count (`queue_id, user_id, refunded_at >= start`) **with and without the `refund_origin = 'automatic'` filter** (DE 9.9 item 6; no `INCLUDE` column, DB-21).
3. **Evidence, not a timing assertion.** The plan text is saved under `.local/qa-ops31/` and cited in the story. Assertion: the plan names the partial index of the object (pending, `settled_external_at`, `refunded_at`) and does not do a sequential scan of `redemptions`. **HYPOTHESIS:** the planner is cost-based, so the assertion can flip with statistics; if it does, `@qa` records CONCERNS for `@data-engineer` instead of forcing a FAIL, and never loosens the index to make it pass.
4. Small tables are not evidence for this (the planner chooses a sequential scan); the story evidence of AC 38 is this test, not a unit test.

## 19. Batch dialogs and pending list in the browser (class `E`, separate from `K`)

Scripts at 320, 390 and 768 px (and 200% zoom at 320), each 3x: policy block and save feedback (`E34-01`), stale edit `alert` keeping unsaved edits (`E35-01`), conversion dialog on enabling `refund_on_end` (`E35-02`), "Decide for the N waiting" (`E36-01`), pending list with causes and cap lines (`E38-01`), history `<details>` closed by default (`E38-02`), the three marks as text (`E37-01`), Operations "Record manual resolution" for `unknown`/`conflict`/`failed` and the conflict line without a read time (`E37-02`), live detection state lines and fallback reasons (`E40-01`), LIV-1 in the UI: after a fake `stream.offline` no card, entry or count changes (`E40-02`). Visual validation, static UX review and assistive technology are reported as separate classes (project rule).

## 20. i18n (`validate:localization`, es/pt-BR without native review)

| ID | Class | Test |
|---|---|---|
| L34-01 | L | `npm run validate:localization` with every new key (panel and chat), three languages, parity and plural forms |
| L34-02 | L | No key present in one language only; no empty value; interpolation placeholders identical across languages |
| C20-01 | C | Negative keys: no `chat.queue.points_waiting`; no chat key for `settled_external`, `check_group`, live start/end or the cap hit (UX checklist: "no chat message") |
| C20-02 | C | Wording contract by key: texts of "requested/pending" never contain "refunded/devuelto/devolvido" unless on the confirmation path (extends C-02); AC 33 |
| U20-03 | U | Every chat notice text with worst-case names stays <= 500 characters after interpolation and carries no id (reuses U71-12 on the new keys, `waiting_decision`) |
| C20-03 | C | `panel.pending.cause.*` has exactly the **six** causes of the closed list (v2.6, `batch_deferred` included) plus the `reentry_cap.*` variants (including `.loosened` and `.zero`); a new cause without a key fails |
| L34-03 | L | The channel language drives chat notices; the panel language drives panel text (no cross-use) |

**Declared limit (not claimed):** Spanish and Portuguese were written by the agent; **no native review**; Spanish plural `.many` not checked against the validator (`ux-plan-v2` section 7: **HYPOTHESIS**). The validator proves presence, parity and plural forms, not meaning or tone. Verdict wording: "validated for presence and parity; semantic quality of es and pt-BR not natively reviewed". The owner reads pt-BR; Spanish stays as declared.

## 21. Mandatory mutations of Part B (39: 28 + M56..M66 of v2.1; >= 20 required)

Same method as Part A section 4.6 (serial, copy under `.local/qa-ops31/backup/<id>/` with `sha256sum`, one-line change, run only the named tests, record the failure, restore, `cmp`). Only at the gate, never while `@dev` edits the same file.

| # | Mutation | Test that must fail |
|---|---|---|
| M28 | Resolver returns the more generous value on disagreement | U34-01, U34-02 |
| M29 | S1 `legacy` treated as `wait` (or `wait` as `legacy`) | U34-01, PG34-03 |
| M30 | Policy read before the queue lock | PG35-02 |
| M31 | Rev compare removed, or increment in a second statement | PG35-01 |
| M32 | "Decide for the N" defaults `choice` to `refund` | API36-01, K36-01 |
| M33 | Cause not cleared when the row leaves `awaiting_choice` | PG37-03 |
| M34 | Drop the `settlement_cause` `CHECK` | PG37-02 |
| M35 | Deletion worker cancels an `awaiting_choice` row | PG37-07 |
| M36 | `settled_external` creates a `chat.notice` | PG37-08, C20-01 |
| M37 | Cap counted at Twitch confirmation, not at the intent | PG39-03, PG39-04, PG39-01 |
| M38 | Cap read outside the queue lock | PG39-01 |
| M39 | Over the cap the refund becomes a fulfill | PG39-06, U34-02 |
| M40 | A failed refund returns budget | PG39-04 |
| M41 | The financial worker writes `refunded_at` | PG39-05 |
| M42 | A refusal cancel sets `refunded_at` | PG39-03 |
| M43 | `offline` handler updates `queues` (and M43b: reconciliation close touches `entries`) | PG40-04, U40-02 |
| M44 | Reconciliation closes on one `null` | TW40-02 |
| M45 | A late `online` of an older stream rewrites `stream_session_id` | U40-01, PG40-03 |
| M46 | Merge boundary exclusive (`<`) instead of inclusive | U40-01 |
| M47 | Channel lock uses the single-bigint key space of `lockQueue` | PG40-06 |
| M48 | Insert-then-close instead of close-then-insert | PG40-02 |
| M49 | Moderator `concluir` returns `complete_pending` | U41-02 |
| M50 | Pending route filters `lifecycleStatus = active` | API38-02 |
| M51 | `total = items.length` | PG38-01 |
| M52 | History `ORDER BY` without the tie-break | PG38-01, DB-14 |
| M53 | A missing `pendingDecisions` rendered as `0` | K38-01, API38-01 |
| M54 | M3 sets `DEFAULT 'wait'` before P7 | PG34-03 |
| M55 | Revocation of the stream subscription sets `reconnect_required` | U40-04 |
| M56 | `after_n` and `at_n` swapped (budget N-1 for `after_n`) | U39-02, PG39-01 |
| M57 | Comparison `<=` instead of `<` (equality at the cap) | U39-02 |
| M58 | `reentry_cap_counts_manual` ignored (manual refunds always count) | U39-02, PG39-14, PG39-01 |
| M59 | A streamer refund is held by the cap | PG39-06, U39-02 |
| M60 | `refund_origin` written in a second statement, or not written | PG39-10 |
| M61 | The origin `CHECK` dropped, or the guard trigger no longer freezes the columns | PG39-11, PG39-12 |
| M62 | `effectiveBudget` returns N for `at_n`, or the client recomputes it | U39-03, API35-13, K39-03, C39-01 |
| M63 | `PUT` coerces `"true"` or `1` to a boolean | API35-08 |
| M64 | M3-down drops the columns before the trigger, or its guard ignores a refund with origin | MG-15 |
| M65 | "Decide one by one" writes `policy_wait` or `chat_clear` instead of `batch_deferred` (or writes it for a non-member) | PG37-10, U37-02 |
| M66 | An equal-body `PUT` increments the revision | API35-10 |

Gate A additional (money baseline): **M-A1** remove `lock_timeout` from a repository transaction -> TS20-02; **M-A2** a caller bypasses the gate (hand-built `financial:` key) -> the OpenGrep fixture and gate contract; **M-A3** the deletion worker leaves `deleting` while a decision is pending -> PG37-07 and Part A PG76-21.

## 22. Real tests (P8): run A after Gate B, run B after Gate C, run C

Authorization and limits stand (Part A section 5): only the exclusive test channel; rewards created by the product only; counts and reason codes only, no id, token, header or chat body copied into evidence. **Run C needs the owner streaming**; the Orion cannot start a stream. Nothing in this section is claimed until observed.

**Run B additions (after Gate C):**

| ID | Script | Expected | Closes |
|---|---|---|---|
| RT-B14 | A held member redemption is finalized from the Twitch dashboard by the owner | `settled_external` in the panel ("settled on Twitch"), no outbox row, no chat message | AC 37 |
| RT-B15 | Pause the reward and redeem (W4-3) | Records whether a paused reward accepts redemptions (decides if "refused because closed" can happen outside a race) | W4-3 |
| RT-B16 | S1 `wait`, refund switch off: no-show of a non-member | `awaiting_choice`, nothing changes on Twitch (still `UNFULFILLED`), panel pending count; then a choice | AC 34, 36, 37 |
| RT-B17 | Y made moderator (reversible `/mod`) types `concluir` on X's member entry, S3 `wait` | Neutral reply, no points message, entry `awaiting_choice` (fallback: same account flipped between roles, declared) | AC 41 |
| RT-B18 | Broadcaster types `concluir` in chat on a held member | Behaves like the panel end of service | AC 41 |
| RT-B19 | Chat `limpar` with a member present, S4 `wait` | Reply with the pending counts; member `awaiting_choice` | AC 34 |

**Run C — live session (owner streaming; separate class `RT-live`):**

| ID | Script | Expected | Closes |
|---|---|---|---|
| RT-C1 | Owner starts a live on the test channel | Session opens (`liveSession` state `live`, source `event`); **delay from go-live to the panel recorded as measured** | AC 40 |
| RT-C2 | Owner stops the live | Session closes; snapshot of counts/checksums of queues, entries, redemptions, outbox taken before and after: **identical** (LIVE-1 in the real channel) | AC 40 |
| RT-C3 | Restart inside the merge window (default 10 min) | Same `stream_session_id` | AC 40 |
| RT-C4 | Set the window to 1 minute, restart after more than that | A new session (fresh cap budget) | AC 39, 40 |
| RT-C5 | Drop the network of the worker during the live and restore | Reconciliation on reconnect; **no false close** (two negatives); state `unknown` while unsure | AC 40 |
| RT-C6 | Read the real EventSub cost after the two new subscriptions | Cost and `max_total_cost` recorded as observed (design assumed 5 of 10: **HYPOTHESIS**) | AC 40 |
| RT-C7 | Cap 1 on a `refund_on_end` queue: X redeems, is refunded at the end, re-enters, second refund | Second goes to `awaiting_choice` (`reentry_cap`); the streamer refunds it (counts); a new live outside the window gives a fresh budget | AC 39 |
| RT-C8 | Optional, owner-gated: revoke the app's authorization on Twitch and reconnect | Fallback reason `revoked`; chat and reward status untouched; recovery after reconnect. **HYPOTHESIS:** the exact revocation path (disruptive; skipped if the owner declines) | AC 40 |

**Cannot be proven here (declared, never claimed):** Prime and the subscriber group (Part A 5.5); the types `rerun`/`premiere`/`playlist` on a real channel (unit only); real Twitch delay variance across several lives; screen reader (`NOT RUN`); expiry of `UNFULFILLED` (observation window).

## 23. Accessibility and the UX checklist (`ux-plan-v2` section 8)

Class `E`, at 320, 390 and 768 px and 200% zoom at 320: every item of the UX checklist becomes a script step with a result (`PASS`, `FAIL`, `NOT RUN`). Measured, not eyeballed: **contrast >= 4.5:1** computed from the rendered styles in the script (the project has no axe dependency, so none is added by `@qa`; **HYPOTHESIS:** `@dev` may already ship a contrast helper, `@qa` checks); **targets >= 44 px** from bounding boxes; **keyboard only** (tab order of the policy block follows visual order; dialogs trap and restore focus; no focus theft on refresh); **live regions:** the count of `[aria-live]`, `[role=status]`, `[role=alert]` mounted is unchanged by the new screens (one status and one alert stay mounted, E77-04) and the live-detection lines create none; marks are text, not color only; `aria-invalid` on number fields (S5 limit 1-20, hours 1-72, merge 1-60) with non-integers and out-of-range refused and a blank limit not accepted when "Limit" is chosen. **Screen reader (NVDA, VoiceOver, TalkBack): `NOT RUN`, risk accepted by the owner**, recorded verbatim; no claim of assistive-technology validation.

## 24. Verdict on this plan, gaps and risks

**Score of the plan: 9.3 / 10** (target >= 9.0; re-scored 2026-11-15 after section 25 and the closing of G-B12, G-B13, G-B15). It is a plan score: nothing was run, and every `HYPOTHESIS` above stays open until the corresponding test runs. Strengths: every AC 1-41 has a package, a gate and at least one class; the money and live invariants have mutation controls; the unit, PostgreSQL, service, browser and real classes are kept apart; the harness for LIVE-1 has a positive control and does not depend on `pg_stat` timing. Reasons it is not higher: one open point of section 25.11 (G-B14), the design points still open below (G-B8..G-B11), many unverified **HYPOTHESIS** items (Prisma flow, planner behavior, fake-adapter stack) and the real-run items that need the owner.

### 24.1 Gaps (to close before the named package)

| # | Gap | Owner | Before |
|---|---|---|---|
| G-B1 | **CLOSED** (design 3.14 A, AC 36): no preselection; the "preselects" text is withdrawn | `@architect` | done |
| G-B2 | **CLOSED** (design 3.14 B): S1 governs non-members only; rows 7, 8 and 8b of section 12 confirmed | `@architect` | done |
| G-B3 | **CLOSED** (AC 39 reworded): the evidence is automatic x manual, section 25.4 | `@po` | done |
| G-B4 | **CLOSED** (DE 9.9 item 1, AC 37): strict form, `awaiting_choice` requires a cause; PG37-02, PG37-09 | `@architect` / `@data-engineer` | done |
| G-B5 | **CLOSED** (design 3.14 D): S2..S5 and the two cap fields are refused before P7, atomically; API35-12 | `@architect` / `@ux` | done |
| G-B6 | **CLOSED** (owner, design 3.15, AC 39): configurable per queue, equality declared (`count < budget`); section 25.1 | `@po` | done |
| G-B7 | **CLOSED** (design 3.15 D): M3a always exists; MG-14 | `@data-engineer` | done |
| G-B8 | TS-20 probe not found in `tests/`; `lock_timeout` does not exist in the repository yet | `@dev` (P0) | P0 |
| G-B9 | `prisma migrate resolve --rolled-back` flow, SET LOCAL inside the Prisma file, the 5 s interactive-transaction timeout for the batch of 3.6 | `@data-engineer`, `@dev` | P5 / P7 |
| G-B10 | The `SV` class depends on the fake-adapter compose stack booting the worker with the new callbacks | `@dev` | P6b |
| G-B11 | The number of `GET /api/state` queries per poll is not measured today (DB-15) | `@dev` | P5b |

### 24.2 Risks of the plan

| # | Risk | Mitigation |
|---|---|---|
| R-B1 | P7 (FT-76 + FT-77 + policy + cap + chat) is one very large package validated at once | Gate C is last and runs on a frozen P5-P6b base; unit and PG tests of P7 are written Red first, per sub-area, by `@dev`; `@qa` refuses a partial P7 |
| R-B2 | Three PostgreSQL batteries (x3 files) are slow on a contended machine | Timing never asserted; budgeted in time; no limits raised |
| R-B3 | Statement triggers in the LIVE-1 harness could themselves write | They only increment a counter table that is excluded from the five snapshots; the positive control proves the harness |
| R-B4 | `EXPLAIN` plans are planner-dependent | Evidence, not assertion of timing; CONCERNS instead of FAIL; plan saved |
| R-B5 | Run C needs the owner streaming; the real EventSub delay is unknown | `PENDING (owner)`; recorded as measured; unit and PG evidence stands without it, but AC 40 and the live half of AC 39 stay open for the real class |
| R-B6 | Real points move in run B and C | Test channel only; Gate C green first; counts only in evidence |
| R-B7 | es/pt-BR texts have no native review | Declared (section 20); validator proves parity only |
| R-B8 | Edit conflicts: `queue-repository.mjs` is a hot file shared by P5b, P6, P6b, P7 | Serial writes (design 14); mutations run only when no `@dev` edits that file |
| R-B9 | Hypotheses of Prisma/PostgreSQL 18 behavior (transaction wrapping, `pg_stat` flush, `migrate resolve`) | Each has a test that records the real behavior; none is assumed |

**Depends on:** `@dev` (seams, Red/Green records, TS-20, timeouts, fake stack), `@data-engineer` (DDL regeneration N-4, constraint names, down flow), `@architect` (G-B1, G-B2, G-B4, G-B5), `@po` (G-B3, G-B6), `@ux-design-expert` (keys), owner (reconnect, two accounts or fallback, streaming for run C, acceptance of the declarations).

### 24.3 Totals (Part B)

| Class | Count | Note |
|---|---|---|
| U (unit) | 22 | `U34-01`, `U39-02` and `U41-01..08` are table-driven; each row is named in the report |
| TW (fake Twurple) | 3 | |
| L / C (localization, static contract) | 4 + 7 | includes `C-05`, `C38-01`, `C41-01`, `C20-01..03`, `L39-01`, `C39-01` |
| PG (isolated PostgreSQL 18, real migrations) | 48 | races: `PG35-01`, `PG37-06`, `PG39-01` (eight cells), `PG39-15`, `PG40-01..03` at 50 rounds x 3 runs |
| API (HTTP contract on the isolated instance) | 19 | includes `API30-01`, `API35-07..15` |
| MG (migration files) | 17 | `MG-01..17`, one test file |
| TS20 (lock_timeout and deadlock probe) | 5 | |
| SV (real services) | 1 | HYPOTHESIS: depends on the fake-adapter stack |
| K (component) | 7 | |
| E (browser scripts) | 12 | `E36-01`, `E39-01`, `E39-02` plus the nine of section 19; 3 widths, each 3x |
| RT (real channel) | 15 | `RT-B14..20` (7, `RT-B20` optional) and `RT-C1..C8` (8); outcomes PASS/FAIL/NOT RUN/PENDING |
| **Total** | **160** | plus 39 mutations (Part B: 28 + M56..M66), 3 Gate A mutations, 27 of Part A, the Part A totals (157 tests, 20 real items) and the existing regression suites (v2.1 added 36 tests) |

Counts come from the IDs written in this plan (a script counted the table rows; the aggregated `RT-C1..C8` row and the repeated `MG-04` and `RT-C7` rows count once). They will move when `@dev` splits a table-driven test; the IDs are the contract, not the number.

---

## 25. Part B v2.1 addendum (design v2.6, 2026-11-15): configurable cap, `refund_origin`, sixth cause

**Basis:** [architect-design-v2](architect-design-v2.md) 3.15 and 3.14 (v2.6), [story](story.md) AC 27, 35, 37, 39 (amended), [data-engineer-review](data-engineer-review.md) 9.9 (DB-18..DB-21 and its six test additions), [ux-plan-v2](ux-plan-v2.md) section 8 checklist (cap items). **Nature:** plan only; nothing was run; **HYPOTHESIS** marks anything unverified. Files are probable names: PostgreSQL cases go in `ops31-cap-postgres.test.js` and `ops31-migrations-postgres.test.js`. **Rule used everywhere below:** `budget = N` with `after_n`, `N - 1` with `at_n`; an automatic refund passes if and only if `count < budget`; `count` is read inside the queue lock before the decision (the refund being decided is not in it) over refunds of that person in the current window with `refunded_at` set and, when `reentry_cap_counts_manual` is false, `refund_origin = 'automatic'`; cap `NULL` never holds; a refund the streamer chooses is never held. Defaults: `after_n`, `true`.

### 25.1 Truth table of the cap (`U39-02`; table-driven, counts once, every row named in the report)

"Rows counted" = `refunded_at` rows of that person in the window, as automatic / streamer. "Held" = the redemption goes to `awaiting_choice`, cause `reentry_cap`, never a fulfill, no Twitch call. Every row also asserts the stored `refund_origin` of a passing refund (`automatic`), the audit fields (setting id, `policyRev`) and the absence of any user identifier.

| # | Hold | N | Counts manual | Rows counted (auto / streamer) | Count read | Budget | Expected |
|---|---|---|---|---|---|---|---|
| C1 | `after_n` | 3 | true | 0 / 0 | 0 | 3 | passes |
| C2 | `after_n` | 3 | true | 2 / 0 | 2 | 3 | passes (the 3rd) |
| C3 | `after_n` | 3 | true | 3 / 0 | 3 | 3 | held |
| C4 | `after_n` | 3 | true | 4 / 0 | 4 | 3 | held |
| C5 | `at_n` | 3 | true | 0 / 0 | 0 | 2 | passes |
| C6 | `at_n` | 3 | true | 1 / 0 | 1 | 2 | passes |
| C7 | `at_n` | 3 | true | 2 / 0 | 2 | 2 | held (the 3rd waits) |
| C8 | `at_n` | 3 | true | 3 / 0 | 3 | 2 | held |
| C9 | `after_n` | 1 | true | 0 / 0 | 0 | 1 | passes |
| C10 | `after_n` | 1 | true | 1 / 0 | 1 | 1 | held |
| C11 | `at_n` | 1 | true | 0 / 0 | 0 | 0 | held (every automatic refund waits) |
| C12 | `at_n` | 1 | true | 1 / 0 | 1 | 0 | held |
| C13 | `at_n` | 1 | false | 0 / 0 | 0 | 0 | held (budget 0 whatever the setting) |
| C14 | `after_n` | 20 | true | 19 / 0 | 19 | 20 | passes |
| C15 | `after_n` | 20 | true | 20 / 0 | 20 | 20 | held |
| C16 | `at_n` | 20 | true | 18 / 0 | 18 | 19 | passes (**derived row**: `@qa` extension of the stated rule) |
| C17 | `at_n` | 20 | true | 19 / 0 | 19 | 19 | held (derived row) |
| C18a..d | cap `NULL`, each of the four combinations of hold x counts manual | `NULL` | any | 0 / 0, 5 / 5, 20 / 20 | n/a | n/a | never held; the cap port is not even read (spy) |
| C19 | `after_n` | 3 | true | 0 / 5 | 5 | 3 | held |
| C20 | `after_n` | 3 | false | 0 / 5 | 0 | 3 | passes (five streamer rows, no automatic row) |
| C21 | `after_n` | 3 | true | 2 / 2 | 4 | 3 | held |
| C22 | `after_n` | 3 | false | 2 / 2 | 2 | 3 | passes |
| C23 | `after_n` | 3 | false | 3 / 0 | 3 | 3 | held (automatic rows always count) |
| C24 | `at_n` | 3 | true | 1 / 1 | 2 | 2 | held |
| C25 | `at_n` | 3 | false | 1 / 1 | 1 | 2 | passes |
| C26a..d | streamer panel choice `refund`, each of the four combinations | 1 and 3 | any | 0, budget - 1, budget, budget + 5 | any | any | **never held**, stored with origin `streamer`, counts only if the setting says so |
| C27 | any | 3 | any | refusal cancel (paused, closed, duplicate) | n/a | n/a | not counted, not held, **neither** `refunded_at` nor `refund_origin` written |
| C28 | any | 3 | any | an earlier refund that ended `failed` or `resolved_manual` | counted | n/a | still counts (DB-5), origin kept, no budget returned |
| C29 | `after_n` | 3 | `true` -> `false` | 0 / 5 | 5 -> 0 | 3 | before the flip an automatic refund is held; after it the **next** one passes; the row already in `awaiting_choice` is not moved (checksum equal) |
| C30 | `after_n` | 3 | `false` -> `true` | 0 / 5 | 0 -> 5 | 3 | the reverse: the next automatic refund is held; past refunds are re-evaluated with their stored origin |
| C31 | `after_n` -> `at_n` | 3 | true | 2 / 0 | 2 | 3 -> 2 | the next decision holds; nothing already pending moves |
| C32 | `at_n` -> `after_n` | 3 | true | 2 / 0 | 2 | 2 -> 3 | a row held before stays held (it keeps waiting for the streamer); the next automatic refund passes |
| C33 | `at_n`, N changed 3 -> 2 | 2 | true | 1 / 0 | 1 | 1 | held; reading `capDetail` for an older held row shows count and budget as of reading time |

C1..C33 (with the a..d expansions: 41 assertions) are one test, named by row. Equality is declared by the owner decision and AC 39 (`count < budget` passes), so the old **HYPOTHESIS** on row 31 of section 12.5 is closed; rows C16/C17 are the only derived ones.

**`U39-03` (unit)** — `effectiveBudget(cap, hold)`: `NULL` -> `null`; `after_n` N -> N; `at_n` N -> N - 1; `at_n` with N = 1 -> `0`; N = 20 `at_n` -> 19; never negative, never above 20; the same function feeds the decision, `GET` and `capDetail` (spy: one implementation, no second formula in the client).

### 25.2 `refund_origin`, the `CHECK` and the guard trigger `redemptions_refund_guard` (DB-21)

| ID | Class | Test | Pkg | Gate | Red today |
|---|---|---|---|---|---|
| PG39-10 | PG | `refund_origin` is written **in the same statement** as `refunded_at` (a test-only statement trigger records both columns of the one `UPDATE`; never two statements). Origin `automatic` for: end-of-service group refund, a refund produced by S1..S4 (including a moderator conclusion and a chat `limpar` that the policy turned into a refund). Origin `streamer` for: single panel decision, "Decide for the N waiting", the panel no-show dialog choice. A refusal cancel writes neither column. Table-driven by path, counts once | P7 | C | Columns absent |
| PG39-11 | PG | `redemptions_refund_origin_check` matrix (DE 9.9 item 2): both `NULL` accepted; both set accepted; a value outside `{automatic, streamer}` refused; origin without `refunded_at` refused; `refunded_at` without origin refused. Each refusal is its own assertion | P5b | C | Absent |
| PG39-12 | PG | **Guard trigger** (DE 9.9 item 3, DB-21): changing `refunded_at` after it is set is refused (`23514`); changing `refund_origin` after it is set is refused (`23514`); `NULL` -> value (first write) passes; value -> `NULL` of **both** columns in one statement (the nulling job) passes; value -> `NULL` of only one column is refused by the `CHECK`; an update of other columns of the row does not fire it (`UPDATE OF` list); the trigger is a separate function from the M2 guard (M3 does not redefine an M2 object) | P5b | C | Absent |
| PG39-13 | PG | The 72 h nulling job clears `refunded_at` and `refund_origin` in the same statement; nothing inside the last session is nulled (PG39-09 horizon unchanged); a row nulled no longer counts for either setting | P7 | C | Absent |
| PG39-14 | PG | **Configuration change** (section 25.3) | P7 | C | Absent |

### 25.3 Changing the configuration does not move held rows (`PG39-14`, `PG39-15`)

- **PG39-14.** Seed `awaiting_choice` rows with each cause (`reentry_cap`, `policy_wait`, `cannot_ask`, `chat_clear`, `legacy_residue`, `batch_deferred`), `held_for_service` and `check_group` rows, and refunds of both origins. For each change in turn (N, `reentry_cap_hold`, `reentry_cap_counts_manual`, window hours): row checksum of every pending/held row equal before and after; `settlement_cause` unchanged; no outbox row created; the **next** automatic decision uses the new values (C29..C33); counts of past refunds are re-evaluated with the stored origin in both directions; the audit row `queue.settlement_policy_changed` holds before/after closed values and no user identifier.
- **PG39-15.** Policy edit of the two new fields x an automatic refund (barrier on the queue lock, both orders, 50 rounds): the refund sees one whole policy revision (old or new, never a mix, for example `after_n` with the new `counts_manual`); the loser waits; the rev increments in the same `UPDATE` as the values; no `40P01`/`40001`/500. Extends R-cap-3.

### 25.4 Race of AC 39 (`PG39-01` extended; barrier, both orders, `counts_manual` true and false)

Fixture per round (fresh ids): person U has an older redemption R0 in `awaiting_choice` (the streamer will refund it by hand) and an active entry E1 whose end of service is the automatic refund; no other refunds in the window; cap `N = 1` with `after_n` (budget 1) and `N = 2` with `at_n` (budget 1), so that **one counted refund exactly fills the budget**. Two connections, a barrier proven by `pg_stat_activity` joined with `pg_blocking_pids` (Part A 4.2; a round where B was never seen waiting is a failed round), 50 rounds per cell, run 3x, serial.

| Cell | Hold | Counts manual | Order | Expected (read back from the database) |
|---|---|---|---|---|
| R1 / R2 | `after_n` | true | manual first / automatic first | manual first: the manual refund passes (never held) and the automatic refund is **held** (`reentry_cap`); automatic first: **both pass**, the count may exceed N by the manual one |
| R3 / R4 | `after_n` | false | manual first / automatic first | the manual commit does **not** change the count read: the automatic refund **passes in both orders**; the manual refund is stored with origin `streamer` and is not held |
| R5 / R6 | `at_n` | true | manual first / automatic first | as R1/R2 with budget 1 |
| R7 / R8 | `at_n` | false | manual first / automatic first | as R3/R4 |

Invariant after every round: automatic refunds counted by the decision never exceed the budget in any interleaving; a streamer refund is never blocked; every refund has its origin; no `40P01`/`40001`/500 on the loser. Control round per cell: a second person V at the same moment is unaffected (the lock serializes, it does not cross-block). The AC sentence "two concurrent refunds at the limit" is not testable for one person (unique active entry, G-B3, closed by AC 39 wording); the race above is the evidence.

### 25.5 API cases (route tests on the isolated instance, panel session)

| ID | Class | Test | Pkg | Gate |
|---|---|---|---|---|
| API35-07 | API | `PUT` with `reentryCapHold` outside `{after_n, at_n}` (empty string, `AFTER_N`, `never`, number) -> **400**, field named, nothing written (row checksum, rev, audit, outbox unchanged) | P5b | C |
| API35-08 | API | `PUT` with `reentryCapCountsManual` not a boolean (`"true"`, `1`, `0`, `null`, `[]`) -> **400**, no coercion, field named, nothing written | P5b | C |
| API35-09 | API | **Stale revision:** `expectedPolicyRev` older than the stored -> `SETTLEMENT_POLICY_STALE`, 409, body carries the current rev, nothing written (including when the body also holds a valid value of the new fields) | P5b | C |
| API35-10 | API | **Equal body** (every value equals the stored one, the two new fields included) -> accepted, **writes nothing, the rev does not move, no audit row**; before and after P7 | P5b | C |
| API35-11 | API | **Missing field means unchanged:** a `PUT` with only `reentryCapHold` leaves `reentryCapCountsManual` as stored, and the reverse; an older client that omits both stays valid | P5b | C |
| API35-12 | API | **Refusal before P7**, each field **alone** (`reentryCapHold` change, `reentryCapCountsManual` change) and **mixed** with an otherwise acceptable change (for example the window hours): `SETTLEMENT_MODE_UNAVAILABLE`, reason `policy_not_active`, the whole call refused atomically (nothing from the accepted field is written, rev unchanged); after P7 the same bodies are accepted. The refusal comes after the stale and the closed-set checks (order: 400, then 409 stale, then pre-P7 refusal) | P5b, P7 | C |
| API35-13 | API | `GET` returns `reentryCapHold`, `reentryCapCountsManual` and `effectiveBudget`: `null` when the cap is `NULL`; N for `after_n`; N - 1 for `at_n`; `0` for `at_n` with N = 1; both fields stored and returned while the cap is `NULL` (inert, no cross-field rule, `PUT` accepts them in any order); `enforcementActive` false before P7 | P5b | C |
| API35-14 | API | **Audit without id:** `queue.settlement_policy_changed` for a change of either new field carries before/after (closed value and boolean only), origin and the rev, **no user identifier, no label**; a log scan of the same call is clean; a refused call writes no audit row of change | P5b | C |
| API35-15 | API | Edit of the two fields refused on `deleting` and archived queues with the stable code (extends API35-03) | P5b | C |

### 25.6 `effectiveBudget` and `capDetail` (`API38-03`, `PG38-04`)

- **API38-03.** `capDetail` appears only on rows with cause `reentry_cap` and carries `count`, `budget`, `window` (`live`, `last_live`, `hours`), `endedAt` and `hours` (field names are a **HYPOTHESIS** until `@dev` confirms, UX plan item 13); `budget` equals `effectiveBudget` for the same queue; a missing `budget` is a client contract case (the UI shows the cause text without `{budget}` and no loosened line).
- **PG38-04.** `count` of `capDetail` is computed **at reading time with the same filter as the decision** (shared helper or shared SQL; the test drives both on one fixture and compares): flipping `reentryCapCountsManual` changes the displayed count on the next reading; a held row whose count fell below the budget after a loosening is still returned as pending (not removed), with count below budget.

### 25.7 Migrations with origin, and DB-18..DB-21 (`MG-13..MG-17`)

| ID | Test |
|---|---|
| MG-13 | **M3 up** on the seeded head (after M2a/M2b): `reentry_cap_hold` reads `after_n` and `reentry_cap_counts_manual` reads `true` on every pre-existing queue; `queues_reentry_cap_hold_check` refuses a value outside the set; `refund_origin` is `NULL` on every row; `relfilenode` of `queues` and `redemptions` unchanged, `atthasmissing` true for the two constant defaults; the `refund_origin` `CHECK` is **not yet validated** after M3 (`convalidated` false) yet already refuses a new bad row; checksums of pre-existing columns equal (DE 9.9 items 4 and 5) |
| MG-14 | **M3a always exists:** it validates `redemptions_refund_origin_check` (`convalidated` true; the validation runs in its own transaction with a concurrent writer, no block of reads or writes recorded, MG-12) and, only if adopted, the optional `refunded_at`/`expected_status` `CHECK`; `M3a-down` is a no-op and succeeds; the up file list is `M3, M3a` (the plan no longer branches on the existence of M3a; G-B7 closed) |
| MG-15 | **M3-down with origin:** the guard refuses when any `refunded_at` is set (a row with `refund_origin` is the same case), when a pending state exists, or when a `refund_on_end` queue exists; it passes before use; the trigger and its function are dropped **before** the columns (a down that drops the columns first fails: the file order is asserted by running it); after M3-down the checksums of the original `queues` and `redemptions` columns equal MG-01; the three new columns, the two `CHECK`s, the index and the trigger are gone; reverse order `M3b, M4, M3a, M3, M2, M1` leaves `_prisma_migrations` linear (extends MG-08) |
| MG-16 | **DB-18 (indexes and locks), decided in design v2.7 3.16 A (G-B12 closed): the index builds move to the validate files.** Assert with a concurrent reader and `log_lock_waits`: after M2a alone `redemptions_settled_external_idx` and the pending-list partial index are **absent**; after M3 alone `redemptions_refunded_idx` is **absent**; after M2b the first two are **present** and after M3a the third is **present**; no migration holds `ACCESS EXCLUSIVE` on `redemptions` while an index is built (the build runs in a file that holds only `SHARE`; record the lock mode and time, and the `redemptions` row count in the dry-run); the unique indexes that enforce integrity (duplicate probe, partial unique index) stay in M2a and exist after it; `M2b-down` and `M3a-down` are no-ops, and `M2-down`/`M3-down` drop the indexes with `IF EXISTS` (the revert order is unchanged). A reader blocked beyond the recorded time is **CONCERNS** with the measured time, never FAIL by timing |
| MG-17 | **DB-19 and DB-20 (design v2.7 3.16 B, C):** (a) the `queues` closed-set `CHECK`s are plain `ADD CONSTRAINT` and `convalidated` true right after the file; the `redemptions`/`outbox` ones are `NOT VALID` until their validate file; (b) the regenerated `redemptions_settlement_values_check` lists **six** states and a write of `settled_external` succeeds (the superseded DE 2.2 text would give `23514`); a `none`/`intent_recorded` write still passes; the DB-1 forms of the state `CHECK`s hold; (c) **DB-21:** `redemptions_refund_guard` is a separate trigger in M3 that freezes `refunded_at` and `refund_origin` once set, except both returning to `NULL` in the 72 h job, and the `refund_origin` index has no `INCLUDE` column |

Also extended: `MG-06` (every `CHECK` refuses its invalid row) gains `queues_reentry_cap_hold_check` and `redemptions_refund_origin_check`; `MG-07` (guard trigger) gains `redemptions_refund_guard`; `MG-02` adds `M3a` unconditionally to the forward order `M1, M2a, M2b, M3, M3a, M4, M3b`. `PG34-01..04` gain the two new `queues` columns and `refund_origin` (defaults, `CHECK`s, rollback guard).

### 25.8 The sixth cause `batch_deferred` and the strict cause `CHECK` (`PG37-09`, `PG37-10`, `U37-02`)

- **PG37-09** (DB-12 strict form, DB-20). Cause `CHECK` with **six** codes (DE 9.9 item 1): each code accepted only with `awaiting_choice`; `batch_deferred` accepted; unknown code refused; `awaiting_choice` with `NULL` cause **refused** (strict form; G-B4 closed); a code on any other state refused. State `CHECK` lists six states (MG-17 b).
- **PG37-10.** `batch_deferred` is written by the clear or delete dialog "decide one by one" **for members only**; non-members follow today's rule (design 3.6 step 3) and never get this cause; the chat `limpar` writes `chat_clear`, a policy writes `policy_wait`, never `batch_deferred`; the deletion waiting on these rows reports them as pending decisions (3.7); the row exits `awaiting_choice` with the cause cleared in the same statement (PG37-03 extended); no `chat.notice`.
- **U37-02.** Precedence: a batch deferral does not read S4, does not consult the cap (spy on the cap port: not called) and is not `policy_wait`.
- Catalog: `C20-03` now asserts **six** causes (see section 20); key `panel.pending.cause.batch_deferred` exists in en, es and pt-BR (`L39-01`).

### 25.9 Panel controls and the loosened-limit line (UX checklist, `ux-plan-v2` section 8)

| ID | Class | Test |
|---|---|---|
| K39-01 | K | Two controls render in the "Limit on repeated refunds" sub-fieldset: the hold radios (`after_n`, `at_n`, each with its worked example by `aria-describedby`, internal names never shown) and the checkbox "Refunds I choose myself also count toward the limit"; a new queue shows the defaults; both are **disabled with a visible reason** when "No limit" is chosen and **keep their values**; the `effectiveBudget` line shows the API number (`.one`, `.other`, zero text), carries the "Saved setting:" prefix with unsaved edits, and is **absent when `null` or missing** (never `0` for missing) |
| K39-02 | K | `at_n` with N = 1 (owner decision, UX U-20, design v2.8 3.16 E; G-B13 closed). **Note:** visible whatever the radio, gets "This is your current choice." when it applies, is referenced by `aria-describedby` from the number field and the `at_n` radio, announces the confirmation, is plain static text (no live region added). **Dialog opens:** Save with `at_n` and a limit of exactly 1 that differs from the saved pair opens the `alertdialog` (`showModal()`, labelled by the title, described by the body) and **sends nothing**. **Dialog does not open:** limit above 1; `after_n`; "No limit" (controls disabled); form equal to the saved pair (`at_n` and 1 in both, a save that only changes other fields); block not rendered. **Focus:** initial focus on **Back**; Tab cycles Back, "Save this choice" and stays inside; Esc, Back and any close other than confirm cancel with nothing sent, edits kept, **focus returns to Save**; a backdrop click does **not** close it. **Confirm:** sends the same request Save would have sent, exactly once; "Save this choice" is **disabled while the request runs** and the dialog stays open until the result; success closes it, shows the success text in the existing form region, focus on Save; a stale revision or validation error closes it and shows the form message with edits kept and focus on Save; no `[aria-live]`, `[role=status]` or `[role=alert]` added. **Order with U-7:** when the `legacy` conversion dialog also applies it opens **first**; Back in either cancels the whole save and nothing is sent; "Save this choice" follows only after the conversion is confirmed; one request in the end. The trigger is a comparison of two literal form values, never a budget computation (grep of the panel code: no client formula) |
| K39-03 | K | Pending row: `{budget}` and `{count}` come from `capDetail`, never recomputed; a row with count **below** budget shows the cause line **plus** the loosened line ("The limit was changed after this was held..."); a row with count at or above budget has **no** loosened line; the words "over the limit"/"above the limit" never appear for a pending row; a missing `budget` falls back to the earlier wording with no loosened line; the sixth-cause line renders |
| K39-04 | K | A `PUT` with only one of the two fields leaves the other unchanged in the form state; an invalid value shows the API field error next to that control (not a banner); a stale revision keeps the unsaved edits and offers reload |
| K39-05 | K | **Block absent before P7 (owner decision, UX U-1/U-18, design 3.16 D):** with `enforcementActive` **false** and with the field **missing** from `GET`, the policy block (S2..S5, the two cap controls, the `effectiveBudget` line) is **not in the page at all**: no element, no heading, no `aria-describedby` target, no read-only text, no key of the removed `panel.policy.cap.readonly`; the rest of the settlement form works and the tab order has no gap; with `true` the block renders. Missing means *not rendered*, never *rendered as active*. The confirmation dialog cannot be raised while the block is absent. The API refusal (API35-12) stays tested separately as the guard for direct calls |
| E39-01 | E | Browser script at 320, 390, 768 px and 200% zoom at 320, 3x each: tab order of the sub-fieldset follows visual order, radios and checkbox targets >= 44 x 44 px (label included), contrast >= 4.5:1 computed from rendered styles, the count of `[aria-live]`, `[role=status]`, `[role=alert]` unchanged by the new controls, disabled reason read in page order, marks as text |
| E39-02 | E | Flow: hold a refund by the cap, raise N (or switch to `after_n`), save, reload Pending: the row keeps its cause line, gains the loosened line with the numbers of the API, the decision dialog still opens and works, no option is pre-checked (AC 36) |
| L39-01 | L | `npm run validate:localization` with the keys `panel.policy.cap.hold.*`, `panel.policy.cap.counts_manual*`, `panel.pending.cause.batch_deferred`, `panel.pending.cause.reentry_cap.loosened`, `.zero`/`.one`/`.other` variants: parity in en/es/pt-BR, no empty value, identical placeholders (`{count}`, `{budget}`, `{hours}`, `{time}`); semantic quality of es and pt-BR not natively reviewed (declared in section 20) |
| C39-01 | C | Static wording contract: no key for a pending row contains "over the limit"; the text "maximum N refunds per person per live" appears only on the `after_n` example, never as a general statement (AC 27 amendment); the limit line uses `effectiveBudget` (no client formula, grep of the panel code for `- 1` on the cap) |

Screen reader stays `NOT RUN` (risk accepted by the owner); these are browser scripts and static review, not assistive-technology validation.

### 25.10 Optional real check (run B, owner-gated)

| ID | Script | Expected | Closes |
|---|---|---|---|
| RT-B20 | Optional: on the test channel, queue with cap 1 and `at_n`: X redeems and is closed by end of service | the refund is **held** (`awaiting_choice`, `reentry_cap`), nothing changes on Twitch (still `UNFULFILLED`), the streamer refunds it by hand (counts per setting); then `after_n`: the first passes and the second is held | AC 39 (boundary), design 3.15 H |

### 25.11 Gaps and previous gaps closed

**Closed by the design v2.5/v2.6, the owner and the DE review (table 24.1 updated):** G-B1 (no preselection, text withdrawn), G-B2 (S1 governs non-members only; rows 7, 8 and 8b of section 12 confirmed), G-B3 (evidence reworded to automatic x manual), G-B4 (strict `awaiting_choice => cause NOT NULL`, PG37-09), G-B5 (S2..S5 refused before P7, atomic), G-B6 (configurable, equality declared), G-B7 (M3a always exists).

**Closed on 2026-11-15 (design v2.7/v2.8, owner decision):** G-B12 (index builds move to M2b and M3a; `MG-16` takes that branch only), G-B13 (confirmation dialog for `at_n` with N = 1, UX U-20; `K39-02` follows the dialog), G-B15 (rows C16/C17 confirmed as derived from the rule: budget 19, count 18 passes, count 19 is held, design 3.16 C). The block before P7 is hidden (`K39-05`), which also closes UX open point 10.

**Open gap (does not block the plan):**

| # | Gap | Owner | Before |
|---|---|---|---|
| G-B14 | `capDetail` field names (`count`, `budget`, `window`, `endedAt`, `hours`) not confirmed by `@dev` (UX item 13) | `@dev` | P7 |

### 25.12 Totals added by this addendum

Tests: `U39-02`, `U39-03`, `U37-02` (U +3); `PG39-10..15` (6), `PG37-09`, `PG37-10`, `PG38-04` (PG +9; `PG39-14` and `PG39-15` counted here once); `API35-07..15` (API +9); `MG-13..17` (MG +5); `K39-01..05` (K +5); `E39-01`, `E39-02` (E +2); `L39-01` (L +1); `C39-01` (C +1); `RT-B20` (RT +1, optional). **+36 tests, 11 mutations (M56..M66, section 21).** `PG39-01` stays one test with 8 cells. Totals are in 24.3.
