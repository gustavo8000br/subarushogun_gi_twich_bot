# Architecture constraints
[Português brasileiro](../pt-BR/fullstack-architecture/architecture-constraints.md)


One local installation, one Twitch broadcaster/client, one bot process, local PostgreSQL via Compose, no public backend/remote storage/telemetry. Product runtime code is JavaScript ESM; browser application source remains JavaScript ESM with JSDoc. OPS-15 adopts Next.js App Router, served by the Next.js production server over local HTTPS, with Fastify as a separate loopback API process in the same container (the earlier static-export plan is historical). No TypeScript application code, public hosting, or new public port is introduced. `.env.example` remains AIOX framework scaffolding. Code is placed under `apps/*`.
