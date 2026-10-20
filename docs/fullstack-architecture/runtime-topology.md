# Runtime topology
[Português brasileiro](../pt-BR/fullstack-architecture/runtime-topology.md)


```mermaid
flowchart LR
  Browser[Local operator browser] -->|127.0.0.1:3000| Fastify[Fastify local HTTPS server]
  OBS[OBS Browser Source] -->|existing /overlay.html?ref=...#token| Fastify
  Fastify --> Web[Next production panel and isolated overlay]
  Fastify --> API[apps/api Fastify routes + domain]
  API --> DB[(PostgreSQL / Prisma)]
  API --> Twitch[Twurple adapters: OAuth, Helix, EventSub WS]
  API --> Outbox[PostgreSQL outbox workers]
  Infra[apps/infra bootstrap/version/health] --> DB
```

Root `Dockerfile` and pull-only `compose.yaml` define product runtime; `compose.build.yaml` explicitly adds source build contexts for CI/maintainers. The installer embeds runtime configuration only and pulls a prebuilt image. Under OPS-15, Next.js App Router uses the production Node server and owns the local panel/overlay origin; Fastify remains domain/API authority behind the same-origin proxy. Compose services: one-shot `bootstrap`; persistent healthy `db`; one-shot `migrate` after DB health; non-root `bot` only after migrations complete. Host publishes only `127.0.0.1:3000:3000`; API and database ports are not published. Volumes persist DB and operational secrets. The bot mounts first-party catalogs from the image and the host community catalog directory read-only; installers create the host directory. Developers use `npm ci` then `npm run dev` for local HTTPS/HMR and isolated PostgreSQL. Test installer/runtime in isolated Compose with disposable data; never use active product volumes for migrations or rollback rehearsal.
