# Files and modules
[Português brasileiro](../pt-BR/front-end-architecture/files-and-modules.md)


The migration keeps the existing frontend in `apps/web/` while the new Next.js source is built under `apps/frontend/`. This lets the team verify export and runtime contracts before cutover. New application code remains JavaScript ESM with JSDoc:

```text
apps/frontend/
  app/                 App Router route/layout composition; separate panel and overlay root layouts
  features/            setup, overview, queues, operations, settings, widgets, overlay
  components/ui/       shared accessible presentation components
  lib/api/             same-origin API client and JSDoc contracts
  lib/i18n/            runtime catalog loading, locale selection and formatting
  styles/              tokens, global styles and feature styles
  scripts/             static-export compatibility artifacts
  features/panel-shell/ local session bootstrap, navigation and shell composition
  features/overview/    read-only overview summaries and projection presentation
apps/web/               existing vanilla frontend retained until parity gates pass
```

The panel shell bootstraps `/api/session` before protected reads, loads the allowlisted `/api/state` and operator `/api/queues` projections, and fetches `/api/localization/catalogs` at runtime. Only a first-party pt-BR catalog is embedded as a static render fallback; the runtime API supplies the complete installed locale set and is authoritative for persisted language selection. Invalid queue projections show an API error instead of an empty queue summary. Mutations keep CSRF, idempotency and expected-revision contracts.

The current foundation emits `apps/frontend/out/*`, including a copied `overlay.html` alias, and the production image contains that output. The dedicated overlay route now mounts the existing read-only renderer in its own client entry so the current URL, capability, polling, and revocation behavior stays intact. Fastify still serves `apps/web/` during this migration phase; switching its root is a later cutover gate. Keep route/layout composition thin and domain decisions in the current backend services. Use text-safe rendering; never put untrusted names/messages into raw HTML. Keep bounded polling and do not add a panel WebSocket. The panel and overlay must produce separate browser entry bundles.
