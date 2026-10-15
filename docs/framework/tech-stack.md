# Technology Stack

[Português brasileiro](../pt-BR/framework/tech-stack.md)

## Application source

- JavaScript ESM, `type: module`, Node.js 24.20.0 LTS, and JSDoc; no application TypeScript. OPS-15 permits Next.js build/transpilation/bundling only to produce static browser assets.
- Fastify 5.12.5 and `@fastify/static` 10.1.5 remain the only runtime HTTP server. OPS-15 migrates `apps/web` to Next.js App Router static export; Fastify serves the output locally.
- `@twurple/auth`, `@twurple/api`, and `@twurple/eventsub-ws` 8.2.0, pinned together.
- Prisma CLI, `@prisma/client`, and `@prisma/adapter-pg` 6.19.3; `pg` 8.23.1; PostgreSQL 18.6.
- Vitest 5.0.3; `package-lock.json` is committed and Docker installs with `npm ci`.

## Runtime and layout

`apps/api` owns HTTP/domain/integrations/persistence, `apps/web` owns static UI, `apps/infra` owns bootstrap/version/health utilities. Root Dockerfile and Compose are deployment entrypoints. The AIOX scaffold `.env.example` is not product configuration.

All dependency versions are exact, not ranges or `latest`. CLI/client/adapters that require compatibility stay on one release. Reconfirm package compatibility and official APIs before implementation.
