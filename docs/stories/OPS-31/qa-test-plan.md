# OPS-31 — `@qa` test plan (refund by group and queue notices; FT-71..FT-78)

[Português (pt-BR)](../../pt-BR/stories/OPS-31/qa-test-plan.md)

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

## 8. Single-gate scheme

Slices run in the architect order (FT-71, FT-72, FT-73 beside them, FT-74, FT-75, FT-76, FT-77); `@dev` records a Red-then-Green checkpoint per slice without committing; FT-78 run A after FT-71..73 is optional before the gate only if the owner is present; run B only after the local gate. One `@qa` gate at the end (project rule), with FT-76 and FT-77 together.
