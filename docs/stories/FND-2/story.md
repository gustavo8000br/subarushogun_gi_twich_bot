# Story FND-2: Queue Domain, Validation, Ordering, and Parser

[Português brasileiro](../../pt-BR/stories/FND-2/story.md)

**Status:** InProgress<br>
**Executor:** @dev<br>
**Quality gate:** @architect<br>
**Quality gate tools:** Vitest, isolated PostgreSQL integration tests with real Prisma migrations, lint, typecheck<br>
**Complexity:** COMPLEX<br>
**Source:** `docs/stories/FND-0/spec/spec.md`; `docs/stories/FND-0/spec/requirements.json`; `docs/prd/functional-requirements.md`; `docs/architecture/persistence-contract.md`; `docs/architecture/internal-boundaries.md`; `docs/framework/testing-strategy.md`; `docs/framework/source-tree.md`; `apps/api/prisma/schema.prisma`; `apps/api/prisma/migrations/202610020001_foundation/migration.sql`.

## Story

**As a** streamer managing several activity queues,<br>
**I want** queue rules, entry transitions, ordering, UID handling, command parsing, and authorization to behave consistently and persist safely,<br>
**so that** viewers' entries and service history remain correct under normal use and concurrent operations.

## Dependencies and boundaries

- Depends on the FND-1 PostgreSQL schema, migrations, runtime and test foundation. FND-1 remains InProgress only for Windows `.bat` runtime execution; the existing Linux/PostgreSQL foundation is available for this story.
- FND-3 owns durable financial outbox processing, retries and remote confirmation. FND-2 must express and audit transition decisions without claiming a refund or consumption has completed.
- FND-4 owns live Twitch authentication and API adapters; FND-5 owns EventSub/chat dispatch, notifications, timers and account switching; FND-6 owns the operator interface.
- This story creates reusable domain/application entry points. It does not add viewer self-signup, UID-based identity, cross-queue moves, frontend behavior or live Twitch API calls.

## Acceptance Criteria

1. Every supported entry transition follows the product transition table through one domain service; invalid transitions, terminal-to-active transitions, `waiting → completed`, and `in_progress → no_show` are rejected without database or side effects. Each accepted transition persists before/after status, actor, origin and reason in audit.
2. Financial decisions use the queue policy snapshot at transition time: waiting removal requests cancellation; called/in-progress removal and viewer-leave use their distinct configured policies; no-show uses its configured policy; clear/removal rules can override as specified. Manual entries never create redemption operations. This story records a decision only and never claims remote confirmation or implements an outbox worker.
3. UID handling accepts exactly nine ASCII digits after trimming outer whitespace in `visible` mode. It rejects Unicode digits, embedded spaces, extra text and wrong lengths. In `hidden` mode any supplied value is discarded before persistence, audit detail, response or logs. Changing a queue to hidden clears stored UIDs and tests that no stale value remains in returned projections.
4. Queue slug and aliases use lowercase ASCII `/^[a-z0-9-]{2,24}$/`, share one globally unique namespace, and reject reserved words. Creating/editing keys preserves one slug per queue and cannot collide with another queue's slug or alias. Archived/deleting/deleted lifecycle restrictions for domain actions follow the product spec.
5. The pure pt-BR parser accepts queue-first slug/alias forms, mixed case, repeated whitespace and accented/unaccented command variants; returns structured syntax/help results for invalid argument counts; and does not execute commands or infer permission. User login matching is case-insensitive and distinct from display name.
6. Authorization is a pure decision based only on broadcaster ID and trusted same-channel message metadata/badges. Viewers can only query/leave using their event identity; moderator/VIP privileges are not inferred from nick, mention or message text. `allow_vip_management` defaults false.
7. PostgreSQL-backed queue entry operations preserve persisted order, append new waiting entries, assign continuous waiting positions, and keep called/in-progress entries separate. Reordering is atomic and local to one queue; terminal history is not reordered or reactivated.
8. Real PostgreSQL integration tests using the versioned migrations prove one active `(queue_id, twitch_user_id)` entry, redemptions/entries identifier integrity, concurrent duplicate-add handling, atomic ordering under concurrent mutations, and that expected uniqueness conflicts return a domain result rather than a fatal error. No SQLite or mocked Prisma is used as persistence proof.
9. Unit and integration tests cover transition matrix/policy combinations, UID cases, parser grammar, aliases/reserved collisions, authorization rules, order operations, duplicate user races and the absence of unintended financial calls/records.
10. All behavior increments follow observed Red → Green → Refactor. English and pt-BR story records include each behavior, exact test command, behavioral Red result, Green result and refactor/retest result. No behavior is marked complete where the PostgreSQL integration test could not execute.

## Scope

Included: pure queue/entry policies, transition domain service, UID/name validation, queue key rules, pure command grammar and authorization predicate, repository operations for queues and entries, PostgreSQL transactions/locking needed for those operations, and integration/unit tests. Excluded: outbox worker/API financial mutation, Twitch API or EventSub, actual chat handlers, call-notification/timer/account behavior and panel screens.

## Tasks / Subtasks

- [x] 1. Define pure entry transitions and policy decisions (AC: 1, 2)
  - [x] 1.1 Add transition matrix tests first; execute and record a behavioral Red before implementation.
  - [x] 1.2 Implement the pure transition/policy function and its domain-service contract under `apps/api/src/domain/`.
  - [x] 1.3 Cover source-specific behavior, policy snapshots, external terminal updates and prohibited transitions; rerun affected tests after refactor.
- [x] 2. Implement queue key and UID validation/privacy rules (AC: 3, 4)
  - [x] 2.1 Add tests for ASCII UID, trimming, hidden-mode discard, key grammar, reserved words and collisions before implementation.
  - [x] 2.2 Add minimal validators and queue-key domain operations; prove hidden mode clears persisted UID and stale domain projections.
  - [x] 2.3 Add migration-backed PostgreSQL assertions for source/identifier constraints; use a new migration only if required by observed contract failure.
- [x] 3. Implement pure Portuguese command parser and authorization (AC: 5, 6)
  - [x] 3.1 Add tests for queue-first grammar, case, whitespace, accent variants, arity/help, viewer identity, channel and badge rules.
  - [x] 3.2 Implement a pure parser separate from authorization and dispatch in `apps/api/src/commands/`.
  - [x] 3.3 Keep `allow_vip_management` false unless explicitly configured; test untrusted body text cannot grant permissions.
- [x] 4. Implement PostgreSQL queue/entry persistence and ordering (AC: 7, 8)
  - [x] 4.1 Write real PostgreSQL integration tests against isolated test databases and actual Prisma migrations before repository implementation; verify observed behavioral failures.
  - [x] 4.2 Implement short transactions and DB coordination for create/add/reorder operations; preserve persisted order and continuous waiting positions.
  - [x] 4.3 Resolve active-user uniqueness races as a rejected duplicate/cancellation decision without crashing. Do not call Twitch or claim points effects.
  - [x] 4.4 Verify concurrent ordering, queue boundaries, duplicate handling and source/identifier DB constraints. Additional call/move/timeout races remain in FND-5.
- [ ] 5. Complete gates and bilingual evidence (AC: 9, 10)
- [x] 5.1 Run focused tests after every refactor and full project gates `npm run lint`, `npm run typecheck`, `npm test` when acceptance is complete.
- [x] 5.2 Record exact Red/Green/Refactor commands and outcomes in both story documents and both story indexes; update checklist and file list.
  - [ ] 5.3 Request @architect quality review before moving this story to Done.

## Dev Notes

### Domain and persistence contract

- Active entry states are `waiting`, `called`, `in_progress`. Terminal states are `completed`, `removed`, `no_show`; terminal entries never return to active. Waiting positions are contiguous `1..N`; other active states have no waiting position. New entries append after current waiters; manual reordering is preserved on recovery. [Source: `docs/stories/FND-0/spec/spec.md` §6–§8; `docs/architecture/persistence-contract.md`]
- Identity is `twitch_user_id`; `user_login` is normalized for lookup/presentation and `display_name` is presentation only. One viewer can be active in several queues, but only once per queue. [Source: `docs/stories/FND-0/spec/spec.md` §6; `docs/prd/functional-requirements.md` FR-5]
- Queue entry source is `manual` or `redemption`; manual rows have no redemption ID and redemption rows require one. Existing migration includes the partial unique active-user index and the UID check. Keep SQL/Prisma names consistent and use migrations for constraints Prisma cannot express. [Source: `apps/api/prisma/schema.prisma` models `Queue`, `QueueKey`, `Entry`, `Redemption`; `apps/api/prisma/migrations/202610020001_foundation/migration.sql`]
- Entry transitions, audit and queue/entry writes belong in the single application/domain service. Routes, future chat handlers, timers and reconciliation call that service and must not update status directly. Transactions are short; no external I/O occurs inside them. [Source: `docs/architecture/internal-boundaries.md`; `docs/architecture/persistence-contract.md`]
- FND-3 will add atomic outbox intent creation to terminal transitions. Until then, test the transition decision/result and prove there is no accidental Twitch/financial call; do not present a local policy decision as remotely confirmed. [Source: `docs/architecture/financial-outbox-contract.md`; FND-0 §8]

### Validation, parser and authorization

- UID rule is product-specific: trim only outer whitespace, then `/^[0-9]{9}$/` using ASCII digits; persist as a string. Hidden mode neither persists nor returns manual/event UID. [Source: FND-0 §6]
- Queue keys are lowercase ASCII `/^[a-z0-9-]{2,24}$/`. Reserved keys: `add remover sair posicao proximo atender concluir mover abrir fechar limpar confirmar filas conta lista`. Slug and aliases use one namespace. [Source: FND-0 §12]
- Parser is pure, accepts `posicao/posição` and `proximo/próximo`, extra spaces and case variants, and returns a syntax result/help without dispatch. Do not normalize usernames as display-name matches. [Source: FND-0 §6, §12]
- Permissions use event broadcaster identity and trusted same-channel badges. The message body, display name, mention and a badge-shaped string are not authorization inputs. Viewer `posicao`/`sair` always use the current event's own Twitch identity. [Source: FND-0 §12]

### Project structure and tests

- ESM JavaScript with JSDoc; app modules are under `apps/api/src/domain/`, `apps/api/src/commands/`, and `apps/api/src/persistence/`. Do not add TypeScript to application runtime or expose Prisma entities to callers. [Source: `docs/framework/source-tree.md`; `docs/framework/coding-standards.md`; `docs/framework/tech-stack.md`]
- Vitest unit tests go in `tests/unit/`; persistence/concurrency tests go in `tests/integration/` against an isolated PostgreSQL database using the actual migrations. No SQLite or Prisma mocks as evidence for atomicity/constraints. [Source: `docs/framework/testing-strategy.md`]
- Start each behavior with a test that executes and fails for the missing behavior. Syntax/dependency/environment failures do not count as Red. After implementation, run the same focused test, refactor, rerun, and record only observed outcomes in both languages. [Source: user-mandated TDD policy; `docs/framework/testing-strategy.md`]

## Testing

- Unit: complete transition matrix, policy true/false, manual/redemption source, external terminal handling, UID accepted/rejected cases and hidden mode, parser syntax/aliases, key reservations, authorization and permission boundaries.
- PostgreSQL integration: apply actual migrations to an isolated database; prove partial unique active-user constraint, source/ID integrity, unique key namespace, stable queue IDs, transactional order and concurrent competing mutations.
- Regression/negative effects: no Twitch calls in FND-2; no financial intent claimed as confirmed; no rejected or hidden UID in persisted rows/audit/projections; failed/duplicate add leaves only the permitted existing active entry.
- Required final checks: `npm run lint`, `npm run typecheck`, `npm test`, focused PostgreSQL integration command, `git diff --check`.

## Local Static Review and Quality Gates

**Story Type Analysis**<br>
**Primary Type**: API/domain and database<br>
**Secondary Type(s)**: Security, concurrency, persistence<br>
**Complexity**: COMPLEX

**Specialized Agent Assignment**
- Primary: @dev
- Supporting: @data-engineer (PostgreSQL transactions/constraints), @architect (domain boundary and quality review), @qa (coverage review)

**Quality Gates**
- [x] Pre-commit: @dev runs focused tests, all required gates, OpenGrep local static review and reviews the diff.
- [ ] Database/domain review: @architect checks transition ownership, transaction boundary, race handling and no remote I/O in transaction.
- [ ] @data-engineer reviews migration and PostgreSQL concurrency evidence.

**Review procedure:** Run `npm run review:static` with pinned OpenGrep `1.30.0` and `.opengrep/rules.yml`. This local rule-based scan is not contextual AI review. No CodeRabbit license is available; do not invoke its CLI or hosted service. Record human/AIOX review separately.

**Focus Areas**: no direct status writes outside the domain service; no UID leakage; no identity/authorization inferred from display strings; correct partial unique index behavior; safe rollback and ordering under concurrent PostgreSQL mutations; no financial/Twitch claims before FND-3/FND-4.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-03 | 0.1.0 | Drafted FND-2 from approved product requirements and existing PostgreSQL contract; no implementation evidence recorded. | @sm |
| 2026-10-03 | 0.1.0 | PO validation GO (9/10) — Status: Draft → Ready. | @po |
| 2026-10-03 | 0.1.0 | Implemented partial domain and PostgreSQL repository increments under TDD; the story remains InProgress because application dispatch, remaining acceptance evidence, gates, and quality review are incomplete. | @dev |
| 2026-10-03 | 0.1.0 | Added the unified transition domain service and routed PostgreSQL integration cases through it; 2 focused unit tests and 13 real-PostgreSQL integration tests pass. Formal @architect/@data-engineer review remains pending. | @dev |

## Dev Agent Record

### Agent Model Used

GPT-6 Codex, @dev persona.

### Debug Log References

- `npm test -- --run tests/unit/entry-transitions.test.js` — initial harness attempt: 0 tests collected because the imported module did not exist; this was an import/environment failure, not a valid Red.
- `npm test -- --run tests/unit/entry-transitions.test.js` — behavioral Red against an empty contract stub: 12 tests, 4 failed for missing transition rejection/result and external-state semantics. After correcting the table fixture to align with the spec, rerun produced 12 tests, 1 failed / 11 passed: externally observed fulfillment incorrectly requested a local fulfillment operation.
- `npm test -- --run tests/unit/entry-transitions.test.js` — Green after implementing the transition decision function: 12 passed.
- `npm run typecheck` — Refactor check initially found incomplete JSDoc types (`refund...` fields and `Error.code`), and the first annotation refinement found one helper input mismatch. Fixed the annotations/error construction; final `npm run typecheck` passed.
- `npm run typecheck && npm test -- --run tests/unit/entry-transitions.test.js` — Refactor/retest: typecheck passed; 12 transition tests passed.
- `npm run lint -- --no-warn-ignored` — passed for the new domain/test files.
- `npm test -- --run tests/unit/uid.test.js` — Red: 11 failed against the empty validator contract, covering accepted normalization, rejected formats, optional/required values and hidden-mode discard.
- `npm test -- --run tests/unit/uid.test.js` — Green: 11 passed after implementing ASCII-only validation, outer trim, safe generic errors and hidden-mode discard.
- `npm test -- --run tests/unit/uid.test.js && npm run typecheck && npm run lint` — Refactor/retest: 11 passed, typecheck passed, lint passed.
- Full repository gates before the UID increment: `npm test` — 55 passed; `npm run lint`, `npm run typecheck`, `npm run validate:version`, `docker compose config --quiet`, and `git diff --check` passed. After UID implementation, its focused suite plus lint/typecheck passed; full suite will be rerun at the next acceptance checkpoint.
- `npm test -- --run tests/unit/command-parser.test.js` — parser contract Red against the empty parser implementation: 18 tests, 11 failed / 7 passed.
- `npm test -- --run tests/unit/command-parser.test.js` — first implementation run exposed a test fixture error: the supposedly rejected `add login uid` form is grammatically valid; changed the rejected fixture to an extra argument for `remover`. This was not recorded as a behavioral Red.
- `npm test -- --run tests/unit/command-parser.test.js` — regression Red: 19 tests, 1 failed / 18 passed because bare `!<queue>` mapped to `join`, violating redemption/manual-only entry. After correcting it to `lista`, Green: 19 passed.
- `npm test -- --run tests/unit/command-parser.test.js && npm run typecheck && npm run lint` — parser refactor/retest passed: 19 tests, typecheck and lint.
- `npm test -- --run tests/unit/queue-keys.test.js` — Red: 25 failed against the empty queue-key contract. Green: 25 passed after lowercasing ASCII keys, grammar/reserved-word validation and in-queue collision checks. `npm test -- --run tests/unit/queue-keys.test.js && npm run typecheck && npm run lint` passed.
- `npm test -- --run tests/unit/command-authorization.test.js` — Red: 6 failed against the empty authorization contract. Green: 6 passed after identity/channel/badge/VIP rules. A follow-up regression Red showed a moderator could use `sair other-user` (1 failed / 6 passed); after rejecting arguments to self-service `posicao`/`sair`, 7 passed. Focused suite, typecheck and lint passed.
- `npm test -- --run tests/integration/queue-repository.test.js` — Red: initial real PostgreSQL run had 4 failures because queue repository operations were absent. Implemented transaction-backed queue creation, manual entry, ordering, policy transitions, key replacement and UID privacy; fixed actual Prisma `void` deserialization and a result-shape collision discovered by integration runs. Resolved a race-test fixture that assumed invocation order equaled database lock order, and a key-collision fixture setup error. Subsequent runs passed with 4, then 6, then 8, then 9 tests as persistence behaviors were added.
- `npm test -- --run tests/integration/queue-repository.test.js` — Additional verification coverage (no behavior code change): 11 passed, including one viewer active in two different queues, one active entry per queue, manual addition to a closed queue, and rejection in archived/deleting queues. This coverage expansion was added after the repository behaviors existed; no Red is claimed for these two verification-only tests.
- PostgreSQL source/identifier contract test first rejected the code-specific expectation `P2004`: Prisma 6.19.3 surfaced PostgreSQL check violation `entries_source_redemption_check` as `PrismaClientUnknownRequestError`. This was an assertion mismatch, not a database behavior failure. Updated the check to match the named database constraint; `npm test -- --run tests/integration/queue-repository.test.js` passed with 12 tests.
- Added a PostgreSQL race contract test for simultaneous `called → completed` and `called → removed` decisions. `npm test -- --run tests/integration/queue-repository.test.js` passed with 13 tests: one terminal transition and one audit are committed; the competing transition is rejected after observing the terminal state. This was added as verification coverage after the transaction/lock implementation; no Red is claimed and no application behavior changed.
- **Unified transition service Red:** `npm test -- --run tests/unit/queue-domain-service.test.js` — 2 tests failed because the contract stub had no `transitionEntry` behavior. This is a behavior failure, not a syntax/dependency failure.
- **Green and persistence integration:** the same unit command passed 2 tests after adding `createQueueDomainService`; `npm test -- --run tests/integration/queue-repository.test.js` passed 13 tests after routing persisted transition cases through that service. The database transaction loads the locked entry and current queue policy, asks the domain service for a decision, then commits status/order/audit together. Invalid transitions persisted neither status nor audit, and no outbox/Twitch operation was created.
- **Refactor/retest:** initial parallel checks caught a duplicate stub export and incomplete JSDoc type; these were not accepted as Red. After correction, `npm run typecheck && npm run lint` passed, and both focused test suites passed again. The diff review confirmed callers use `createQueueDomainService.transitionEntry` as the transition decision path.
- Manual code review covered the new transition decision/service, UID/key validators, parser, authorization predicate, PostgreSQL repository transaction boundaries, migration constraints and integration assertions. No additional source defect was found. Runtime chat/EventSub dispatch is assigned to the later integration stories.
- Repository implementation record: `createQueue`, atomic key replacement, manual add, ordered listing/move, UID-mode privacy cleanup, and persisted/audited transitions use actual Prisma transactions against PostgreSQL. Manual transition policies are recorded, with no Twitch call or financial outbox operation. Runtime chat/EventSub dispatch and redemption import are not implemented by this repository increment.

### Completion Notes List

Implemented transition decisions/policy snapshots, UID and queue-key validation, the pure command parser and authorization, PostgreSQL-backed queue creation/manual addition/order/UID privacy, and audited entry transitions through one `createQueueDomainService`. The isolated real PostgreSQL integration suite passes 13 tests and covers duplicate-add races, cross-queue participation, source/redemption identifier constraints, key uniqueness/rollback, concurrent reordering and competing terminal decisions, hidden-UID cleanup, audit persistence, and manual-add lifecycle rules. The service records local financial intent only; no outbox or remote confirmation is claimed. FND-2 remains InProgress pending formal @architect/@data-engineer quality review. Runtime chat/EventSub handlers and redemption import are assigned to FND-4/FND-5, and financial delivery remains in FND-3.

Latest Linux verification: `npm test` passed 22 files/142 tests; `npm run test:integration` passed 5 files/28 tests, including the real PostgreSQL suite; `npm run lint`, `npm run typecheck`, `npm run review:static` (19 JavaScript files, 0 findings), `npm run validate:version`, `docker compose config --quiet`, and `git diff --check` passed. Formal AIOX reviewer sign-offs remain unchecked.

### File List

- `apps/api/src/domain/entry-transitions.mjs`
- `tests/unit/entry-transitions.test.js`
- `apps/api/src/domain/uid.mjs`
- `tests/unit/uid.test.js`
- `apps/api/src/domain/queue-keys.mjs`
- `tests/unit/queue-keys.test.js`
- `apps/api/src/commands/parser.mjs`
- `tests/unit/command-parser.test.js`
- `apps/api/src/commands/authorization.mjs`
- `tests/unit/command-authorization.test.js`
- `apps/api/src/persistence/queue-repository.mjs`
- `apps/api/src/domain/queue-service.mjs`
- `tests/unit/queue-domain-service.test.js`
- `tests/integration/queue-repository.test.js`

## QA Results

Formal @architect/@data-engineer and QA review pending.
