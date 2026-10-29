# Front-End Architecture: `apps/frontend`

[Português brasileiro](pt-BR/front-end-architecture.md) · Product behavior: [front-end specification](front-end-spec.md).

> Superseded topology: the earlier FND-0/OPS-15 plan (`output: 'export'`, static assets served by Fastify, no Next.js runtime server) is historical. The current topology below was verified against the code on 2026-10-21 ([OPS-15 structural review](stories/OPS-15/structural-review.md), S-07).

## Runtime and boundaries

The browser frontend is a Next.js App Router application in `apps/frontend/`, served in production by the Next.js Node server (`apps/frontend/scripts/start-production.mjs`) over local HTTPS on `PANEL_PORT` (3000 in the container). There is no static export. The same container runs Fastify (`apps/api/src/server.mjs`) as a separate process on loopback `API_PORT` 3109; `apps/infra/scripts/start-product.mjs` starts both and stops both when either exits. Next rewrites `/api/*`, `/overlay/api/*`, `/health` and `/callback` to the HTTPS loopback Fastify origin, so the browser sees one origin; Fastify remains the authority for session, Host/Origin, CSRF, domain and Twitch. The OBS overlay is the Next `/overlay` route and widget links have the form `/overlay?ref=...#token` (`apps/api/src/domain/overlay-widget-service.mjs:41`). Since OPS-15 cutover Wave 3 ([record](stories/OPS-15/cutover-wave-3.md)) the vanilla overlay and the legacy `/overlay.html` alias no longer exist: `/overlay.html` gets a Next 404 without redirect (`tests/integration/compose-runtime.test.js:376`), so an OBS source still using an older `/overlay.html` link needs a newly generated link. Panel and overlay have separate layouts and browser bundles.

Since OPS-15 cutover Wave 1 (2026-10-27, [record](stories/OPS-15/cutover-wave-1.md)), production `/` is the Next panel Overview (`apps/frontend/app/(panel)/page.jsx:8`) and Fastify serves no browser file: the only production rewrites to Fastify are `/api/*`, `/overlay/api/*`, `/health` and `/callback` (`apps/frontend/scripts/dev-proxy-config.mjs:41-46`), `apps/api/src/server.mjs` registers no static route, and `/app.js`, `/styles.css`, `/index.html` and `/shared/panel/*` get a Next 404 (`tests/integration/compose-runtime.test.js:372`). The remaining `apps/web/` files (vanilla panel only) stay on disk but are not served and are removed in Wave 4 (the vanilla overlay files were removed in Wave 3; the localization catalogs moved to `apps/shared/localization/catalogs` in Wave 2, [record](stories/OPS-15/cutover-wave-2.md)). `legacy` is a historical reference only, never a fallback or rollback target.

Browser source stays JavaScript ESM with JSDoc. The Next.js build is the documented exception for bundling/transpiling frontend source; it does not authorize TypeScript application code. The browser never imports Prisma or communicates with Twitch directly.

## Files and modules

```text
apps/frontend/
  app/(panel)/         panel routes: overview, connection, new-queue, queues, operations, commands, settings, widgets
  app/(overlay)/       isolated OBS overlay route and layout
  features/            panel shell, overview, queues, operations, settings, widgets, overlay
  components/ui/       shared accessible presentation components
  lib/api/             same-origin API client and request contracts
  lib/i18n/            runtime catalogs, locale and formatting helpers
  styles/              shared design tokens and global styles
  scripts/             Next runtime config, production HTTPS server, development launcher
apps/web/              vanilla panel files, not served since Wave 1; removed in Wave 4
```

The 12 modules the Next runtime shares with the vanilla panel (overlay renderer, `PANEL_PLACEHOLDERS` and presentation helpers) live in `apps/shared/panel/` (S-03); an ESLint `no-restricted-imports` rule and `tests/unit/shared-panel-boundary.test.js` forbid `apps/frontend` and `apps/shared` from importing `apps/web`. Since cutover Wave 1 Fastify no longer serves them over HTTP (the transitional `/shared/panel/` prefix was removed); Next imports them from the file system (for example `apps/frontend/features/panel-shell/panel-shell.jsx:8`). Since cutover Wave 2 the first-party catalogs live in `apps/shared/localization/catalogs`; the API, the validator and the Next static fallback resolve them through `apps/shared/localization/first-party-catalogs.mjs`, and `tests/unit/shared-panel-boundary.test.js` also fails on any `apps/web` path string in Next, shared, API or infra code (TS-04).

Keep route/layout composition thin. Feature modules consume explicit API projections and never implement domain transitions. Panel and the `/overlay` route use separate entries so OBS does not download the operator panel bundle. Keep untrusted content as text and never render it as HTML. Poll local state at the existing bounded cadence; do not add panel WebSockets. Mutations keep session CSRF, idempotency keys and applicable expected revisions.

## Screen model

Setup/reconnect → overview → queue list/detail → Twitch/points recovery → account and product settings → widget management. The OBS overlay is a separate capability-based presentation entry. Every existing surface preserves its loading, empty, disconnected, stale, partial, error, success, pending, unknown and conflict states as applicable. Queue controls reflect existing lifecycle while server validation remains authoritative. Destructive actions retain their existing review and confirmation steps.

## Privacy and state

The panel receives only API projections for the authenticated local operator. UID is returned only under the current queue privacy policy; overlay projections apply their stricter current output policy. Secrets are never returned after credential submission. The overlay uses its existing bearer capability without a panel session and must not expose the fragment secret after initialization. Settings changes refresh projections without caching rendered notification text.

## Verification

Component and browser tests cover the migration parity matrix by surface, action, endpoint, locale, state and test reference. Build/Compose contracts verify the Next production build (`.next`), the production rewrite list to the loopback HTTPS Fastify origin, same-origin API requests, and panel/overlay bundle separation. Runtime catalog discovery remains through `/api/localization/catalogs`; tests add an eligible catalog after frontend build and verify it is available without rebuild or API restart. Overlay browser and native OBS/CEF checks cover existing URL/capability lifecycle and FND-7's documented performance budget. Backend route tests remain responsible for session, CSRF, Host/Origin, authorization, privacy projections and mutation correctness.
