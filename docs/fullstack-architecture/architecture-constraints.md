# Architecture constraints
[Português brasileiro](../pt-BR/fullstack-architecture/architecture-constraints.md)


One local installation, one Twitch broadcaster/client, one bot process, local PostgreSQL via Compose, no public backend/remote storage/telemetry. Product runtime is JavaScript ESM and vanilla browser assets; `.env.example` remains AIOX framework scaffolding. Code is placed under `apps/*`.
