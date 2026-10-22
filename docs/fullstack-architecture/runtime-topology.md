# Runtime topology
[Português brasileiro](../pt-BR/fullstack-architecture/runtime-topology.md)


```mermaid
flowchart LR
  Browser[Local operator browser] -->|https://127.0.0.1:3000| Next[apps/frontend Next.js server :3000]
  OBS[OBS Browser Source] -->|/overlay.html?ref=...#token| Next
  Next -->|rewrites /api, /overlay/api, /health, /callback| API[apps/api Fastify + domain, loopback :3109]
  Next -.->|transitional until cutover: /, /app.js, /styles.css| API
  API --> DB[(PostgreSQL / Prisma)]
  API --> Twitch[Twurple adapters: OAuth, Helix, EventSub WS]
  API --> Outbox[PostgreSQL outbox workers]
  Infra[apps/infra bootstrap/version/health] --> DB
```

Root `Dockerfile` and pull-only `compose.yaml` define product runtime; `compose.build.yaml` explicitly adds source build contexts for CI/maintainers. The installer embeds runtime configuration only and pulls a prebuilt image. Under OPS-15, Next.js App Router uses the production Node server over HTTPS and owns the local panel/overlay origin; Fastify remains domain/API authority on loopback port 3109 behind the same-origin rewrites. Until the owner-authorized cutover, `/` is still rewritten to the vanilla shell that Fastify serves. Compose services: one-shot `bootstrap`; persistent healthy `db`; one-shot `migrate` after DB health; non-root `bot` only after migrations complete. Host publishes only `127.0.0.1:3000:3000`; API and database ports are not published. Volumes persist DB and operational secrets. The bot mounts first-party catalogs from the image and the host community catalog directory read-only; installers create the host directory. Developers use `npm ci` then `npm run dev` for local HTTPS/HMR and isolated PostgreSQL. Test installer/runtime in isolated Compose with disposable data; never use active product volumes for migrations or recovery tests. Recovery is a forward fix or redeploying a previous image digest; `legacy` is not a rollback target.
