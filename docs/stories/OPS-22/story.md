# OPS-22 — Recover the `unknown` financial state and complete queue deletion safely

[Português (pt-BR)](../../pt-BR/stories/OPS-22/story.md)

**Status:** Ready (`@po` GO 2026-10-27, see [po-validation.md](po-validation.md)). Implementation only after `@po` GO, the planning gates below, an issue created by `@devops`, and an explicit order in the OPS-15 sequence. **Issue:** #80; slice 1 FT-24 = #82 (created by `@devops`; no issue comments). Slices FT-25, FT-26 and FT-36 get their issues just-in-time (`@devops`).
**Source:** Live battery round 1, defects D-5 and D-6 ([live-battery-2026-10-26-results.md](../OPS-15/live-battery-2026-10-26-results.md)); root-cause research by `@analyst` ([redemption-sync-research.md](../OPS-15/redemption-sync-research.md), verdict SUFFICIENT); `@architect` review, section 5 and slice S-F ([panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md)); owner decisions of 2026-10-27 (below); decisions of `@architect` ([architecture-decisions.md](architecture-decisions.md), cited "ARCH §n", findings F1-F14) and `@data-engineer` ([data-review.md](data-review.md), cited "DATA §n", conditions C1-C8) of 2026-10-27; `@qa` gate of slice 1 ([qa-gate-2026-10-27.md](qa-gate-2026-10-27.md)).
**Related:** OPS-15 (Next panel migration — this story is a dependency of the cutover, owner decision 2026-10-27); FND-3 (durable outbox and financial recovery); FND-9 (queue/reward lifecycle); OPS-21 (panel API contract — idempotency of any new mutation); OPS-20 (refund eligibility — later, see risks); OPS-23 (real-time panel — independent, shares no write set except where noted); **issue [#74](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/74) (diagnose reconciliation and make Twitch operations actionable), incorporated into this story on 2026-10-27 as a sub-issue of #80 (it left #69) and with no story of its own**.
**Coordination required:** `$aiox-po` (validation), `$aiox-architect` (state machine and deletion order), `$aiox-data-engineer` (persistence of the retry counter and every migration), `$aiox-analyst` (live confirmation plan, see gates), independent `$aiox-qa`, `$aiox-devops` (issue). `$aiox-ux-design-expert`: no gate of its own for this story; its new visible texts join the FT-23 UX plan (see "UX note").

## Problem

In the live session of 2026-10-27 the owner redeemed a reward-backed queue and found that the financial path does not close:

- **D-5 — `redemption.fulfill` stuck in `unknown`.** Starting service created the outbox task `redemption.fulfill`, which went to `unknown` / `remote_state_unavailable` after one attempt; the redemption stayed `UNFULFILLED` on Twitch. Retry in Operations made attempt 2 with the same result (consistent failure).
- **Most likely root cause (confidence ~90%, VERIFIED in source, not yet by a live log):** `helix-adapter.mjs` reads the status with `value.isFulfilled`, then `value.isCanceled`, then `value.status`. In `@twurple/api` 8.2.0 the class `HelixCustomRewardRedemption` has no `status` getter, so an `UNFULFILLED` redemption (both booleans false) maps to `UNKNOWN`, which the worker records as `unknown`. The EventSub event class does have `status`, which is why the redemption arrives but the Helix check fails. Tests missed it because the fakes are plain objects or strings, never the real class (research, TL;DR).
- **Collateral defects of the same area (VERIFIED in code):** (a) `listUnfulfilledRedemptions` also yields `UNKNOWN`, so reconciliation never imports missed redemptions and logs nothing; (b) every `error.status` check misses Twurple errors, which expose `statusCode`, so real 401/403/404 responses are treated as transient and a real 404 never reaches the not-found branch.
- **`unknown` is terminal.** `claimNext` only claims `pending`/`retry`; no retry, backoff or re-check exists after `unknown` (architect review, section 5).
- **Queue deletion is blocked forever.** Deleting the queue promised cancellation in the panel dialog, but no cancel was created; `reward.delete` turned `unknown` (`queue_deletion_financial_conflict`) because of the unknown redemption, and "Sync now" did not clear it. Twitch's dashboard refused to delete the reward while one redemption was pending; the owner cleaned up by hand. The documented Delete Custom Reward API instead turns a still-`UNFULFILLED` redemption into `FULFILLED` (points kept, not refunded), which is why the order of operations matters (research, Q3).
- **D-6 — `/health` `twitch_integration: degraded`** from stream start with no explanatory log line. The exact trigger is UNVERIFIED; the reconciliation `issues` array is only published in the status object, not logged.

## Owner decisions (2026-10-27)

1. Two separate stories, both dependencies of the OPS-15 cutover: this one (financial recovery and queue deletion) and OPS-23 (real-time panel and shared state).
2. State `unknown`: up to **6 attempts** with a **growing wait** and **read-only re-verification**; afterwards **manual resolution, audited, in Operations**. Never confirm without a positive remote read.
3. Deleting a queue ends with a message and an automatic redirect. That message/redirect belongs to the OPS-15 navigation slice (FT-23); this story supplies the states it needs (deleted, deletion pending, deletion blocked).
4. **OD-22-1 (decided, via Orion):** no separate UX gate for OPS-22; the new visible texts of FT-25, FT-26 and FT-36 join the FT-23 `@ux-design-expert` plan (score >= 9.0) and are approved there before the UI part of each slice ships. The API contract is code-only (`deletionState`, counts, `blockReason` codes), so the panel needs no server free text.
5. **OD-22-2 (decided, via Orion): "cancel deletion" is IN scope** as slice 4 (FT-36), overruling the earlier `@po` recommendation to leave it out. It is allowed only while the deletion is pending or blocked, never after it completed.
6. **Manual "retry now" opens a fresh cycle of 6 attempts** (decided by `@architect` and the owner; ARCH §1). The persistence mechanism is still `@data-engineer`'s (see "Open items", item 2).
7. **OD-22-3 and OW-16 — RESOLVED (owner, 2026-10-27):** OPS-22 may reach Done without the live check; AC 19 is a separate owner acceptance; OW-16 (live check) is authorized, with the live run automated after FT-25/FT-26.
8. **Issue #74 incorporated (owner, 2026-10-27):** #74 became a sub-issue of #80 (left #69). Its diagnostic part (reconciliation `degraded` visibility and actionable operations) is covered by slice 1 / FT-24, already delivered (ACs 4-5: shared error classification and the structured reconciliation log line with issue codes and counts), and by slices 2-3 (audited manual resolution in Operations, ACs 6 onward). No new AC was needed; a panel diagnostics view stays with the OPS-15 Operations page. #74 gets no story and no slice of its own.

## Story

As the streamer operating a reward-backed queue,
I want a redemption to be confirmed or refunded on Twitch reliably, a stuck state to be retried a bounded number of times and then handed to me with a clear audited manual path, and queue deletion to settle every open redemption before the reward is removed,
so that viewers' points are never silently kept or lost, and a queue never stays stuck in `deleting`.

## Scope

**In (grouped as four independently testable slices):**

- Slice 1 — read mapping and error classification (D-5 root cause) plus diagnosable `degraded` (D-6 visibility). **DELIVERED (FT-24, see below).**
- Slice 2 — bounded retry and read-only re-verification of `unknown`, then audited manual resolution in Operations (FT-25).
- Slice 3 — queue deletion order and states (FT-26).
- Slice 4 — cancel a pending or blocked queue deletion, reopening the queue and its reward safely (FT-36; depends on FT-26).

**Known code gaps that the slices must absorb** (found by `@architect`; owner slice in parentheses):

1. `markRedemptionUnknown` (F7, `reconciliation.mjs:153,189` + `queue-repository.mjs:1407-1408`) moves `pending/retry/processing` outbox tasks to `unknown` without a lease guard: it races the worker and would kill the retry budget. It must stop touching outbox rows (it may set `redemptions.sync_status='unknown'` and audit; a real 404 in reconciliation becomes the diagnostic `redemption_history_unavailable`). **FT-25** (DATA C4).
2. Deletion blockers freeze `reward.delete` (F8, `reward-worker.mjs:288-301`, `queue-repository.mjs:1728-1739`): blockers turn it into terminal `unknown('queue_deletion_financial_conflict')`. It must go to `retry` (`queue_deletion_blocked_by_review`). **FT-26** (AC 14).
3. Manual resolution never unblocks deletion (F9, `queue-repository.mjs:1741-1780, 2247-2276`): `prepareRewardDelete` and `completeQueueDeletion` require every financial task `confirmed`. `resolved_manual` + `operator_resolved` must count as locally settled, with the Twitch re-list as the final guard. **FT-26** (AC 14; DATA C5).
4. Manual retry keeps `attempts` (F10, `retryOutboxManually`, `queue-repository.mjs:2224-2231`): once a cap exists, a manual retry would exhaust after one try. It must open a fresh cycle (AC 20). **FT-25**.
5. The reward worker's post-delete lookup (`reward-worker.mjs:316`, QA finding C-1) still checks `lookupError?.status === 404`: a real Twurple 404 becomes `unknown('queue_delete_result_unknown')` instead of "already gone" (AC 22). **FT-26**.

Already inside FT-24 (AC 1-5): the `status` getter (F1), `error.status` vs `statusCode` (F2, F3) and the direct dependencies (see "Dependencies").

**Out of scope:**

- Message, redirect and focus after deleting or creating a queue (OPS-15 slice FT-23) and any real-time update (OPS-23).
- A periodic open-ended re-verification loop for `unknown` (the architect proposed one every 15 min; the owner chose 6 bounded attempts and then manual resolution).
- Changing who is refunded (OPS-20 refund eligibility) or any product refund rule.
- Fixing the root cause of D-6 beyond making it diagnosable; the fix follows the evidence.
- Twitch dashboard behavior (a UI, not the API) and any claim about live Twitch before the owner-gated live check (OW-16).
- Migration of the disposable dev database or the queue left in `deleting` in it (dev DB is disposable).
- Undoing a deletion that already completed (`deleted`) and bringing back redemptions that deletion already canceled (refunded): the refund stays final.
- Converting the touched files to TypeScript (OPS-24 starts after OPS-22; no conversion mixed with behavior change).
- Version bump, commit, push, PR, release, cutover, vanilla panel removal.

## Acceptance criteria

Evidence follows the project rules: fixtures/mocks, unit tests, isolated PostgreSQL (real migrations), real browser and live Twitch are recorded as separate classes. Every behavior starts with a failing test (Red-first). ACs 20-22 were added on 2026-10-27 and are numbered after AC 19 to keep the existing references stable; each sits in the slice it belongs to.

### Slice 1 — Read mapping, error classification, diagnosable `degraded` (DELIVERED)

**Delivery record:** FT-24 (#82) delivered, commit `95c15d4`; `@qa` gate [qa-gate-2026-10-27.md](qa-gate-2026-10-27.md) = **CONCERNS 8.6/10, 0 blocking issues**. **ACs 1-5 are met** (class: unit tests with real Twurple instances plus PostgreSQL integration for the repository; no live Twitch). The one gate finding that needs follow-up (C-1, reward-worker 404) is owned by FT-26 (AC 22).

1. **Given** a real `HelixCustomRewardRedemption` instance built from raw Helix JSON with `status` `UNFULFILLED`, `FULFILLED` or `CANCELED`, **when** the adapter reads its status, **then** it returns that same status and never `UNKNOWN`. The contract test uses real Twurple class instances, not plain objects (research, "Q5"). It fails today for `UNFULFILLED`.
2. **Given** `listUnfulfilledRedemptions` returns real class instances, **when** reconciliation runs, **then** each item carries its real status and `onRedemptionAdd` imports the redemption missed by EventSub.
3. **Given** an unrecognized status, **when** the worker classifies it, **then** the result is still `unknown` and is never treated as confirmation (invariant "unknown never becomes confirmation" is preserved).
4. **Given** a Twurple `HttpStatusCodeError` with `statusCode` 401, 403, 404, 429 or 5xx, **when** the worker or the reconciler classifies it, **then** one shared function reads `error.statusCode ?? error.status` and 401 goes to `blocked_auth`, 404 to the not-found branch, and 5xx is transient; a 429 that escapes Twurple is transient: it follows the schedule and honors a retry delay only if the caller supplies it (delivered as `retryAfterSeconds`; Twurple's error has no such field, F6). Existing tests that use `{ status }` keep passing. The same function replaces the status read of the eligibility check, and the adapter reads the raw Helix status with `getRawData`, returning `UNKNOWN` when it contradicts the booleans (ARCH §4.1). (The reward worker's own status reads move to the same function in AC 22.)
5. **Given** a reconciliation that ends `partial` or fails, **when** it publishes `degraded`, **then** a structured log line records the issue codes and counts and the `reason`, with no redemption body, user id/login, tokens, headers or secrets, so `degraded` is explainable (D-6 visibility; research Q4/Q5). A unit test asserts the exact key set of the line (delivered event `twitch_reconciliation_degraded`; its final key set is an open item, see "Open items", item 5).

### Slice 2 — Bounded retry, read-only re-verification, audited manual resolution (FT-25)

6. **Given** a financial task whose remote read is non-conclusive (unrecognized status or transient read failure), **when** the worker handles it, **then** it reschedules up to **6 attempts in total** per the policy fixed by `@architect` (ARCH §1): 6 attempts counting the first; wait after attempt *n* = `min(60 min, 60 s x 4^(n-1))` (nominal 1, 4, 16, 60, 60 min), multiplicative jitter x0.8 to x1.2 from an injected `random`; constants exported from one pure policy module, no environment variable; `outbox.attempts` is the counter (incremented at claim, so a lease-expiry reclaim consumes one attempt); the sixth attempt ends about 2 h 21 min after the first (1 h 53 min to 2 h 49 min with jitter). Classification: a read returning `UNKNOWN`, 5xx, network error, timeout and **404 on the read** are non-conclusive and consume the budget; 401 never consumes it (`unknown` + `authorization_required`, re-armed after re-authorization); 403 and other 4xx are permanent (`failed`); 404 on the **write** means re-read. Every re-verification is a **read-only** `getRedemptionStatus`; a write is attempted only through the normal task flow when the read positively shows `UNFULFILLED`.
7. **Given** a re-verification read shows the expected final state already applied, **when** it is processed, **then** the task is confirmed from that positive remote read; if it shows the opposite final state, the existing `conflict` path applies. If a guarded outcome write updates 0 rows (the redemption was confirmed externally by EventSub or reconciliation), the worker treats it as `lease_lost`, not as an error; proven on PostgreSQL (ARCH §3, DATA test 2).
8. **Given** the sixth attempt is non-conclusive, **when** it ends, **then** the task becomes terminal `unknown` ("needs review"), no further automatic attempt is claimed, and the health projection distinguishes retryable items (`degraded`) from terminal ones (`needs_review`) (architect review, 5.5). No new outbox status is created: the terminal state is `unknown` with a reason code (`retry_exhausted` provisionally, see "Open items", item 1); health is derived (`retry` with a non-conclusive reason class is `degraded`; `unknown`, `conflict` and `failed` are `needs_review`).
9. **Given** any sequence of failed or exhausted reads, **when** tests inspect the stored state, **then** no outbox task is `confirmed` and no redemption is marked fulfilled or canceled locally without a positive remote read (PostgreSQL assertion, not only a mock).
10. **Given** each attempt, **when** it is logged, **then** the line is `{ event: 'financial.attempt', operationType, outboxId, attempt, httpStatus, twitchErrorCode (<= 64), nextAttemptAt, outcome }` and nothing from the redemption, the viewer, tokens or headers; `twitchErrorCode` is our enumerated code, never the Helix message or body, and `error.message` is never logged (ARCH §4.3). A unit test asserts the exact key set.
11. **Given** a task in terminal `unknown`, **when** the operator opens Operations, **then** the item shows its blocking effect (for a queue deletion: how many operations block it) and offers the existing audited actions: retry now, and "I verified on Twitch" manual resolution. **When** the operator resolves it manually, **then** the audit records actor, timestamp and reason with `remoteConfirmed: false`, the state is `operator_resolved`, and it is never automatic (FND-3 behavior preserved).
12. **Given** `@data-engineer` decides persistence, **when** the retry counter, `unknownSince` and the reason class are stored, **then** they use the existing `attempts`/`lastError`/`nextAttemptAt`/`payload` columns if they suffice; otherwise one additive, reversible migration owned by `@data-engineer`, proven on isolated PostgreSQL with real migrations. **Answer of `@data-engineer` (data-review, 2026-10-27): no migration.** `attempts`, `lastError`, `nextAttemptAt` and `payload` (`firstNonConclusiveAt` = `unknownSince`, `reasonClass`, cycle base) suffice; `FINANCIAL_MAX_ATTEMPTS = 6` is a code constant; no new outbox status (`outbox_status_check` would need a migration). Every new transition is one lease-guarded transaction updating `outbox` + `redemptions.sync_status` + `audit_logs` (C2). Legacy `unknown` rows are not backfilled. If a later decision needs DDL, it returns to `@data-engineer` (C8).
20. **Given** a task in `unknown`, `conflict` or `failed`, **when** the operator uses "retry now", **then** it goes to `pending` with a **fresh cycle of 6 attempts** (another 6 reads, not 1), the audit records the actor and the previous attempt count, and the task is never confirmed without a positive remote read. (Persistence and audit event name: `@data-engineer`, "Open items", item 2.)

### Slice 3 — Queue deletion order and states (FT-26)

13. **Given** a queue with open (`UNFULFILLED`) redemptions is deleted, **when** the deletion runs, **then** the order is: (a) pause the reward; (b) cancel (refund) each open redemption, creating one idempotent `redemption.cancel` task per redemption, and confirm each by a remote read; (c) re-list to confirm zero `UNFULFILLED`; (d) delete the reward; (e) a 404 on delete means "already gone". "Open redemption" means `UNFULFILLED` **with no financial task in flight**. A redemption whose `redemption.fulfill` (service already started) is pending, retrying or `unknown` is governed by AC 14 (it blocks deletion) and is **never** canceled by the deletion flow, so a served viewer is not refunded by mistake. An existing `redemption.fulfill` is kept (`queue-repository.mjs:1704-1708`). [AUTO-DECISION] cancel (not fulfill) → it is what the panel dialog already promises and what the live run expected (reason: the API's implicit FULFILLED-on-delete would charge viewers without serving them).
14. **Given** a financial task of the queue is `unknown`, `conflict`, `failed` or still retrying, **when** deletion is requested, **then** the reward is **not** deleted and `reward.delete` goes to `retry` (`queue_deletion_blocked_by_review`, re-check every 5 min, no attempt budget), never to `unknown` because of financial blockers (nothing was sent to Twitch); the queue stays `deleting` with the derived state `blocked` (AC 15) and a `blockingOperations` count that links to Operations. **Resumption:** (a) when the blocker is confirmed by a positive remote read, the same transaction sets that queue's `reward.delete` task to `nextAttemptAt = now`; (b) after audited manual resolution (`resolved_manual` + `operator_resolved`) the task counts as **locally settled**, deletion resumes, and the final guard is the Twitch re-list (AC 13 step c): `reward.delete` is issued only when no redemption of the reward is `UNFULFILLED` by a remote read taken **after** the resolution. If one still is, the cancel task is re-armed to `pending` with a fresh cycle of 6 attempts, the audit records `financial.manual_resolution_contradicted`, and the reward is not deleted. A manual resolution alone never unblocks `reward.delete` and never writes `remoteStatus`. Deletion never freezes without a visible reason.
15. **Given** the deletion completes, **when** `reward.delete` is confirmed or the reward is already gone, **then** the queue becomes `deleted`; the API projection exposes distinct states (deleted, deletion pending, deletion blocked) that the panel message in FT-23 can use without promising success on a pending deletion.
16. **Given** an unauthorized or revoked token (401) during deletion, **when** it occurs, **then** the deletion stays blocked with the auth state visible and re-arms after re-authorization (architect review, 5.1).
17. **Given** the deletion flow exercised on isolated PostgreSQL with real migrations, **when** a redemption sits in each state (open, unknown, already canceled, already fulfilled), **then** the final queue and outbox states match ACs 13-15 and no `reward.delete` is issued while an unaccounted `UNFULFILLED` redemption remains.
18. **Given** the new cancel and deletion actions are panel mutations, **when** they are added, **then** they follow the OPS-21 idempotency contract (start as `terminal_unknown`, promoted only with PostgreSQL proof) and their non-2xx responses carry an enumerated `code`.
22. **Given** the reward worker looks up the reward after a delete (`reward-worker.mjs:316`) and reads its own status (`reward-worker.mjs:5-8`), **when** Twurple returns a real `HttpStatusCodeError` 404, **then** the worker uses the shared function (`twitchHttpError`, `statusCode ?? status`, QA finding C-1) and treats the 404 as "already gone" (AC 13 step e), never as `unknown('queue_delete_result_unknown')`; the local `httpStatus()` that prefers `status` over `statusCode` is removed. Proven with the real-instance helper (`tests/helpers/twurple-real-instances.mjs`) and a Red-first test.

### Slice 4 — Cancel a pending or blocked deletion (FT-36, depends on FT-26)

21. **Given** a queue in `deleting` whose deletion is **pending or blocked** (AC 15 states), **when** the operator cancels the deletion, **then** the queue is reopened and its reward is reopened safely (the reward pause is reverted by a verified write, never assumed), the pending `reward.delete` and pause tasks are canceled with the lease guard, and the audit records actor, timestamp and previous state. **Given** redemptions that deletion already canceled (refunded), **then** they do **not** come back: the refund stays final and the reopened queue starts without them. **Given** a deletion already `deleted` (or a `reward.delete` already confirmed), **then** cancel is refused with an enumerated `code` and nothing changes. **Given** a `reward.delete` that is claimed, in flight, `retry` or `unknown`, **when** the operator asks to cancel, **then** the cancel is refused with an enumerated `code` (or waits for a positive remote read) and the queue is never reopened while the reward's existence on Twitch is unproven. **Given** the pause revert cannot be verified by a read, **then** the queue stays in a visible blocked state with an operator action, never reopened as if the reward were active. `@architect` may refine the mechanism; the "no assumption without a positive remote read" rule is not negotiable. **Given** the action is a panel mutation, **then** it follows the OPS-21 idempotency contract (start as `terminal_unknown`, promoted only with PostgreSQL proof) and returns an enumerated `code` on non-2xx. The destructive confirmation and the UX text of this action belong to the FT-23 UX plan (score >= 9.0, see "UX note"). Evidence: PostgreSQL with real migrations for each state (pending, blocked, in-flight `reward.delete`, deleted); unit for the transitions; browser E2E with fixtures once the text is approved. The state redesign (`deleting` -> reopened, race with an in-flight `reward.delete`/DELETE call, treatment of cancel tasks already `confirmed`/`pending`) is `@architect`'s; the starting point is `beginQueueDeletionCancellation` (`queue-repository.mjs:838-865`).

### Live confirmation (owner-gated)

19. **Given** the owner authorizes a live check (OW-16), **when** it runs on the test channel, **then** the evidence records the analyst's four checks: raw Helix `status` and adapter value for an `UNFULFILLED` redemption; the `issues[].code` and degraded `reason` of a reconciliation; Delete Custom Reward with one pending redemption followed by a read with `status=FULFILLED`; and the HTTP result of reading a redemption by `id` right after the EventSub event. Nothing live is claimed before it runs, and the result is recorded as a separate evidence class. The residual window between the re-list and the DELETE (mitigated by the verified pause) and the Twitch dashboard refusing to delete are PARTIAL and are checked here (ARCH §5.3).

## Dependencies

- **Depends on:** `@po` GO and issue (done); `@data-engineer` answer on persistence (AC 12, done: no migration); FND-3 outbox and lease semantics; OPS-21 contract for the new mutations (AC 18, AC 21); owner authorization and a real redemption for AC 19. **`@twurple/common` as a direct runtime dependency (for `getRawData`) and `@twurple/api-call` as a devDependency (tests build real `HttpStatusCodeError`), both pinned at 8.2.0 in lockstep with `@twurple/api`; both are transitive today and not re-exported by `@twurple/api` (F14); the lockfile change goes through `@dev` -> `@qa` -> `@devops`** (done in FT-24).
- **Slice order:** FT-24 (delivered) -> FT-25 -> FT-26 -> FT-36.
- **Is a dependency of:** OPS-15 cutover (FT-10, OW-11); FT-23 (needs the deletion states of AC 15 and hosts the UX text of FT-25, FT-26 and FT-36).
- **Write-set clash:** touches `financial-worker.mjs`, `reward-worker.mjs`, `helix-adapter.mjs`, `reconciliation.mjs` and `queue-repository.mjs`, plus `apps/api/src/twitch/http-error.mjs` (shared `twitchHttpError`, delivered by FT-24) and the test helper `tests/helpers/twurple-real-instances.mjs` (the existing name is kept; ARCH §4.4 had proposed `twurple-real.js`); serialize with OPS-21 slices 4-5 (same repository file) and do not run two `@dev` agents on them in parallel. FT-36 shares the repository and worker files with FT-26.
- **Interplay with OPS-20:** when refund eligibility ships, the cancel-at-deletion rule (AC 13) must be re-checked against it.

## Risks

- **Double financial action:** a retry that writes when the remote state already changed. Mitigation: read before write, read-only re-verification (AC 6-7), PostgreSQL proof.
- **Charging viewers without service** if the reward is deleted with open redemptions. Mitigation: AC 13-14, 17.
- **Root cause only ~90% sure:** another cause may sit behind AC 1 (for example the redemption belongs to a different reward or Client ID, or a consistency delay, UNVERIFIED). Mitigation: contract test with real instances now, live check (AC 19) later; the 6-attempt policy still protects against the other causes.
- **Retry cap vs architect proposal:** the architect suggested 8 attempts / 24 h; the owner chose 6. The wait values are fixed in ARCH §1 (1, 4, 16, 60, 60 min nominal, cap 1 h).
- **Hidden Twitch behavior:** dashboard and API differ on deleting with pending redemptions; only the documented API behavior is designed for.
- **Test blindness:** the original defect passed because fakes were plain objects. Contract tests must use real Twurple classes.
- **Twurple bump:** a bump must move `@twurple/api`, `@twurple/common` and `@twurple/api-call` together and triggers the research REFRESH; the real-instance helper is the single cast point and breaks on purpose.
- **Manual resolution vs remote truth:** an operator may resolve while Twitch still shows `UNFULFILLED`; the AC 13 step c guard prevents deletion and re-arms the refund (ARCH §5.2).
- **Reverse transition (FT-36):** canceling a deletion races with an in-flight `reward.delete`/DELETE call and with cancel tasks already `confirmed` or `pending`; the reward pause must be reverted by a verified write. Mitigation: `@architect` redesign and `@data-engineer` re-evaluation before FT-36 starts, PostgreSQL proof per state.
- **External confirmation without lease token** (F11): safe only if a 0-row guarded update is treated as `lease_lost` (AC 7), proven on PostgreSQL.

## Complexity (estimate by `@sm`, **to be re-evaluated by `@architect`**)

Original estimate with three slices: scope 4, integration 4, infrastructure 3, knowledge 3, risk 5 = **19 → COMPLEX (GG)**, confirmed by `@architect` on 2026-10-27 (ARCH §6) for those three slices. The owner decision of 2026-10-27 added a fourth slice (FT-36) with a new reverse transition (`deleting` -> reopened), which may raise risk and scope; **the score is to be re-evaluated by `@architect` and recorded here** (until then: "to re-evaluate"). Priority **P1** (blocks queue deletion and a correct redemption flow). Difficulty **GG** overall; slice 1 **P** (delivered), slice 2 **G**, slice 3 **G**, slice 4 (FT-36) **G** (inventory estimate, `@architect` to confirm).

## Business value

Viewers' channel points are reliably settled; a failed Twitch read no longer silently freezes a queue; the operator gets a bounded, auditable way out instead of a hand cleanup on the Twitch dashboard, and can back out of a deletion that has not completed. Removes a cutover blocker.

## Test plan (test-first)

1. **Unit (Vitest):** adapter contract with real Twurple class instances (AC 1-2); error classification by `statusCode` (AC 4, AC 22); worker attempts, backoff and read-only re-verification with fake timers and an injected `random` (AC 6-8): each wait stays within the jitter bounds (x0.8 to x1.2) of its nominal value and `next_attempt_at` is **non-decreasing up to the 60 min cap** (the 4th and 5th waits are both nominally 60 min, so "strictly increasing" is impossible and is not asserted; this replaces the wording of DATA test 3); log shape with the exact key set of the reconciliation and attempt lines (AC 5, 10); transitions of the cancel-deletion action (AC 21).
2. **PostgreSQL (disposable instance, real migrations, never SQLite or Prisma mocks):** the 12 tests of DATA §4 (claim race, stale lease, six attempts, no confirmation without a positive read, positive re-verification in one transaction, reconciliation vs live lease, manual retry, manual resolution, deletion resume, idempotent cancel, legacy rows, audit allowlist); attempt counter and `nextAttemptAt` persisted across lease expiry; no `confirmed` without a positive read (AC 9); manual resolution audit (AC 11); manual retry opens a fresh cycle of 6 (AC 20); deletion order and states for each redemption state (AC 13-17); cancel of deletion for each state — pending, blocked, in-flight `reward.delete`, deleted (AC 21); migration, if any (AC 12).
3. **Browser-only E2E (Chromium, fixtures, no Twitch):** Operations shows the blocking item and the audited actions; queue shows deletion pending/blocked with the Operations link; deletion resumes after resolution; cancel deletion with its destructive confirmation (only for already approved text).
4. **Live Twitch:** only AC 19, owner-gated, recorded separately.
5. **Gates before closing:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static` (OpenGrep only; record command, result and accepted findings). `@qa` runs the final independent gates and issues the verdict before `@devops` commits.

## Planning gates before implementation

- [x] `@analyst` research: root cause and Twitch behavior ([redemption-sync-research.md](../OPS-15/redemption-sync-research.md), 2026-10-26; SUFFICIENT; the live checks are confirmation, not more research).
- [x] `@architect` review and recovery policy proposal ([panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md), 2026-10-26, slice S-F).
- [x] Owner decisions recorded (2026-10-27).
- [x] `@po` validation (10 points) and GO (9.5/10, 2026-10-27, [po-validation.md](po-validation.md)).
- [x] `@architect` confirmation of wait values, state names, cancel-at-deletion rule, interplay with OPS-21 and OPS-20 (closed 2026-10-27, [architecture-decisions.md](architecture-decisions.md)); covers slices FT-24, FT-25 and FT-26 only.
- [x] `@data-engineer` answer on persistence (AC 12) — GO with conditions C1-C8, no migration (closed 2026-10-27, [data-review.md](data-review.md)); covers FT-24 to FT-26 only.
- [x] `@devops` creates the GitHub issue: parent #80, FT-24 = #82 (no issue comments). FT-25, FT-26 and FT-36 issues are created just-in-time.
- [ ] `@qa` test plan (PostgreSQL isolated, real Twurple instances, evidence separation).
- [ ] Owner: authorize and schedule the live check (OW-16).
- [ ] `@architect` re-review for FT-36 (states, races, `confirmed`/`pending` cancel tasks) and **re-score of the OPS-22 complexity**.
- [ ] `@data-engineer` re-review of FT-36 transitions and tests (expected still no DDL), and update of DATA C3 (fresh cycle of 6) plus the settlement of the "Open items" below.
- [ ] `@po` re-validation of the changed scope: AC 13 and AC 14 text, new ACs 20-22, slice 4 (FT-36), and the closing of the open questions.
- [ ] `@ux-design-expert` plan of FT-23 includes the OPS-22 texts (deletion pending/blocked, blocking count, manual-resolution wording, cancel-deletion confirmation), score >= 9.0, before the UI part of FT-25, FT-26 and FT-36 ships.

## UX note

OD-22-1 (decided, 2026-10-27): OPS-22 has no UX gate of its own. The new visible strings and states ("deletion pending", "deletion blocked: N operations need review", the blocking count, the manual-resolution wording and the destructive confirmation and text of "cancel deletion") are added to the scope of the FT-23 `@ux-design-expert` plan (score >= 9.0) and approved there before the UI part of FT-25, FT-26 and FT-36 ships. The API contract is code-only, so the panel needs no server free text. FT-24 has no visible text. This story reuses the existing Operations actions and states.

## Open items (to settle before the slice that needs them)

Divergences between `@architect` and `@data-engineer` recorded on 2026-10-27; `@sm` does not decide them. Settle all before FT-25 starts.

1. **Terminal reason code — PENDING.** `retry_exhausted` (ARCH §1; used provisionally in AC 8 and the inventory) vs `attempts_exhausted` (DATA §1, §2.1, test 3). One name is needed; `@data-engineer` owns the audit catalogue (`financial.operation_attempts_exhausted`).
2. **Manual retry — PARTIALLY decided.** Decided: a manual retry opens a **fresh cycle of 6 attempts** (`@architect` + owner; AC 20). DATA C3 (default of 1 attempt per click, `[AUTO-DECISION]`) must therefore be updated by `@data-engineer`. **Pending:** persistence — reset `attempts` to 0 with `previousAttempts` in the audit (ARCH §1) vs `payload.cycleStartAttempts` with `attempts` monotonic (DATA C3); and the audit event name (`financial.operation_retried_manually` vs `financial.operation_retry_requested`).
3. **Test of `next_attempt_at` — RESOLVED.** DATA test 3 ("strictly increasing") is impossible with the 60 min cap and jitter; the test asserts the bounds of each wait and "non-decreasing up to the cap" (see Test plan, item 1). `@data-engineer` updates the wording of DATA test 3.
4. **`resolved_manual` in `blockingOperations` — PENDING.** DATA C6 lists it among the blockers shown to Operations; ARCH §5.2 and DATA C5 treat it as locally settled with the re-list as guard. Recommendation (not a decision): it does not count once the post-resolution re-list is the guard. `@architect` + `@data-engineer` confirm; needed before FT-26.
5. **Key set of the reconciliation log line — PENDING.** FT-24 delivered the event `twitch_reconciliation_degraded` with the details `trigger`, `reason`, `issueCount`, `issueCounts`, `httpStatusCounts`; ARCH §4.3 proposed `{ event: 'twitch.reconciliation', trigger, status, reason, queues, imported, issueCounts }` (codes and counts only, no `queueId`/`redemptionId`/user data). `@architect` + `@po` decide whether the delivered line stands or changes (AC 5).

## Open questions (for `@po` / `@architect` / owner)

1. "Cancel deletion": **answered by the owner (OD-22-2): in scope, slice FT-36** (AC 21).
2. Wait values and whether "6 attempts" counts the first try: **answered**, 6 in total including the first, waits per AC 6 (ARCH §1).
3. May the story reach Done on PostgreSQL and real-class evidence alone, with AC 19 as a separate owner acceptance, or must live evidence precede Done? **Answered by the owner (OD-22-3, 2026-10-27): yes, it may reach Done without the live check; OW-16 authorized.** Recommended: Done on PostgreSQL and real-class evidence; AC 19 is a separate owner acceptance, recorded.

## Definition of Done

- ACs 1-18 and 20-22 have recorded Red-first evidence by class; AC 19 is **not** required for Done (owner decision OD-22-3, 2026-10-27): it is recorded as a separate owner acceptance (live run automated after FT-25/FT-26, OW-16).
- All quality gates are green; `@qa` verdict recorded; File List and checklists updated in English and pt-BR.
- No `unknown` ever becomes a confirmation without a positive remote read.

## SM draft validation (story-draft-checklist, 2026-10-27)

1. Goal and context: clear (problem, owner decisions, relation to OPS-15). PASS.
2. Technical guidance: files, Twurple class behavior and error shape named; persistence left to `@data-engineer` by design. PASS.
3. References: point to specific sections of the research and the architect review. PASS.
4. Self-containment: root cause, edge cases (404, 401, 429, already-applied) and assumptions stated. PASS.
5. Testing: classes separated; PostgreSQL and real-class contract tests required; live check isolated. PASS.
6. Static analysis: `npm run review:static` recorded; owners of findings = `@dev`, verified by `@qa`. PASS.
- Result: ready for `@po`. No requirement was invented; items that go beyond the owner decisions come from the cited architect review and are marked as such, with open questions listed.

## File List

- `docs/stories/OPS-22/story.md` (new)
- `docs/pt-BR/stories/OPS-22/story.md` (new)
- `docs/stories.md` (index entry)
- `docs/pt-BR/stories.md` (index entry)

Implementation files will be listed here by `@dev` after the gates.

### Slice 1 — FT-24 (#82), `@dev` 2026-10-27

- `apps/api/src/twitch/http-error.mjs` (new: shared `twitchHttpError`, `statusCode ?? status` + `retryAfterSeconds`)
- `apps/api/src/twitch/helix-adapter.mjs` (redemption status from Twurple raw data via `getRawData`; eligibility probe uses the shared function)
- `apps/api/src/outbox/financial-worker.mjs` (401/403/404/429/5xx classified through the shared function)
- `apps/api/src/twitch/reconciliation.mjs` (shared function for 404; `httpStatus` on remote issues; exported `RECONCILIATION_ISSUE_CODES`)
- `apps/api/src/twitch/integration.mjs` (structured `twitch_reconciliation_degraded` log line)
- `apps/api/src/observability/structured-logger.mjs` (safe `trigger`, `reason`, `issueCount`, `issueCounts`, `httpStatusCounts` details)
- `apps/api/src/runtime.mjs`, `apps/api/src/server.mjs` (pass `logEvent` to the integration)
- `package.json`, `package-lock.json` (`@twurple/common` 8.2.0 pinned as a direct dependency; `@twurple/api-call` 8.2.0 pinned as a dev dependency; both were already installed transitively at that version)
- `tests/helpers/twurple-real-instances.mjs` (new: the single helper that builds real Twurple instances)
- `tests/unit/twitch-redemption-contract.test.js` (new), `tests/unit/twitch-http-error.test.js` (new)
- `tests/unit/twitch-integration.test.js`, `tests/unit/structured-logger.test.js`, `tests/unit/runtime-composition.test.js` (new cases)
- `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`

## Change Log

- 2026-10-27 — `@sm` (River): story drafted from the D-5/D-6 evidence, the `@analyst` research, the `@architect` review and the owner decisions of 2026-10-27. Status Draft.
- 2026-10-27 — `@po` (Pax): `*validate-story-draft` 10 points = 9.5/10, **GO**. Issue #80 (FT-24 = #82) registered. Status Draft → Ready. Conditions and decisions in [po-validation.md](po-validation.md): "cancel deletion" stays out; cancel-at-deletion (AC 13) validated; FT-24 may start now; FT-25/FT-26 only after the `@architect` and `@data-engineer` gates; UX of the new visible text pending owner decision.
- 2026-10-27 — `@dev` (Dex): slice 1 FT-24 (#82) implemented test-first (ACs 1-5). Red: 15 new cases failed on the old code (`UNFULFILLED` read as `UNKNOWN`; real Twurple 401/403/404/429 retried as transient; no `degraded` log line) plus a missing-module failure for the shared function. Green: 136/136 in the 9 affected unit files; `tests/integration/queue-repository.test.js` 156/156 on disposable PostgreSQL; full suite 165 files / 1621 tests; lint, typecheck, `review:static` (0 findings) and `git diff --check` pass. Retry policy, deletion states and schema unchanged. Story status left as is by orchestrator instruction (slices 2-3 pending); final verdict belongs to `@qa`.
- 2026-10-27 — `@sm` (River): applied the pending edits E1-E17 ([sm-pending-edits.md](sm-pending-edits.md)) and the later owner decisions; status field **not** changed (that is `@po`). What changed: (1) Slice 1 recorded as DELIVERED — FT-24 #82, commit `95c15d4`, `@qa` gate CONCERNS 8.6/10 with 0 blocking issues, ACs 1-5 met; (2) AC 4 reworded to the delivered behavior (429 follows the schedule; retry delay only if supplied; eligibility check and `getRawData`); the reward-worker status reads and QA finding C-1 (`reward-worker.mjs:316`, real 404 = "already gone") moved to the **new AC 22** (FT-26), as the gate recommends; (3) ACs 6, 7, 8, 10, 12 completed with the ARCH §1/§3/§4.3 policy, lease-lost, no new status, log key set and the `@data-engineer` "no migration" answer (E4, E6, E7, E9, E10); (4) **new AC 20** (manual retry = fresh cycle of 6, E8), **new AC 21 / slice 4 FT-36** (cancel pending or blocked deletion, E16), numbered after AC 19 to keep references stable; (5) AC 13 clarified ("no financial task in flight", E1) and AC 14 rewritten (E2); (6) Scope: four slices, "Known code gaps" list (E11), Out list extended; (7) Dependencies, Risks and Test plan updated (E12; strictly increasing `next_attempt_at` replaced by "non-decreasing up to the cap"); (8) planning gates ticked per po-validation, architecture-decisions and data-review, new gates added for FT-36 and the `@po` re-validation (E3, E16); (9) UX note and owner decisions updated (OD-22-1 and OD-22-2 decided; OD-22-3 and OW-16 pending) (E14); (10) new section "Open items" with the four E13 divergences plus the log-key-set divergence (item 5). Complexity left as "to re-evaluate" by `@architect` (E16). **Needs `@po` acknowledgement** of the AC text changes (AC 4, 6-8, 10, 12-14, 20-22) and re-validation of the changed scope; the AC text is `@po`'s authority.
- 2026-10-27 — `@po` (Pax): QA gate 27b M-1 / L-1. AC 21 (FT-36) now carries the two additions that `@po` required in [po-validation.md](po-validation.md) (addendum, item 4): (a) cancel refused with an enumerated `code` (or waiting for a positive remote read) while `reward.delete` is claimed, in flight, `retry` or `unknown`, never reopening the queue while the reward's existence on Twitch is unproven; (b) a pause revert that cannot be verified by a read leaves the queue in a visible blocked state with an operator action. With this text in place, E16 in [sm-pending-edits.md](sm-pending-edits.md) is correctly `[x]`. Corrected two references: the shared error module is `apps/api/src/twitch/http-error.mjs` with `twitchHttpError` (delivered by FT-24), not `twitch-errors.mjs`; the `markRedemptionUnknown` calls are at `reconciliation.mjs:153,189` (were `:137,172` before FT-24). FT-36 remains NOT READY (re-validation gate still open); no status, title or other AC changed.
- 2026-10-27 — `@sm` (River): issue #74 incorporated into OPS-22 (sub-issue of #80, left #69; no story of its own; its diagnostic part is covered by slice 1 / FT-24 ACs 4-5 and slices 2-3). OD-22-3 and OW-16 recorded as resolved by the owner (Done without the live check; OW-16 authorized, live run automated after FT-25/FT-26). Status field untouched (`@po`).
- 2026-10-28 — `@sm` (River): Definition of Done aligned with OD-22-3 (`@po` validation required edit): Done does not require AC 19; AC 19 is a separate owner acceptance (OW-16). Status untouched (`@po`).
