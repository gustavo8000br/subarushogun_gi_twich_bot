# FND-9 — Manual and reward-backed queue modes by Twitch capability

[Português brasileiro](../../pt-BR/stories/FND-9/story.md)

**Issue:** [#19](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/19)  
**Complexity:** COMPLEX (23/25)  
**Status:** InProgress  
**Executor:** @dev  
**Architecture review:** @architect  
**Database review:** @data-engineer  
**Quality gate:** @qa  
**Epic/capability:** FND-9 — local queue modes when Twitch reward APIs are unavailable

## Story

**As a** Twitch streamer using the local chatbot,
**I want** Twitch chat and queue operation to remain usable independently from Channel Points APIs, with reward-backed or local/manual queues,
**so that** viewers can join through a managed reward or be added for free by me/moderators without losing redemption and finance traceability.

## Approved product boundaries

- Queue mode is `channel_points` or `manual_only`. Reward origin in `channel_points` mode is `bot_created` by default or `dashboard_existing` only after this Client ID proves the complete lifecycle.
- Manual entry is a separate entry source allowed in either queue mode. Only streamer/moderator explicitly adds the named Twitch user; free-form viewer chat never enrolls anyone.
- A manual entry has source `manual`, no redemption ID, and no financial outbox intent.
- A streamer may convert a reward-backed queue one-way to local/manual mode. The conversion stays pending until Twitch confirms reward pause. Keep the reward ID/origin as history, do not delete the reward during conversion, preserve/drain existing redemptions, and durably cancel any redemption racing with conversion.
- An unknown/failed Twitch pause must not activate local mode. Retry/reconciliation must resolve the remote state without duplicate effects.
- Keep the panel because product operation requires it. Implement domain/chat/API behavior before the UI controls; panel observes the same tested contracts.
- No viewer self-enrollment, payment/Bits/subscription verification, automatic priority, new external service, new OAuth scope without proven need, or raw chat persistence.

## Acceptance Criteria

1. [ ] Valid broadcaster chat authorization starts `channel.chat.message` handling even when reward APIs are unsupported; health/panel distinguish chat state from reward capability.
2. [ ] OAuth scopes are split only after documented and authorized acceptance evidence. Temporary network, OAuth, scope, 429, 5xx, or timeout errors are `unknown/retryable`, never proof to downgrade an existing queue.
3. [ ] Reward capability is based on actual supported API operations, not `broadcasterType` alone. Dashboard rewards are selectable only after complete per-reward lifecycle proof; otherwise the panel offers a local/manual queue and does not adopt unrelated rewards.
4. [ ] PostgreSQL migration/backfill distinguishes new local queues (no reward ID) from converted queues (historical reward ID/origin retained), enforces consistent mode/source constraints, and preserves all existing queue, entry, redemption, audit, settings, and OAuth data.
5. [ ] Streamer/moderator can explicitly add a resolved Twitch user for free to reward-backed, manual-only, closed, or `conversion_pending` queues, subject to duplicate/archive/delete rules. Entry is manual, standard FIFO, audited, and has no redemption or finance linkage.
6. [ ] A viewer's `!<queue> add`, forged actor/badge data, Shared Chat from another channel, invalid login/UID, and free-form request cause no unauthorized lookup, insert, Twitch financial operation, or unsafe announcement.
7. [ ] `!<queue> ping` localized global behavior remains streamer/mod-only and works while chat is connected/reward APIs unavailable, returning Pong, product version, and cached Twitch latency without per-message Helix/reward calls.
8. [ ] Conversion request persists a unique/idempotent transition intent and remains `conversion_pending` while pause is unresolved. It blocks new reward redemption admission/calls for that queue while explicit manual adds remain allowed.
9. [ ] Confirmed Twitch pause activates local/manual mode, retains historical reward ID/origin, leaves the reward paused, and does not issue reward DELETE as part of conversion.
10. [ ] Timeout, 429, 5xx, OAuth failure, lost response, and process restart during conversion recover via retry/reconciliation. No failure or unknown result activates local mode or repeats side effects blindly.
11. [ ] A redemption racing with conversion is durably recorded and cancellation is requested; already admitted redemptions and their financial outbox work continue through normal remote confirmation/recovery. Failed cancellation remains visible/recoverable and blocks destructive queue deletion.
12. [ ] PostgreSQL constraints/transactions serialize conversion with EventSub import, add, call, deletion, and outbox creation; tests use isolated real PostgreSQL and versioned migrations, not mocked Prisma.
13. [ ] Protected panel can create/select a queue mode, request conversion with a reviewable confirmation, show pending/confirmed/recoverable failure states, retain historical reward information, and revalidate session/CSRF/operation key/version server-side.
14. [ ] Product copy/localization is added for supported locales and user-generated queue/reward text remains unchanged and safely rendered. No Twitch enum, raw provider error, secret, token, invalid UID, or raw message is exposed.
15. [ ] Existing eligible-channel reward, EventSub, reconciliation, outbox, command, ordering, and deletion tests pass; every new behavior records real Red → Green → Refactor evidence in the English and pt-BR story indexes.
16. [ ] Independent @qa review and project quality gates pass. Authorized live chat acceptance is reported only if actually executed; no real reward/refund/fulfillment is claimed from mocks.
17. [ ] All affected documentation and both changelogs stay equivalent in English/pt-BR. FND-9 story is not Done until all acceptance criteria and evidence gates are complete.
18. [x] Closing, archiving, or converting a managed reward queue confirms Twitch `is_paused=true`; reopening confirms `is_paused=false`. Do not send or require `is_in_stock` because the current Helix Update Custom Reward request does not accept it, even though GET responses expose it. Preserve the returned stock value as Twitch-owned state, and do not claim the reward was marked out of stock. Reconciliation uses only documented writable fields and must not report a divergence solely because `is_in_stock=true` on a paused reward. Covered by the adapter/worker/reconciliation tests, real PostgreSQL migration/reconciliation tests, and the authorized idempotent Twitch probe recorded in validation.md.

## Tasks / Subtasks

- [x] Regression fix — HTTP route-shaped queue creation (AC: 4, 13)
  - [x] Red: `npm test -- --run tests/integration/queue-repository.test.js -t 'normalized key bundle passed'` failed 2/2 against isolated PostgreSQL because Prisma rejected the route helper's `keys` relation value.
  - [x] Green: the same command passed 2/2 after both repository creation paths discarded the helper-only `keys` bundle and recalculated keys from `slug`/`aliases`.
  - [x] Refactor: central repository normalization remains the source for persisted `queue_keys`; route validation metadata is not treated as a Prisma model field.
  - [x] Chrome reproduction: one authorized request returned HTTP 400 before persistence or Twitch calls; no data or active Compose service was changed. Browser retry against the updated runtime remains pending because the active bot was not restarted.

- [x] 1. Persist queue mode, reward origin, and transition state (AC: 4, 8, 12)
  - [x] Write real PostgreSQL migration/repository tests first for old-row backfill, new local queues, converted historical association, constraints, idempotency, restart recovery, and unrelated-data preservation.
  - [x] Implement migration/schema/repository behavior after behavioral Red; serialize mutations with existing PostgreSQL strategy.
  - [x] Record Red, Green, Refactor and run affected PostgreSQL suite after refactor.
- [x] 2. Separate chat and reward capabilities (AC: 1, 2, 3, 7)
  - [x] Test chat runtime when reward capability is unsupported, plus available/unknown states, token validation, refresh, and retry. A reduced chat-only OAuth scope set remains gated on authorized live evidence.
  - [x] Keep chat commands alive while reward workers/subscriptions are gated by verified capabilities and configured queue modes.
  - [x] Preserve `/health` contract and localized status projection; do not leak raw backend errors.
- [x] 3. Implement queue modes and reward-source gates (AC: 3, 4, 9, 14)
  - [x] Test queue creation and selection contracts before route/repository changes.
  - [x] Keep bot-created reward as default; Dashboard reward selection stays unavailable until this Client ID proves the complete lifecycle.
  - [x] Create local queues without reward API operations; preserve historical source metadata when converted.
- [x] 4. Implement explicit free manual add in both modes (AC: 5, 6, 15)
  - [x] Test command authorization, ID resolution, duplicate/UID/privacy behavior, no finance intent, and no free-form auto-enrollment before handler changes.
  - [x] Route chat and panel manual adds through the shared domain service.
  - [x] Preserve continuous FIFO and audit actor/source.
- [x] 5. Implement recoverable reward-to-manual conversion (AC: 8–12)
  - [x] Write PostgreSQL-backed tests for pending/confirmed/unknown/failed pause, process restart, retry/idempotency, and transition/event races.
  - [x] Add durable transition intent; call Twitch outside DB transactions; reconcile unknown remote pause before retry.
  - [x] Cancel racing redemption durably; preserve all prior financial operations; prohibit reward DELETE during conversion.
- [x] 6. Implement protected panel controls after backend contracts (AC: 13, 14)
  - [x] Add localized queue-mode selection and conversion confirmation/status states after API behavior tests pass.
  - [x] Use text-safe rendering; apply session, CSRF, operation key, and version checks; provide actionable safe errors. Independent UX review remains open for the planned audit.
- [ ] 7. Recovery, QA, documentation, and completion (AC: 15–17)
  - [x] Test recovery after restarts and partial Twitch failures; retain existing queue/reward flows.
  - [ ] Run independent @qa review and project gates. Report Twitch live checks separately.
  - [x] Update docs, story indexes, roadmaps, integrations, and changelogs in both languages; complete this story's File List and evidence. The controlled live-test checklist is in `docs/stories/FND-9/validation.md` and its pt-BR pair.
- [x] 8. Helix pause contract and recovery (AC: 18)
  - [x] Test the supported pause PATCH, archived/closed queues, retry after a lost response, and reconciliation when Twitch retains `is_in_stock=true`.
  - [x] Remove the unsupported stock write/snapshot; verify pause through the installed Twurple auth provider and official Helix fields.

## Dev Notes

- Source of requirements and decisions: [FND-9 spec](spec/spec.md), [requirements](spec/requirements.json), [research](spec/research.json), [critique](spec/critique.json), and [implementation plan](plan/implementation.yaml), with pt-BR equivalents.
- Existing implementation entry points identified from the repository: `apps/api/src/twitch/{auth-runtime,integration,eventsub-runtime,helix-adapter,reconciliation}.mjs`; `apps/api/src/persistence/queue-repository.mjs`; `apps/api/src/http/queue-routes.mjs`; `apps/api/src/commands/chat-handler.mjs`; `apps/api/prisma/schema.prisma`; `apps/web/app.js`; `apps/web/localization/catalogs/{panel,chat}/{en,es,pt-BR}.tsv`.
- Domain transition behavior remains in domain services. Chat/HTTP/EventSub/workers must not write entry or queue status directly.
- The Twitch network call must never occur inside an open PostgreSQL transaction. Unknown pause results require remote-state reconciliation, not blind retry or local success.
- Conversion to manual mode is one-way within FND-9. Local mode has no active reward intake, but a converted queue retains its old reward ID/origin as historical metadata.
- Manual add remains allowed in `conversion_pending`; EventSub redemptions racing after transition intent are cancelled durably. Entries admitted before conversion keep their existing financial lifecycle.
- No user-facing claim of refund/consumption before Twitch confirmation. No HTTP 404 or missing paginated result alone is proof of cancellation.
- Do not change dependencies, release stage, or runtime version except the product version change required by the eventual PR/release policy.

### Testing

- JavaScript ESM + Vitest; tests under `tests/unit/` and `tests/integration/`.
- PostgreSQL contracts, partial indexes, transactions, and migrations use the isolated PostgreSQL harness in `tests/helpers/isolated-postgres-cleanup.mjs` and actual Prisma migrations. Never use SQLite or mock Prisma as evidence for atomicity.
- Use controlled clocks and Twitch/EventSub fakes only at external boundaries. Assert absence of unwanted lookups, inserts, API calls, refunds/fulfillments, messages, and UID exposure.
- TDD is mandatory per behavior: first a test that fails because behavior is absent, then minimal implementation, then refactor and rerun affected suite. Syntax/dependency/environment errors do not count as Red.
- Record exact commands, failures, passing results, and refactor notes in both `docs/stories.md` and `docs/pt-BR/stories.md`; never fabricate evidence.

## Quality Gate Plan

**Primary Type:** Full-stack integration (API/domain/database/chat/panel)  
**Secondary Type(s):** PostgreSQL migration, Twitch integration, security/privacy, localization  
**Complexity:** Complex — 23/25  
**Executor:** @dev  
**Architecture review:** @architect  
**Data review:** @data-engineer  
**Quality gate:** @qa  
**Quality gate tools:** Vitest, isolated PostgreSQL + Prisma migrations, `npm run lint`, `npm run typecheck`, `npm test`, `npm run review:static`, `npm run validate:localization`, `npm run validate:version`, `docker compose config --quiet`, `git diff --check`.

**Static analysis focus:** authorization, transaction boundaries, idempotent retries, no silent downgrade, EventSub race ordering, secret/raw-text sanitization, CSRF/session/version checks, and bilingual parity.

- [ ] Pre-commit @dev: affected tests and full required gates.
- [ ] Architecture review @architect: persisted queue/transition model and recovery semantics.
- [ ] Database review @data-engineer: migration, uniqueness, locking, restart recovery.
- [ ] Independent QA @qa: every AC with evidence; issue blockers/score.
- [ ] Pre-PR @devops: branch/PR flow, version/changelog consistency, and issue body/status sync on completion.

### Implementation evidence — 2026-10-07

TDD evidence recorded during the active branch `feat/fnd-9-manual-queue-modes`:

- **Correlated durable reward outcomes:** Red: the focused worker test failed because an `unknown` operation result produced no diagnostic; a separate reporter test failed because lowercase `snake_case` codes were dropped. A runtime composition test then failed because the reward worker factory did not receive the diagnostic reporter. Green: the reward worker reports persisted retry/failure/unknown codes through the safe reporter, the runtime supplies the callback, and the reporter accepts constrained lower/upper snake-case codes. Focused tests passed: `npm test -- --run tests/unit/reward-outbox-worker.test.js tests/unit/error-diagnostics.test.js tests/unit/runtime-composition.test.js` (record final count after the full rerun). The currently stored `reward_create_response_unverified` predates the change, so it has no retroactive reference.

- **Queue mode schema and migration:** `npm test -- --run tests/integration/queue-repository.test.js -t 'admission mode and reward provenance'` Red — PostgreSQL `42703`, `column "queue_mode" does not exist`. Green after the versioned migration and repository defaults: the focused PostgreSQL test passed. A follow-up provenance regression Red observed `bot_created` where preexisting unverified rows must be `legacy_unknown`; Green passed after distinguishing legacy records from new bot-created rewards.
- **Local queue persistence:** a real PostgreSQL test first failed because `createManualQueue` did not exist. After implementation, `npm test -- --run tests/integration/queue-repository.test.js -t 'creates a local manual-only queue'` exposed that queue preferences were silently ignored (expected custom call text, timeout and visible UID, received defaults); Green passed after persisting the validated local settings. The same test confirms the manual entry has no redemption ID and creates no outbox finance task.
- **Protected API and panel:** `npm test -- --run tests/unit/queue-routes.test.js -t 'manual-only queue through the protected API'` Red — expected 201, received 400 because the route required points cost. Green passed after adding the local-mode branch and explicit DTO fields. `npm test -- --run tests/unit/web-route.test.js -t 'serves overview, queues'` Red — the form had no `queueMode`; Green passed after adding the mode selector, reward-field grouping and conditional request payload.
- **Local lifecycle:** PostgreSQL Red observed `QUEUE_REWARD_NOT_READY` when opening a local queue. Green passed with local-only state changes and audit records, no Twitch outbox. Deleting a never-rewarded local queue first failed with the existing managed-reward prerequisite; Green passed with soft deletion, key release, preserved entry history and no finance operation. Focused command: `npm test -- --run tests/integration/queue-repository.test.js -t 'deletes a never-rewarded local queue|opens and closes a local queue'`.
- **Reward-backed conversion and race:** the race test first failed because `requestManualModeTransition` was absent. Green passed after adding the durable pause intent; the same PostgreSQL contract proves an `UNFULFILLED` redemption during transition is recorded and gets a `redemption.cancel` task. Confirmation test proves queue mode stays `channel_points` before confirmation, then switches only after the leased pause operation confirms; reward ID/origin and cost remain historical, and no reward DELETE is created.
- **Conversion recovery:** a PostgreSQL Red observed that an unknown pause could not be retried. Green passed after recording a new idempotent pause task for explicit retry. `npm test -- --run tests/unit/reward-outbox-worker.test.js -t 'retries a manual-mode pause safely'` Red — worker returned `unknown` while Twitch still showed the reward active; Green passed after safe backoff/retry of the idempotent pause. `npm test -- --run tests/unit/twitch-reconciliation.test.js -t 'converted manual queue reward'` Red — reconciliation marked a correctly paused reward divergent when local manual intake was open and did not finalize a pending switch; Green passed after treating manual mode as always remotely paused and confirming pending intent from the verified remote state.
- **Block calls during conversion:** PostgreSQL Red — `npm test -- --run tests/integration/queue-repository.test.js -t 'blocks new calls while a reward-backed queue is switching to manual mode'` failed because `callNext` moved a waiting entry to `called` while the Twitch pause was pending. Green — the same isolated PostgreSQL test passed after both bulk and specific call operations rejected pending/unknown/failed conversion states without moving entries or enqueuing chat notifications. HTTP Red — `npm test -- --run tests/unit/queue-routes.test.js -t 'stable conflict code when reward-to-manual conversion blocks calls'` returned 400 and omitted a stable code; Green — 409 with `QUEUE_MODE_TRANSITION_PENDING` passed without exposing the internal error. Panel copy Red — `npm test -- --run tests/unit/panel-error-presentation.test.js -t 'state-conflict codes'` used generic text for the new code; Green — localized en/es/pt-BR catalog mapping passed. Refactor centralized the PostgreSQL guard for both call paths. The user-facing instance was not rebuilt during the operator's live test.
- **Chat guidance during conversion:** `npm test -- --run tests/unit/chat-command-handler.test.js -t 'explains that calls are paused while a reward queue switches to manual mode'` Red — a moderator `proximo` received only the generic command failure. Green — the handler now selects a product-owned localized message for the stable transition conflict; no notification is enqueued and technical error text is not sent to chat. `npm run validate:localization` confirmed all locale catalogs remain complete.
- **Call deadline in the operator panel:** `npm test -- --run tests/unit/call-deadline-presentation.test.js` Red — the deadline presentation module did not exist, so the panel had no way to display remaining time or distinguish delivery-pending, no-timeout, and expired states. Green — the new projection uses the persisted call deadline, the protected queue API includes delivery confirmation time, and the UI renders localized countdown/status text in en/es/pt-BR. Focused tests also verify the deadline fields in the protected API projection; the countdown refreshes with the existing five-second panel polling and does not mutate entry state.
- **Independent capability status:** focused EventSub/integration/health tests cover chat connected while reward capability is unsupported and keep Twitch status fields separate. No authorized real Twitch reward, redemption, pause, cancellation, or chat write was performed.
- **Capability from actual API results:** `npm test -- --run tests/unit/twitch-adapter.test.js -t 'actual Helix reward capability'` Red — an unknown `broadcasterType` returned unsupported without calling `getCustomRewards`. Green after removing the metadata-only gate and probing Helix; the adapter now distinguishes a successful read, documented `403` unsupported, `401` invalid token, and transient/other failures. `npm test -- --run tests/unit/twitch-adapter.test.js tests/unit/twitch-integration.test.js` later exposed the stale 403 expectation (`authorization_required`); the test was corrected to `channel_ineligible` and an integration regression confirms a denied reward probe keeps chat/EventSub alive without starting reward reconciliation. Refactor/focused rerun: **35/35 tests passed**. This tests the API contract with fakes; Twitch docs and an authorized live check remain the acceptance sources.
- **Reward stock snapshot (historical design, superseded 2026-10-08):** The earlier Red/Green cycle implemented a stock snapshot and direct PATCH based on the assumption that `is_in_stock` was writable. The new official-contract review and authorized live probe disproved that assumption: HTTP 200 left `is_in_stock=true` in both PATCH response and subsequent GET. That older implementation was removed; its original TDD record is retained here as history, not as current behavior.
- **Twitch reward pause/synchronization correction (2026-10-08):** Red 1: adapter/outbox/reconciliation tests failed because the old logic sent/required stock state and persisted `reward_stock_before_close`; the real PostgreSQL migration contract confirmed that column existed. Red 2: `npx vitest run tests/unit/twitch-adapter.test.js tests/unit/reward-outbox-worker.test.js -t 'updates only pause through|stale response|missing persisted reward|wrong persisted reward id|failed remote read|does not confirm a reward pause|explicit 429'` failed **10 tests**: pause still bypassed the configured Twurple API client, stale/missing remote state was classified incorrectly by the adapter contract, and workers did not recognize Twurple's `statusCode` errors for 400/401/403/429. Red 3: `npx vitest run tests/integration/queue-repository.test.js -t 'does not clear a remote divergence'` failed because reconciliation cleared `diverged` after a local queue edit made after the Twitch read. Green: remove the stock snapshot column with a forward migration; send only `{isPaused, autoFulfill:false}` through Twurple `updateCustomReward`, reread the reward, and reject missing/wrong-ID/read-error results; normalize Twurple `statusCode` alongside existing `status` across reward worker retry/permanent/unknown handling; bind divergence confirmation to the queue version checked against Twitch. Focused Green: `npx vitest run tests/unit/twitch-adapter.test.js tests/unit/reward-outbox-worker.test.js tests/unit/twitch-reconciliation.test.js tests/integration/postgres-foundation.test.js tests/integration/queue-repository.test.js` passed **158 tests in 5 files**, including real PostgreSQL migrations and the stale-version race. Refactor routes pause changes through the pinned SDK and its configured client/rate limiter instead of a hand-built Helix call. Live evidence: the earlier authorized idempotent PATCH returned HTTP 200 but stock remained true; no reward was deleted and no redemption was modified. `npm test` passed **833 tests in 99 files**; lint, typecheck, OpenGrep (0 findings), localization, version, Compose config, and diff checks passed. Runtime verification completed after rebuilding only the bot: the migration applied, `/health` returned `ok` with database/API/chat/rewards connected and 198 ms API latency, and a fresh Chrome reload showed the connected channel, seven preserved queues and rewards available. Database and secrets volumes were preserved. No reward or redemption was mutated during this runtime check.
- **Free manual add during conversion:** `npm test -- --run tests/integration/queue-repository.test.js -t 'keeps free operator adds available during conversion'` passed **1/1** on first execution. This was a coverage-only check: the repository already allowed the operation; no Red or implementation change is claimed. The real PostgreSQL assertion confirms the manual entry has no redemption/finance linkage while the racing redemption cancellation stays pending.
- **Full suite and quality gates (2026-10-07, after call-deadline panel presentation and conversion coverage):** `npm test -- --run` — **89 files / 765 tests passed**. `npm run lint`, `npm run typecheck`, `npm run validate:localization`, `npm run validate:version`, `npm run review:static` (**0 findings / 73 JS files**), `docker compose config --quiet`, and `git diff --check` passed. Independent QA, UX review, authorized live Twitch acceptance, and remote lifecycle proof remain pending; this does not close FND-9.
- **Queue creation regression verification (2026-10-07):** After adding the route-shaped key-bundle regression tests and making the rollback assertion order-independent, `npm test -- --run` passed **89 files / 767 tests**. `npm run lint`, `npm run typecheck`, `npm run review:static` (**0 findings / 73 JS files**), `npm run validate:localization`, `npm run validate:version`, `docker compose config --quiet`, and `git diff --check` all passed. Active Compose was not restarted; post-fix browser and live Twitch acceptance remain pending.
- **Twitch runtime adapter and safe diagnostics (2026-10-07):** Red: `npm test -- --run tests/unit/twitch-integration.test.js -t 'exposes the active Twitch adapter'` failed because `integration.twitch` was undefined after initialization, leaving chat and reward workers idle despite a healthy API probe. Green exposed the active adapter through a getter; the focused regression passed. Diagnostics Red tests reproduced unexpected queue errors classified as 400, raw Fastify error details in responses, and missing correlation for worker failures. Green added generic localized responses with `referenceId` and structured diagnostics without raw messages/stacks/payloads/secrets. Focused command `npm test -- --run tests/unit/safe-http-error-handler.test.js tests/unit/error-diagnostics.test.js tests/unit/outbox-loop.test.js tests/unit/queue-routes.test.js tests/unit/twitch-integration.test.js tests/unit/panel-error-presentation.test.js` passed 73 tests in 6 files. The authorized browser queue/outbox task was preserved; full gates and Docker runtime verification continue.
- **Twurple logger sanitization (2026-10-07):** The installed `@twurple/eventsub-ws` 8.2.0 declarations document the `logger.custom` override. Red: `npx vitest run tests/unit/eventsub-runtime.test.js -t 'replaces Twurple EventSub raw logs with correlated safe diagnostics'` failed with `Cannot read properties of undefined (reading 'custom')` when the EventSub logger was not configured. Green injects a safe logger, routes errors through the shared reporter, and writes only the reference ID/fixed warning code; raw SDK messages are discarded. Green rerun passed 1 test. Type/lint required documenting the second optional listener-factory argument while preserving existing one-argument test factories. This sanitizes logs; it does not itself prove EventSub subscription activation.
- **Recovery diagnostics and runtime verification (2026-10-07):** Red: `npx vitest run tests/unit/queue-routes.test.js -t 'correlates unavailable Twitch adapter responses for reward recovery'` failed because adapter-unavailable 503 responses had no reference; Green added correlation to candidate and association paths, and the focused test passed. Full validation: `npm test -- --run` **92 files / 780 tests passed**; lint, typecheck, localization/version checks, OpenGrep (**0 findings / 76 JS files**), Compose config and diff check passed. After rebuilding/restarting only `bot`, `/health` returned database/Twitch API/chat connected and API ping 202 ms; the database/secret volumes were preserved. Fresh Chrome test showed the existing dashboard reward but the panel correctly found no exact match and made no mutation/retry. Logs since restart contained no raw Twurple errors. FND-9 remains open: exact reward association, EventSub subscription activation and authorized redemption lifecycle are not yet verified.
- **Queue lifecycle controls UX (2026-10-07):** Red: `npx vitest run tests/unit/queue-action-state.test.js` first exposed three incorrect states (unresolved rewards were not safely represented; archived manual queues could not re-enable intake; valid local/synced queues showed a false block reason). Green: a pure action-state projection now keeps pause/activate/archive/unarchive/delete visible when relevant, disables remote actions until ownership/state is confirmed, and provides a recovery explanation; labels and controls are grouped below the queue heading. The localization contract Red caught stale `open/close` copy references; it was updated for `activate/pause`. Focused tests and Chrome verification followed. UX review confirms the ambiguous `create_unknown` queue must remain undeletable until reward ownership is resolved; no Twitch mutation or volume removal occurred.
- **Reward-association error copy (2026-10-07):** Chrome reproduced the empty-candidate result; the same-title/same-cost dashboard reward did not satisfy at least one exact matching condition, but the UI did not explain the requirements. Red: `npx vitest run tests/integration/panel-localization-contract.test.js -t 'explains why a reward with a matching title may still be unavailable for recovery'` failed because the message did not mention paused/managed requirements. Green: the message now states app ownership, paused state and matching UID/description/limits; the focused contract passed across pt-BR/en/es and the localization validator passed. An initial matcher typo (`managed` versus `manageable`) was corrected and rerun. No Twitch reward was edited or associated.
- **Reward-link diagnosis and severity logs (2026-10-08):** Red for compatibility: `npx vitest run tests/unit/pending-queue-reward-compatibility.test.js` failed 4/4 because the behavior was absent. Red for structured logging: focused logger tests failed before level filtering existed; `npx vitest run tests/unit/queue-routes.test.js -t 'logs safe mismatch counts'` failed because an empty candidate result emitted no event. Green adds reason-coded fail-closed matching, severity-filtered structured logs and safe counters. Twurple 8.2.0 `autoFulfill` now maps to Helix `should_redemptions_skip_request_queue`; absent values remain unknown. Live before/after normalization: 2 managed rewards, 0 candidates; final safe reasons `reward_not_paused: 2`, `title_mismatch: 1`. The reward with the queue title is not paused; the other reward has a different title. Full suite: 95 files / 796 tests; lint, typecheck, OpenGrep (0/79 JS files), localization/version, Compose and diff checks passed. No Twitch reward mutation or volume removal occurred.
- **Create Custom Reward pause contract (2026-10-08):** Official Helix documentation review found that `is_paused` is a read/update field, not a documented Create Custom Rewards request field. Red: `npx vitest run tests/unit/reward-outbox-worker.test.js` failed 6 cases because creation expected an immediately paused reward and could not confirm the actual POST response. Green: the worker POSTs with `is_enabled=false`, then PATCHes the unique created reward to enabled+paused, and commits the local association only after the PATCH response matches. Recovery after a lost POST response locates only a unique new exact-configuration reward; a lost/failed pause PATCH retries without repeating POST. Focused worker suite: 19/19 passed. This fix has not yet been validated against a real Twitch reward write.
- **Live diagnostic after rebuild (2026-10-08):** `APP_LOG_LEVEL=verbose docker compose up -d --build bot` completed; existing PostgreSQL and operational-secret volumes remained. After explicitly reloading Chrome, `/health` returned `ok`, database/chat/rewards `connected/available`, and Twitch API ping `195 ms`. Clicking **Vincular recompensa** issued the read-only candidate lookup and emitted `info` totals `2 managed / 0 candidates` plus `verbose` reasons `reward_not_paused: 2`, `title_mismatch: 1`. The panel displayed the matching requirements; no Twitch mutation, association, or repeat POST was made. Full suite passed 95 files / 797 tests; lint, typecheck, OpenGrep (0/79 JS files), localization/version, Compose, and diff checks passed. Live creation and pause PATCH still require an authorized eligible-channel test.
- **Chat ping latency wiring (2026-10-08):** Chrome history showed a `!fila ping` response with unavailable latency while `/health` could measure Twitch API latency. Red: `npx vitest run tests/unit/chat-command-handler.test.js -t 'handler created before health registration'` failed because no late-bound shared health reader existed. Green: a stable bridge lets a handler constructed before health registration read the real cached probe after attachment; chat/health suites passed 36/36. The channel is currently offline, so this fix was not tested by sending another live chat message.
- **Queue creation onboarding and stale Twitch PATCH response (2026-10-08):** Red: `npx vitest run tests/unit/queue-onboarding-flow.test.js` failed 4/4 because create/settings-save transitions were absent. Green adds a tested flow that opens settings immediately after queue creation, keeps the default closed state, and directs to activation only after save and confirmed reward synchronization; an unsynchronized reward leaves activation disabled with localized guidance. The full suite exposed one stale localization contract expecting the removed `queue_created` toast; it was updated to assert current onboarding keys and passes. Live Creator Dashboard showed “redemptions paused” after a pause, while the Helix PATCH response carried stale active flags. Red: `npx vitest run tests/unit/twitch-adapter.test.js -t 'stale response'` failed because the adapter returned the stale active state. Green: the adapter now reads the persisted reward through Twurple after PATCH; focused adapter/lifecycle tests pass. Focused set: **110/110 tests**. Existing Compose data volumes were retained; runtime rebuild and browser verification are pending.
- **Twitch reward picker recovery (2026-10-08):** Chrome reproduced the reported behavior: clicking **Vincular recompensa** with no compatible candidates only showed a toast; it never opened the dialog. Red: `npx vitest run tests/unit/reward-link-dialog.test.js` first failed behaviorally because incomplete reward records were exposed as selectable; Green filters invalid candidates. The dialog now opens before its Twitch read, displays localized loading/empty/error states, and can refresh the managed-reward list; link submission remains disabled without a complete compatible candidate, and the API rechecks ownership/configuration. The existing direct-Twitch route tests plus dialog/onboarding/adapter/localization focused set passed **94/94**. Compose rebuild and fresh browser verification are pending.
- **Post-create browser error regression (2026-10-08):** Chrome showed the row persisted but left the streamer on the new-queue form with generic failure. This was a success-path UI bug after `POST /api/queues` returned 201: `event.currentTarget` is null after the awaited request. Red: the new `tests/integration/panel-localization-contract.test.js` capture-before-await regression failed; Chrome reproduced the symptom. Green captures the form before any await, resets it through the stable reference, then navigates to queue settings. Focused regression passed 1/1, with lint/typecheck passing. Rebuild and live browser confirmation are pending.
- **Concurrent reward sync while saving queue settings (2026-10-08):** Chrome's new points queue opened its settings, then save returned a stale-version conflict while the reward worker changed queue version. Red: `npx vitest run tests/unit/queue-settings-version.test.js` failed because the safe retry predicate did not exist. Green retries the settings PATCH once only when the queue remains active/closed and every local field still matches the captured baseline; concurrent user setting changes or queue lifecycle changes fail closed. Predicate tests pass, along with lint/typecheck. Rebuild and browser confirmation remain pending.
- **Full validation and updated-container browser check (2026-10-07):** `npm test -- --run` passed **93 files / 785 tests**; lint, typecheck, localization/version validation, OpenGrep (**0 findings / 77 JavaScript files**), Compose config and `git diff --check` passed. Rebuilt/restarted only `bot`, retained `operational_secrets` and `postgres_data`, then explicitly reloaded Chrome. The new queue controls and clearer no-candidate explanation were visible. `/health` returned database/Twitch API/chat connected and 193 ms API ping. The account-linked panel remains operational; no reward association, remote mutation or volume deletion was performed. Earlier sanitized EventSub errors remain a separate open verification item; health connectivity does not prove subscription delivery.
- **Blocked delete explanation (2026-10-07):** Red: extended the localization contract to require the unavailable-candidate message to name deletion; it failed because the prior copy only described matching requirements. Green: all three locales now state that activation, pause, archive, and deletion require a paused reward managed by this app with matching settings; the focused contract and localization validator passed. The final **93-file / 785-test** suite and all gates above include this copy refinement.
- **Earlier focused checkpoint:** `npm test -- --run tests/integration/queue-repository.test.js tests/unit/queue-routes.test.js tests/unit/reward-outbox-worker.test.js tests/unit/twitch-reconciliation.test.js tests/unit/web-route.test.js tests/unit/eventsub-runtime.test.js tests/unit/twitch-integration.test.js tests/unit/health-route.test.js tests/unit/health-status.test.js` — **195 tests passed in 9 files** before the stock-state increment.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-07 | — | Story materialized from the approved Spec Pipeline after owner authorized implementation. | @sm |

## Dev Agent Record

### Agent Model Used

@dev implementation coordinated with the project-wide @data-engineer database authority. Independent @qa review is pending.

### Debug Log References

See the dated TDD evidence section above.

### Completion Notes List

Implementation remains in progress. The 2026-10-08 full quality run passed 103 files / 866 tests; lint, typecheck, localization/version checks, OpenGrep, Compose validation, and diff check passed. This branch also adds a contract-tested Codespaces continuation environment. Independent QA, UX review, and financial redemption acceptance remain open.

### File List

- `.aiox-core/development/agents/data-engineer.md`
- `.aiox/project-status.yaml`
- `.devcontainer/devcontainer.json`
- `.devcontainer/post-create.sh`
- `AGENTS.md`
- `CHANGELOG.md`
- `CHANGELOG_INTERNAL.md`
- `apps/api/prisma/migrations/20261007190000_queue_admission_modes/migration.sql`
- `apps/api/prisma/migrations/20261007203000_reward_pause_stock_state/migration.sql`
- `apps/api/prisma/migrations/20261008010000_remove_unsupported_reward_stock_state/migration.sql`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/commands/chat-handler.mjs`
- `apps/api/src/domain/queue-service.mjs`
- `apps/api/src/health-route.mjs`
- `apps/api/src/http/queue-routes.mjs`
- `apps/api/src/http/safe-http-error-handler.mjs`
- `apps/api/src/observability/error-diagnostics.mjs`
- `apps/api/src/observability/structured-logger.mjs`
- `apps/api/src/outbox/loop.mjs`
- `apps/api/src/outbox/reward-worker.mjs`
- `apps/api/src/persistence/queue-repository.mjs`
- `apps/api/src/runtime.mjs`
- `apps/api/src/server.mjs`
- `apps/api/src/twitch/eventsub-runtime.mjs`
- `apps/api/src/twitch/helix-adapter.mjs`
- `apps/api/src/twitch/integration.mjs`
- `apps/api/src/twitch/pending-queue-reward-compatibility.mjs`
- `apps/api/src/twitch/reconciliation.mjs`
- `apps/api/src/twitch/route-integration-proxy.mjs`
- `apps/shared/localization/discover-catalog-module.mjs`
- `apps/web/app.js`
- `apps/web/call-deadline-presentation.mjs`
- `apps/web/dom-localization.mjs`
- `apps/web/health-status.mjs`
- `apps/web/index.html`
- `apps/web/localization/catalogs/chat/en.tsv`
- `apps/web/localization/catalogs/chat/es.tsv`
- `apps/web/localization/catalogs/chat/pt-BR.tsv`
- `apps/web/localization/catalogs/panel/en.tsv`
- `apps/web/localization/catalogs/panel/es.tsv`
- `apps/web/localization/catalogs/panel/pt-BR.tsv`
- `apps/web/panel-catalog.mjs`
- `apps/web/panel-error-presentation.mjs`
- `apps/web/queue-action-state.mjs`
- `apps/web/queue-onboarding-flow.mjs`
- `apps/web/queue-settings-version.mjs`
- `apps/web/queue-sync-status.mjs`
- `apps/web/reward-link-dialog.mjs`
- `apps/web/styles.css`
- `compose.yaml`
- `docs/DEVELOPMENT.md`
- `docs/ROADMAP.md`
- `docs/integrations.md`
- `docs/pt-BR/CHANGELOG.md`
- `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/pt-BR/DESENVOLVIMENTO.md`
- `docs/pt-BR/ROADMAP.md`
- `docs/pt-BR/integrations.md`
- `docs/pt-BR/stories.md`
- `docs/pt-BR/stories/DOC-3/story.md`
- `docs/pt-BR/stories/FND-9/plan/implementation.yaml`
- `docs/pt-BR/stories/FND-9/spec/complexity.json`
- `docs/pt-BR/stories/FND-9/spec/critique.json`
- `docs/pt-BR/stories/FND-9/spec/requirements.json`
- `docs/pt-BR/stories/FND-9/spec/research.json`
- `docs/pt-BR/stories/FND-9/spec/spec.md`
- `docs/pt-BR/stories/FND-9/story.md`
- `docs/pt-BR/stories/FND-9/validation.md`
- `docs/pt-BR/stories/TWITCH-CAPABILITY-GAP-ANALYSIS.md`
- `docs/stories.md`
- `docs/stories/DOC-3/story.md`
- `docs/stories/FND-9/plan/implementation.yaml`
- `docs/stories/FND-9/spec/complexity.json`
- `docs/stories/FND-9/spec/critique.json`
- `docs/stories/FND-9/spec/requirements.json`
- `docs/stories/FND-9/spec/research.json`
- `docs/stories/FND-9/spec/spec.md`
- `docs/stories/FND-9/story.md`
- `docs/stories/FND-9/validation.md`
- `docs/stories/TWITCH-CAPABILITY-GAP-ANALYSIS.md`
- `tests/helpers/isolated-compose-cleanup.mjs`
- `tests/integration/codespaces-contract.test.js`
- `tests/integration/compose-contract.test.js`
- `tests/integration/compose-runtime.test.js`
- `tests/integration/panel-localization-contract.test.js`
- `tests/integration/postgres-foundation.test.js`
- `tests/integration/queue-repository.test.js`
- `tests/unit/call-deadline-presentation.test.js`
- `tests/unit/chat-command-handler.test.js`
- `tests/unit/documentation-contract.test.js`
- `tests/unit/dom-localization.test.js`
- `tests/unit/error-diagnostics.test.js`
- `tests/unit/eventsub-runtime.test.js`
- `tests/unit/health-route.test.js`
- `tests/unit/health-status.test.js`
- `tests/unit/isolated-compose-cleanup.test.js`
- `tests/unit/outbox-loop.test.js`
- `tests/unit/overlay-routes.test.js`
- `tests/unit/panel-catalog-placeholders.test.js`
- `tests/unit/panel-error-presentation.test.js`
- `tests/unit/pending-queue-reward-compatibility.test.js`
- `tests/unit/queue-action-state.test.js`
- `tests/unit/queue-domain-service.test.js`
- `tests/unit/queue-onboarding-flow.test.js`
- `tests/unit/queue-routes.test.js`
- `tests/unit/queue-settings-version.test.js`
- `tests/unit/queue-sync-status.test.js`
- `tests/unit/reward-dialog-contract.test.js`
- `tests/unit/reward-link-dialog.test.js`
- `tests/unit/reward-outbox-worker.test.js`
- `tests/unit/runtime-composition.test.js`
- `tests/unit/safe-http-error-handler.test.js`
- `tests/unit/structured-logger.test.js`
- `tests/unit/twitch-adapter.test.js`
- `tests/unit/twitch-integration.test.js`
- `tests/unit/twitch-reconciliation.test.js`
- `tests/unit/twitch-route-integration-proxy.test.js`
- `tests/unit/web-route.test.js`

### Panel operation and isolated Compose verification — 2026-10-08

- Red: `npx vitest run tests/unit/isolated-compose-cleanup.test.js` failed because the safe cleanup helper was absent. Green adds `tests/helpers/isolated-compose-cleanup.mjs`, validates the unique acceptance-project name and every configured/listed volume, tears down without `--volumes`, and removes only volumes returned under that project's Docker Compose label. The real acceptance run passed 3/3.
- Targeted panel/Twitch/domain/outbox/widget/Compose contracts passed 132/132. Additional tests cover a reward disappearing between candidate lookup and association, and sanitized/correlated unexpected deletion failure; both passed on first run because the fail-closed route behavior already existed (no Red is claimed). Full `npm test` before those two additions passed 102 files / 854 tests. Final full-suite count and gates are recorded in the validation report. Product volume names/timestamps stayed unchanged during the isolated acceptance run. No reward deletion was submitted to Twitch.
- Docker metadata shows product volumes created at `2026-10-08T00:02:57-03:00`; current PostgreSQL has zero queues, one saved OAuth credential, and `/health` reports Twitch API/chat/rewards connected with a 223 ms probe. The origin of the prior volume recreation is not established. This story remains InProgress pending independent QA, UX review, and authorized live reward lifecycle verification.

### Panel save, localization, and Twitch reward lifecycle regressions — 2026-10-08

- Red: `npx vitest run tests/integration/queue-repository.test.js -t 'includes operator queue settings in the panel projection'` failed because the PostgreSQL projection omitted call text/deadline and refund/account settings. Green adds those fields and call notification time; the isolated real-PostgreSQL test passes. In Chrome after rebuild, settings reopened with the persisted call text, 10-minute default, and refund flags; changing the timeout to 12 and saving returned the success state.
- Red: `npx vitest run tests/unit/dom-localization.test.js -t 'preserves documented placeholder tokens in static help text'` rendered the safe-unavailable text because static catalog application discarded its placeholder allowlist. Green preserves only documented tokens as literal text nodes. The rebuilt panel showed the full accepted placeholder list.
- Red: `npx vitest run tests/unit/queue-routes.test.js -t 'returns a safe diagnostic reference when saving local queue settings fails unexpectedly'` failed because the route returned no correlation ID. Green adds sanitized `referenceId` and `x-error-reference` to unexpected local/reward settings failures and unexpected open/archive/unarchive/manual-mode failures; known conflicts remain stable, actionable responses. The lifecycle diagnostic test passed for all four actions.
- Red: the operator DTO regression detected that the viewer-leave refund field was named differently from the form field, so reopening the form could silently clear the option. Green aligns the response property with the persisted/form contract; route, settings, localization, and PostgreSQL focused checks passed **186/186**.
- Live authorized acceptance used one disposable bot-created reward while the Twitch channel was offline: updated local settings and saved successfully; activated the reward, confirmed `synced`; paused, confirmed `synced`; archived and confirmed the pause; unarchived and confirmed it stayed closed; then deleted the queue through the confirmed deletion flow. The outbox recorded `reward.delete=confirmed`, and a refreshed Twitch Creator Dashboard text check found zero rows for the disposable reward title. No redemption, cancellation, or fulfillment was created. PostgreSQL and operational-secret volumes kept their original `2026-10-08T00:02:57-03:00` creation timestamps.
- Final local gates: `npm test` **102 files / 862 tests passed**; lint, typecheck, localization/version validation, OpenGrep (**0 findings / 84 JS files**), Compose config, and `git diff --check` passed. Rebuilt/restarted the Compose bot and reloaded Chrome; `/health` returned `ok`, with database, Twitch API, integration, chat and rewards available. FND-9 remains InProgress until independent QA/UX reviews and remaining acceptance criteria are complete.

### Standardized unexpected HTTP failures — 2026-10-08

- Red: `npx vitest run tests/unit/safe-http-error-handler.test.js tests/unit/queue-routes.test.js -t 'generic message plus reference|safe diagnostic reference when saving local queue settings fails unexpectedly'` failed because both the global handler and settings route omitted a stable API error code. A queue-creation regression also failed when run with `npx vitest run tests/unit/queue-routes.test.js -t 'unexpected queue creation failures'`.
- Green: unexpected failures now return `code: INTERNAL_ERROR`, safe localized copy, and `referenceId`; the same reference is returned in `x-error-reference` and included in sanitized diagnostics. Red also reproduced expected settings errors (`STALE_QUEUE_VERSION` and invalid values) being reduced to the generic toast because the routes omitted `code`. Green adds stable codes for settings/reward validation, template errors, stale/deleted/unavailable queues and pending reward updates, with panel translations in pt-BR, English and Spanish. The panel ignores backend raw messages and displays catalog-owned copy plus a UUID-validated reference.
- Focused route/error-presentation/real-PostgreSQL verification passed 161/161. Full suite passed 102 files/863 tests; lint, typecheck, documentation contract, localization/version validation, OpenGrep (0 findings), Compose config, and diff checks passed.
- Runtime: rebuilt/restarted the bot without removing or recreating product data volumes. `/health` returned `ok`; database, Twitch API/integration, chat and rewards were connected/available. The database and operational-secret volume creation timestamps remain `2026-10-08T00:02:57-03:00`. A fresh Chrome tab reloaded the panel without the stale generic toast. The prior authorized settings save/reload and disposable Twitch reward lifecycle are recorded above.
- Refactor: consolidated unexpected route failures on the shared diagnostic response helper and made the top-level Fastify error handler follow the same response contract.

## QA Results

Pending independent @qa review after implementation.

### Context-specific reward errors — 2026-10-08

- Red: `npx vitest run tests/unit/panel-error-presentation.test.js -t 'stable locale, Twitch, OAuth, widget, and state-conflict codes'` failed because `QUEUE_REWARD_NOT_READY` used deletion-only copy, which was misleading in the reward settings dialog. Green maps it to dedicated actionable copy (“refresh and review pending reward operations”) with pt-BR, English and Spanish catalog entries. The focused regression passed 1/1 and `npm run validate:localization` passed.
