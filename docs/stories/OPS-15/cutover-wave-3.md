# OPS-15 cutover — Wave 3 (vanilla overlay and `/overlay.html` aliases removed)

[Português brasileiro](../../pt-BR/stories/OPS-15/cutover-wave-3.md)

- **Date:** 2026-10-27 (code), verification resumed 2026-10-28 after a quota interruption
- **Issue:** #95 (card FT-39), sub-issue of #69
- **Executor:** `@dev` (Dex). Final verdict belongs to `@qa`; commit belongs to `@devops`.
- **QA verdict:** CONCERNS, 9.0/10 (slice gate, 0 blocking issues for the Wave 3 commit): [`qa-gate-2026-10-28.md`](qa-gate-2026-10-28.md).
- **Branch / commits:** `feat/ops-15-next-panel`, base `0224bce` (Wave 0 = `08e84cb`, Wave 1 = `384a7e7`). Wave 3 committed by `@devops`: `906fd5c` (code + docs), followed by `8e20277` (architecture docs), `0604799` (stories and planning) and `0e5f1c9` (governance memory snapshot).
- **Authorization:** owner, 2026-10-27, incremental cutover (beta with no active users, safe structural changes until `rc`, no compatibility shims; `legacy` = protected branch `a9279b2`). OW-09 resolved: the `/overlay.html` aliases do not need to be kept. The owner checked the result manually with `npm run dev:start` ("Tudo Ok"). Plan: [`cutover-plan.md`](cutover-plan.md), Wave 3.
- **Scope:** Wave 3 only. The vanilla panel (`apps/web/app.js`, `index.html`, `styles.css` and its modules) and the localization catalogs are untouched (Waves 2 and 4). `API_ONLY` and `@fastify/static` stay (Wave 6). No Compose, installer, Dockerfile, CI or `package.json` change.

## What was removed or changed

| File | Change |
| --- | --- |
| `apps/api/src/domain/overlay-widget-service.mjs` | The widget link generator issues `${origin}/overlay?ref=<22 chars>#<token>` instead of `/overlay.html?...`. The capability secret is still only in the fragment (browsers never send it in a request, `Location` header or log line). |
| `apps/api/src/http/dev-overlay-alias.mjs` | Deleted. It was the development-only Fastify `GET /overlay.html` → 307 redirect to the Next origin. |
| `apps/api/src/server.mjs` | Removed the `registerDevelopmentOverlayAlias` import and its `NODE_ENV === 'development'` registration. |
| `apps/frontend/scripts/dev-proxy-config.mjs` | Removed the development rule `/overlay.html` → `/overlay` and the production `afterFiles` rule (now `afterFiles: []`). |
| `apps/web/overlay.html`, `overlay.js`, `overlay.css` | Deleted (not served since Wave 1). |
| `tests/unit/dev-overlay-alias.test.js` (3 cases) | Deleted with the module. |

The Next overlay (`apps/frontend/app/(overlay)/**`, which imports `apps/frontend/styles/overlay.css`, a different file) and the renderer `apps/shared/panel/overlay-renderer.mjs` did not change.

## Consumer searches

```text
git grep -n -I "overlay\.html\|overlay\.js\b\|overlay\.css\|dev-overlay-alias\|registerDevelopmentOverlayAlias" -- ':!docs/**' ':!CHANGELOG*' ':!legacy/**'
-> apps/frontend/app/(overlay)/layout.jsx:1   imports ../../styles/overlay.css (the Next stylesheet, not apps/web)
-> tests only: assertions that the paths are absent or answered with 404
   (overlay-browser-only.mjs:51-52, compose-runtime.test.js:374-382, next-static-export.test.js:32-34,
    api-static-surface-contract.test.js:38-55, next-dev-proxy.test.js, next-runtime-config.test.js:38,
    overlay-widget-service.test.js:19-22, shared-panel-boundary.test.js:77)
-> .claude/agent-memory/aiox-po/project_no_shims_until_rc.md (agent memory, history)
```

No application module (`apps/api/src`, `apps/frontend`, `apps/shared`, `apps/infra`) contains `overlay.html` any more; the new `api-static-surface-contract` case enforces it. The remaining `overlay` hits in `apps/web/app.js` are the vanilla panel widget editor (Wave 4), not the overlay document.

## Test-first (Red → Green)

New and changed tests (the new contract):

- `overlay-widget-service.test.js`: the link matches `^https://localhost:3000/overlay\?ref=[A-Za-z0-9_-]{22}#`, its path is `/overlay`, it does not contain `overlay.html`; the regenerated link also uses `/overlay`.
- `api-static-surface-contract.test.js` (new `describe`): `server.mjs` does not import or register the development alias, `http/dev-overlay-alias.mjs` does not exist, and no application module serves, rewrites or emits `/overlay.html`.
- `next-dev-proxy.test.js`: no `/overlay.html` rule in development or production; no rule rewrites to `/overlay`; `/overlay.html` added to the vanilla sources that never reach Fastify; production `afterFiles` is `[]`.
- `next-runtime-config.test.js`: `afterFiles` is `[]`. `next-static-export.test.js`: the built `routes-manifest.json` has no `overlay.html` rewrite.
- `shared-panel-boundary.test.js`: `apps/web/overlay.html`, `overlay.js`, `overlay.css` do not exist (the `app.js` assertion stays until Wave 4).
- `compose-runtime.test.js` (route ownership): `/overlay.html?ref=...`, `/overlay.html`, `/overlay.js` and `/overlay.css` = 404 answered by Next, no `Location`, no overlay entry, never JavaScript or CSS; `/overlay?ref=...` = 200, no `Location`, Next overlay entry.
- `overlay-browser-only.mjs`: opens `/overlay?ref=...#token`, asserts the page stays on `/overlay` (no redirect) and that `/overlay.html` = 404 with redirects disabled.
- Fixture-only updates (no new contract): `overlay-renderer`, `overlay-routes`, `queue-routes`, `next-widgets-page`, `overlay-parity-browser-only.mjs`, `overlay-browser.mjs` (CDP page filter), `widget-link-dialog-browser-only.mjs` now use `/overlay` URLs.

**Red** (tests as above, production files temporarily restored to `HEAD` `0224bce`: the three changed modules plus the four deleted files; then the Wave 3 versions were put back and checked by SHA-256):

- `npx vitest run tests/unit/overlay-widget-service.test.js tests/unit/next-dev-proxy.test.js tests/unit/api-static-surface-contract.test.js tests/unit/shared-panel-boundary.test.js tests/unit/next-runtime-config.test.js tests/unit/orphan-module-contract.test.js` → 5 files failed / 1 passed, **10 failed / 18 passed**: 2 `overlay-widget-service` (link path), 4 `next-dev-proxy` (alias rules present), 1 `next-runtime-config`, 2 `api-static-surface-contract` (`server.mjs` registers the alias; `dev-overlay-alias.mjs` emits `overlay.html`), 1 `shared-panel-boundary` (`apps/web/overlay.html` exists). `orphan-module-contract` passes in both states (the overlay files referenced each other, so it never flagged them).
- `npx vitest run tests/integration/compose-runtime.test.js -t "route ownership"` → exit 1, 1 failed / 6 skipped, at `compose-runtime.test.js:378`: `/overlay.html?ref=aaaaaaaaaaaaaaaaaaaaaa is retired: expected 200 to be 404` (the old `afterFiles` rewrite served the overlay).

**Green** (Wave 3 working tree):

- The 10 affected unit files above plus `overlay-renderer`, `overlay-routes`, `queue-routes`, `next-widgets-page` → exit 0, 10 files / 234 tests.
- `npx vitest run tests/integration/compose-runtime.test.js` (full file, disposable image built from the working tree) → exit 0, 7/7 in 110.7 s.

## Verification (`@dev`, development only; not the `@qa` verdict)

All commands ran with Node 24.20.0 (`nvm use`).

| Command | Exit | Result |
| --- | --- | --- |
| `npm run test:e2e:overlay:browser-only` with `APP_ORIGIN=https://localhost:3207` | 0 | Next `/overlay` without redirect, `/overlay.html` = 404, fragment cleanup, bearer without cookies, 401/403/404 clearing, 8 isolated sources (Chrome headless; intercepted API fixtures) |
| `npm run test:e2e:overlay:parity-browser-only` with the same origin | 0 | 7 source types, 8 simultaneous sources, 10 rapid revisions, latest update in 956 ms, route-bundle isolation (intercepted fixtures) |
| `npm run test:e2e:overlay:bundle-boundary` | 0 | overlay entry 1 chunk; panel entry 3; 3 panel-only chunks excluded |
| `npx vitest run tests/integration/compose-runtime.test.js` | 0 | 7/7 |
| `npm test` (full suite) | 0 | 163 files / 1610 tests (120.6 s). Wave 1 record: 164 / 1609; −1 file / −3 cases (`dev-overlay-alias`), +4 cases (2 `api-static-surface-contract`, 1 `next-dev-proxy`, 1 `shared-panel-boundary`) |
| `npm run lint` | 0 | pass |
| `npm run typecheck` | 0 | pass |
| `npm run review:static` | 0 | 2 rules on 149 files, 0 findings |
| `npm run validate:localization` | 0 | pass |
| `npm run validate:version` | 0 | `v0.2.0-0000000-beta` valid |
| `npm run validate:port-denylist` | 0 | 1037 files, 0 findings |
| `docker compose -f compose.yaml -f compose.build.yaml config --quiet` | 0 | valid (render only) |
| `git diff --check` | 0 | no whitespace errors |

The two `browser-only` E2E need an HTTPS app on loopback. Without one they fail with `net::ERR_CONNECTION_REFUSED` at `https://localhost:3000` (first attempt, exit 1, no app running). They were then run against an isolated `next dev` on `127.0.0.1:3207` with the same `--experimental-https` flags and local dev certificates that `npm run dev:start` uses, without Fastify or a database (the tests intercept `/overlay/api/widget`). Before the tests that server answered `/overlay` = 200 and `/overlay.html` = 404 with an empty `Location`. It was stopped in the same command; afterwards no port 3000–3999 was listening and no Next process was left.

**Docker:** before the work there were 0 containers, 0 volumes, the networks `bridge`/`host`/`none` and one image (`postgres:18.6-bookworm`). The only resources created were the disposable ones that `compose-runtime` (Green full file, Red single case, and inside `npm test`) and the PostgreSQL integration files create and remove. After every run: 0 containers, 0 volumes, only `postgres:18.6-bookworm`, the same three networks. No active resource existed or was touched.

**Not run:** native OBS/CEF with a new `/overlay` link; Firefox/WebKit; live Twitch; `test:e2e:overlay` (the CDP variant against a running stack); `npm run build:frontend` in an isolated worktree (`next-static-export` ran `next build` in the shared `apps/frontend/.next`).

## Observed risks

- **Old OBS links stop working.** A browser source configured with `/overlay.html?ref=...#token` now gets a 404 and must be given a newly generated link. Accepted by the owner (beta with no active users, OW-09). No redirect was kept on purpose: it would be a compatibility shim.
- **Docs still describe the alias.** `docs/front-end-architecture.md`, `docs/front-end-architecture/runtime-and-boundaries.md`, `screen-model.md`, `verification.md`, `docs/fullstack-architecture.md`, `docs/fullstack-architecture/runtime-topology.md` and `docs/DEVELOPMENT.md` (en + pt-BR) still mention `/overlay.html` or "to be removed in Wave 3". They were outside the `@dev` write set for this run; another agent owns those doc updates.
- **Story text.** OPS-15 AC 3/AC 8 named `/overlay.html`; the plan made their rewording by `@po` a precondition. `@po` was editing the story in parallel; `@qa` should confirm the wording before the gate.
- **Shared Next build directory.** `next-static-export` and the isolated `next dev` used `apps/frontend/.next`; the owner's `dev:start` rebuilds it, so no action is needed, but a running owner dev server would have conflicted (none was running).
- Production is not changed by a commit; users see it only when a release ships.

## Files changed

- Removed: `apps/web/overlay.html`, `apps/web/overlay.js`, `apps/web/overlay.css`, `apps/api/src/http/dev-overlay-alias.mjs`, `tests/unit/dev-overlay-alias.test.js`.
- Created: this file and its pt-BR copy.
- Changed: `apps/api/src/domain/overlay-widget-service.mjs`, `apps/api/src/server.mjs`, `apps/frontend/scripts/dev-proxy-config.mjs`, `tests/unit/overlay-widget-service.test.js`, `tests/unit/api-static-surface-contract.test.js`, `tests/unit/next-dev-proxy.test.js`, `tests/unit/next-runtime-config.test.js`, `tests/unit/shared-panel-boundary.test.js`, `tests/unit/overlay-renderer.test.js`, `tests/unit/overlay-routes.test.js`, `tests/unit/queue-routes.test.js`, `tests/unit/next-widgets-page.test.jsx`, `tests/integration/next-static-export.test.js`, `tests/integration/compose-runtime.test.js`, `tests/e2e/overlay-browser-only.mjs`, `tests/e2e/overlay-parity-browser-only.mjs`, `tests/e2e/overlay-browser.mjs`, `tests/e2e/widget-link-dialog-browser-only.mjs`, `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`.
- Not changed (on purpose): `apps/web/app.js`, `index.html`, `styles.css` and the other vanilla panel modules, the catalogs, `apps/frontend/next.config.mjs`, `package.json`, `Dockerfile`, Compose files, CI, installers, the story and its File List (`@po` and `@sm` were editing stories at the same time).

## How to revert

Revert the Wave 3 commit (`git revert <commit>`). That restores the three vanilla overlay files, `dev-overlay-alias.mjs` and its registration, both `/overlay.html` rewrites, the `/overlay.html` link generator and the previous tests. Links issued while Wave 3 was active (`/overlay?ref=...#token`) keep working after a revert, because the Next `/overlay` route existed before this wave. There is no data, schema or Compose effect.
