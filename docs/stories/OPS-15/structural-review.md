# OPS-15 — Structural review (lens 3: contracts, boundaries, documentation)

[Português brasileiro](../../pt-BR/stories/OPS-15/structural-review.md) · Story: [OPS-15](story.md)

- **Reviewer:** @architect (Aria), static code/document review on branch `feat/ops-15-next-panel`, working tree including uncommitted WIP, 2026-10-21.
- **Evidence class:** static reading only. No build, Compose, browser, OBS/CEF, PostgreSQL or Twitch execution was performed for this review. Each finding is a hypothesis grounded in cited code until reproduced by @dev/@qa.
- **Owner decisions applied:** `apps/web` (vanilla) is legacy and will be fully removed after the Next migration; `legacy` is historical only (not fallback/rollback); static review is OpenGrep only.
- **Not covered:** visual/UX quality, accessibility runtime, performance, Prisma schema.

## Severity summary

| ID | Severity | Area | Title | Owner decision? |
|---|---|---|---|---|
| S-01 | Blocker | Build | Docker frontend build omits `apps/web/call-deadline-presentation.mjs` | No |
| S-02 | Blocker | Routing | Production `/` is rewritten to the Fastify vanilla shell, which cannot load its own modules | Yes (cutover) |
| S-03 | High | Boundaries | Next runtime (panel, OBS overlay, catalogs, Dockerfile) depends on 12 `apps/web` modules | Yes (target location) |
| S-04 | High | Idempotency | A 5xx leaves the idempotency record in `processing` forever; client also generates a new key per retry | No |
| S-05 | High | Session | In-memory sessions + cached CSRF token: API restart breaks every mutation until a full reload, with no machine-readable code | No |
| S-06 | High | Error contract | Many 4xx/503 responses carry hardcoded pt-BR text and no `code`; the client collapses them to `REQUEST_FAILED` | No |
| S-07 | High | Docs | Architecture docs still describe static export / vanilla runtime served by Fastify | No |
| S-08 | High | Docs/plan | Roadmaps and stories keep "rollback/legacy recovery pointer" gates that contradict the owner decision | Yes (wording) |
| S-09 | Medium | Docs | Release stage contradictions: README "alpha", internal changelog "beta unscheduled/v1.0.0", actual `v0.2.0-beta` | Yes (status line) |
| S-10 | Medium | Docs | `docs/ROADMAP.md` stale (2026-10-07), omits OPS-11..OPS-20, conflicts with completion roadmap | No |
| S-11 | Medium | Contract | `/api/state` and `/api/queues` both project queues with different privacy rules | No |
| S-12 | Medium | Dead config | Dead rewrite filter `/connection/:path*`; `/app.js`, `/styles.css` rewrites; `/overlay.html` aliases | Yes (alias retention) |
| S-13 | Medium | Docs | Front-end spec says UI language is pt-BR only and "no component framework" | No |
| S-14 | Low | Contract | `/api/session` exemption matches exact `request.url` (query string breaks it) | No |
| S-15 | Low | Docs | English user guide/README use pt-BR UI labels; stories index title still "static frontend" | No |

## Findings

### S-01 — Blocker — Docker build omits a module the Next panel imports

- `apps/frontend/features/queues/call-deadline.jsx:2` imports `../../../web/call-deadline-presentation.mjs`; it is used by `queue-list.jsx` (file is untracked WIP).
- `Dockerfile:9-20` copies 11 `apps/web` modules one by one into the `frontend-build` stage; `call-deadline-presentation.mjs` is not among them. `npm run build:frontend` (`Dockerfile:22`) should fail with an unresolved import as soon as this WIP lands.
- Root cause (inherited planning failure): the build relies on a hand-maintained allowlist of cross-app files instead of a declared package boundary; nothing fails in unit tests when the list drifts.
- **Fix:** short-term add the COPY line plus a contract test that parses every `apps/frontend` import resolving into `apps/web` and asserts each is copied (extend `tests/unit/windows-native-contract.test.js` or a new Dockerfile contract test). Structural fix: S-03.

### S-02 — Blocker — Production `/` still points at the vanilla panel, and that shell is broken there

- `apps/frontend/scripts/dev-proxy-config.mjs:48-49` (`buildProductionProxyRules`) adds `beforeFiles` rewrites for `/`, `/styles.css`, `/app.js` to the Fastify origin (`API_PORT` 3109). `beforeFiles` runs before Next pages, so `app/(panel)/page.jsx` (the Next overview) is shadowed in production; in development (`buildDevProxyRules`, lines 21-30) `/` is Next. Dev and prod therefore render different products at the same URL.
- Fastify still serves `apps/web` statically when `API_ONLY` is unset (`apps/api/src/server.mjs:128-133`, `apps/api/src/web-route.mjs:10-25`); `apps/infra/scripts/start-product.mjs` and `compose.yaml:50-63` never set `API_ONLY`.
- The vanilla `index.html` loads `/app.js`, which imports `./application-setup.mjs`, `./panel-navigation.mjs`, `../shared/browser/translate-catalog.mjs` etc. (`apps/web/app.js:1-21`). Only `/`, `/styles.css` and `/app.js` are rewritten, so those module requests hit Next and 404: production `/` would be a non-functional shell while `/queues` etc. are Next.
- **Fix:** remove the `/`, `/styles.css`, `/app.js` rewrites so Next owns `/`; run Fastify with `API_ONLY=true` in the product start script and Compose; add a production-config contract test asserting no rewrite targets a vanilla asset. Needs owner authorization because it is the cutover itself (CLAUDE.md forbids cutover without explicit approval). Validate with production-like Compose, not unit tests.

### S-03 — High — Next runtime is coupled to the legacy app directory

- 15 import statements in `apps/frontend` resolve to 12 modules under `apps/web` (e.g. `apps/frontend/features/panel-shell/panel-shell.jsx:8`, `queues/queue-lifecycle-actions.jsx:4,6`, `queues/queue-settings.mjs:1-2`, `connection/connection-page-content.jsx:6`, `commands/command-permissions-page-content.jsx:6`, `widgets/widgets-page-content.jsx:6`, `lib/i18n/panel-catalogs.mjs:2`).
- The OBS overlay entry imports `apps/web/overlay-renderer.mjs` (`apps/frontend/app/(overlay)/overlay/overlay-root.jsx:4`).
- Runtime catalogs live in `apps/web/localization/catalogs/` and the API reads them from there (`apps/api/src/server.mjs:43`); `setup-messages.mjs:1` pulls `apps/shared/browser`.
- Consequence: "remove `apps/web` completely" is impossible today without breaking the panel, the overlay, catalog discovery and the image. The removal plan must be preceded by a relocation story.
- **Fix (options):** A) move the pure modules to `apps/shared/panel/` and catalogs to `apps/shared/localization/catalogs/` (recommended: one source, consumed by API and Next, Dockerfile copies `apps/shared` already at line 21); B) move them into `apps/frontend/lib/` and point the API catalog root to a new location (simpler but API then depends on the frontend tree); C) keep in `apps/web` and delete only vanilla files (leaves a misleading directory name). Trade-off: A costs one mechanical move + import rewrite + `validate:localization` path updates; it is the only option that makes the removal a pure deletion. Owner/architect decision on target path; @dev executes with tests.

### S-04 — High — Idempotency records can be stuck and retries do not reuse keys

- `apps/api/src/http/queue-routes.mjs:122` skips `completePanelOperation` when `reply.statusCode >= 500`; the row stays `state: 'processing'` (`apps/api/src/persistence/queue-repository.mjs:287`). Any later request with the same key gets `in_progress` 409 (`queue-repository.mjs:296`, `queue-routes.mjs:116`) with no expiry or lease.
- Conversely `apps/frontend/lib/api/client.mjs:23` generates a fresh UUID per call; no caller in `apps/frontend/features` passes `idempotencyKey` (grep). After a transport failure (`client.mjs:33-37`, which correctly says the request may have reached the server) a user retry is a *new* operation, so the replay protection never covers the case it exists for. Domain-level guards (versions, outbox keys) may still prevent duplication, but that is per-route and unverified.
- **Fix:** on 5xx, mark the record `failed` (retryable with same fingerprint) or give `processing` a lease/expiry; in the client, keep a per-intent key for the uncertain-retry path of each action (call, clear, create, delete). Requires PostgreSQL integration tests (real migrations) for replay, conflict, stuck and expired cases; @data-engineer reviews the state model.

### S-05 — High — Session loss is not recoverable without reload

- Sessions are an in-process `Map` (`apps/api/src/http/local-session.mjs:6`); an API restart (both processes are restarted independently by `start-product.mjs`) invalidates every cookie.
- The client caches `csrfToken` for the page lifetime (`client.mjs:10,21`) and never re-initializes on 401/403. API replies are plain text without `code` (`local-session.mjs:42,47,50,55,58`), so UI sees `REQUEST_FAILED` and cannot show "session expired, reload".
- **Fix:** add stable codes (`LOCAL_SESSION_REQUIRED`, `CSRF_INVALID`, `ORIGIN_INVALID`), have the client re-init once on those codes for GETs and surface a localized reload prompt for mutations (never auto-replay a mutation). UX review required (user-facing).

### S-06 — High — Error-code contract is incomplete and API text is pt-BR only

- Hardcoded pt-BR messages without `code`: idempotency (`queue-routes.mjs:102,105,109,116,117`), operations (`:271,277`), reconciliation (`:281,283`), setup (`:291,293,298`, `:306`), session (`local-session.mjs`). Other routes do send `code` (`:402-405,432-433`), so the contract is inconsistent.
- `client.mjs:41-45` drops the message and keeps only `code`, so code-less responses are indistinguishable. The panel ships en/es/pt-BR catalogs; the API prose is dead text for the Next client.
- **Fix:** define one error envelope `{ code, referenceId? }` for every non-2xx, enumerate codes in `endpoint-catalog-inventory.md`, map them to catalog keys; add a route-table test asserting every `reply.code(>=400)` includes `code`. Backward compatible: keep `error` during migration, remove after vanilla removal.

### S-07 — High — Architecture docs describe the abandoned topology

- `docs/front-end-architecture.md:7` — "`output: 'export'` … served by Fastify … no Next.js runtime server … extra port"; reality: Next runtime on `PANEL_PORT` over HTTPS (`apps/frontend/scripts/start-production.mjs:11-12,20`) proxying to Fastify on `API_PORT` 3109 (`dev-proxy-config.mjs:33-34`, `compose.yaml:56-57`).
- `docs/front-end-architecture.md:14-22` lists `apps/web/app`, `features`, `out/`; code is in `apps/frontend/`, no `out/` exists. Same in sharded `docs/front-end-architecture/{runtime-and-boundaries,files-and-modules,verification}.md`.
- `docs/architecture.md:7` "API … serves `apps/web`"; `docs/fullstack-architecture.md:7,13,25` "vanilla browser assets", "`apps/web` static assets", "HTML/CSS/vanilla JS operator panel"; `docs/fullstack-architecture/architecture-constraints.md`.
- Static-export leftovers also in `docs/prd.md`, `docs/stories/FND-0/spec/*`, `eslint.config.js`, `.dockerignore`, `.gitignore`, `tsconfig.json`, `tests/unit/next-frontend-config.test.js` (grep `output: 'export'|out/`); verify each is history or live config.
- **Fix:** rewrite the three architecture docs (+ shards, en/pt-BR together) to the two-process topology, the module boundary chosen in S-03, and the security chain (Next HTTPS → Fastify loopback HTTPS, Host/Origin check with `backendPort`). Historical specs (FND-0) keep content but get a "superseded by OPS-15" note.

### S-08 — High — Planning gates contradict the owner's `legacy`/rollback decision

- `docs/project-completion-roadmap.md:16` lists "rehearse rollback"; `:27` forbids moving "the fixed local `legacy` recovery pointer" before "isolated rollback is complete". `docs/stories.md:356` (and pt-BR `:357`) lists "rollback gates remain open". The owner decision says `legacy` is not a rollback target.
- Inherited failure: the gate set was planned when vanilla was the fallback; it now blocks removal on an unreachable/undesired condition.
- **Fix:** replace "rollback to legacy" with "forward-fix/redeploy previous image digest" (the real recovery mechanism per `docs/VERSIONING.md:31`), in both languages, recorded in the story Change Log. Owner confirms wording.

### S-09 — Medium — Release stage contradictions

- `README.md:4,13` and `README.pt-BR.md:4` — badge/notice "alpha"; `VERSION` = `v0.2.0-0000000-beta`, `.release-stage` = `beta`, `CHANGELOG-beta.md:5` has `v0.2.0-beta`.
- `CHANGELOG_INTERNAL.md:5` latest entry is FND-9 (2026-10-07) with no OPS-11..OPS-15 entries; `:18` says "beta plan is unscheduled"; `docs/VERSIONING.md:19` example `v1.0.0-…-beta` vs actual `0.2.0` base (`:15`). `docs/stories.md:370` "Beta timing is not scheduled" while beta versions already exist.
- `README.md:49` project status stops at OPS-6.
- Latest-first ordering is respected in every stage changelog checked (alpha, beta, internal); no ordering violation found. `CHANGELOG-rc.md`/`-stable.md` have no entries (expected).
- **Fix:** one owner-approved status sentence ("beta stage, no public release yet") propagated to README (en/pt-BR), internal changelog, VERSIONING example and stories index; add internal changelog entries for OPS-11..OPS-15 work.

### S-10 — Medium — `docs/ROADMAP.md` is stale and diverges from the completion roadmap

- `docs/ROADMAP.md:5` "checked … 2026-10-07"; table has no OPS-11, OPS-12, OPS-13, OPS-14, OPS-15, OPS-20; FND-9 "Implementation in progress" (`:17`) vs `docs/project-completion-roadmap.md:17` "Ready for Review; owner acceptance pending". `:38` sequence "FND-9 → DOC-2 → DOC-3" omits OPS-15 as active work. README links ROADMAP as "current".
- **Fix:** make `ROADMAP.md` the single status table (or have it link to the completion roadmap and drop duplicate status), en/pt-BR together.

### S-11 — Medium — Two queue projections with different privacy rules

- `/api/state` maps `queueDto(queue)` (non-operator, UID only if `showUidInOverlay`, `queue-routes.mjs:57,173`); `/api/queues` maps `queueDto(queue, { operator: true })` (`:376`). The panel fetches both on every poll (`apps/frontend/features/panel-shell/load-panel-snapshot.mjs:3-23`).
- Risk: any component that reads `state.queues` instead of the operator projection silently hides UID or diverges; the duplicate also doubles DB work per poll. This was a vanilla-era shape carried over.
- **Fix:** drop `queues` from `/api/state` for the Next client (or document it as overlay-privacy projection) after confirming no consumer; contract test that panel components read only `/api/queues`.

### S-12 — Medium — Dead or transitional routing

- `apps/frontend/scripts/next-runtime-config.mjs:9` filters `/connection/:path*` from `beforeFiles`, but `buildProductionProxyRules` never emits that source: dead code from an earlier plan.
- `/app.js`, `/styles.css`, `/` rewrites (S-02); `/overlay.html` → `/overlay` alias (`dev-proxy-config.mjs:29,51`) and `apps/api/src/http/dev-overlay-alias.mjs:11` serve existing OBS URLs. The `/callback` redirect targets `/connection/?oauth=` (`queue-routes.mjs:316`), relying on a trailing-slash redirect with `trailingSlash: false`.
- **Fix:** remove the dead filter; redirect to `/connection?oauth=`; owner decides how long `/overlay.html` stays (existing OBS sources depend on it — keep until a documented migration window ends).

### S-13 — Medium — Front-end spec is pre-localization and pre-Next

- `docs/front-end-spec.md:20` "Product interface language is pt-BR"; FND-8 ships en/es/pt-BR + community locales. `:36` "No CSS or component framework is required" is vanilla-era guidance. `:7` "not … an overlay" while the same Next app now hosts the overlay entry.
- **Fix:** update spec (en/pt-BR) with localization rule, the 9 routes, and the panel/overlay bundle separation; UX expert review because it is product-facing.

### S-14 — Low — Exact-URL session exemption

- `local-session.mjs:54` and `queue-routes.mjs:100` compare `request.url === '/api/session'`; `request.url` includes the query string, so `/api/session?x=1` returns 401. Harmless today, brittle. **Fix:** compare `request.routeOptions.url` or the parsed pathname.

### S-15 — Low — Language drift in English docs

- `README.md:20` "**Conexão do canal**"; `docs/USER_GUIDE-en_US.md:139` uses a pt-BR toggle label. The English UI is localized, so these labels no longer match what an English user sees.
- `docs/stories.md:356` / pt-BR `:357` title "Modular Next.js *static* frontend" is stale (runtime server).
- Heading counts of `USER_GUIDE-en_US.md` and `MANUAL_DE_USUARIO-pt_BR.md` match (21/21); content parity was not line-audited here (DOC-3 scope).

## API ↔ page contract map (summary)

All endpoints consumed by the 9 Next pages exist in `apps/api/src/http/*.mjs`; no missing route was found. Admin routes are behind the global `onRequest` session/Host/Origin/CSRF hook (`local-session.mjs:36-59`); `/overlay/api/widget` is intentionally public with a bearer capability; `/health` and `/callback` are public by design. No unauthenticated admin route was found. Routes with no Next consumer: `POST /api/queues/:id/archive-local/challenge|confirm` and `/delete/cancel` were not seen in the grep of `apps/frontend` literal paths (they may be built dynamically in `queue-lifecycle.mjs:64-67`; @qa should confirm via the endpoint inventory rather than assume dead).

## Recommended sequence

1. S-01 (one line + contract test) → 2. S-03 decision and relocation story → 3. S-04/S-05/S-06 as one "panel error and replay contract" story (data-engineer + UX) → 4. S-02 cutover with owner authorization and production-like Compose evidence → 5. S-07..S-15 documentation pass in en/pt-BR before the vanilla deletion PR.

## Resolution (2026-10-21, docs-only pass approved by the owner)

Changed: `docs/front-end-architecture.md` and shards `runtime-and-boundaries.md`, `files-and-modules.md`, `verification.md`, `index.md`; `docs/architecture.md` and `architecture/responsibilities.md`; `docs/fullstack-architecture.md` and shards `runtime-topology.md`, `architecture-constraints.md`, `application-modules.md`; `docs/project-completion-roadmap.md`; `docs/ROADMAP.md`; `README.md`/`README.pt-BR.md`; `docs/VERSIONING.md` (all with their pt-BR copies).

- **S-07 — resolved (docs):** two-process topology (Next.js HTTPS server → loopback HTTPS Fastify 3109), rewrite list, Host/Origin rule and the transitional vanilla `/` documented; static export marked historical. Second pass: `docs/prd.md` and shards `functional-requirements.md`/`non-goals.md` (FR-11, non-goals) now say the Next.js server serves the panel with no static export; `docs/stories/FND-0/spec/spec.md` has a "superseded in part by OPS-15" note covering `requirements.json`/`plan.json`/`research.json` (historical content kept). Still open: config/test leftovers (`eslint.config.js`, `.dockerignore`, `.gitignore`, `tsconfig.json`, `tests/unit/next-frontend-config.test.js`; out of docs-only scope) and module location under S-03.
- **S-08 — resolved (docs):** completion roadmap and `docs/stories.md` OPS-15 entry no longer gate on rollback to `legacy`; the open gate is an isolated redeploy of a previous image digest. Owner wording confirmation and the story Change Log entry stay with OPS-15.
- **S-09 — resolved (docs):** README badge/notice/status and VERSIONING example say beta; `gh release list` returned no release (verified 2026-10-21), so "Beta (no public release yet)" stands. `CHANGELOG_INTERNAL.md` has a latest-first 2026-10-21 entry with stage and OPS-11/12/13/15 status (OPS-14 has no index entry; not invented) marking the 2026-10-11 "beta plan is unscheduled" line as historical; `docs/stories.md` beta-timing line replaced.
- **S-10 — resolved:** ROADMAP refreshed (2026-10-21), OPS-11..OPS-20 added, FND-1/FND-9 corrected, ordering delegated to the completion roadmap.
- **S-15 — resolved (docs):** English README label fixed; `docs/USER_GUIDE-en_US.md` bold UI labels replaced with the English panel catalog values (`apps/web/localization/catalogs/panel/en.tsv`), and the stale "Operações financeiras" page name updated in both guides to the current navigation label; the auto-switch toggle label is not in the catalogs, so it is described rather than quoted. Stories index title no longer says "static". Full content parity remains DOC-3 scope.
- **S-13 — open:** product-facing spec; requires `aiox-ux-design-expert` review.
- **S-03 — resolved for modules (2026-10-21, @dev):** the 12 modules imported by Next (`call-deadline-presentation`, `command-catalog-view`, `overlay-renderer`, `overlay-widget-form`, `panel-catalog`, `panel-navigation`, `queue-action-state`, `queue-confirmation-copy`, `queue-settings-version`, `queue-sync-status`, `reward-link-dialog`, `setup-messages`) moved with `git mv` to `apps/shared/panel/` (owner decision: no new workspace). Next, tests, `apps/web/app.js` and `overlay.js` import the new path; Fastify serves it to the vanilla panel at the transitional `/shared/panel/` prefix (`web-route.mjs`, removed with the vanilla panel). The 12 Dockerfile `COPY apps/web/<module>` lines are gone (`COPY apps/shared` covers them); `tsconfig.web.json` and `lint:web` cover `apps/shared/panel`; ESLint `no-restricted-imports` blocks `**/web/**` from `apps/frontend` and `apps/shared`. Guarded by `tests/unit/shared-panel-boundary.test.js` and `dockerfile-frontend-imports.test.js`. **Still open:** catalogs stay in `apps/web/localization/catalogs` (separate step C, owner decision).
- **S-12 — partly resolved (2026-10-21, @dev):** the dead `/connection/:path*` filter was removed from `next-runtime-config.mjs`; the test now pins production rewrites to `buildProductionProxyRules` exactly. **Kept by owner decision:** the `/`, `/app.js`, `/styles.css` rewrites (S-02 cutover not authorized) and the `/overlay.html` aliases. The `/callback` redirect target was not changed.
- **S-03 follow-up (2026-10-21, @dev):** `tests/unit/web-route-vanilla-modules.test.js` crawls every static import of `apps/web/app.js` and `overlay.js` through `registerWebRoutes`; it found that `../shared/queue-call-message.mjs` (imported since `bbd9f9a`) returned 404 on Fastify, so `apps/shared/queue-call-message.mjs` also moved to `apps/shared/panel/`. `typecheck:web` errors are pre-existing: 59 at `HEAD` (clean worktree) and 60 now; the extra one is in uncommitted WIP (`queue-list.jsx:297`), not in the move; none in `apps/shared/panel`. Not fixed (out of scope).
- **S-13 — resolved (docs, 2026-10-22, owner decisions):** `docs/front-end-spec.md` and its shards (en + pt-BR) now describe the Next.js 16 / React 19 panel, `en`/`es`/`pt-BR` catalogs with the versioned server-side `product_locale` (panel and chat replies), the `/overlay` route on its own bundle, the Commands/Widgets/Settings areas (Settings = product language, which also sets the chat language, plus local preferences; anything new needs its own story), and the one-time-secret rule. The "no CSS or component framework" sentence was removed (no library adoption is claimed). Per the UX plan caveat, the overlay is not claimed to share the product locale (not verified in code).
