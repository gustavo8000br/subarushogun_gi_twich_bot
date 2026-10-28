# OPS-15 cutover — Wave 1 (Next owns `/`)

[Português brasileiro](../../pt-BR/stories/OPS-15/cutover-wave-1.md)

- **Date:** 2026-10-27
- **Issue:** #93 (FT-38)
- **Executor:** `@dev` (Dex). Final verdict belongs to `@qa`; commit belongs to `@devops`.
- **Branch / base:** `feat/ops-15-next-panel` at `80efb98` (uncommitted working tree; Wave 0 is commit `0eb4fd2`).
- **Authorization:** owner, 2026-10-27, incremental cutover (beta with no active users, no compatibility shims; `legacy` = protected branch `a9279b2`). Owner decisions: DP-0 (OPS-22/OPS-23/FT-23 block only OPS-15 completion, not this wave), DP-1 (the Next Overview is the production home page; on first use without a connection it shows the "connect" card instead of opening Connection), DP-2 (delete `registerWebRoutes` and `web-route.mjs`, do not switch them off). Plan: [`cutover-plan.md`](cutover-plan.md), Wave 1, items A-01 and A-02.
- **Scope:** Wave 1 only. `apps/web/**`, the vanilla overlay files and the `/overlay.html` aliases are untouched (Waves 3 and 4). `API_ONLY` and the `@fastify/static` dependency stay (Wave 6). No Compose, installer, Dockerfile or CI change.

## What was removed or changed

| File | Change | Plan item |
| --- | --- | --- |
| `apps/frontend/scripts/dev-proxy-config.mjs` | Removed the three production `beforeFiles` rewrites of `/`, `/styles.css` and `/app.js` to Fastify. The remaining Fastify rewrites are `/api/:path*`, `/overlay/api/:path*`, `/health` and `/callback`; `afterFiles` keeps `/overlay.html` → `/overlay`. Development rules are unchanged (they never had these three). | A-01 |
| `apps/api/src/server.mjs` | Removed the `registerWebRoutes` import and call (static root `apps/web`, `/shared/browser/` and `/shared/panel/` prefixes, `apiOnly` option). | A-02 |
| `apps/api/src/web-route.mjs` | Deleted (option A, DP-2). | A-02 |
| `tests/unit/web-route.test.js` (10 cases) | Deleted with the module. See "Removed tests" below. | A-02 |
| `tests/unit/web-route-vanilla-modules.test.js` (2 cases) | Deleted with the module. | A-02 |
| `apps/frontend/next.config.mjs` | Not changed: it only calls `buildNextConfig`, which reads the rules above. | — |

No UI code changed. The Next Overview (`apps/frontend/app/(panel)/page.jsx`) already existed and was already the page at every deep route; the first-run "connect channel" card is the existing `getOverviewNextAction` behavior (`apps/shared/panel/panel-navigation.mjs:9-14`).

## Consumer searches (before the change, at `80efb98`)

```text
git grep -n -I "registerWebRoutes\|web-route\|API_ONLY\|apiOnly\|fastify/static\|sharedPanelRoot\|sharedBrowserRoot" -- . ':!docs' ':!package-lock.json'
-> apps/api/src/server.mjs:8,128,133,134 (import and call)
-> apps/api/src/web-route.mjs (the module; only importer of @fastify/static)
-> tests/unit/web-route.test.js, tests/unit/web-route-vanilla-modules.test.js (its tests)
-> apps/frontend/scripts/dev-runtime-config.mjs:20 (API_ONLY: 'true', kept until Wave 6)
-> package.json:56 (@fastify/static, kept until Wave 6)
-> CHANGELOG_INTERNAL.md (history)

git grep -n -E "['\"\`]/shared/(browser|panel)/" HEAD -- apps tests ':!apps/web'
-> only web-route.mjs and its two tests: no HTTP consumer of the shared prefixes outside the vanilla
   (Next and the API import apps/shared/** from the file system, not over HTTP)

git grep -n -E "source: '/'|'/styles\.css'|'/app\.js'" -- tests apps
-> tests/unit/next-dev-proxy.test.js, tests/unit/next-runtime-config.test.js:36,
   tests/integration/next-static-export.test.js:31, tests/integration/compose-runtime.test.js:387-391,
   tests/integration/compose-contract.test.js:170-171 (server.mjs contains the web root URL)
```

After the change, `git grep -n -E "registerWebRoutes|web-route" -- . ':!docs' ':!CHANGELOG_INTERNAL.md'` → exit 1 (no match).

Not removed on purpose: the `/overlay.html` aliases (`dev-proxy-config.mjs`, `apps/api/src/http/dev-overlay-alias.mjs`), `apps/shared/panel/**` and `apps/shared/browser/translate-catalog.mjs` (imported by Next and by `chat-handler.mjs` from the file system), the first-party catalogs under `apps/web/localization/catalogs` (still read by `server.mjs:43`; Wave 2).

## Test-first (Red → Green)

New and changed tests (the new contract):

- **New** `tests/unit/api-static-surface-contract.test.js`: `server.mjs` does not register or import the web routes and does not build the `../../web/`, `../../shared/browser/` or `../../shared/panel/` roots; `apps/api/src/web-route.mjs` does not exist; no module under `apps/api/src` imports `@fastify/static`. This re-expresses the class-1 case "API-only mode without browser UI routes" (`web-route.test.js:16`) for the whole API process instead of a flag.
- `tests/unit/next-dev-proxy.test.js`: the exact production rules no longer list `/`, `/styles.css`, `/app.js`; new case "never rewrites the panel root or a vanilla panel asset to Fastify" (no `/`, `/index.html`, `/styles.css`, `/app.js`, `/overlay.js`, `/overlay.css` or `/shared/*` source; Fastify receives only the four operational routes; `afterFiles` keeps `/overlay.html`); the `buildNextConfig` case asserts no `/` source.
- `tests/integration/compose-contract.test.js:170-172`: `server.mjs` must **not** contain the `../../web/` web root.
- `tests/integration/compose-runtime.test.js` (route-ownership case, renamed "Next owns the root and migrated pages, overlay, and Fastify APIs"): `/` = 200, `text/html`, `x-powered-by: Next.js`, `class="panel-shell"`, `data-next-panel-entry`, no `app-shell`, no `/styles.css` link; `/app.js`, `/styles.css`, `/index.html` and `/shared/panel/panel-navigation.mjs` = 404 answered by Next, never JavaScript or CSS.
- `tests/unit/next-runtime-config.test.js:28-38` and `tests/integration/next-static-export.test.js:30-32`: these two also pinned the old `/` rewrite. They were **not** listed in the plan and my first search (by `styles.css`/`app.js`) missed them; the full suite found them after the code change. They were inverted (exact four-rule `beforeFiles`; no `/`, `/styles.css`, `/app.js` in the built `routes-manifest.json`), and their Red was then reproduced against the old proxy config (below).

**Red** (code unchanged):

- `npx vitest run tests/unit/next-dev-proxy.test.js tests/unit/api-static-surface-contract.test.js tests/integration/compose-contract.test.js` → 3 files failed, 6 failed / 15 passed. Failures: both `api-static-surface-contract` cases (`server.mjs` matches `registerWebRoutes`; importers = `["apps/api/src/web-route.mjs"]`), the three `next-dev-proxy` cases (vanilla sources `/`, `/styles.css`, `/app.js` present), `compose-contract` (`server.mjs` contains the web root URL).
- `npx vitest run tests/integration/compose-runtime.test.js -t "route ownership"` → exit 1, 1 failed / 6 skipped, at `compose-runtime.test.js:391`: `expected undefined to be 'Next.js'` (Fastify answered `/`).
- `next-runtime-config.test.js` with only `dev-proxy-config.mjs` temporarily restored to `HEAD` (`git stash push -- <file>`, then `git stash pop`) → exit 1, 1 failed / 4 passed. `next-static-export` failed in the first full-suite run after the code change and before its edit (`expected [...] to deep equally contain { source: '/' ... }`), i.e. it pinned the old contract.

**Green** (after the change):

- The 7 directly affected files (`next-dev-proxy`, `api-static-surface-contract`, `compose-contract`, `shared-panel-boundary`, `orphan-module-contract`, `next-dev-runtime-config`, `dockerfile-frontend-imports`) → 7 files / 38 tests passed.
- `npx vitest run tests/unit/next-runtime-config.test.js tests/integration/next-static-export.test.js` → exit 0, 2 files / 6 tests (includes a real `next build`).
- `npx vitest run tests/integration/compose-runtime.test.js` (full file, builds a disposable image) → exit 0, 7/7 passed in 120.5 s: route ownership, overlay, Chromium journey, community catalog, TLS and restart cases.

## Removed tests and where each contract lives now

| Removed test | Class (audit) | Contract now held by |
| --- | --- | --- |
| `web-route.test.js` "API-only mode without browser UI routes" | 1 (kept contract) | `api-static-surface-contract.test.js` (no static handler in the API process at all) + `compose-runtime` (`/app.js` = Next 404) |
| `web-route.test.js` "serves only shared localization ESM from the browser module prefix" | 1 | Obsolete: no HTTP consumer of `/shared/browser/` remains (search above). `translate-catalog.mjs` is still imported from the file system and covered by its own unit tests. Reclassification to C to be confirmed by `@qa` (plan Wave 1). |
| `web-route.test.js` "transitional /shared/panel/ prefix" and "does not expose the shared panel prefix in API-only mode" | C (transitional) | `compose-runtime` asserts `/shared/panel/panel-navigation.mjs` = Next 404 |
| `web-route.test.js` six cases reading `/`, `/app.js`, `/styles.css` (page markup, locale picker, resend, settings dialogs, delete confirmation) | C (vanilla UI, `legacy-test-audit.md:30`) | Next page tests already listed in the audit (`next-overview-panel`, `next-queues-*`, `next-locale-*`, `next-panel-class1-parity`, etc.); not ported again |
| `web-route-vanilla-modules.test.js` (2) | C (S-03 HTTP graph of the vanilla) | `shared-panel-boundary.test.js` still checks that every relative import of `app.js`/`overlay.js` resolves to a file until Waves 3/4 |

No class-B contract file was touched: `panel-confirmation-contract`, `reward-dialog-contract`, `health-status`, `web-application-setup`, `locale-picker-state` and `panel-localization-contract` read files on disk, not over HTTP, and still pass.

## Verification (`@dev`, development only; not the `@qa` verdict)

All commands ran with Node 24.20.0 (`nvm use`).

| Command | Exit | Result |
| --- | --- | --- |
| `npm run lint` | 0 | pass |
| `npm run typecheck` | 0 | pass |
| `npm test` (full suite, final run) | 0 | 164 files / 1609 tests passed (109.2 s). Wave 0 baseline 165 / 1618: −12 (`web-route` 10 + `web-route-vanilla-modules` 2), +2 (`api-static-surface-contract`), +1 (`next-dev-proxy`). The previous full run, before the two extra test edits, was exit 1 with exactly the 2 failures described above. |
| `npx vitest run tests/integration/compose-runtime.test.js` | 0 | 7/7 (disposable image built from the working tree; `/` answered by Next) |
| `npm run review:static` | 0 | 2 rules on 151 files, 0 findings |
| `npm run validate:localization` | 0 | pass |
| `npm run validate:version` | 0 | `v0.2.0-0000000-beta` valid |
| `npm run validate:port-denylist` | 0 | 1037 files, 0 findings |
| `npm run sync:ide:check` | 0 | pass |
| `docker compose -f compose.yaml -f compose.build.yaml config --quiet` | 0 | valid (render only) |
| `git diff --check` (+ `--no-index` check of the new untracked test) | 0 | no whitespace errors |

**Docker:** before the work there were 0 containers, 0 volumes and one image (`postgres:18.6-bookworm`). The only resources created were the disposable ones that `compose-runtime` (three runs: Red, Green, and inside each full suite) and the PostgreSQL integration files create and remove. After every run: 0 containers, 0 volumes, only `postgres:18.6-bookworm`, no extra network. No active resource existed or was touched. Ports 3000/3109 were not used manually and no dev server was started.

**Not run:** browser smoke of `/` at 390×844 / 768×900 / 1440×900 and the overlay `browser-only`, `parity-browser-only` and `bundle-boundary` E2E (plan Wave 1 gates for `@qa`); `npm run build:frontend` in an isolated worktree (the `next-static-export` test ran `next build` in the shared `apps/frontend/.next`); live Twitch; native OBS/CEF.

## Observed risks

- **Two unlisted pins.** `next-runtime-config.test.js` and `next-static-export.test.js` also fixed the `/` rewrite; the plan listed only `next-dev-proxy` and `compose-runtime`. Both were inverted in this wave. `@qa` should rerun the broad search `git grep -n -E "source: '/'|'/styles\.css'|'/app\.js'" -- tests apps`.
- **First-run landing (R2, DP-1).** A disconnected first visit now lands on the Overview with the "connect channel" card instead of the Connection page. This is the accepted behavior; it is covered by unit tests of the Overview and was not checked in a browser in this wave.
- **Dead files still on disk.** `apps/web/**` (panel and overlay) and `@fastify/static` are now unreachable/unused at runtime until Waves 3, 4 and 6. `orphan-module-contract` does not flag them because `index.html`/`overlay.html` still reference them.
- **Docs not updated in this wave.** The plan lists `docs/front-end-architecture/runtime-and-boundaries.md`, `files-and-modules.md`, `verification.md`, `docs/fullstack-architecture/application-modules.md`, `docs/architecture/responsibilities.md` and `docs/DEVELOPMENT.md:90` (en + pt-BR). They were outside the write set given to `@dev` for this run (another agent was editing story docs), so they still describe the transitional vanilla `/`. The product-facing beta changelog line (DP-7, `CHANGELOG-beta.md`) is also pending, for the release preparation.
- **Production is not changed by a commit.** Users see this only when a release ships (R7).
- Only a real browser can confirm the absence of layout overflow and the 5 s polling on `/`; only a shipped release confirms installed users' home page.

## Files changed

- Removed: `apps/api/src/web-route.mjs`, `tests/unit/web-route.test.js`, `tests/unit/web-route-vanilla-modules.test.js`.
- Created: `tests/unit/api-static-surface-contract.test.js`, this file and its pt-BR copy.
- Changed: `apps/api/src/server.mjs`, `apps/frontend/scripts/dev-proxy-config.mjs`, `tests/unit/next-dev-proxy.test.js`, `tests/unit/next-runtime-config.test.js`, `tests/integration/next-static-export.test.js`, `tests/integration/compose-contract.test.js`, `tests/integration/compose-runtime.test.js`, `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`.
- Not changed (on purpose): `apps/frontend/next.config.mjs`, `package.json`, `Dockerfile`, Compose files, CI, installers, `apps/web/**`, the story and its File List (`@po` was editing the story at the same time; `@po`/`@dev` update the File List later).

## How to revert

Revert the Wave 1 commit (`git revert <commit>`). That restores the three rewrites, `web-route.mjs`, its call in `server.mjs` and the two removed tests, and reverts the test inversions; `/` returns to the vanilla shell. There is no data, schema or Compose effect.
