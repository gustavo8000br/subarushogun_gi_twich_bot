# Application modules
[Português brasileiro](../pt-BR/fullstack-architecture/application-modules.md)


- `apps/web`: HTML/CSS/vanilla JS operator panel; uses explicit API projections and safe text APIs.
- `apps/api`: Fastify process composition, local security, route handlers, domain services, persistence adapters, Twitch adapters, EventSub and durable workers.
- `apps/api/prisma`: Prisma 6 schema/config/client generation and PostgreSQL migrations, including SQL constraints not represented by Prisma schema.
- `apps/infra`: bootstrap secret helper, product version validation/materialization, health and operations utilities.
- `tests`: Vitest unit/contract tests and isolated real-PostgreSQL/Compose integration suites.
