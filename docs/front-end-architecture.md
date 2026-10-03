# Front-End Architecture: `apps/web`

[Português brasileiro](pt-BR/front-end-architecture.md) · Product behavior: [front-end specification](front-end-spec.md).

## Runtime and boundaries

`apps/web/public` contains static HTML, CSS and vanilla JavaScript served by `@fastify/static` from the local Fastify process. No frontend framework, TypeScript, transpiler, bundler, or public hosting is introduced. The browser never imports Prisma or communicates with Twitch directly.

## Files and modules

```text
apps/web/public/
  index.html       semantic shell and named regions
  styles.css       responsive local operator styling
  app.js           session-aware API client, screen rendering and event handlers
```

`app.js` renders explicit API projections using DOM construction and `textContent`. Keep untrusted names/messages away from `innerHTML`. Poll local state at a bounded interval; do not add panel WebSockets. Mutations are explicit requests with CSRF token, idempotency key and applicable state revision.

## Screen model

Setup/reconnect → overview → queue list/detail → financial recovery → account settings. Each screen has loading, empty, disconnected, stale, partial, error and success/pending states. Queue controls reflect lifecycle but server validation remains authoritative. Destructive delete and clear actions show a review summary before the final request.

## Privacy and state

The browser receives only API projections for the authenticated operator. UID is returned only while queue mode is visible; the public state projection has its stricter overlay toggle even though no overlay is part of this release. Secrets are never returned after credential submission. Current UI refreshes after settings changes and does not cache rendered notification text.

## Verification

Vitest DOM/contract coverage checks required regions and actions, correct handling of pending/confirmed financial state, field validation feedback, accessible labels/focus, and malicious text rendered literally. Backend route tests remain responsible for session, CSRF, Host/Origin, authorization, privacy projection and mutation correctness.
