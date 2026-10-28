# Application modules
[Português brasileiro](../pt-BR/fullstack-architecture/application-modules.md)


- `apps/frontend`: Next.js App Router operator panel and isolated OBS overlay route; uses explicit API projections and safe text rendering.
- `apps/web`: vanilla panel files, no longer served since cutover Wave 1 (production `/` is the Next Overview) and removed in cutover Wave 4 (the vanilla overlay files were removed in Wave 3); `apps/frontend` no longer imports it; the shared modules moved to `apps/shared/panel` (S-03) and only the catalogs remain here until they move out in Wave 2.
- `apps/api`: Fastify process composition, local security, route handlers, domain services, persistence adapters, Twitch adapters, EventSub and durable workers.
- `apps/api/prisma`: Prisma 6 schema/config/client generation and PostgreSQL migrations, including SQL constraints not represented by Prisma schema.
- `apps/infra`: bootstrap secret helper, product version validation/materialization, health and operations utilities.
- `tests`: Vitest unit/contract tests and isolated real-PostgreSQL/Compose integration suites.
