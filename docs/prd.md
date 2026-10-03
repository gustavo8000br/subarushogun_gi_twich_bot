# Product Requirements Document: Local Twitch Queue Bot

[Português brasileiro](pt-BR/prd.md) · Source: [project brief](project-brief.md) and [FND-0 specification](stories/FND-0/spec/spec.md).

## Product outcome

An operator can configure and run multiple Twitch channel-points queues for one broadcaster, keep entry order and service history locally, and recover point operations safely after interruption.

## Users and roles

- **Streamer/operator:** owns the Twitch application and channel, configures queues and accounts, and manages service.
- **Authorized moderator:** performs queue management through trusted current-message moderator badges; VIP management is a separate opt-in setting, false by default.
- **Viewer:** joins only by redeeming a queue reward, or observes their own position/state and leaves their own active entry through chat.

## Functional requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Install one local instance through Compose with persistent PostgreSQL, one-time secret bootstrap, ordered health/migrations, and loopback access. | P0 |
| FR-2 | Configure Twitch app credentials locally, validate Client Credentials, run session-bound one-use OAuth, check identity/scopes/eligibility, and persist token refresh safely. | P0 |
| FR-3 | Manage only app-owned queue rewards; retain desired and confirmed remote state separately; make creation/deletion recoverable. | P0 |
| FR-4 | Support multiple queues, globally unique normalized keys, configurable policies and immutable history identity. | P0 |
| FR-5 | Accept entries only from owned redemptions or authorized manual adds; enforce Twitch ID identity, per-queue active uniqueness, and exact visible UID format. | P0 |
| FR-6 | Route all entry transitions through one domain service and atomically persist state, ordering/account changes, audit, policy snapshot, and outbox intent. | P0 |
| FR-7 | Process points operations through durable PostgreSQL outbox with idempotency, leases, retries, remote-state resolution, and visible conflict/unknown states. | P0 |
| FR-8 | Receive redemption/chat events with EventSub WebSocket, send via Helix, deduplicate, and reconcile after startup/reconnect/interval/operator request. | P0 |
| FR-9 | Parse Portuguese commands independently from execution/authorization and enforce channel, role, identity, syntax, cooldown, and response limits. | P0 |
| FR-10 | Provide list/position/leave/add/remove/next/start/complete/move/open/close/archive/clear/account operations, notifications, and no-show timers per policy. | P0 |
| FR-11 | Provide a local vanilla UI and protected Fastify API with installation, health, queues, entries, finance, reconciliation, account settings, and explicit state projection. | P1 |
| FR-12 | Persist current/default account labels and switch ownership; only a single-person automatic call may set ownership. | P1 |
| FR-13 | Expose complete runtime product version separately from API contract and state revision; materialize exact seven-character source SHA only for artifacts. | P1 |
| FR-14 | Keep English primary docs and equivalent pt-BR installation, stories/evidence, integration, versioning, and changelog docs. | P1 |

## Acceptance and release gates

Acceptance IDs AC-1 through AC-20 are defined in `stories/FND-0/spec/requirements.json`; they are the authoritative testable behaviors. All behavior is test-first. Required evidence includes unit tests, real isolated PostgreSQL/migration contracts, Compose contracts/acceptance, privacy and security tests, version materialization checks, and bilingual documentation parity. The project quality gates additionally include `npm run lint`, `npm run typecheck`, `npm test`, build, database, Compose and version checks once implemented.

## Non-goals

No public signup, viewer join command, game credentials, UID verification, Discord/DM, overlay, ranking, multiple channels/apps/bot accounts, hosted backend/database, telemetry, export/backup feature, horizontal scaling, IRC, frontend framework, TypeScript, transpiler, or bundler.

## Sequencing

FND-1 runtime/persistence → FND-2 domain/parser/order → FND-3 financial outbox → FND-4 Twitch auth/adapters/reconciliation → FND-5 chat/calls/accounts → FND-6 local panel/security/system acceptance. Each story passes AIOX story validation and the TDD contract before implementation.

## Source traceability

Requirements and acceptance criteria map to FR-*, NFR-*, CON-* in [requirements.json](stories/FND-0/spec/requirements.json). Technology and external API choices are constrained to the dated findings in [research.json](stories/FND-0/spec/research.json). No new user-facing capability is introduced here.
