# Front-End Architecture: `apps/web`

[Português brasileiro](pt-BR/front-end-architecture.md) · Product behavior: [front-end specification](front-end-spec.md).

## Runtime and boundaries

The browser frontend uses Next.js App Router with `output: 'export'`. Production output contains static assets only and is served by the existing local Fastify HTTPS process through `@fastify/static`, on the same origin as the existing API. There is no Next.js runtime server, public hosting, extra port, or cross-origin API proxy. The OAuth callback remains an explicit Fastify route. The exact OBS entry remains `/overlay.html?ref=...#token`, without redirects or rewrites; panel and overlay have separate layouts and browser bundles.

Browser source stays JavaScript ESM with JSDoc. The Next.js build pipeline is the documented exception that bundles/transpiles frontend source to static assets; it does not authorize TypeScript application code. The browser never imports Prisma or communicates with Twitch directly.

## Files and modules

```text
apps/web/
  app/                 route and layout composition
  features/            setup, queues, operations, settings, widgets, overlay
  components/ui/       shared accessible presentation components
  lib/api/             same-origin API client and request contracts
  lib/i18n/            runtime catalogs, locale and formatting helpers
  styles/              shared design tokens and global styles
  out/                 generated static export; not source of truth
```

Keep route/layout composition thin. Feature modules consume explicit API projections and never implement domain transitions. Panel and `/overlay.html` use separate entries so OBS does not download the operator panel bundle. Keep untrusted content as text and never render it as HTML. Poll local state at the existing bounded cadence; do not add panel WebSockets. Mutations keep session CSRF, idempotency keys and applicable expected revisions.

## Screen model

Setup/reconnect → overview → queue list/detail → Twitch/points recovery → account and product settings → widget management. The OBS overlay is a separate capability-based presentation entry. Every existing surface preserves its loading, empty, disconnected, stale, partial, error, success, pending, unknown and conflict states as applicable. Queue controls reflect existing lifecycle while server validation remains authoritative. Destructive actions retain their existing review and confirmation steps.

## Privacy and state

The panel receives only API projections for the authenticated local operator. UID is returned only under the current queue privacy policy; overlay projections apply their stricter current output policy. Secrets are never returned after credential submission. The overlay uses its existing bearer capability without a panel session and must not expose the fragment secret after initialization. Settings changes refresh projections without caching rendered notification text.

## Verification

Component and browser tests cover the migration parity matrix by surface, action, endpoint, locale, state and test reference. Build/Compose contracts verify static export, exact Fastify route precedence, same-origin API requests and panel/overlay bundle separation. Runtime catalog discovery remains through `/api/localization/catalogs`; tests add an eligible catalog after frontend build and verify it is available without rebuild or API restart. Overlay browser and native OBS/CEF checks cover existing URL/capability lifecycle and FND-7's documented performance budget. Backend route tests remain responsible for session, CSRF, Host/Origin, authorization, privacy projections and mutation correctness.
