# Story FND-5: Chat Commands, Calls, Service Lifecycle, and Account Ownership

[Português brasileiro](../../pt-BR/stories/FND-5/story.md)

**Complexity:** COMPLEX
**Executor:** @dev
**Quality gate:** @qa
**Epic/capability:** Chat, queue service lifecycle, and account ownership (FND-5)
**Status:** Done
**Issue:** [#1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1)
**Source of requirements:** the FND-5 section in `docs/stories.md`, the product specification, and the accepted GitHub issue.

## User story

As a streamer operating queue commands during a live stream, I want authorized chat actions, recoverable calls and timeouts, and correctly owned current-account changes, so queue and account state remains consistent across concurrent operations and restarts.

## Scope and acceptance criteria

- Chat parsing and authorization use trusted Twitch message identity/channel/badges; mutable messages are deduplicated and viewer cooldown is enforced.
- Calls are bounded and persisted; notification delivery is durable, privacy is checked at send time, and timeout starts only after confirmed delivery.
- Starting service transitions `called → in_progress` and prevents no-show; timeout decisions serialize with manual actions and recovery.
- Clear requires confirmation from the same actor/channel/queue and unchanged active-entry snapshot within 15 seconds; invalid confirmation has no domain or point side effects.
- Automatic account switching happens only for an individual call. Current account has one global owner across queues; only that owner's terminal transition returns it to the latest default.
- Manual account changes retain the current owner link, reset clears ownership, and all changes are persisted and audited.
- Chat handlers, timers and the panel use shared domain/application services.
- Archived queues disappear from viewer discovery, preserve existing entries for operator service, allow unarchive only after a confirmed pause, and never reopen automatically.
- Queue deletion requires explicit panel confirmation, durably closes/archives the queue, requests cancellation of active redemption-backed entries, paginates all remote `UNFULFILLED` redemptions, and waits for confirmed cancellation before deleting the Twitch reward. Unknown, failed, conflicting, or interrupted operations remain visible and resumable; historical records keep the old queue identity.
- Tests cover concurrency, restart, delivery failures, privacy changes, and the absence of unintended point operations.

## Current progress

Implemented: parser/authorization integration, core viewer/manager commands, bounded calls, durable chat outbox, confirmed-send timeout, service start, clear preview/confirmation, persisted account labels and individual-call ownership, shared transition service, PostgreSQL global serialization of account mutations, panel call resend, archived queue lifecycle, and resumable confirmed queue deletion.

Reward open/close records durable intent, updates Twitch through the worker, and reports confirmation only after matching remote state or a safe re-query after a lost response. Chat notification retries use persisted exponential backoff with jitter and honor 429 retry-after. Durable viewer cooldown and message-ID deduplication are implemented in PostgreSQL. Implementation, file list and full quality run are complete; FND-5 is InReview for independent QA. FND-7 remains gated on FND-5 and FND-6.

## TDD record — concurrent account ownership across queues (2026-10-06)

- **Behavior:** concurrent individual calls in separate queues serialize account ownership and audit the actual predecessor state; the final account owner matches the last committed switch.
- **Red:** `npm test -- --run tests/integration/queue-repository.test.js -t 'serializes automatic account ownership across concurrent calls from separate queues'` — 1 failed because both audits recorded `Streamer` as their previous state.
- **Green:** same command — 1 passed after adding a PostgreSQL transaction advisory lock shared by automatic switches, owner resets, manual set/reset and default-label updates.
- **Refactor/retest:** focused test passed again. `npm test -- --run tests/integration/queue-repository.test.js tests/integration/queue-repository-chat.test.js` — 47 passed using isolated PostgreSQL and real migrations.

## TDD record — durable chat message deduplication and viewer cooldown (2026-10-06)

- **Behavior:** persist message-ID claims and the five-second viewer/channel cooldown; duplicates stay suppressed after repository recreation, a cooldown-rejected message cannot execute on later redelivery, simultaneous viewer commands serialize, and management commands bypass viewer cooldown.
- **Red — PostgreSQL contract:** `npm test -- --run tests/integration/queue-repository.test.js -t 'persists chat message deduplication|serializes viewer cooldown claims'` — 2 failed because `claimChatCommand` was absent.
- **Red — handler contract:** `npm test -- --run tests/unit/chat-command-handler.test.js -t 'claims each authorized command durably'` — 1 failed because the handler did not claim the operation before effects.
- **Green:** PostgreSQL contract — 2 passed after implementing transactional `processed_operations` claims protected by per-message and per-viewer advisory locks; focused handler suite — 7 passed after wiring the durable claim and rejecting duplicate/cooldown results before command execution.
- **Refactor/retest:** the PostgreSQL contract and handler suites passed again. The operation result stores only safe identifiers/status/timestamp; message text and rejected input are not persisted.

## TDD record — remote-confirmed reward open/close and chat retry backoff (2026-10-06)

- **Behavior:** opening/closing a managed reward creates a durable operation and reports success only after Twitch confirms the requested state; a lost response is resolved by querying the reward without repeating a possibly applied mutation. Unconfirmed chat calls schedule a durable backoff and are not reclaimed early.
- **Red — PostgreSQL reward intent:** `npm test -- --run tests/integration/queue-repository.test.js -t 'persists a remote reward pause intent'` failed because `setQueueOpen` changed only local state and created no outbox task.
- **Red — worker reconciliation:** `npm test -- --run tests/unit/reward-outbox-worker.test.js -t 'confirms queue opening|reconciles a lost open response'` failed because the worker did not support `reward.set_open`.
- **Red — chat result:** `npm test -- --run tests/unit/chat-command-handler.test.js -t 'does not announce an opening reward as open'` failed because the response did not describe the pending remote confirmation.
- **Red — retry schedule:** `npm test -- --run tests/unit/chat-outbox-worker.test.js -t 'backs off after unconfirmed delivery'` failed because no `nextAttemptAt` was persisted.
- **Green/refactor:** focused tests passed after adding transactional reward-open intent/lease/confirmation state, preflight and safe lost-response reconciliation, accurate pending chat text, and capped exponential backoff with jitter/429 delay. `npm test -- --run tests/integration/queue-repository.test.js -t 'persists a remote reward pause intent' tests/unit/reward-outbox-worker.test.js -t 'confirms queue opening|reconciles a lost open response' tests/unit/chat-command-handler.test.js -t 'does not announce an opening reward as open' tests/unit/chat-outbox-worker.test.js -t 'backs off after unconfirmed delivery'` is **not** recorded as one combined invocation; the focused cases were run individually during development.
- **PostgreSQL retry contract:** the first integration attempt failed on test setup because `callSpecificEntry` does not enqueue a notification. After explicitly using `enqueueCallNotification`, one assertion incorrectly expected an unreturned `status` field. Correcting the fixture/assertion exposed the final contract; `npm test -- --run tests/integration/queue-repository.test.js -t 'persisted retry time' tests/unit/chat-outbox-worker.test.js` passed 1 selected integration test and skipped 51 unrelated cases. It verifies the real PostgreSQL outbox cannot reclaim the task before `nextAttemptAt` and can claim it at the due time.

## TDD record — operator call notification resend (2026-10-06)

- **Behavior:** a session/CSRF-protected panel action requeues the existing notification only while its entry remains `called`; it does not repeat the domain transition, create another outbox row, or change `calledAt`/the existing deadline. A task currently processing is not sent concurrently.
- **Red — PostgreSQL contract:** `npm test -- --run tests/integration/queue-repository.test.js -t 'resends an existing call notification'` failed because `resendCallNotification` did not exist.
- **Red — HTTP contract:** `npm test -- --run tests/unit/queue-routes.test.js -t 'call notification resend'` returned 404 because the route did not exist.
- **Green/refactor:** repository and route contracts passed; the PostgreSQL case confirms same outbox row reset to pending, audit actor/reason, unchanged call transition and unchanged deadline. `npm test -- --run tests/integration/queue-repository.test.js -t 'resends an existing call notification'` — 1 passed; `npm test -- --run tests/unit/queue-routes.test.js -t 'call notification resend'` — 2 passed; `npm test -- --run tests/unit/queue-routes.test.js -t 'requires the local session and CSRF token for call notification resend'` — 1 passed. `npm run lint` and `npm run typecheck` passed.

## TDD record — repeated open request while remote confirmation is pending (2026-10-06)

- **Behavior:** repeating the same open-state request during `pending_open` returns pending and creates no second task; it must not report confirmed from desired local state alone.
- **Red — PostgreSQL regression:** `npm test -- --run tests/integration/queue-repository.test.js -t 'repeated open request pending'` failed because the repository rejected the pending reward state as not ready, rather than returning the persisted pending state.
- **Green/refactor:** the same isolated PostgreSQL test passed after handling synced/no-op, pending/same-intent and unresolved remote statuses separately before permitting a new remote transition. It asserts exactly one outbox intent. `npm test -- --run tests/unit/chat-command-handler.test.js tests/unit/queue-routes.test.js -t 'opening reward|open-state'` also passed 1 selected chat case (21 unrelated cases skipped).

## TDD record — archived queues, resumable deletion and operator recovery (2026-10-05)

- **Behavior:** archive pauses an open managed reward and hides discovery while retaining service access to existing entries; unarchive remains closed. Deletion needs protected explicit confirmation, removes active entries through the shared domain decision, requests cancellation irrespective of queue policy, imports all paginated `UNFULFILLED` redemptions, and cannot delete the Twitch reward before each cancellation is confirmed. Unknown deletion-stage work can be retried from the panel; retries restore the correct pending lifecycle state. History remains tied to the deleted queue ID and keys are reusable only after final confirmation.
- **Red — deletion domain:** `npm test -- --run tests/unit/entry-transitions.test.js -t 'queue deletion'` failed because deletion returned `no_operation` rather than a cancellation intent.
- **Red — explicit panel confirmation:** `npx vitest run tests/unit/queue-routes.test.js -t 'requires CSRF and calls the domain service to request queue deletion'` failed because a CSRF-valid request without `confirm: true` still returned 200.
- **Red — panel action:** `npx vitest run tests/unit/web-route.test.js -t 'offers explicit queue deletion confirmation'` failed because the deletion action and pending-state guard were absent.
- **Red — safe operation projection:** `npx vitest run tests/unit/queue-routes.test.js -t 'exposes only safe queue-deletion operation fields'` failed because deletion entity and retry fields were absent from the API response.
- **Red — operation starvation:** `npm test -- --run tests/integration/queue-repository.test.js -t 'keeps deletion tasks visible when the financial operation history exceeds the panel page limit'` failed because 205 newer finance rows pushed an older pending deletion task out of the combined 200-row query.
- **Red — PostgreSQL recovery regression:** the first full `npm test` run failed because manual retry tried to query a queue with a redemption operation ID (invalid PostgreSQL UUID, `22P02`); 326 other tests passed in that run.
- **Red — deletion retry state:** `npm test -- --run tests/integration/queue-repository.test.js -t 'restores the pending pause stage when an operator retries an unknown queue deletion'` failed because `close_unknown` remained after the task was reset to pending, preventing the worker from claiming it.
- **Green/refactor:** focused HTTP, web, PostgreSQL, and worker tests passed. PostgreSQL deletion cases pass for deletion intent, already-paused path, cancellation gate/history/key reuse, pending-pause restoration, and visibility despite more than 200 newer financial records; lifecycle operations now have an independent query from the paginated finance history. Worker tests pass for waiting on cancellation and resolving a lost delete response with one DELETE.
- **Executed Green commands:** `npm test -- --run tests/unit/queue-routes.test.js -t 'requires CSRF and calls the domain service to request queue deletion|exposes only safe queue-deletion operation fields'` (2 passed); `npm test -- --run tests/unit/web-route.test.js -t 'offers explicit queue deletion confirmation'` (1 passed); `npm test -- --run tests/integration/queue-repository.test.js -t 'requests resumable deletion|starts reward deletion directly|prevents reward deletion|restores the pending pause stage'` (4 passed); `npm test -- --run tests/integration/queue-repository.test.js -t 'keeps deletion tasks visible when the financial operation history exceeds the panel page limit'` (1 passed); `npm test -- --run tests/unit/reward-outbox-worker.test.js -t 'records every unfulfilled redemption|reconciles a lost reward-delete response'` (2 passed).

## Quality run — 2026-10-06

- **TDD — per-PR version policy documentation:** added a bilingual documentation contract first. Red — `npm test -- --run tests/unit/documentation-contract.test.js -t 'owner-controlled per-PR version increment'` failed because the documents did not state the exact PATCH/MINOR/MAJOR rules and explicitly reserve stage changes to the product owner. Green — the same command passed after updating both versioning documents; its policy assertions are included in the final suite below.
- **TDD — linked issue update rule:** added an `AGENTS.md` contract test first. Red — `npm test -- --run tests/unit/documentation-contract.test.js -t 'DevOps to update the linked issue'` failed because the project did not require `$aiox-devops` to update a completed story's issue after merge or limit issue comments. Green — the focused test passed after persisting the rule in `AGENTS.md`; the technical changelogs were updated in both languages.
- **TDD — public changelog readability:** added a bilingual contract requiring concise release sections and excluding implementation jargon. Red — `npm test -- --run tests/unit/documentation-contract.test.js -t 'keeps public changelogs concise'` failed on the v0.2.0 section because it exposed runtime identity, retry-after, and endpoint terminology. Green — the same command passed after condensing both public changelogs to user-visible outcomes; implementation detail remains in the internal changelogs.
- **TDD — AIOX port-denylist command:** `npm test -- --run tests/unit/port-denylist-validation.test.js` Red — the validator module was missing. Green — both wrapper tests passed after adding the CLI adapter, and `npm run validate:port-denylist` scanned 1,028 files with 0 findings.
- **TDD — Compose image version drift:** `npm test -- --run tests/integration/compose-contract.test.js -t 'defaults local app images'` Red — Compose resolved `v0.1.0-0000000-alpha` while tracked `VERSION` was `v0.2.0-0000000-alpha`. `npm test -- --run tests/integration/version-cli.test.js -t 'CI image'` Red — the contract required the stale fallback. Green — both focused tests passed after clearing the Compose default and Dockerfile ARG default; CI still supplies the materialized identity explicitly. A clean-image build and `/app/VERSION` check follow below.
- `npm test` at QA review — 48 files, 329 tests passed (includes isolated PostgreSQL migrations, isolated Compose first-run contract, and version-policy documentation contract).
- Follow-up `npm test` after the issue-sync policy contract — 48 files, 330 tests passed. Additional changelog readability and port-denylist tests are included in the final post-change run below.
- Final post-change `npm test` — 49 files, 333 tests passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run review:static` — OpenGrep scanned 41 JavaScript files; 0 findings.
- `npm test -- --run tests/integration/version-cli.test.js tests/unit/documentation-contract.test.js` — 10 tests passed before adding the policy contract; the new policy contract then passed its focused Red/Green run and is included in the final full suite.
- `npm run validate:version` — pass at `v0.2.0-0000000-alpha`.
- `npm run validate:port-denylist` — scanned 1,028 files with 0 findings.
- `docker compose config --quiet` and `git diff --check` — pass.
- `docker compose build bot` — production image build passed on pinned Node 24 Alpine image.
- Final identity regression: `docker compose build bot` passed without a version override; `docker compose run --rm --no-deps --entrypoint cat bot /app/VERSION` returned `v0.2.0-0000000-alpha`, matching tracked `VERSION`.
- Live Twitch integration was not exercised; no Twitch credentials or live point operations were used.

## File list for this increment

- `apps/api/src/persistence/queue-repository.mjs`
- `apps/api/src/outbox/reward-worker.mjs`, `apps/api/src/outbox/chat-worker.mjs`
- `apps/api/src/commands/chat-handler.mjs`
- `apps/api/src/http/queue-routes.mjs`
- `apps/api/src/domain/queue-service.mjs`, `apps/api/src/domain/entry-transitions.mjs`
- `apps/web/app.js`
- `apps/web/call-notification-actions.mjs`
- `tests/integration/queue-repository.test.js`
- `tests/unit/reward-outbox-worker.test.js`, `tests/unit/queue-routes.test.js`, `tests/unit/web-route.test.js`, `tests/unit/entry-transitions.test.js`, `tests/unit/chat-command-handler.test.js`, `tests/unit/chat-outbox-worker.test.js`
- `tests/unit/call-notification-actions.test.js`
- `tests/unit/documentation-contract.test.js`
- `AGENTS.md`
- `docs/stories.md`, `docs/pt-BR/stories.md`
- `docs/stories/FND-5/story.md`, `docs/pt-BR/stories/FND-5/story.md`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `package.json`, `package-lock.json`, `VERSION`, `docs/VERSIONING.md`, `docs/pt-BR/VERSIONING.md`
- `docs/qa/gates/FND-5-chat-calls-account-ownership.yml`
- `docs/qa/assessments/FND-5-risk-20261006.md`, `docs/qa/assessments/FND-5-nfr-20261006.md`
- `apps/infra/scripts/validate-port-denylist.mjs`, `tests/unit/port-denylist-validation.test.js`
- `.aiox/project-status.yaml`

## Implementation Checklist

- [x] Acceptance criteria and shared-domain paths implemented.
- [x] Required behavior tests passed, including isolated PostgreSQL/migration coverage.
- [x] English and pt-BR story records, central stories, and applicable changelogs synchronized.
- [x] File list and recorded Red → Green → Refactor evidence updated.
- [x] `npm test` — 48 files, 330 tests passed; the 329-test QA snapshot plus the new post-review issue-sync contract.
- [x] `npm run lint`, `npm run typecheck`, and `npm run review:static` passed.
- [x] `npm run validate:version`, `docker compose config --quiet`, and `git diff --check` passed.
- [x] Independent QA review and gate decision — CONCERNS, 9.0/10; live Twitch operations remain unverified.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-05 | 0.1.0 | Implemented archive/unarchive and resumable queue deletion; recorded PostgreSQL, worker, HTTP and panel evidence; submitted for QA review. | @dev |
| 2026-10-06 | 0.2.0 | QA Gate CONCERNS — Status: InReview → Done | @qa |

## QA Results

### Review Date: 2026-10-06

### Reviewed By: Quinn (Test Architect)

### Reviewed Revision

`worktree-source-sha256:e672280cd8705933b2b04fbae506a600d77db32c97e1a88ac766bf30bbe74b59`

### Code Quality Assessment

All nine acceptance criteria map to unit and persistence coverage. The full 329-test suite, real PostgreSQL migrations/concurrency tests, isolated Compose first-run contract, lint, typecheck, OpenGrep, version validation, Compose configuration, and diff checks passed. No blocking implementation defect was found. Quality score: **9.0/10**.

### Refactoring Performed

None during QA review.

### Compliance Check

- Coding Standards: ✓ ESM/JSDoc, lint and typecheck passed.
- Project Structure: ✓ API/domain/persistence/outbox/web responsibilities remain separated.
- Testing Strategy: ✓ PostgreSQL behavior uses isolated real migrations; adapter/network boundaries use fakes.
- All ACs Met: ✓ Automated criteria pass; real-channel acceptance is not claimed.

### Security Review

No blocking issue found. Chat authorization uses trusted event fields, panel mutations require local session/CSRF, error projections stay sanitized, and text rendering avoids interpreting user input as HTML.

### Performance Considerations

Retry delays are bounded and Twitch calls remain outside database transactions. A low-priority improvement is replacing full local redemption-history loading in deletion blocker aggregation with count/bounded queries if very large queues become common.

### Files Modified During Review

- `docs/qa/gates/FND-5-chat-calls-account-ownership.yml`
- `docs/qa/assessments/FND-5-risk-20261006.md`
- `docs/qa/assessments/FND-5-nfr-20261006.md`
- This story's QA Results and lifecycle fields.

### Gate Status

Gate: CONCERNS → `docs/qa/gates/FND-5-chat-calls-account-ownership.yml`
Risk profile: `docs/qa/assessments/FND-5-risk-20261006.md`
NFR assessment: `docs/qa/assessments/FND-5-nfr-20261006.md`

### Lifecycle Transition

QA applies `InReview → Done`. The gate is CONCERNS because authorized live Twitch operations were not exercised; adapter fakes do not prove real point changes. Score 9.0/10 meets the project's 8.5/10 PR threshold.
