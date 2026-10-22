# Files and modules
[Português brasileiro](../pt-BR/front-end-architecture/files-and-modules.md)


The Next.js source lives in `apps/frontend/`; the vanilla frontend stays in `apps/web/` only until the owner-authorized cutover and its full removal. New application code remains JavaScript ESM with JSDoc:

```text
apps/frontend/
  app/                 App Router route/layout composition; separate panel and overlay root layouts
  features/            setup, overview, queues, operations, settings, widgets, overlay
  components/ui/       shared accessible presentation components
  lib/api/             same-origin API client and JSDoc contracts
  lib/i18n/            runtime catalog loading, locale selection and formatting
  styles/              tokens, global styles and feature styles
  scripts/             Next runtime config, production HTTPS server, development launcher
  features/panel-shell/ local session bootstrap, navigation and shell composition
  features/overview/    read-only overview summaries and projection presentation
apps/web/               vanilla frontend; removed after the authorized cutover
```

The panel shell bootstraps `/api/session` before protected reads, loads the allowlisted `/api/state` and operator `/api/queues` projections, and fetches `/api/localization/catalogs` at runtime. Only a first-party pt-BR catalog is embedded as a static render fallback; the runtime API supplies the complete installed locale set and is authoritative for persisted language selection. Invalid queue projections show an API error instead of an empty queue summary. Mutations keep CSRF, idempotency and expected-revision contracts.

The Docker frontend stage runs `npm run build:frontend` and the runtime image contains `apps/frontend/.next`, served by the Next.js production server; there is no `out/` export. The modules shared with the vanilla panel live in `apps/shared/panel/` and reach the build through the single `COPY apps/shared` line; only the catalogs are still copied from `apps/web/localization/catalogs` (structural review S-03). The dedicated overlay route mounts the existing read-only renderer in its own client entry, preserving the current URL, capability, polling, and revocation behavior. Production `/` is still proxied to the vanilla shell served by Fastify until the cutover. Keep route/layout composition thin and domain decisions in the current backend services. Use text-safe rendering; never put untrusted names/messages into raw HTML. Keep bounded polling and do not add a panel WebSocket. The panel and overlay must produce separate browser entry bundles.
