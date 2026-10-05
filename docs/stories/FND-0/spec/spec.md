# Product Specification: Local Twitch Queue Bot for Genshin Impact

[Português brasileiro](../../../pt-BR/stories/FND-0/spec/spec.md)

> **Story ID:** FND-0  
> **Complexity:** COMPLEX (25/25)  
> **Generated:** 2026-10-02  
> **Status:** Draft for AIOX critique  
> **Source:** User's complete Prompt 1 and folder-layout clarification

## 1. Overview

Build a local-first, single-channel Twitch application for managing multiple Genshin Impact service queues. Queue entry comes only from an app-owned Channel Points reward redemption or an authorized streamer/moderator manual add. Twitch is the authority for points; the local PostgreSQL database is the authority for queue order, service lifecycle, financial intent, and history.

### Goals

- Install and operate from Docker Compose v2 without host Node.js or PostgreSQL.
- Preserve queue operations and point intentions through process, network, and machine restarts.
- Provide Twitch OAuth/reward/chat integration and a local operator panel.
- Keep the product in Brazilian Portuguese and the canonical project documentation in English with equivalent Portuguese documents.
- Make every behavior increment test-first and auditable.

### Non-goals

Hosted service/backend, remote database, telemetry, public-domain requirement, Discord/DMs, second bot account, IRC, viewer join command, public signup, UID registration, overlay/OBS, ranking, backup/export product feature, multi-channel mode, multiple bot identities, and horizontal scaling.

## 2. Requirements Summary

The complete structured requirements are in [requirements.json](requirements.json); complexity and verified sources are in [complexity.json](complexity.json) and [research.json](research.json).

### Functional requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | First-run Compose, bootstrap secrets, local PostgreSQL, migrations, health, and safe operator lifecycle. | P0 |
| FR-2 | Twitch app credential validation, session-bound OAuth, token validation/refresh, eligibility, and reconnection. | P0 |
| FR-3 | Own and safely manage queue rewards, archive and deletion workflows, and desired versus confirmed remote state. | P0 |
| FR-4 | Persist queue configuration, keys, native Twitch limits, privacy, and immutable local history identity. | P0 |
| FR-5 | Redemption/manual-only entry, Twitch ID identity, active-entry uniqueness, and strict UID handling. | P0 |
| FR-6 | One domain transition service with atomic local state, policy snapshot, audit, order/account changes, and outbox intent. | P0 |
| FR-7 | Durable financial outbox with leases, retry, remote reconciliation, conflicts, and visible unknown states. | P0 |
| FR-8 | EventSub WebSocket, Helix chat, deduplication, and startup/reconnect/periodic/operator reconciliation. | P0 |
| FR-9 | Pure Portuguese parser plus trusted channel/actor authorization, cooldown, dedupe, limits, and safe send-result handling. | P0 |
| FR-10 | Queue, call, service, cleanup, open/close, account, and timeout operations with specified policies. | P0 |
| FR-11 | Local Fastify/static vanilla UI and session-protected explicit API projections. | P1 |
| FR-12 | Persist account label, source, owner, automatic individual-call switching, and reset rules. | P1 |
| FR-13 | Separate product identity, API contract version, and state revision; validate and materialize exact SHA identity. | P1 |
| FR-14 | Keep English canonical and Portuguese equivalent docs/changelogs linked and semantically aligned. | P1 |

All testable Given/When/Then criteria AC-1 through AC-20 are defined in `requirements.json` and are binding for the stories below.

### Non-functional requirements

- **Security:** no secret/token/code/password/connection-string leakage; local Host/Origin/session/CSRF controls; allowlisted persistence of untrusted Twitch text; non-root bot; least-privilege secret mounts.
- **Reliability:** durable state and outbox; Twitch-confirmed point outcomes; no exactly-once network claim; restart and partial-recovery safety.
- **Concurrency:** PostgreSQL constraints and short transactions serialize same-queue order and global current-account changes; one bot process only.
- **Usability:** operator and chat content in pt-BR, compact responses of at most 500 characters, actionable errors, install with Docker Compose v2 and browser only.
- **Maintainability:** JavaScript ESM/JSDoc, Fastify, vanilla assets, pinned dependencies and lockfile, Prisma/PostgreSQL, Vitest, no application TypeScript/transpiler/bundler.
- **Documentation:** English primary plus equivalent pt-BR, and per-increment genuine TDD evidence.

## 3. Technical Approach

### Architecture

Use a monolith with explicit application directories:

```text
apps/
  api/       Fastify API, domain services, persistence, Twitch adapters, workers
  web/       Vanilla HTML, CSS, and JavaScript served by @fastify/static
  infra/     Bootstrap and local operational scripts used by Compose
Dockerfile
compose.yaml
iniciar.bat
iniciar.sh
```

Other `apps/*` directories may be added only when required. The framework `.env.example` is not product configuration. Root Compose/Docker entrypoints remain where the product requirements name them. Prisma schema and migrations live with `apps/api` and remain versioned.

One Compose deployment contains four responsibilities: one-shot idempotent `bootstrap`, PostgreSQL `db`, one-shot `migrate`, and non-root `bot`. Persist the PostgreSQL data and an independent named secret volume. Bootstrap creates a random database password once and preserves it; the remaining containers receive only read-only mounts to the same password file. `db` publishes no host port. The bot builds a correctly URL-encoded connection string from the secret before loading Prisma configuration, never logging it. Compose gates `db` on health and `bot` on successful migration. The app binds `0.0.0.0` in its container and the host maps `127.0.0.1:${APP_PORT:-3000}:3000`.

The local panel and Twitch callback use `https://localhost:${APP_PORT:-3000}` and `/callback`. Bootstrap creates a persistent local CA and localhost server certificate in the secret volume; only the public CA certificate is exported beneath ignored `.local/` for the operator to trust in the current-user certificate store. The bot mounts the TLS key read-only and starts Fastify with HTTPS. No public hostname, proxy, LAN binding, or automatic host trust-store mutation is required. The secure session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure`; mutating requests accept only the exact HTTPS local Origin. The Twitch console rejected the HTTP callback during setup despite current public Twitch documentation examples still showing HTTP localhost, so the tested console behavior is the product contract.

The user-mandated app layout is implemented without frontend compilation. `apps/api` provides domain, parser, persistence, outbox, OAuth, Helix/EventSub adapters, Fastify routes, and lifecycle workers. `apps/web` is static source. `apps/infra` owns bootstrap/start/wait/open-browser logic. Keep SQL transaction duration short; call Twitch outside database transactions.

### Stack and version choices

| Component | Planned pin | Evidence and reason |
| --- | --- | --- |
| Runtime/container | Node 24.20.0 LTS, `node:24.20.0-bookworm-slim` | Node release status and Docker Official Image checked 2026-10-02. |
| Database/container | PostgreSQL 18.6, `postgres:18.6-bookworm` | Current supported minor on PostgreSQL versioning page checked 2026-10-02. |
| Prisma | `prisma`, `@prisma/client`, `@prisma/adapter-pg` 6.19.3; `pg` 8.23.1 | Official v6 docs support `.mjs` Prisma config and `prisma-client-js`; v7 `prisma-client` emits TypeScript. |
| Twitch SDK | `@twurple/auth`, `@twurple/api`, `@twurple/eventsub-ws` 8.2.0 | npm metadata shows package peer versions aligned at 8.2.0; official current references consulted. |
| HTTP/static/tests | Fastify 5.12.5, `@fastify/static` 10.1.5, Vitest 5.0.3 | Current package metadata checked 2026-10-02; pin and lock exact versions. |

Use a root npm workspace/lockfile so the Docker image can run `npm ci`; app dependencies and scripts remain scoped to `apps/*`. `prisma.config.mjs` is supported by Prisma v6.19.3. The selected generator is `prisma-client-js`, explicitly accepting its deprecation in Prisma 7 to honor the user’s JavaScript-only requirement. Add no TypeScript generated client or frontend build step.

### Domain and persistence

Model queues, queue keys, entries, redemptions, outbox operations, audit logs, installation settings, private OAuth credentials, and processed operations. Store Twitch IDs and UID as strings; use local UUIDs; store UTC timestamps. Never save raw chat/redemption event payloads.

Use a SQL partial unique index for one active entry per `(queue_id, twitch_user_id)` when status is `waiting`, `called`, or `in_progress`. Add database uniqueness for redemption ID, global normalized queue keys, outbox idempotency, and processed operations. Encode manual/redemption source integrity as SQL checks/relations. Serialize mutations of a queue with transaction-level locks and globally serialize current-account updates in PostgreSQL; process only one bot instance.

Every entry state change passes through one domain service used by chat, panel, timer, EventSub, and reconciliation. The service writes state, queue order/account changes, audit, policy snapshot, and any financial intention together. The outbox sends after commit. For local transactions use PostgreSQL and real Prisma migrations, not SQLite or mocked Prisma.

### Twitch operations and scopes

| Operation | Endpoint/event | User scope |
| --- | --- | --- |
| App credential proof | `POST https://id.twitch.tv/oauth2/token`, `grant_type=client_credentials` | Client ID/Secret; no user scope |
| Connect/refresh streamer | OAuth authorize/token and `/oauth2/validate` | `channel:manage:redemptions user:read:chat user:write:chat` |
| Create/get/update/delete own custom reward | Helix `/channel_points/custom_rewards` | `channel:manage:redemptions` (GET also supports read scope) |
| Page/query redemption state | Helix `/channel_points/custom_rewards/redemptions` | `channel:manage:redemptions` (GET also supports read scope) |
| Cancel/fulfill a redemption | PATCH Helix redemption status to `CANCELED` or `FULFILLED` | `channel:manage:redemptions` |
| Receive new/update redemption | EventSub `channel.channel_points_custom_reward_redemption.add` / `.update` | `channel:manage:redemptions` or `channel:read:redemptions` |
| Receive chat | EventSub `channel.chat.message` over WebSocket | `user:read:chat` |
| Send chat | Helix `POST /chat/messages`, broadcaster's own user token | `user:write:chat` |

The OAuth scopes above are the minimum expected by this architecture; add none without a documented endpoint requirement. EventSub and Helix fields/status formats are normalized inside the Twitch adapter. Verify SDK method names, result shapes, error behavior, and supported subscription methods against the pinned packages before coding.

The Twitch docs checked 2026-10-02 state: custom reward title max 45 characters; prompt max 200; at most 50 enabled plus disabled rewards; app that created reward controls it; rewards require Affiliate/Partner; `should_redemptions_skip_request_queue=false` preserves `UNFULFILLED`; deleting a reward with pending redemptions marks those redemptions `FULFILLED`. Chat API allows up to 500 characters and reports whether the message was sent. These semantics govern creation, cancellation, deletion, and chat confirmation.

OAuth uses a short-lived, one-use random state linked to the initiating local session. Save new app credentials only after Client Credentials success. Persist `RefreshingAuthProvider` token updates atomically. Validate on startup and at least hourly. Client ID/broadcaster identity is fixed once data/rewards exist; Secret rotation for the same app is supported. Local UI never returns any part of a saved Secret.

### Financial and recovery behavior

`CANCELED` means refund request; report refunded only after Twitch confirms `CANCELED`. `FULFILLED` means consume request; report consumed only after confirmation. A DB commit and Twitch request cannot be one transaction and do not provide exactly-once network delivery.

For a terminal transition: transactionally validate/lock, update entry and order/account, record audit and immutable policy decision, insert the unique outbox intent, then commit. The worker calls Twitch outside the transaction and records confirmation/retry/conflict/unknown. Use durable leases, bounded exponential backoff with jitter, `Retry-After`/rate-limit data for 429, controlled 401 revalidation, and remote status lookup after lost responses. A 404 is not proof of cancellation. Keep conflicts visible and do not erase financial history.

Deletion is a durable saga: mark deleting and block new actions; pause reward and confirm; enumerate every page of all UNFULFILLED redemptions including rejected/unimported ones; request cancellation and wait for each remote confirmation; re-query and prove no pending redemptions; only then delete reward and mark local queue deleted. Failure/unknown leaves it resumable. Keep old history bound to its immutable local queue ID.

On startup/reconnect/manual/periodic reconciliation, establish observation, verify reward ownership/critical settings, page all UNFULFILLED redemptions, import absent valid events in redeemed-at/ID order, verify missing active redemption by ID, apply confirmed external terminal state through the domain service without sending another mutation, and restore outbox/call timers only after applicable reconciliation. Partial pages/failures never prove absence. Preserve persisted manual order.

### Privacy, commands, and operator surfaces

Hidden UID mode does not request or accept UID, clears existing queue UID values when toggled, and does not retain manual UID arguments. Visible mode requires reward prompt explaining the public UID; manual UID is optional but strict-format when present. Render all pending messages from current visibility settings at send time so stale scheduled text cannot leak a UID.

The pure parser accepts queue slug/aliases first, case/extra spaces and command accent variants, but never uses display name as a login. Viewer `posicao`/`sair` use identity from the Twitch message. Management uses broadcaster ID/mod badges from the current same-channel message; optional VIP management is false by default. Chat mutating messages dedupe by message ID. Responses are centralized in pt-BR, at most 500 chars, and sending failure never rolls back committed domain state.

Calls move up to 10 waiting entries to called atomically. Start-service moves called to in_progress and ends absence timeout. Timer starts only after confirmed first notification; a restart/reconciliation resumes stored deadline with the required 60-second recovery grace. Clear is a reviewable 15-second confirmation bound to actor/channel/queue/active-set version and includes all active redemptions. Account auto-switch applies only to one-person `proximo`; only the owning entry may reset it.

The local panel exposes the specified installation/reconnection, queue, entry, account, financial, and reconciliation operations. Its local session protects explicit safe API projections. `GET /api/state` distinguishes `product_version`, `api_contract_version`, state revision, and timestamp; includes only fields appropriate to current UID visibility. Mutation routes use explicit schemas, session, CSRF, idempotency and applicable optimistic version checks. Host/Origin allowlisting is exact; OAuth callback has a narrowly scoped Origin exception and validates Host, session, and state; the secure cookie supports OAuth GET return (`SameSite=Lax`). Use `textContent`, never interpolate untrusted values as HTML.

## 4. Dependencies and Official Research

The dated sources and package metadata are recorded in `research.json`. Primary references:

- [Twitch app registration](https://dev.twitch.tv/docs/authentication/register-app/) — email verification, 2FA, registered redirect URI, confidential Secret handling.
- [Twitch OAuth token flows](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/) and [token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/) — Client Credentials and Authorization Code details, user-token validation.
- [Twitch Helix API reference](https://dev.twitch.tv/docs/api/reference/) — reward/redemption endpoints, point status semantics, eligibility and limits, Send Chat Message response.
- [Twitch EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/) and [WebSocket handling](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/) — event names, scopes, transport and reconnect.
- [Twitch chat send/receive](https://dev.twitch.tv/docs/chat/send-receive-messages/) — EventSub plus Helix, not IRC.
- [Twurple RefreshingAuthProvider](https://twurple.js.org/reference/auth/classes/RefreshingAuthProvider.html), [EventSubWsListener](https://twurple.js.org/reference/eventsub-ws/classes/EventSubWsListener.html), [HelixChatApi](https://twurple.js.org/reference/api/classes/HelixChatApi.html) — pinned SDK surface.
- [Prisma v6 generators](https://www.prisma.io/docs/orm/v6/prisma-schema/overview/generators), [Prisma v6 config](https://www.prisma.io/docs/orm/v6/reference/prisma-config-reference), [PostgreSQL adapter](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql) — `prisma-client-js`, `.mjs`, and `@prisma/adapter-pg`.
- [PostgreSQL partial indexes](https://www.postgresql.org/docs/current/indexes-partial.html) and [supported versions](https://www.postgresql.org/support/versioning/) — active-entry uniqueness and version choice.
- [Compose startup ordering](https://docs.docker.com/compose/how-tos/startup-order/) and [Compose secrets](https://docs.docker.com/reference/compose-file/secrets/) — health/completion dependency conditions and local secret mount constraints.
- [Node.js releases](https://nodejs.org/en/about/previous-releases/) and [official Node image tags](https://hub.docker.com/_/node/tags) — supported LTS image.

## 5. Files to Create

| Area | Paths (planned) | Purpose |
| --- | --- | --- |
| Root runtime | `package.json`, `package-lock.json`, `Dockerfile`, `compose.yaml`, `.dockerignore`, `.gitignore`, `.release-stage`, `VERSION` | Workspace, lockfile, build/runtime entrypoints, version sources. |
| API | `apps/api/package.json`, `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.mjs`, `apps/api/prisma/migrations/*`, `apps/api/src/*` | Database, domain, adapters, routes, worker, safe lifecycle. |
| Web | `apps/web/public/index.html`, `apps/web/public/*` | Static vanilla operator interface. |
| Infrastructure | `apps/infra/*`, root `iniciar.bat`, root `iniciar.sh` | Persistent bootstrap secret, start/wait/browser helpers. |
| Tests | `tests/unit/*`, `tests/integration/*`, `compose.test.yaml` | Pure behavior and isolated real PostgreSQL/migration contract coverage. |
| Docs | `README.md`, `README.pt-BR.md`, `docs/stories.md`, `docs/pt-BR/stories.md`, `docs/integrations.md`, `docs/pt-BR/integrations.md`, version/changelog counterparts | Install/use, decisions, policy, progress, evidence. |

All exact paths are refined in the Greenfield and implementation plans; no application source is created during this spec phase.

## 6. Testing Strategy

Tests are written before each behavior implementation and record exact observed Red → Green → Refactor evidence in both stories documents.

| Test group | Required coverage |
| --- | --- |
| Unit/domain | All valid/invalid transitions, financial policy snapshots, UID ASCII/trim/hidden mode, parser grammar, safe templates, response lengths, account ownership and controlled timers. |
| API/security | Host/Origin/CSRF/session, OAuth state/callback, secret non-disclosure, HTML input, authorization badges/channel identity, schema/idempotency/version checks, explicit projection and UID non-leakage. |
| Twitch adapter contract | Fakes around token/reward/redemption/EventSub/chat APIs; SDK result/field normalization, dropped chat response, rate limit, retry and remote opposite/unknown states. No credentials required. |
| PostgreSQL integration | Real isolated PostgreSQL and real migrations; unique partial indexes; foreign/source integrity; redemption/message dedupe; competing queue operations; outbox atomicity/lease recovery; global account lock; deletion/resume. No SQLite or mock Prisma proof. |
| Recovery/acceptance | Crash before request, lost response after success, update-before-add, partial pagination, invalid/rejected redemption recovery, stale UID notification, timer restart/grace/race, deletion held until every cancellation confirmed. |
| Runtime/Compose | Compose config and image build, bootstrap idempotency/permissions, dependency health/completion order, local health, no DB host port, non-root bot, first start and persistent restart. |
| Version | Marker and source consistency, valid exact seven-char SHA, missing Git versus Git lookup error, artifact materialization from source commit, no checkout/version rewrite by normal validation, runtime/API/state version separation. |

Project checks are `npm run lint`, `npm run typecheck`, `npm test`, plus PostgreSQL integration, migration, Compose health/build, and version-policy checks. These checks have not been run in this spec phase.

## 7. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Local commit and remote Twitch effect cannot be atomic. | Incorrect refund/consumption claim or a lost operation. | Durable outbox, idempotent local intent, query remote status after unknown result, expose pending/conflict/unknown. |
| Twitch reward deletion fulfills remaining pending redemptions. | Points may be consumed instead of refunded. | Enumerate and confirm all cancellations before DELETE; integration/fake contract tests verify no DELETE on any unconfirmed item. |
| Prisma 7 generator produces TypeScript. | Violates direct-JavaScript runtime constraint. | Pin matching Prisma 6.19.3 packages and `prisma-client-js`; generate in image and verify output/ESM without compilation. |
| Event delivery is not a replay log and pagination is not a snapshot. | Missed, duplicated, or reordered redemptions. | Durable dedupe IDs, event observation plus paged reconciliation, by-ID verification, short transactions, no destructive inference from missing page. |
| File-backed local secrets differ across host Docker implementations. | First-start or DB/app secret permission failure. | Use a persistent named secret volume plus one-shot bootstrap, test on Compose v2 platforms, mount read-only to consumers, document platform evidence. |
| Shared Chat can propagate broadcaster-token messages. | Message visibility differs from local-only expectation. | Do not promise isolation; document the Twitch behavior and use the required API result. |
| Saved UID or an old notification leaks after privacy changes. | Public exposure of user data beyond configured policy. | Clear persisted UIDs on hide; construct notification at send time from current privacy settings; test every output projection. |

## 8. Open Questions

No product/architecture question blocks implementation. Live Twitch verification requires credentials deliberately supplied by the streamer later; without them, report live integration as pending, not validated. Cross-platform Compose secret behavior must be tested before claiming Windows/macOS/Linux parity.

## 9. Implementation Checklist

- [ ] AIOX Spec Pipeline critique and implementation plan completed.
- [ ] Greenfield full-stack, service, and UI workflows completed after spec material is sufficient.
- [ ] Story Development Cycle creates/validates each story before implementation.
- [ ] For every behavior increment: Red observed first; Green implementation; Refactor and affected tests passing; bilingual evidence written.
- [ ] PostgreSQL integration uses isolated database and real migrations.
- [ ] All applicable docs and changelogs are equivalent in English and pt-BR.
- [ ] Runtime Compose and first-run/restart scenarios are verified.
- [ ] No release, tag, or stage promotion occurs as part of this foundation.
