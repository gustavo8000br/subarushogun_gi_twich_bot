# OPS-22 — `@qa` test plan of the single package (FT-25, FT-26, FT-36, FT-23)

[Português (pt-BR)](../../pt-BR/stories/OPS-22/qa-test-plan.md)

**Author:** `@qa` (Quinn), 2026-11-04. **Nature:** PLAN ONLY. No test was written or run, no code, catalog or style was changed, no Docker or browser was started. All file names below are **probable** (to be created or extended by `@dev`); the names of tests are the contract, the files may move.
**Inputs:** [story](story.md) (AC 1-22), [po-validation](po-validation.md), [architect-review-ft36](architect-review-ft36.md) (F15-F24, D-36-1..8, section 5 and the Orion addendum), [data-review](data-review.md) (DATA §4, C3, C6), [ft-36-data-engineer-confirmation](ft-36-data-engineer-confirmation.md) (conditions A-I, T36-9b, T36-14, T36-15, T-C3), [ux-plan-ft23-ft36](ux-plan-ft23-ft36.md) (UX-1..UX-15, R1-R8), [FT-23 story](../OPS-15/ft-23-navigation-and-messages.md) (#103, 12 criteria).
**Reading of the repository used for this plan (read-only):** `tests/` layout, `tests/helpers/{isolated-postgres-image,isolated-postgres-cleanup,twurple-real-instances}.mjs`, `tests/helpers/ops15/qra-postgres-fixtures.mjs`, the existing suites named below, `package.json` scripts.

## 1. Basis and rules

1. **Classes are separate evidence** and none replaces another: unit (Vitest, fakes/real Twurple instances), contract (static or shape contracts), component (Vitest + DOM), integration on **isolated PostgreSQL with real migrations** (`isolated-postgres-image.mjs`, label `queuebot.test=disposable`; never SQLite, never Prisma mocks, never an active volume), localization, Compose (regression only), browser-only E2E (Chromium, fixtures, no Twitch), live Twitch (AC 19 / OW-16, owner-gated, outside this plan).
2. **Races are tested with two real connections** (two `PrismaClient`s) and a **barrier** before each call, N = 50 rounds, invariant read back from the database after each round. **No `sleep` as synchronization.** Time is injected (`clock`, fake timers, injected `random`).
3. **Test-first:** every test below is written by `@dev` Red before the code; the Red expected today is in section 2. The `@dev` checkpoint records the Red and the Green output in the story (not a commit).
4. **Decision of the Orion (2026-10-30)** changes T36-5: a cancel is **allowed** when the read-only `cancel_verification` read proves the exact reward exists and is paused, even when `requestMayHaveReachedTwitch` is true; `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` applies **only** when the read is inconclusive or negative after a DELETE attempt. The two existing fixtures (`tests/integration/qra-postgres-fixtures.test.js` ~457-488 and ~497-528) stay unchanged and must stay green. New test T36-16 covers the late DELETE.
5. **Legend:** `U` unit, `C` contract, `K` component, `PG` PostgreSQL integration, `L` localization, `E` Chromium E2E. One ID = one named test (a table-driven test with several cases counts once and says so).

## 2. Red expected today (why each group fails before the code)

| Group | Red today |
|---|---|
| FT-25 | No policy module, so `U25-01..06` fail on import; `PG25-03` fails (no cap: the 6th non-conclusive read does not become `unknown/attempts_exhausted`); `PG25-07`/`PG25-11` fail (`retryOutboxManually` keeps `attempts` and writes no `cycleStartAttempts`, `queue-repository.mjs:2237-2258`); `PG25-06`/`U25-13` fail (`markRedemptionUnknown` moves `pending/retry/processing` tasks to `unknown` without a lease guard); `U25-11` fails (no `financial.attempt` line). |
| FT-26 | `U26-01` fails (`reward-worker.mjs:316` still reads `lookupError?.status === 404`, so a real `HttpStatusCodeError` becomes `unknown('queue_delete_result_unknown')`); `U26-03`/`PG26-01` fail (blockers turn `reward.delete` into terminal `unknown('queue_deletion_financial_conflict')`); `PG26-04`/`PG26-05` fail (`resolved_manual` counts as a blocker, `queue-repository.mjs:1741-1751`); `U26-06` fails (no `deletionState`/`blockingOperations`/`canCancelDeletion` projection). |
| FT-36 | `PG36-09` fails with `P2002` and rollback (F18, confirmed by `@data-engineer`); `PG36-01` 5xx variant, `PG36-12` and `U36-02` fail (failed verification always sets `unknown`, `queue-repository.mjs:880`); `U36-01` fails for `QUEUE_DELETION_ALREADY_COMPLETED` (today a dead `200 already_deleted` branch) and `PAUSE_IN_PROGRESS`; `PG36-10` fails (a blocked pause has no cancel path, F19); `PG36-13` fails (no `actorId` on confirm/fail rows, F22). |
| FT-23 | Components and modules do not exist (`post-action-route.mjs`, outcome region, URL parser): `U23-*`, `K23-*`, `C23-*` fail on import or on the missing `role` region; `L23-*` fail on missing keys; `E23-*` fail because the notice is card-local state. |

## 3. FT-25 (#98) — bounded retry, read-only re-verification, audited manual resolution (G1)

Files: `tests/unit/financial-retry-policy.test.js` (new), `tests/unit/financial-outbox-worker.test.js` (extend), `tests/unit/twitch-reconciliation.test.js` (extend), `tests/unit/queue-routes.test.js` (extend), `tests/integration/financial-retry-postgres.test.js` (new), `tests/integration/queue-repository.test.js` (extend, existing claim-race block at ~:500, ~:673, ~:696).

| ID | Class | Test | AC |
|---|---|---|---|
| U25-01 | U | Nominal waits after attempt n = `min(60 min, 60 s x 4^(n-1))` = 1, 4, 16, 60, 60 min | 6 |
| U25-02 | U | Jitter x0.8..x1.2 from an injected `random` at 0, 0.5 and 1: each wait inside its bounds | 6 |
| U25-03 | U | `next_attempt_at` non-decreasing up to the 60 min cap over a sweep of random values (not "strictly increasing") | 6 |
| U25-04 | U | 6 attempts counting the first; the 6th non-conclusive read ends in `unknown` with `lastError = attempts_exhausted`; no further claim | 6, 8 |
| U25-05 | U | Budget = `attempts - (payload.cycleStartAttempts ?? 0)`, cap 6; a missing key reads as 0 (legacy row) | 6, 20 |
| U25-06 | U | "Retry now" computes a fresh cycle of 6 (another 6 reads, not 1) and never lowers `attempts` | 20 |
| U25-07 | U | 401: move to `unknown('authorization_required')` and `cycleStartAttempts = min(cycleStartAttempts + 1, attempts)` in one decision; invariant `0 <= cycleStartAttempts <= attempts` | 6, 20 |
| U25-08 | U | A 404 on a **read** (`remote_state_unavailable`) is NOT refunded (a real non-conclusive result) | 6 |
| U25-09 | U | Re-verification is read-only: the fake Twitch records zero write calls (no cancel, no fulfill) | 7 |
| U25-10 | U | Positive read of the expected state: `confirmed`; opposite state: existing `conflict`; guarded write with 0 rows: `lease_lost`, not an error | 7 |
| U25-11 | U | `financial.attempt` line has exactly `{event, operationType, outboxId, attempt, httpStatus, twitchErrorCode<=64, nextAttemptAt, outcome}`; canary strings in `error.message` (token-like, user login) never appear in any log argument | 10 |
| U25-12 | U | Health projection: retryable items = `degraded`, terminal = `needs_review` | 8 |
| U25-13 | U | `markRedemptionUnknown` / reconciliation no longer touches outbox rows (fake repository records zero outbox writes) | known gap 1 |
| C25-01 | C | Catalogue names: `attempts_exhausted` and `financial.operation_retry_requested` exist; `retry_exhausted` and `financial.operation_retried_manually` appear nowhere in `apps/` (static scan) | open items 1, 2 |
| C25-02 | C | Operations route/projection shape: reason code, blocking effect field, resolve returns `remoteConfirmed:false`; every non-2xx carries an enumerated `code`; no free text rendered by contract | 11, 18 |
| PG25-01 | PG | DATA 1 claim race: two clients, barrier, 50 rounds, exactly one row returned, loser gets `null`, `attempts` +1 once | 6 |
| PG25-02 | PG | DATA 2 stale lease: A's old token returns `count=0` on retry/confirm/unknown; row reflects only B | 7 |
| PG25-03 | PG | DATA 3 six attempts: each wait in bounds, `next_attempt_at` non-decreasing to the cap, `firstNonConclusiveAt` unchanged, 6th = `unknown/attempts_exhausted`, `redemptions.sync_status='unknown'`, one exhaustion audit row, `claimNext` at `now + 1 day` = `null` | 6, 8 |
| PG25-04 | PG | DATA 4 no confirmation without a positive read: after any failed/exhausted sequence no `confirmed` outbox row and `remote_status` unchanged | 9 |
| PG25-05 | PG | DATA 5 positive re-verification at attempt 3: `confirmed` + `sync_status='confirmed'` + audit in ONE transaction (force a failure in step 3: all three or none) | 7 |
| PG25-06 | PG | DATA 6 reconciliation vs live lease: a `processing` task with a valid lease is untouched by `markRedemptionUnknown` | known gap 1 |
| PG25-07 | PG | DATA 7 manual retry: `unknown` to `pending`, `cycleStartAttempts` = previous `attempts`, `attempts` not reset, audit `financial.operation_retry_requested` with `{operationType, previousAttempts, cycleStartAttempts}` and the actor | 20 |
| PG25-08 | PG | DATA 8 manual resolution: `resolved_manual`, `sync_status='operator_resolved'`, `remote_status` unchanged, audit `remoteConfirmed:false`; a later positive EventSub observation moves it to `confirmed`/`conflict` | 11 |
| PG25-09 | PG | DATA 11 legacy row `payload='{}'`, `attempts=1`: read with fallbacks, stays terminal until manual retry | 12 |
| PG25-10 | PG | DATA 12 audit allowlist: `safe_detail` keys of every event of FT-25 inside the allowlist, plus none matching `/user\|login\|name\|token\|header\|input\|body\|uid/i` | 10 |
| PG25-11 | PG | T-C3: after 6 exhausted attempts "retry now" gives exactly 6 more; a 401 in the middle consumes none; `attempts` never decreases (compare before/after) | 20 |
| PG25-12 | PG | Payload merge never replaces the object: other keys (`firstNonConclusiveAt`, `reasonClass`, reward keys) survive retry-now and the 401 refund; `claimNext` `RETURNING` includes `payload` | 6, 20 |
| PG25-13 | PG | Retry-now is one transaction under `FOR UPDATE` with the `WHERE status = <read status>` guard, `count === 1`, audit in the same transaction (force a failure after the update: neither change persists) | 20 |
| PG25-14 | PG | 401 refund is atomic: the move to `unknown('authorization_required')` and `cycleStartAttempts += 1` are one statement/transaction (force a failure between: neither or both) | 20 |

FT-25 total: 13 U + 2 C + 14 PG = **29**.

## 4. FT-26 (#99) — deletion order and states (G2)

Files: `tests/unit/reward-outbox-worker.test.js` (extend), `tests/unit/queue-action-state.test.js` (extend, shared projection), `tests/unit/queue-routes.test.js` (extend), `tests/unit/twitch-http-error.test.js` (extend), `tests/integration/queue-deletion-order-postgres.test.js` (new).

| ID | Class | Test | AC |
|---|---|---|---|
| U26-01 | U | `reward-worker.mjs:316`: a real Twurple `HttpStatusCodeError` 404 on the post-delete lookup means "already gone" (AC 13 step e), never `unknown('queue_delete_result_unknown')`; table-driven over `statusCode` and `status` (one test, 3 cases) | 22 |
| U26-02 | U | The worker's own status read (`reward-worker.mjs:5-8`) uses the shared `twitchHttpError` function (`statusCode ?? status`) | 22 |
| U26-03 | U | Financial blockers move `reward.delete` to `retry('queue_deletion_blocked_by_review')`, re-check every 5 min, no attempt budget consumed, never `unknown` because of blockers | 14 |
| U26-04 | U | 401 during deletion: stays blocked with the auth state visible; re-arms after re-authorization | 16 |
| U26-05 | U | Auto-resume decision function sets `nextAttemptAt = now` only for a `reward.delete` in `retry` of a queue still `deleting` (I7); `cancelled` and `cancel_verification` are never touched | 14 |
| U26-06 | U | Projection: `deletionState` in {deleted, pending, blocked}; `blockReason` enumerated; `blockingOperations` count; `resolved_manual` not counted; `canCancelDeletion` and `cancellationInProgress` follow the begin predicate (single source for the button, F17) | 15 |
| U26-07 | U | Deletion order with a fake Twitch: pause, one idempotent cancel per open redemption, re-list shows zero `UNFULFILLED`, then delete; 404 on delete = already gone | 13 |
| U26-08 | U | Reward-worker log/audit lines of the deletion carry only enumerated codes and counts (key-set test, canary strings) | 10 |
| C26-01 | C | Queue API schema: new projection fields are enumerated, no free text; every non-2xx carries `code` | 18 |
| C26-02 | C | Static: no remaining `lookupError?.status === 404` (or `.status ===` for Twurple errors) in `apps/api/src/outbox/reward-worker.mjs` | 22 |
| PG26-01 | PG | DATA 9 deletion resume: one redemption each in open, `unknown`, already `CANCELED`, already `FULFILLED`: no `reward.delete` claimable while blockers exist; completes after a confirming read; after manual resolution resumes, but `completeQueueDeletion` refuses while the post-resolution read still shows `UNFULFILLED` | 14, 17 |
| PG26-02 | PG | DATA 10 idempotent cancel: `recordQueueDeletionRedemptions` twice creates one `redemption.cancel` per redemption; an existing `redemption.fulfill` is kept | 13 |
| PG26-03 | PG | AC 17 matrix (one table-driven test, 4 cases: open, unknown, canceled, fulfilled): final queue and outbox states match ACs 13-15; no `reward.delete` issued while an unaccounted `UNFULFILLED` remains | 17 |
| PG26-04 | PG | Contradicted resolution: re-list after the resolution still shows `UNFULFILLED` and the cancel task is re-armed to `pending` with a fresh cycle, audit `financial.manual_resolution_contradicted` | 14 |
| PG26-05 | PG | `resolved_manual` is not in `blockingOperations`; the deletion projection is `pending` while the post-resolution guard runs | 15 |
| PG26-06 | PG | 401 during deletion persisted as blocked with the auth reason; re-authorization re-arms to `retry` | 16 |
| PG26-07 | PG | Auto-resume after a financial confirmation touches only a `reward.delete` in `retry` of a `deleting` queue (a `cancelled` row stays `cancelled`) | 14 |
| PG26-08 | PG | Absence from the `UNFULFILLED` list is never written back as a `remoteStatus` (no inferred status) | 9 |

FT-26 total: 8 U + 2 C + 8 PG = **18**.

## 5. FT-36 (#100) — cancel a pending or blocked deletion (G3)

Files: `tests/unit/queue-domain-service.test.js` (extend), `tests/unit/queue-routes.test.js` (extend), `tests/unit/queue-deletion-cancel-matrix.test.js` (new), `tests/integration/queue-deletion-cancel-postgres.test.js` (new), `tests/integration/qra-postgres-fixtures.test.js` (keep unchanged; it must stay green).

| ID | Class | Test | Maps to |
|---|---|---|---|
| U36-01 | U | Begin refusal matrix, one table-driven test, one row per line of architect 1.2: deleted gives 409 `QUEUE_DELETION_ALREADY_COMPLETED`; not deleting / not Channel Points / no reward gives `NOT_PENDING`; any `processing` reward task (with or without a valid lease) gives `QUEUE_REWARD_OPERATION_PROCESSING`; pause stage `pending|retry` gives `QUEUE_DELETION_PAUSE_IN_PROGRESS`; nothing changes on any refusal and no audit row is written | 1.2 |
| U36-02 | U | Domain service with a fake Twitch from `twurple-real-instances.mjs`: paused gives `cancelled`; not paused gives `queue_delete_cancel_reward_not_paused`; diverged gives `queue_delete_reward_diverged`; `null`/real `HttpStatusCodeError` 404 gives `queue_delete_reward_absent`; real 401 gives `authorization_required`; real 500, network and timeout give `queue_deletion_cancel_verification_unavailable` with the previous status restored | 1.2, F20 |
| U36-03 | U | Routes: `confirm !== true` gives 400 `QUEUE_DELETE_CANCEL_CONFIRMATION_REQUIRED`; 2xx `not_cancelled` carries an enumerated `reason`; every non-2xx carries `code`; the Portuguese `error` text is not needed by any consumer | 1.5 |
| U36-04 | U | Audit event builder: `actorId` non-null on `queue.deletion_cancel_verification_requested`, `queue.deletion_cancelled`, `queue.deletion_cancellation_not_confirmed`; exact `safeDetail` key sets; legacy reason `queue_deletion_cancel_verification_failed` read as an alias | F22 |
| U36-05 | U | Orion decision: `requestMayHaveReachedTwitch:true` + positive read (exists, paused) gives `cancelled`; the same flag + inconclusive or negative read gives 409 `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` and the previous status restored | Orion addendum |
| U36-06 | U | Late DELETE after a verified cancel (service level): the open action re-reads the reward; if the read now says absent/inconclusive the open fails safely and the queue is not reopened without its reward | Orion addendum |
| U36-07 | U | `canCancelDeletion` / `cancellationInProgress` come from the same predicate as begin (no remote read); the client heuristic on `remoteSyncStatus` is not used | F17 |
| U36-08 | U | The route class starts as `terminal_unknown` (OPS-21 table); repeating the request with a fresh key resumes (domain re-entrancy) | AC 18 |
| PG36-01 | PG | T36-1 cancel of a `pending` delete: `cancel_verification` then `cancelled`; queue `active`, archived, closed, `synced`, reward verified paused; **5xx variant:** a non-conclusive read restores `previousStatus` (not `unknown`) with `lastError queue_deletion_cancel_verification_unavailable` | 1.2, F20 |
| PG36-02 | PG | T36-2 cancel of a delete blocked by review (`retry` / `queue_deletion_blocked_by_review`): the financial `unknown` task is untouched and still listed in Operations | 1.2 |
| PG36-03 | PG | T36-3 a `processing` reward task: 409, nothing changed | 1.3 |
| PG36-04 | PG | T36-4 race, two clients, barrier, 50 rounds: `claimNextRewardOperation` vs `beginQueueDeletionCancellation`; exactly one wins; invariant from the database after each round: `NOT (status='processing' AND a cancel_verification audit row exists for that attempt)` | 1.3 |
| PG36-05 | PG | T36-5 (rewritten by the Orion decision) `requestMayHaveReachedTwitch:true`: positive read gives `cancelled`; inconclusive or negative gives 409 `REMOTE_DELETE_ATTEMPTED`; the two existing fixtures stay green | Orion addendum |
| PG36-06 | PG | T36-6 queue `deleted`: 409 `QUEUE_DELETION_ALREADY_COMPLETED`, nothing changes | 1.2 |
| PG36-07 | PG | T36-7 crash after begin (call begin only) then the same request with a fresh `Idempotency-Key`: resumes, executes once, exactly one `..._requested` audit row | cond. C |
| PG36-08 | PG | T36-8 a `redemption.cancel` `pending` at cancel time still reaches `confirmed`/`CANCELED` after the reopen (worker with a positive fake read); entries stay `removed`; counts and statuses of `redemptions` and `redemption.*` rows are identical before and after the cancel; no row deleted | I2, I3 |
| PG36-09 | PG | T36-9 open queue, cancel, unarchive and open, delete again: the pause confirmation reuses the single `reward.delete` row (F18, Red today); the second pause key differs from the first (`queue:<id>:reward.delete.pause:<nextVersion>`); the old cancelled pause task stays as history | F18, cond. 2 |
| PG36-09b | PG | T36-9b an unexpected `reward.delete` row in a status other than operator-cancelled at `confirmRewardOpen`: fail closed (throw/rollback, pause task stays `processing`), never silently overwritten | cond. D |
| PG36-10 | PG | T36-10 blocked pause (`close_unknown`): paused read cancels both tasks; not paused restores the pause task with `queue_delete_cancel_reward_not_paused` | F19 |
| PG36-11 | PG | T36-11 FT-26 auto-resume ignores a `cancelled`/`cancel_verification` delete | I7 |
| PG36-12 | PG | T36-12 queue version change during verification: 409 `QUEUE_DELETION_CANCELLATION_STALE`, previous status restored (also with a 5xx read) | 1.2 |
| PG36-13 | PG | T36-13 `safeDetail` allowlist, `actorId` on all three events, no key matching `/user\|login\|name\|token\|header\|input\|body\|uid/i` | F22, cond. H |
| PG36-14 | PG | T36-14 a legacy `cancel_verification` row without `payload.cancelVerification` resumes and, on a non-conclusive read, restores to `unknown` | cond. E |
| PG36-15 | PG | T36-15 (optional, run once) `rollback.sql` and the migration re-applied with a `cancel_verification` row present | cond. F |
| PG36-16 | PG | T36-16 (new) late DELETE after a verified cancel: cancel succeeds on a positive read, then the fake Twitch reports the reward gone; the open action re-reads, fails safely, and the queue is not reopened without its reward | Orion addendum |
| PG36-EX | PG | `EXPLAIN` record of the begin/claim lookups (by `entity_id` and `idempotency_key`): **recorded, not asserted** (counted as 0 tests) | cond. I |

FT-36 total: 8 U + 17 PG (PG36-01..16 plus 09b) = **25** (`PG36-EX` is an evidence record, not a test).

## 6. FT-23 (#103) — navigation and messages (G4)

Files: `tests/unit/post-action-route.test.js` (new), `tests/unit/next-outcome-url.test.js` (new), `tests/unit/next-queue-lifecycle.test.js` (extend, the mapper), `tests/unit/next-outcome-region.test.jsx` (new), `tests/unit/next-queue-lifecycle-actions.test.jsx` (extend), `tests/unit/next-queue-creation-form.test.js` (extend), `tests/unit/next-panel-catalogs.test.js` and `tests/unit/panel-catalog-placeholders.test.js` (extend), `tests/e2e/queue-outcome-browser-only.mjs` (new, new script `test:e2e:queue-outcome:browser-only`) and `tests/e2e/queue-lifecycle-browser-only.mjs` (extend).

| ID | Class | Test | UX / AC |
|---|---|---|---|
| U23-01 | U | `resolvePostActionRoute` is pure and covers create (5 codes), deleted, pending, blocked, every cancel outcome, deletion of the last queue, and an unknown outcome returning `null` (table-driven, one test) | UX-5, AC 8 |
| U23-02 | U | Last-queue rule: `/new-queue/` only when no non-`deleted` queue remains; a `pending` or `blocked` last queue stays on `/queues/` | UX-5 |
| U23-03 | U | URL parser: closed list (5 create codes, 3 `queue_deleted_last_*`), UUID pattern, unknown or malformed ignored, nothing reflected, both parameters removed with `history.replaceState` | UX-6, AC 6 |
| U23-04 | U | `navigateTo` is the single caller of `window.location` for post-action navigation (static scan of `apps/frontend`) | UX-13, AC 7 |
| U23-05 | U | Cancel mapper table (3.4): each `code`/`reason` returns the listed key; unknown `code` gives `panel.error.generic`; unknown `reason` gives `unverified`; API `error` free text never rendered | UX-4 |
| U23-06 | U | `pending` never maps to a `deleted.*` or `done` key | UX-8 |
| U23-07 | U | Element mapping: refusals and `not_cancelled` go to `alert`; created, deleted, pending, cancelled, refreshed go to `status` | UX-3 |
| U23-08 | U | R6: `already_deleted` is mapped from the 409 `QUEUE_DELETION_ALREADY_COMPLETED` code, not from a 200 status | R6 |
| K23-01 | K | `PanelShell` renders one container with one `role="status"` and one `role="alert"`, both empty at first render and on every `status` value (loading, ready, unavailable) | UX-1, AC 1 |
| K23-02 | K | After a delete result and after the card unmounts the message is still in the region | UX-2 |
| K23-03 | K | `uncertain` create result: no navigation, submit stays disabled, `creation_result.uncertain` in `alert` with the "Open queues" link; a second click creates no duplicate | UX-7 |
| K23-04 | K | "Cancel deletion" shown only from the server flag `canCancelDeletion`; while `cancellationInProgress` the card shows `panel.queue.deletion.cancelling` and the button stays | UX-9, R2 |
| K23-05 | K | Dialog: specific title (not "Confirm action"), "Back" first in DOM order and default focus, `aria-labelledby`/`aria-describedby` target existing ids, accept button disabled while saving, three description paragraphs for cancel (including "do not come back") | UX-10, R5 |
| K23-06 | K | `tabindex="-1"` on the queue title `h2` and on both page `h1`; focus helper falls back to `h1` when the UUID is absent | UX-11, R3 |
| K23-07 | K | Dismiss and action controls are outside the live elements; no auto-dismiss (fake timers advance 10 minutes, message stays); a new outcome replaces it; page change clears it | plan 3.1 |
| K23-08 | K | R1: a Channel Points queue never renders `panel.queue.delete.done` / `.pending` (they say "reward remains paused/untouched"); local and converted queues keep the reused keys | R1 |
| K23-09 | K | R7: `{count}` of 1 renders the singular form, other counts the plural; blocked count `.one/.many/.other` | R7 |
| K23-10 | K | Focus after an action: invoker if it still exists, else the queue title, else the `h1`; focus moves only after the message is written | plan 3.7 |
| K23-11 | K | Blocked deletion shows a persistent card line from the projection with the count and a link to Operations; an unknown `blockReason` falls back to the generic text, raw code never shown | plan 3.3 |
| L23-01 | L | The 25 new keys (plan 4.2) exist in en, es and pt-BR with the same placeholders; plural `.one/.many/.other` where listed; the plan's table also lists `panel.queue.confirm.delete.one` under "amended" but that key does not exist today: the test asserts it as a 26th key | UX-12, AC 10 |
| L23-02 | L | None of the new keys collides with an existing key; the 28 reused keys exist in all three catalogs | UX-12 |
| L23-03 | L | The amended texts (`confirm.delete`, `confirm.cancel_delete`, `delete.cancelled`) carry the "removed entries do not come back" sentence in all three languages | I3 |
| L23-04 | L | `npm run validate:localization` and `tests/unit/localization-parity.test.js` pass with the new keys | AC 10 |
| L23-05 | L | Term rule: new pt-BR text uses "fila", "recompensa", "exclusão" (not the English "reward"); es uses "cola", "recompensa", "eliminación" | plan 2.7 |
| C23-01 | C | New CSS animations only inside `prefers-reduced-motion: no-preference` | UX-15 |
| C23-02 | C | R8 static: the region class declares `font-size` >= 14px; the declared status, warning and error colors against the declared region background compute to >= 4.5:1 (arithmetic on declared values, NOT a pixel measurement) | R8 |
| C23-03 | C | No component renders the raw `outcome` parameter (static scan of the outcome module for direct interpolation) | UX-6 |
| E23-01 | E | Create a queue, then `/queues/` with focus on the new queue title (computed `document.activeElement`), neutral message in `status` that does not promise Twitch success, parameters removed | UX-14, AC 2 |
| E23-02 | E | Delete (Channel Points fixture): persistent message after the card unmounts | AC 1, 3 |
| E23-03 | E | Delete the last queue: `/new-queue/` with the message and focus on the `h1` | AC 4 |
| E23-04 | E | Deletion `pending` and `blocked`: message plus the Operations link; "Refresh queues" replaces the message with `panel.outcome.refreshed` | AC 3, 9 |
| E23-05 | E | Each cancel refusal (parametrized, 12 rows of table 3.4, one test): right element (`alert`) and text, never "safe/reopened" | AC 5 |
| E23-06 | E | Cancel success: archived/closed card, message names the order show-then-open | AC 5 |
| E23-07 | E | A reload after arriving does not replay the message | AC 6 |
| E23-08 | E | Operations page texts of FT-25/FT-26: `attempts_exhausted`, `blocks_deletion` tag, `manual_contradicted` | plan 3.6 |
| E23-09 | E | Cancel then open when the fixture reports the reward gone: open fails safely, the queue stays closed, message in `alert` (end-to-end of PG36-16) | Orion addendum |

FT-23 total: 8 U + 11 K + 5 L + 3 C + 9 E = **36**.

## 7. Mutation proofs (apply, show the named test failing, revert)

### 7.1 The ten of the architect review (section 5)

| # | Mutation | Test that catches it |
|---|---|---|
| M1 | Remove the `processing` refusal in begin | PG36-03, PG36-04 (and U36-01) |
| M2 | Drop `reward.isPaused !== true` in confirm or the domain service | U36-02 "not paused", PG36-10 |
| M3 | Make the cancel set `redemption.*` tasks to `cancelled` | PG36-08 |
| M4 | Remove the `requestMayHaveReachedTwitch` refusal. **Rewritten by the Orion decision:** make begin refuse a possibly-sent DELETE even with a positive read (reverts the decision), and, separately, remove the refusal for an inconclusive/negative read | U36-05, PG36-05 (both directions) |
| M5 | Remove the queue `version` CAS in confirm | PG36-12 |
| M6 | Let auto-resume touch any non-`retry` delete | PG36-11, PG26-07, U26-05 |
| M7 | FT-25: confirm on `UNKNOWN`/error without a positive read | PG25-04 (DATA 4), U25-10 |
| M8 | FT-26: skip the post-resolution re-list guard | PG26-01 (DATA 9), PG26-04 |
| M9 | FT-26: put back `lookupError?.status === 404` at `reward-worker.mjs:316` | U26-01 (real `HttpStatusCodeError`), C26-02 |
| M10 | FT-23: render the raw `outcome` parameter | U23-03, C23-03 |

### 7.2 Twelve added by this plan

| # | Mutation | Test that catches it |
|---|---|---|
| M11 | Restore always to `unknown` instead of `previousStatus` on a non-conclusive read (including 5xx) | PG36-01 5xx variant, PG36-12, U36-02 |
| M12 | Reopen without re-reading in the open action (late DELETE after a verified cancel); this is the proof requested by the Orion addendum | PG36-16, E23-09, U36-06 |
| M13 | "Retry now" resets `attempts` to 0 or gives 1 attempt instead of a fresh cycle of 6 | PG25-07, PG25-11, U25-06 |
| M14 | 401 does not refund the attempt (`cycleStartAttempts` not incremented) | PG25-11, PG25-14, U25-07 |
| M15 | Payload merge replaces the object instead of spreading it | PG25-12 (keys survive) |
| M16 | `markRedemptionUnknown` again moves `processing` tasks without a lease guard | PG25-06, U25-13 |
| M17 | Count `resolved_manual` in `blockingOperations` | PG26-05, U26-06 |
| M18 | `confirmRewardOpen` goes back to `tx.outbox.create` for `reward.delete` (F18) | PG36-09 (`P2002`) |
| M19 | Overwrite an unexpected `reward.delete` row instead of failing closed | PG36-09b |
| M20 | Channel Points deletion uses `panel.queue.delete.done` / `.pending` text | K23-08 (R1) |
| M21 | "Cancel deletion" visible from the `remoteSyncStatus` heuristic instead of the server flag | K23-04, U36-07, U26-06 (R2) |
| M22 | Map `already_deleted` from the 200 status instead of the 409 code | U23-08 (R6) |

Total: **22 mutations** (10 + 12). Each is recorded in the `@qa` gate with the failing test name and the revert (`git diff` empty after revert). Mutations are applied only in a throwaway copy under `.local/qa-mutations/` or by an in-place edit that is reverted before the next step; no mutation is ever committed.

## 8. UX requirements R1-R8, i18n coverage and repetition

### 8.1 R1-R8: how each is verified (automatic vs human)

| R | Automatic evidence (`@qa` can claim) | Needs a human or another validation (must NOT be claimed from the automatic evidence) |
|---|---|---|
| R1 | K23-08 plus M20; `L23-02` keys exist | Whether the type-specific wording is understood (reading test with streamers) |
| R2 | K23-04, U36-07, U26-06, M21 | none beyond the automatic proof |
| R3 | K23-06 (attribute and fallback); E23-01 and E23-03 (computed `document.activeElement` in Chromium after a full document load) | Order of the focus announcement and the status announcement in NVDA, JAWS, VoiceOver, TalkBack (assistive technology) |
| R4 | Document check by `@qa`: story/AC 1 and 11 wording acknowledged by `@po` (two stable live elements); K23-01 | `@po` acknowledgment itself is a documentary act, not a test |
| R5 | K23-05, E23-05/E23-06 (title, buttons, order, ids) | Look of the dialog, focus ring visibility, double-negative perception |
| R6 | U23-08, M22 | none beyond the automatic proof |
| R7 | K23-09, L23-01 (plural keys including pt-BR `many`) | Naturalness of es/pt-BR plural phrasing (human reading) |
| R8 | C23-02 (declared size and arithmetic contrast); `@qa` may also compute the contrast from Chromium computed styles in E23-02 and label it "computed-style contrast" | Contrast on real rendered pixels, 320 px / 400 percent zoom reflow, `position: sticky` visibility when focus lands far down the list, dark-surface appearance: **visual validation, not done** |

**Not claimable without human validation:** assistive-technology behavior (whether a message written into a region that was empty at document load is announced, and the interplay with the focused title); real-pixel contrast and reflow; the sticky region; the readability of "do not come back" and "the reward stays paused until you show and open it"; es phrasing. The gate records these as "NOT DONE" and the UX score 9.1 stays "static review only" (plan section 0).

### 8.2 i18n coverage

L23-01..L23-05 plus the existing `validate:localization`, `localization-parity` and `panel-catalog-placeholders` tests. Every visible string of FT-25, FT-26, FT-36 and FT-23 exists in en, es and pt-BR with the same placeholders (`{title}`, `{count}`, `{id}`); plural forms `.one/.many/.other` (pt-BR needs `.many`, as `panel.reconciliation.complete.*` already does); no API free text is rendered; the closed code lists have one key per code. `@qa` does not judge es/pt-BR phrasing quality (a human reading item).

### 8.3 Repetition for tests with a history of instability

Chromium and Docker tests have failed intermittently before (TS-15, M-2 of gate 30). Rule for the gate: **every Chromium E2E script runs 3 times** (`queue-lifecycle`, `queue-outcome`, plus any script the `@dev` touches) and must pass 3/3; `compose-runtime` is run once as regression and its queue-deletion test 3 times; the two race tests (PG25-01, PG36-04) run 50 barrier rounds each and the whole PostgreSQL file runs 3 times. A single failure in the repetitions is a finding, not a retry.

## 9. Risks and what stays unproven

| # | Risk | Mitigation / owner |
|---|---|---|
| R-1 | **Shared files across slices:** `apps/api/src/persistence/queue-repository.mjs` is edited by FT-25, FT-26 and FT-36, and `tests/unit/queue-routes.test.js`, `tests/integration/queue-repository.test.js` by several. Four atomic commits **by pathspec alone are impossible** on those files. | `@dev` saves a cumulative patch at each checkpoint (`git diff > .local/ops22/cp-N.patch`, untracked); `@devops` builds the four commits by applying `git apply --cached` of the differences between consecutive checkpoint patches. `@po`/`@devops` to confirm. |
| R-2 | The plan says 25 new keys; `panel.queue.confirm.delete.one` is listed as "amended" but does not exist: 26 keys. | Asserted by L23-01; `@ux-design-expert` may correct the plan. |
| R-3 | `getReward` has no bounded server timeout (architect residual risk, FT-44/OPS-21): a hanging read keeps `cancel_verification`. | Recovery = repeat cancel (PG36-07, PG36-14). Not provable by a unit test; recorded as unproven. |
| R-4 | OPS-21 route class `terminal_unknown` is not enforced in code yet; a 5xx is not stored, so a retry re-executes. | Safe because begin is re-entrant and confirm uses CAS (PG36-07, U36-08). |
| R-5 | Test volume and time (108 tests, 2 PostgreSQL files with 50-round races, 3 Chromium runs). | One PostgreSQL container per file via the existing helper; TS-07/TS-11 (measure first) is out of scope here. |
| R-6 | A planned test list can drift when `@dev` finds a case: IDs are contracts, counts are the plan baseline. | The `@qa` gate reconciles planned vs delivered and lists any difference as a finding. |
| R-7 | Docker and Chromium on this machine are contended (timings vary). | Timings are never an assertion; barriers, not sleeps. |

**Stays WITHOUT proof after this package, whatever the result:** live Twitch (AC 19 / OW-16: raw Helix `status`, Delete Custom Reward with a pending redemption, a redemption on a paused reward, the HTTP result of reading a redemption); native OBS/CEF; Windows and macOS (no result claimed); assistive technology and visual validation (section 8.1); eventual consistency of Helix after a DELETE that errored (architect residual risk); server-side Twurple read timeout; the reading test with streamers.

## 10. Single-gate scheme

**Order (one `@dev` at a time, never in parallel: same files):** G1 FT-25, G2 FT-26, G3 FT-36, G4 FT-23 + catalogs. FT-26 needs the FT-25 `retry`/blocked behavior, FT-36 needs the FT-26 projection, FT-23 needs the FT-36 contract and the UX plan (>= 9.0, delivered).

| Step | Slice | `@dev` checkpoint (evidence recorded in the story, not a commit) | Tests that must be Green at the checkpoint |
|---|---|---|---|
| CP-0 | none | open items settled, `@data-engineer` confirmation, UX plan, this plan | none |
| CP-1 | FT-25 | Red output then Green; patch `cp-1.patch` | U25-*, C25-*, PG25-* on isolated PostgreSQL |
| CP-2 | FT-26 | Red then Green; `cp-2.patch` | U26-*, C26-*, PG26-* plus CP-1 tests |
| CP-3 | FT-36 | Red then Green; `cp-3.patch` | U36-*, PG36-* plus the two existing fixtures plus CP-1/2 |
| CP-4 | FT-23 | Red then Green; `cp-4.patch` | U23-*, K23-*, L23-*, C23-*, E23-* (3 Chromium runs) plus all earlier |
| Gate | all | **one** `@qa` gate (independent re-run) | everything below |

**The single `@qa` gate runs, in this order:** `git diff --check`; `npm run lint`; `npm run typecheck` and `typecheck:api/infra/web`; `npm run validate:localization`, `validate:version`, `validate:port-denylist`; `npm run review:static` (OpenGrep); `npx vitest run tests/unit` ; `npx vitest run tests/integration` (Docker; 3 runs of the PostgreSQL files); full `npm test`; `compose-runtime` regression; the Chromium E2E scripts 3x each; the 22 mutations (section 7); the R1-R8 table (section 8.1) with the NOT DONE list; the secret scan (`git log origin/main..HEAD --format=%B | grep -c 'claude.ai/'` = 0). Verdict PASS/CONCERNS/FAIL/WAIVED with a score, and the list of ready groups.

**Commit groups for `@devops` (four atomic commits, in this order, each revertible alone).** Pathspecs are by slice; files marked (shared) need the checkpoint-patch method of R-1:

- **G1 FT-25:** `apps/api/src/outbox/financial-worker.mjs`, `apps/api/src/twitch/reconciliation.mjs`, `apps/api/src/persistence/queue-repository.mjs` (shared), `apps/api/src/http/queue-routes.mjs` (shared), `tests/unit/financial-retry-policy.test.js`, `tests/unit/financial-outbox-worker.test.js`, `tests/unit/twitch-reconciliation.test.js`, `tests/integration/financial-retry-postgres.test.js`, plus the story File List and checklist.
- **G2 FT-26:** `apps/api/src/outbox/reward-worker.mjs`, `apps/shared/panel/queue-action-state.mjs`, `apps/api/src/persistence/queue-repository.mjs` (shared), `apps/api/src/http/queue-routes.mjs` (shared), `tests/unit/reward-outbox-worker.test.js`, `tests/unit/queue-action-state.test.js`, `tests/unit/twitch-http-error.test.js`, `tests/integration/queue-deletion-order-postgres.test.js`.
- **G3 FT-36:** `apps/api/src/domain/queue-service.mjs`, `apps/api/src/persistence/queue-repository.mjs` (shared), `apps/api/src/http/queue-routes.mjs` (shared), `tests/unit/queue-domain-service.test.js`, `tests/unit/queue-deletion-cancel-matrix.test.js`, `tests/integration/queue-deletion-cancel-postgres.test.js`, `tests/integration/qra-postgres-fixtures.test.js` (unchanged), and the shared-test hunks of `tests/unit/queue-routes.test.js` and `tests/integration/queue-repository.test.js`.
- **G4 FT-23 + catalogs:** `apps/frontend/`, `apps/shared/localization/catalogs/panel/`, `apps/shared/panel/`, `tests/unit/post-action-route.test.js`, `tests/unit/next-outcome-url.test.js`, `tests/unit/next-outcome-region.test.jsx`, `tests/unit/next-queue-lifecycle.test.js`, `tests/unit/next-queue-lifecycle-actions.test.jsx`, `tests/unit/next-queue-creation-form.test.js`, `tests/unit/next-panel-catalogs.test.js`, `tests/unit/panel-catalog-placeholders.test.js`, `tests/e2e/queue-outcome-browser-only.mjs`, `tests/e2e/queue-lifecycle-browser-only.mjs`, `package.json` (script only), and the bilingual docs/story updates of the package.

**Fallback (architect, needs the orchestrator's decision):** if the visible text is late, G1..G3 may take the same gate without G4; the UI texts of FT-25/26/36 wait with G4.

## 11. Totals

| Slice | Unit | Contract | Component | Localization | PostgreSQL | E2E | Total |
|---|---|---|---|---|---|---|---|
| FT-25 | 13 | 2 | 0 | 0 | 14 | 0 | 29 |
| FT-26 | 8 | 2 | 0 | 0 | 8 | 0 | 18 |
| FT-36 | 8 | 0 | 0 | 0 | 17 | 0 | 25 |
| FT-23 | 8 | 3 | 11 | 5 | 0 | 9 | 36 |
| **Package** | **37** | **7** | **11** | **5** | **39** | **9** | **108** |

Plus: 22 mutation proofs, 1 evidence record (`EXPLAIN`), the existing regression suites (`compose-runtime`, the two existing fixtures, `localization-parity`, `documentation-contract`), and zero live-Twitch tests.

## Change Log

- 2026-11-04 — `@qa` (Quinn): created the test plan of the OPS-22 single package. Plan only; nothing was executed. Closes the "`@qa` test plan" gate row of [po-validation](po-validation.md).
