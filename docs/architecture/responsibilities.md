# Responsibilities
[Português brasileiro](../pt-BR/architecture/responsibilities.md)


The API is a single local Fastify process on loopback `API_PORT` (3109 in the product container), reached by the browser through the Next.js panel server's same-origin rewrites. It owns local sessions and HTTP safety, composes domain/persistence/Twitch adapters, consumes Twitch events, schedules reconciliation and timers, and runs durable PostgreSQL outbox workers. It is not a hosted API or multi-tenant service. Until the owner-authorized OPS-15 cutover it also still serves the vanilla `apps/web` shell through `@fastify/static`; that responsibility is removed together with `apps/web`.
