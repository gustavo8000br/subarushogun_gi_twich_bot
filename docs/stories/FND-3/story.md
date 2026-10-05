# Story FND-3: Durable Financial Outbox and Recovery

[Português brasileiro](../../pt-BR/stories/FND-3/story.md)

**Status:** Done<br>
**Executor:** @dev<br>
**Quality gates:** @architect, @data-engineer, @qa<br>
**Complexity:** COMPLEX<br>
**Source:** `docs/stories.md` FND-3; `docs/architecture/financial-outbox-contract.md`; `docs/architecture/persistence-contract.md`; product spec §8–§10 and §17.

## Story

As the streamer operating a local Twitch queue bot,<br>
I want every points operation to survive process and network failures and remain auditable,<br>
so that a refund or consumption is never reported as confirmed without Twitch confirmation and unresolved outcomes require an explicit operator decision.

## Scope and current state

The PostgreSQL outbox, atomic terminal intent, one-intent idempotency, lease recovery, retry worker, rejected-redemption recovery and remote-state comparison already exist. This story closes the remaining acceptance gaps and performs the full failure-matrix review. Chat delivery remains a separate effect and must not change financial intent.

Included: financial outbox persistence and worker, recovery/reconciliation of uncertain requests, retry/reconnect behavior, sanitized operation projections, explicit operator acknowledgment of an irrecoverably unknown result, and PostgreSQL integration evidence. Excluded: Twitch reward lifecycle (FND-4), panel redesign (FND-6), exactly-once network claims, and real Twitch confirmation without authorized credentials.

## Acceptance criteria

1. A local terminal transition, policy snapshot, audit record and one stable financial intent per redemption commit atomically before remote I/O. Manual entries never create financial operations.
2. Workers lease tasks outside database/API transactions; an expired lease is recoverable, only its current lease holder may finalize it, and retries use bounded backoff/jitter and applicable 429 limits.
3. Lost responses are reconciled against Twitch before retry. Matching final state confirms; opposite final state conflicts; 401/revocation pauses automatic attempts; 404/unavailable history stays unknown.
4. Rejected redemptions without entries retain enough safe data to resume cancellation after restart. Duplicate/reordered EventSub and reconciliation observations never repeat local effects or regress a terminal record.
5. Pending, retry, processing, confirmed, conflict, failed, unknown and manually resolved operations remain visible and auditable. Chat delivery failure is independent.
6. For an irrecoverably unknown outcome, the operator may explicitly acknowledge the uncertainty. The audit captures actor, origin, prior/next operation state and a fixed safe reason; the operation becomes `resolved_manual`. This action does not change the expected financial intent or remote status, does not claim Twitch confirmation, and prevents automatic retry of that intent.
7. PostgreSQL integration tests use isolated PostgreSQL and real migrations for transaction atomicity, unique intent, concurrent claims, lease fencing/recovery, unknown resolution and rejected-redemption recovery. Fakes are limited to the Twitch boundary.
8. Every behavior change follows Red → Green → Refactor and records exact observed evidence in this story and its pt-BR equivalent. Full gates pass before completion.

## Tasks

- [x] 1. Persist terminal financial intent atomically with local transition and audit; verify with PostgreSQL.
- [x] 2. Implement worker claims, lease recovery, bounded retry and outcome classification; cover failures with Twitch fakes.
- [x] 3. Recover rejected-redemption cancellation and apply observed remote terminal status without repeating effects.
- [x] 4. Add explicit, audited acknowledgment for irrecoverably unknown financial outcomes without modifying remote truth or intent.
  - [x] 4.1 Write a real-PostgreSQL integration test first for allowed status, audit actor/reason, preserved expected status, and no remote-confirmation claim.
  - [x] 4.2 Add an API operation and a panel control with a clear review/confirmation step; unauthorized/invalid requests cause no database change.
  - [x] 4.3 Verify a manually resolved operation is not claimed or retried by the worker after restart.
- [x] 5. Run the complete failure matrix and review atomicity/lease fencing; update the file list and bilingual evidence.

## Test strategy and safety properties

- PostgreSQL migrations are applied to isolated test containers; no SQLite or mocked Prisma is evidence for transaction/constraint behavior.
- Twitch calls use controllable fakes; no test claims a real refund or fulfillment.
- Assert no duplicate outbox intent, no network call before commit, no false confirmation, no retry after manual resolution, no automatic retry under revoked authorization, and no mutation for stale leases.
- Required gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run review:static`, Prisma validation, `docker compose config --quiet`, and `git diff --check`.

## Architecture notes

- The database is the source of truth for local intent and audit; Twitch is the source of truth for remote points state. A manual acknowledgment must remain visibly distinct from remote confirmation. [Source: `docs/architecture/financial-outbox-contract.md` §§1–5; product spec §8, §10]
- No transaction may remain open during Twitch I/O. Leases and idempotency are persisted in PostgreSQL. [Source: `docs/architecture/persistence-contract.md`; `apps/api/prisma/schema.prisma` `Outbox`/`Redemption`]
- IDs and audit/log identifiers remain English; user-facing panel text remains pt-BR. Do not persist raw chat/rescue payloads or free-form operator explanations. [Source: product spec §2, §8, §15]

## Quality review

- @architect: transaction boundaries, state machine and distinction between manual acknowledgment and Twitch confirmation.
- @data-engineer: migration constraint, idempotency and concurrent lease resolution against PostgreSQL.
- @qa: failure-matrix traceability, negative effects, restart and worker non-retry after resolution.
- Local static analysis: `npm run review:static` with `.opengrep/rules.yml`; findings block completion.

## TDD evidence

Previous implementation evidence is summarized in `docs/stories.md` under FND-3. For operator resolution, `npm test -- --run tests/integration/queue-repository.test.js -t 'operator resolution of unknown|outside unknown state'` first failed as expected because `resolveUnknownFinancialOperation` was absent (2 failures). After implementation, the isolated PostgreSQL run passed both cases: resolution preserved `UNFULFILLED`/`CANCELED`, recorded `operator_resolved` and safe audit fields, and excluded the operation from both manual retry and worker claims; non-unknown state remained unchanged. `npm test -- --run tests/unit/queue-routes.test.js tests/unit/web-route.test.js` passed 11 tests, including CSRF denial/allow, actor binding, panel affordance and the explicit no-confirmation label. Refactoring kept the operation in a short Prisma transaction, used conditional `updateMany` for one winner, and separated `resolved_manual` from Twitch-confirmed states. New PostgreSQL migration was applied by the integration harness. The full suite initially exposed an overbroad `claimNext() === null` assertion because other integration cases leave unrelated durable tasks; narrowed the assertion to ensure the resolved ID is never claimed, then the full 244-test suite passed.

For a later Twitch terminal event after manual resolution, `npm test -- --run tests/integration/queue-repository.test.js -t 'later Twitch terminal observation'` first failed because the outbox remained `resolved_manual` despite the authoritative event. Green includes `resolved_manual` in external reconciliation; the PostgreSQL regression passed and now updates the outbox to `confirmed`/`conflict` while recording actual remote status. Refactor review confirmed a manual resolution stops retries but does not suppress later Twitch evidence.

## File list

The ignore-policy contract also failed Red because `.gitignore` dropped every SQL migration. `tests/unit/local-ignore-policy.test.js` now proves the Prisma migration exception; after adding `!apps/api/prisma/migrations/**/*.sql`, the focused test passed (3 tests) and `git check-ignore -v` confirmed all three migration SQL files are visible to Git. This gate fix ensures the new constraint migration and the existing schema migrations can be delivered.

Changed: `.gitignore`, `apps/api/prisma/migrations/202610020001_foundation/migration.sql`, `apps/api/prisma/migrations/202610030001_outbox_lease_token/migration.sql`, `apps/api/prisma/migrations/202610050001_manual_outbox_resolution/migration.sql`, `apps/api/src/persistence/queue-repository.mjs`, `apps/api/src/http/queue-routes.mjs`, `apps/web/app.js`, `tests/integration/queue-repository.test.js`, `tests/unit/queue-routes.test.js`, `tests/unit/web-route.test.js`, `tests/unit/local-ignore-policy.test.js`, `docs/stories.md`, `docs/pt-BR/stories.md`, both FND-3 story files, both internal changelogs.

## QA results

PASS (2026-10-05). Local architecture review verified transaction boundaries, atomic status fencing and separation of manual acknowledgment from Twitch truth; it identified and closed the late-EventSub observation gap. Persistence review verified the versioned check-constraint migration through real isolated PostgreSQL migrations, conditional single-winner resolution, retry exclusion, and lease-token fencing. QA traced the FND-3 matrix to worker fakes plus PostgreSQL integration tests. The final full gates after the ignore-policy fix are recorded in `docs/stories.md`. Twitch live refund/fulfillment was not tested because no authorized credentials were available; no remote operation is claimed as real.
