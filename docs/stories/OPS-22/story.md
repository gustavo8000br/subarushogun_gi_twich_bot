# OPS-22 — Recover the `unknown` financial state and complete queue deletion safely

[Português (pt-BR)](../../pt-BR/stories/OPS-22/story.md)

**Status:** Ready (`@po` GO 2026-10-27, see [po-validation.md](po-validation.md)). Implementation only after `@po` GO, the planning gates below, an issue created by `@devops`, and an explicit order in the OPS-15 sequence. **Issue:** #80; slice 1 FT-24 = #82 (created by `@devops`; no issue comments).
**Source:** Live battery round 1, defects D-5 and D-6 ([live-battery-2026-10-26-results.md](../OPS-15/live-battery-2026-10-26-results.md)); root-cause research by `@analyst` ([redemption-sync-research.md](../OPS-15/redemption-sync-research.md), verdict SUFFICIENT); `@architect` review, section 5 and slice S-F ([panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md)); owner decisions of 2026-10-27 (below).
**Related:** OPS-15 (Next panel migration — this story is a dependency of the cutover, owner decision 2026-10-27); FND-3 (durable outbox and financial recovery); FND-9 (queue/reward lifecycle); OPS-21 (panel API contract — idempotency of any new mutation); OPS-20 (refund eligibility — later, see risks); OPS-23 (real-time panel — independent, shares no write set except where noted).
**Coordination required:** `$aiox-po` (validation), `$aiox-architect` (state machine and deletion order), `$aiox-data-engineer` (persistence of the retry counter and every migration), `$aiox-analyst` (live confirmation plan, see gates), independent `$aiox-qa`, `$aiox-devops` (issue). `$aiox-ux-design-expert`: not a mandatory gate for this story by owner instruction; see "UX note".

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

## Story

As the streamer operating a reward-backed queue,
I want a redemption to be confirmed or refunded on Twitch reliably, a stuck state to be retried a bounded number of times and then handed to me with a clear audited manual path, and queue deletion to settle every open redemption before the reward is removed,
so that viewers' points are never silently kept or lost, and a queue never stays stuck in `deleting`.

## Scope

**In (grouped as three independently testable slices):**

- Slice 1 — read mapping and error classification (D-5 root cause) plus diagnosable `degraded` (D-6 visibility).
- Slice 2 — bounded retry and read-only re-verification of `unknown`, then audited manual resolution in Operations.
- Slice 3 — queue deletion order and states.

**Out of scope:**

- Message, redirect and focus after deleting or creating a queue (OPS-15 slice FT-23) and any real-time update (OPS-23).
- A periodic open-ended re-verification loop for `unknown` (the architect proposed one every 15 min; the owner chose 6 bounded attempts and then manual resolution).
- Changing who is refunded (OPS-20 refund eligibility) or any product refund rule.
- Fixing the root cause of D-6 beyond making it diagnosable; the fix follows the evidence.
- Twitch dashboard behavior (a UI, not the API) and any claim about live Twitch before the owner-gated live check (OW-16).
- Migration of the disposable dev database or the queue left in `deleting` in it (dev DB is disposable).
- Version bump, commit, push, PR, release, cutover, vanilla panel removal.

## Acceptance criteria

Evidence follows the project rules: fixtures/mocks, unit tests, isolated PostgreSQL (real migrations), real browser and live Twitch are recorded as separate classes. Every behavior starts with a failing test (Red-first).

### Slice 1 — Read mapping, error classification, diagnosable `degraded`

1. **Given** a real `HelixCustomRewardRedemption` instance built from raw Helix JSON with `status` `UNFULFILLED`, `FULFILLED` or `CANCELED`, **when** the adapter reads its status, **then** it returns that same status and never `UNKNOWN`. The contract test uses real Twurple class instances, not plain objects (research, "Q5"). It fails today for `UNFULFILLED`.
2. **Given** `listUnfulfilledRedemptions` returns real class instances, **when** reconciliation runs, **then** each item carries its real status and `onRedemptionAdd` imports the redemption missed by EventSub.
3. **Given** an unrecognized status, **when** the worker classifies it, **then** the result is still `unknown` and is never treated as confirmation (invariant "unknown never becomes confirmation" is preserved).
4. **Given** a Twurple `HttpStatusCodeError` with `statusCode` 401, 403, 404, 429 or 5xx, **when** the worker or the reconciler classifies it, **then** one shared function reads `error.statusCode ?? error.status` and 401 goes to `blocked_auth`, 404 to the not-found branch, 429 honors `Retry-After`, 5xx is transient. Existing tests that use `{ status }` keep passing.
5. **Given** a reconciliation that ends `partial` or fails, **when** it publishes `degraded`, **then** a structured log line records the issue codes and counts and the `reason`, with no redemption body, user id/login, tokens, headers or secrets, so `degraded` is explainable (D-6 visibility; research Q4/Q5).

### Slice 2 — Bounded retry, read-only re-verification, audited manual resolution

6. **Given** a financial task whose remote read is non-conclusive (unrecognized status or transient read failure), **when** the worker handles it, **then** it reschedules up to **6 attempts in total** with an increasing wait using the existing exponential backoff with jitter, and every re-verification is a **read-only** `getRedemptionStatus`. A write is attempted only through the normal task flow when the read positively shows `UNFULFILLED`.
7. **Given** a re-verification read shows the expected final state already applied, **when** it is processed, **then** the task is confirmed from that positive remote read; if it shows the opposite final state, the existing `conflict` path applies.
8. **Given** the sixth attempt is non-conclusive, **when** it ends, **then** the task becomes terminal `unknown` ("needs review"), no further automatic attempt is claimed, and the health projection distinguishes retryable items (`degraded`) from terminal ones (`needs_review`) (architect review, 5.5).
9. **Given** any sequence of failed or exhausted reads, **when** tests inspect the stored state, **then** no outbox task is `confirmed` and no redemption is marked fulfilled or canceled locally without a positive remote read (PostgreSQL assertion, not only a mock).
10. **Given** each attempt, **when** it is logged, **then** the line contains only `{ operationType, outboxId, attempt, httpStatus, twitchErrorCode (<= 64), nextAttemptAt }` and nothing from the redemption, the viewer, tokens or headers.
11. **Given** a task in terminal `unknown`, **when** the operator opens Operations, **then** the item shows its blocking effect (for a queue deletion: how many operations block it) and offers the existing audited actions: retry now, and "I verified on Twitch" manual resolution. **When** the operator resolves it manually, **then** the audit records actor, timestamp and reason with `remoteConfirmed: false`, the state is `operator_resolved`, and it is never automatic (FND-3 behavior preserved).
12. **Given** `@data-engineer` decides persistence, **when** the retry counter, `unknownSince` and the reason class are stored, **then** they use the existing `attempts`/`lastError`/`nextAttemptAt`/`payload` columns if they suffice; otherwise one additive, reversible migration owned by `@data-engineer`, proven on isolated PostgreSQL with real migrations.

### Slice 3 — Queue deletion order and states

13. **Given** a queue with open (`UNFULFILLED`) redemptions is deleted, **when** the deletion runs, **then** the order is: (a) pause the reward; (b) cancel (refund) each open redemption, creating one idempotent `redemption.cancel` task per redemption, and confirm each by a remote read; (c) re-list to confirm zero `UNFULFILLED`; (d) delete the reward; (e) a 404 on delete means "already gone". [AUTO-DECISION] cancel (not fulfill) → it is what the panel dialog already promises and what the live run expected (reason: the API's implicit FULFILLED-on-delete would charge viewers without serving them).
14. **Given** a redemption is in `unknown` or still being retried, **when** the queue deletion is requested, **then** the reward is **not** deleted, the queue stays `deleting` with a "deletion pending/blocked: N operations need review" projection that links to Operations, and the deletion **resumes automatically** when the blocker is confirmed by a remote read or resolved manually (AC 11). It never freezes without a visible reason.
15. **Given** the deletion completes, **when** `reward.delete` is confirmed or the reward is already gone, **then** the queue becomes `deleted`; the API projection exposes distinct states (deleted, deletion pending, deletion blocked) that the panel message in FT-23 can use without promising success on a pending deletion.
16. **Given** an unauthorized or revoked token (401) during deletion, **when** it occurs, **then** the deletion stays blocked with the auth state visible and re-arms after re-authorization (architect review, 5.1).
17. **Given** the deletion flow exercised on isolated PostgreSQL with real migrations, **when** a redemption sits in each state (open, unknown, already canceled, already fulfilled), **then** the final queue and outbox states match ACs 13-15 and no `reward.delete` is issued while an unaccounted `UNFULFILLED` redemption remains.
18. **Given** the new cancel and deletion actions are panel mutations, **when** they are added, **then** they follow the OPS-21 idempotency contract (start as `terminal_unknown`, promoted only with PostgreSQL proof) and their non-2xx responses carry an enumerated `code`.

### Live confirmation (owner-gated)

19. **Given** the owner authorizes a live check (OW-16), **when** it runs on the test channel, **then** the evidence records the analyst's four checks: raw Helix `status` and adapter value for an `UNFULFILLED` redemption; the `issues[].code` and degraded `reason` of a reconciliation; Delete Custom Reward with one pending redemption followed by a read with `status=FULFILLED`; and the HTTP result of reading a redemption by `id` right after the EventSub event. Nothing live is claimed before it runs, and the result is recorded as a separate evidence class.

## Dependencies

- **Depends on:** `@po` GO and issue; `@data-engineer` answer on persistence (AC 12); FND-3 outbox and lease semantics; OPS-21 contract for the new mutations (AC 18); owner authorization and a real redemption for AC 19.
- **Is a dependency of:** OPS-15 cutover (FT-10, OW-11); FT-23 (needs the deletion states of AC 15).
- **Write-set clash:** touches `financial-worker.mjs`, `reward-worker.mjs`, `helix-adapter.mjs`, `reconciliation.mjs` and `queue-repository.mjs`; serialize with OPS-21 slices 4-5 (same repository file) and do not run two `@dev` agents on them in parallel.
- **Interplay with OPS-20:** when refund eligibility ships, the cancel-at-deletion rule (AC 13) must be re-checked against it.

## Risks

- **Double financial action:** a retry that writes when the remote state already changed. Mitigation: read before write, read-only re-verification (AC 6-7), PostgreSQL proof.
- **Charging viewers without service** if the reward is deleted with open redemptions. Mitigation: AC 13-14, 17.
- **Root cause only ~90% sure:** another cause may sit behind AC 1 (for example the redemption belongs to a different reward or Client ID, or a consistency delay, UNVERIFIED). Mitigation: contract test with real instances now, live check (AC 19) later; the 6-attempt policy still protects against the other causes.
- **Retry cap vs architect proposal:** the architect suggested 8 attempts / 24 h; the owner chose 6. The wait values are therefore set by `@architect` with the existing 1 h cap in mind.
- **Hidden Twitch behavior:** dashboard and API differ on deleting with pending redemptions; only the documented API behavior is designed for.
- **Test blindness:** the original defect passed because fakes were plain objects. Contract tests must use real Twurple classes.

## Complexity (estimate by `@sm`, to be confirmed by `@architect`)

Scope 4, integration 4, infrastructure 3, knowledge 3, risk 5 = **19 → COMPLEX (GG)**. Priority **P1** (blocks queue deletion and a correct redemption flow; slice 1 is P0-small and has no database or UX gate). Difficulty **GG** overall; slice 1 **P**, slice 2 **G**, slice 3 **G**.

## Business value

Viewers' channel points are reliably settled; a failed Twitch read no longer silently freezes a queue; the operator gets a bounded, auditable way out instead of a hand cleanup on the Twitch dashboard. Removes a cutover blocker.

## Test plan (test-first)

1. **Unit (Vitest):** adapter contract with real Twurple class instances (AC 1-2); error classification by `statusCode` (AC 4); worker attempts, backoff and read-only re-verification with fake timers (AC 6-8); log shape (AC 5, 10).
2. **PostgreSQL (disposable instance, real migrations, never SQLite or Prisma mocks):** attempt counter and `nextAttemptAt` persisted across lease expiry; no `confirmed` without a positive read (AC 9); manual resolution audit (AC 11); deletion order and states for each redemption state (AC 13-17); migration, if any (AC 12).
3. **Browser-only E2E (Chromium, fixtures, no Twitch):** Operations shows the blocking item and the audited actions; queue shows deletion pending/blocked with the Operations link; deletion resumes after resolution.
4. **Live Twitch:** only AC 19, owner-gated, recorded separately.
5. **Gates before closing:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static` (OpenGrep only; record command, result and accepted findings). `@qa` runs the final independent gates and issues the verdict before `@devops` commits.

## Planning gates before implementation

- [x] `@analyst` research: root cause and Twitch behavior ([redemption-sync-research.md](../OPS-15/redemption-sync-research.md), 2026-10-26; SUFFICIENT; the live checks are confirmation, not more research).
- [x] `@architect` review and recovery policy proposal ([panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md), 2026-10-26, slice S-F).
- [x] Owner decisions recorded (2026-10-27).
- [ ] `@po` validation (10 points) and GO.
- [ ] `@architect` confirmation of: wait values for the 6 attempts, state names, cancel-at-deletion rule, interplay with OPS-21 and OPS-20.
- [ ] `@data-engineer` answer on persistence of the counter, `unknownSince` and reason class (AC 12); coordinates every migration.
- [ ] `@qa` test plan (PostgreSQL isolated, real Twurple instances, evidence separation).
- [ ] `@devops` creates the GitHub issue (parent issue of this story, with its slices as sub-issues just-in-time; blocks the OPS-15 cutover as a native dependency); no issue comments.
- [ ] Owner: authorize and schedule the live check (OW-16).

## UX note

By owner instruction (2026-10-27) the mandatory `@ux-design-expert` score of at least 9.0 applies to the real-time story (OPS-23) and the navigation slice (FT-23), not to this one. This story reuses the existing Operations actions and states. If it adds or changes visible text (for example "deletion blocked: N operations need review"), `@po` must decide at validation whether the project UX rule triggers a review before that text ships; this is not decided here.

## Open questions (for `@po` / `@architect` / owner)

1. Is "cancel deletion" (architect's third operator decision) wanted? It is not in the owner decisions, so it is left out; `@po` decides.
2. Exact wait values and whether "6 attempts" counts the first try (assumed yes: 6 in total).
3. May the story reach Done on PostgreSQL and real-class evidence alone, with AC 19 as a separate owner acceptance, or must live evidence precede Done? Recommended: separate owner acceptance, recorded.

## Definition of Done

- ACs 1-18 have recorded Red-first evidence by class; AC 19 is either executed with the owner or explicitly waived by the owner.
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
