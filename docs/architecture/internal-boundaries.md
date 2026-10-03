# Internal boundaries
[Português brasileiro](../pt-BR/architecture/internal-boundaries.md)


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
