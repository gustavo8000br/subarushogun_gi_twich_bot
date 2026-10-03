# Service Architecture: `apps/api`

[Português brasileiro](pt-BR/architecture.md) · Detailed system topology: [full-stack architecture](fullstack-architecture.md).

## Responsibilities

The API is a single local Fastify process. It serves `apps/web`, owns local sessions and HTTP safety, composes domain/persistence/Twitch adapters, consumes Twitch events, schedules reconciliation and timers, and runs durable PostgreSQL outbox workers. It is not a hosted API or multi-tenant service.

## Internal boundaries

```text
apps/api/src/
  bootstrap/       startup, health and graceful shutdown
  domain/          queue, entry transitions, account, reward lifecycle
  persistence/     Prisma repositories and short transaction coordination
  outbox/          durable financial/chat/reward operation workers
  twitch/          OAuth, token storage, Helix adapters, EventSub normalization
  reconciliation/  paginated recovery and remote/local state comparison
  commands/        pure Portuguese parser and authorization predicates
  chat/            message intake, domain dispatch and safe response catalog
  http/            Fastify routes, schemas, projections and local security
```

These are module locations within one process, not separate deployable services. Keep domain decisions in domain services. Routes, EventSub callbacks, chat handlers, workers and timers call those services instead of editing status directly.

## Persistence contract

Prisma 6.19.3 and `prisma-client-js` are pinned to preserve JavaScript generation. `prisma.config.mjs` reads a connection string assembled at runtime from Compose service host and a mounted password file. Do not print or expose it. Schema and versioned migrations live in `apps/api/prisma`; SQL adds partial unique/check constraints. Integration tests apply the same real migrations to an isolated PostgreSQL database.

Repositories provide short explicit transactions. Queue-level mutations use database coordination plus unique constraints; global account updates serialize across queues. Unique conflicts for duplicate active redemptions are expected domain outcomes and enqueue cancellation rather than crashing event intake. No transaction spans remote I/O.

## Financial outbox contract

One stable financial intent per redemption ID and operation key. Domain transaction persists terminal state, audit, policy snapshot, ordering/account effects and outbox row. A worker leases rows, calls Twitch outside the transaction, and persists expected-status confirmation, retry schedule, conflict, or unknown result. Lost responses trigger remote lookup. A missing redemption or 404 does not prove cancellation. Credentials/scopes invalidated by 401 halt automated attempts pending valid reconnection. Retry uses bounded exponential backoff/jitter and rate-limit headers.

## Twitch lifecycle

OAuth routes validate client-app credentials before replacing stored values; secret reads return presence only. OAuth callback validates Host, session, state and one-use expiry. Refresh provider persists each token atomically. Runtime validates token at startup/hourly. EventSub WebSocket registers redemption add/update and chat message handlers. Adapters normalize SDK enums/field shapes at their boundary. Reconciliation starts event observation, verifies app-owned reward settings, imports paginated unfulfilled redemptions, checks unresolved local IDs individually, applies confirmed external terminal status through the domain service, then resumes applicable workers/timers.

## HTTP surface

All mutating operations use POST/PATCH/DELETE, schema validation, local session, CSRF, operation idempotency key and applicable state revision. GET `/api/state` is session protected and returns explicit projected data with `product_version`, `api_contract_version`, state revision, timestamp, account, connectivity, queues and privacy-filtered entries. OAuth callback is a single validated GET exception. Static assets never receive Prisma client or secrets.

## Failure behavior

Twitch loss keeps the local panel and PostgreSQL available. Pending financial work remains durable and visibly pending/conflicted/unknown. Partial reconciliation cannot delete entries. SIGTERM/SIGINT stops intake/new work, leaves pending rows persistent, disconnects Twitch, and closes Prisma/Fastify cleanly. An advisory lock, if used for single-instance protection, must hold a dedicated PostgreSQL session connection.
