# Architecture constraints
[Português brasileiro](../pt-BR/fullstack-architecture/architecture-constraints.md)


One local installation, one Twitch broadcaster/client, one bot process, local PostgreSQL via Compose, no public backend/remote storage/telemetry. Product runtime code is JavaScript ESM; browser application source remains JavaScript ESM with JSDoc. OPS-15 permits Next.js App Router and its build-time transpilation/bundling only to produce a static export served by the existing Fastify process. No TypeScript application code, Next production server, public hosting, or new public port is introduced. `.env.example` remains AIOX framework scaffolding. Code is placed under `apps/*`.
