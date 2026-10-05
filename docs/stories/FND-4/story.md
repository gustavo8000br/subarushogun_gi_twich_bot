# Story FND-4: Twitch OAuth, adapters, and reconciliation

[Português brasileiro](../../pt-BR/stories/FND-4/story.md)

**Complexity:** COMPLEX
**Executor:** @dev
**Quality gate:** @qa
**Epic/capability:** Twitch integration, FND-4
**Source:** `docs/stories.md` FND-4 section; `docs/integrations.md`; `docs/stories/FND-0/spec/spec.md`.

## Status

**InReview**

## Story

**As a** streamer configuring the local Twitch chatbot,
**I want** to validate my confidential Twitch app, connect the broadcaster account, and recover managed reward/redemption state,
**so that** the chatbot can manage its own queue rewards without exposing credentials or inventing remote results.

## Acceptance Criteria

1. Twitch Client ID/Secret validation uses Client Credentials; a failed validation does not save the replacement and no secret/token/code appears in responses, UI, URLs, logs, or errors.
2. Authorization Code flow uses one-time session-bound state and the exact HTTPS callback `https://localhost:${APP_PORT:-3000}/callback`; token identity must match the configured Client ID/broadcaster and required scopes. Token refresh is persisted, startup/hourly validation is supported, and revoked authorization leaves the local panel available for reconnect.
3. The authorized user must be the configured broadcaster. Affiliate/Partner and Channel Points API availability are checked before activating Twitch features. Safe setup projection displays only allowlisted eligibility/capacity fields and explains unavailable/ineligible states.
4. Only app-managed rewards are associated. Reward creation is a durable local outbox intent, checks channel capacity, creates paused with redemption request queue enabled, and never blindly retries an unknown POST result. Ambiguous ownership can be resolved only by revalidating an exact app-managed reward and recording an operator audit without claiming Twitch confirmation.
5. EventSub redemption add/update and paginated reconciliation deduplicate by redemption ID, preserve terminal state, handle update-before-add and partial failure, and recover after reconnect. Chat/EventSub subscriptions use the streamer's account and required least-privilege scopes.
6. Real isolated PostgreSQL tests cover credential binding/persistence, durable reward creation/association, lease recovery and unknown outcomes. Unit adapter tests use fakes; no real Twitch success is claimed without an authorized run.
7. Official integration references are dated, version-pinned, bilingual, and include the operation/event → endpoint → scope → SDK mapping.

## Scope

Includes Twitch app validation and OAuth, token lifecycle, Twurple adapters, channel eligibility, managed reward creation and ownership recovery, EventSub, redemption reconciliation, setup-panel status and related integration documentation. Reward editing/open-close/archive/delete are broader panel/reward lifecycle behavior tracked in FND-5/FND-6. Live Twitch acceptance is an operator step after merge and is not claimed here.

## TDD Evidence

- OAuth behavior: `tests/unit/twitch-oauth.test.js` — 6 tests passed after Red for missing Client Credentials validation, state binding/expiry/reuse and identity/scope checks; PostgreSQL credential persistence tests verify same-app binding semantics.
- Twurple runtime/adapters: `tests/unit/twitch-auth-runtime.test.js`, `tests/unit/twitch-adapter.test.js`, `tests/unit/eventsub-runtime.test.js`; missing normalized event identities first failed the EventSub contract, then passed after adapter normalization.
- Reconciliation: `tests/unit/twitch-event-processor.test.js`, `tests/unit/twitch-reconciliation.test.js`, `tests/unit/twitch-integration.test.js`; queue-mode regression first accepted `should_redemptions_skip_request_queue=true`, then passed after normalization and divergence handling.
- Durable reward intent: PostgreSQL Red had 2 failures because atomic queue/reward outbox creation was absent; Green passed 38. Worker Red had 6 behavior failures and PostgreSQL Red had 2 missing claim/state operations; after leased worker, paused create, capacity guard, ownership matching and unknown-result handling, unit and isolated PostgreSQL suites passed.
- Ambiguous reward recovery: PostgreSQL Red 2, route Red 404, and UI Red due missing action/endpoints; Green verified exact app-managed candidates, Twitch re-fetch, session/CSRF, actor audit, closed queue and no false API confirmation.
- Eligibility projection: `tests/unit/queue-routes.test.js -t 'safe setup projection'` first omitted eligibility. Green passes with a forbidden `privateToken` field excluded. `tests/unit/setup-messages.test.js` covers Affiliate/Partner capacity, ineligible/unavailable states and pending checks. These use adapter fixtures; no broadcaster was queried.
- HTTPS credential form regression: reproduced `currentTarget` becoming null after async form dispatch; stable references now clear the Secret after success. See `docs/stories.md` for exact commands/results.

## Validation Record

- Final local suite: `npm test` — 45 files, 283 tests passed.
- `npm run lint`, `npm run typecheck`, `npm run review:static` (40 application JS files, 0 findings), `npm run validate:version`, `docker compose config --quiet`, and `git diff --check` passed.
- `npm test -- --run tests/integration/compose-runtime.test.js` — 3 isolated Compose/HTTPS tests passed.
- No real Twitch OAuth, reward, redemption, refund, chat, or EventSub operation was run. Operator will perform Windows/Twitch acceptance after merge.

## File List

Files in this review:

- `.dockerignore`, `.gitignore`, `AGENTS.md`, `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`, `README.md`, `README.pt-BR.md`, `compose.yaml`, `iniciar.sh`, `iniciar.bat`, `atualizar.sh`, `atualizar.bat`, `desinstalar.sh`, `desinstalar.bat`.
- `apps/api/src/http/local-session.mjs`, `apps/api/src/http/queue-routes.mjs`, `apps/api/src/persistence/queue-repository.mjs`, `apps/api/src/runtime.mjs`, `apps/api/src/server.mjs`, `apps/api/src/twitch/auth-runtime.mjs`, `apps/api/src/twitch/helix-adapter.mjs`, `apps/api/src/twitch/integration.mjs`, `apps/api/src/outbox/reward-worker.mjs`.
- `apps/infra/scripts/bootstrap.mjs`, `apps/infra/scripts/healthcheck.mjs`, `apps/infra/src/bootstrap-secret.mjs`, `apps/web/app.js`, `apps/web/index.html`, `apps/web/application-setup.mjs`, `apps/web/setup-messages.mjs`.
- `docs/integrations.md`, `docs/pt-BR/integrations.md`, `docs/stories.md`, `docs/pt-BR/stories.md`, `docs/stories/FND-0/spec/spec.md`, `docs/pt-BR/stories/FND-0/spec/spec.md`, `docs/stories/FND-1/story.md`, `docs/pt-BR/stories/FND-1/story.md`, `docs/stories/FND-4/story.md`, `docs/pt-BR/stories/FND-4/story.md`, `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`.
- `tests/integration/compose-contract.test.js`, `tests/integration/compose-runtime.test.js`, `tests/integration/queue-repository.test.js`, `tests/unit/bootstrap-secret.test.js`, `tests/unit/documentation-contract.test.js`, `tests/unit/local-ignore-policy.test.js`, `tests/unit/local-session.test.js`, `tests/unit/queue-routes.test.js`, `tests/unit/runtime-composition.test.js`, `tests/unit/start-script.test.js`, `tests/unit/twitch-adapter.test.js`, `tests/unit/twitch-auth-runtime.test.js`, `tests/unit/twitch-integration.test.js`, `tests/unit/twitch-oauth.test.js`, `tests/unit/web-route.test.js`, `tests/unit/maintenance-scripts.test.js`, `tests/unit/reward-outbox-worker.test.js`, `tests/unit/setup-messages.test.js`, `tests/unit/web-application-setup.test.js`.

## QA Results

Pending @qa review.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-05 | 0.1.0 | FND-4 story formalized from implementation and TDD evidence; submitted to QA review. | @dev |
