# Responsibilities
[Português brasileiro](../pt-BR/architecture/responsibilities.md)


The API is a single local Fastify process. It serves `apps/web`, owns local sessions and HTTP safety, composes domain/persistence/Twitch adapters, consumes Twitch events, schedules reconciliation and timers, and runs durable PostgreSQL outbox workers. It is not a hosted API or multi-tenant service.
