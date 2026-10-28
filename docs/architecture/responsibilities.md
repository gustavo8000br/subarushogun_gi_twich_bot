# Responsibilities
[Português brasileiro](../pt-BR/architecture/responsibilities.md)


The API is a single local Fastify process on loopback `API_PORT` (3109 in the product container), reached by the browser through the Next.js panel server's same-origin rewrites. It owns local sessions and HTTP safety, composes domain/persistence/Twitch adapters, consumes Twitch events, schedules reconciliation and timers, and runs durable PostgreSQL outbox workers. It is not a hosted API or multi-tenant service. Since OPS-15 cutover Wave 1 it serves no browser file: `apps/api/src/server.mjs` registers no static route and no module under `apps/api/src` imports `@fastify/static` (`tests/unit/api-static-surface-contract.test.js`); the panel at `/` is served by Next. It still reads the first-party catalogs from `apps/web/localization/catalogs` (`apps/api/src/server.mjs:42`).
