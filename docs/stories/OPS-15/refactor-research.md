# OPS-15 — Refactor research: S-03 module relocation and S-12 residue cleanup

- Date: 2026-10-21 · Author: @analyst (Atlas) · Branch: `feat/ops-15-next-panel` · Scope: research only (no code edited)
- Inputs: `structural-review.md` (S-03, S-12, Resolution), repository grep on 2026-10-21, Next.js official docs.
- Evidence labels: **VERIFIED** (read in the repo or official docs today), **PARTIAL** (partly confirmed), **UNVERIFIED** (inference; must be proven by tests).

## 1. Summary

1. Move the 12 modules to `apps/shared/panel/` with `git mv` in one dedicated commit (rename only), then rewrite imports in a second commit.
2. **Do not use re-export shims.** Fastify serves the vanilla panel from `apps/web` plus a single extra prefix `/shared/browser/` (`apps/api/src/web-route.mjs`). A shim in `apps/web` that re-exports `../shared/panel/x.mjs` makes the browser request `/shared/panel/x.mjs`, which returns 404. The working option is: update `apps/web/app.js` and `overlay.js` to import from `../shared/panel/` **and** register a `/shared/panel/` static prefix in `web-route.mjs` (transitional; it goes away with the vanilla removal). **VERIFIED** (code read); runtime behavior **UNVERIFIED**.
3. Catalogs: move them to `apps/shared/localization/catalogs/` in a **separate step (C)** after A, because they touch the API, `validate:localization`, the Next fallback and ~40 test references. They are not a prerequisite for A.
4. S-12: removing `/app.js` and `/styles.css` while the `/` rewrite still exists leaves production `/` as an unstyled shell without its script. In practice that is part of the S-02 cutover. It needs explicit owner authorization **together with `/`**, or must be postponed. The dead `/connection/:path*` filter can be removed safely. `/overlay.html` stays.

## 2. Exact module list and importers (VERIFIED, grep 2026-10-21)

| Module (`apps/web/…`) | Next importers (`apps/frontend`) | Other importers | Internal deps |
|---|---|---|---|
| `queue-action-state.mjs` | `features/queues/queue-settings.mjs:1`, `queue-list.jsx:2`, `queue-lifecycle.mjs:2`, `queue-lifecycle-actions.jsx:4` | `app.js:13`, `tests/unit/queue-action-state.test.js` | none |
| `queue-confirmation-copy.mjs` | `queue-lifecycle-actions.jsx:6` | `app.js:17`, unit test | none |
| `queue-settings-version.mjs` | `queue-settings.mjs:2` | `app.js:18`, unit test | none |
| `queue-sync-status.mjs` | `queue-list.jsx:3` | `app.js:5`, unit test | none |
| `reward-link-dialog.mjs` | `queue-reward-resolution.mjs:1` | `app.js:15`, unit + e2e tests | none |
| `call-deadline-presentation.mjs` | `queue-list.jsx` via `features/queues/call-deadline.jsx:2` (**untracked WIP file**) | `app.js:12`, `call-deadline-presentation.test.js`, `next-call-deadline.test.jsx` | none |
| `panel-navigation.mjs` | `features/panel-shell/panel-shell.jsx:8` | `app.js:6`, unit test | none |
| `setup-messages.mjs` | `features/connection/connection-page-content.jsx:6` | `app.js:3`, unit test | `../shared/browser/translate-catalog.mjs` → becomes `../browser/translate-catalog.mjs` |
| `command-catalog-view.mjs` | `features/commands/command-permissions-page-content.jsx:6` | `app.js:7`, unit test | none |
| `overlay-widget-form.mjs` | `features/widgets/widgets-page-content.jsx:6` | `app.js:8`, unit test | none |
| `overlay-renderer.mjs` | `app/(overlay)/overlay/overlay-root.jsx:4` (`../../../../web/`) | `overlay.js:1`, `overlay-renderer.test.js`, `next-overlay-root.test.js` | none |
| `panel-catalog.mjs` (`PANEL_PLACEHOLDERS`) | `lib/i18n/panel-catalogs.mjs:2` | `app.js:20`, `panel-catalog-placeholders.test.js`, `next-panel-catalogs.test.js` | none |

15 Next import lines in total. The other 13 modules in `apps/web` (`application-setup`, `call-notification-actions`, `dom-localization`, `health-status`, `locale-picker-state`, `panel-confirmation`, `panel-error-presentation`, `priority-labels`, `queue-onboarding-flow`, plus `app.js`, `overlay.js`, `*.html`, `*.css`) are vanilla-only. They **stay** and are deleted along with the vanilla panel.

## 3. References to the old paths (VERIFIED)

- **Dockerfile:9-20**: 12 `COPY apps/web/<module>` lines. Line 21 copies `apps/web/localization/catalogs` and line 22 copies `apps/shared`. After A, the 12 lines are removed because `COPY apps/shared` already covers them. Keep the line-21 catalog COPY until C.
- **`tests/unit/dockerfile-frontend-imports.test.js:30,73`**: accepts `apps/web/` or `apps/shared/`. It keeps working. After the move, tighten it to fail on any `apps/web/` import coming from `apps/frontend`.
- **Unit tests importing the 12 modules**: about 20 files (table above plus `next-queue-entry-actions.test.js` (5 refs), `reward-dialog-contract.test.js`, `next-panel-class1-parity.test.js`, `next-queue-settings-form.test.jsx`, `vanilla-fulfillment-feedback.test.js`). Each needs its path updated. Tests for vanilla-only modules are unchanged.
- **`eslint.config.js:32`**: browser globals for `apps/web/**/*.js` only. `.mjs` files under `apps/shared/panel` do not use DOM globals except `overlay-renderer` (**PARTIAL**: check whether `document` is used and whether `apps/shared` is linted by `npm run lint`).
- **`tsconfig.web.json:7-8`** (`typecheck:web`): includes `apps/web/**/*.mjs`. After the move the modules lose type coverage unless `apps/shared/panel/**/*.mjs` is added. **Required.**
- **`package.json:47` `lint:web`** = `eslint apps/web`: the same coverage loss applies.
- **Catalogs (step C)**: `apps/api/src/server.mjs:43`; `apps/infra/scripts/validate-localization.mjs:9`; `apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs:4` (`process.cwd()` + `apps/web/localization/catalogs`, read at runtime through `fs`, not bundled); `Dockerfile:21`; `tests/integration/panel-localization-contract.test.js` (36 refs, part of them about `index.html`/`app.js`/`styles.css`, which stay), `localization-catalog-discovery.test.js`, `panel-catalog-placeholders.test.js:36`; docs (`USER_GUIDE-en_US.md` and the S-15 note cite `apps/web/localization/catalogs/panel/en.tsv`); `discover-catalog-module.mjs` takes the root as a parameter and needs no change. The vanilla panel receives catalogs through API state (`state.localizationCatalogs`, `app.js:60,69`), so it does not depend on the catalog path. **VERIFIED.**
- **OPS-15 docs**: `story.md` (21), `structural-review.md` (16), `legacy-test-audit.md`, `queue-route-action-inventory.md`, `page-ux-review.md`, `flow-and-chat-review.md`. Update only living sections (File List, Change Log). Leave historical findings as they are.

## 4. External research

| Topic | Finding | Status |
|---|---|---|
| Turbopack root | "Files outside of the project root are not resolved". The root is detected from `package-lock.json`. `next build apps/frontend` detects the repo root, which is why `../../../web/` works today. `apps/shared` sits under the same root, so the move needs no `turbopack.root` change. Setting an explicit `turbopack.root` (repo root) is optional hardening. [Next.js turbopack docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack), lastUpdated 2026-09-24 | VERIFIED (docs); build **UNVERIFIED** |
| `experimental.turbopackAdditionalRoots` (16.4.0) | Only for symlinks. "Direct relative imports that escape a root are unsupported". Not applicable here. | VERIFIED |
| `outputFileTracingRoot` | Relevant only to `output: 'standalone'`. The project does not use standalone: the runtime image copies all of `apps` (`Dockerfile` runtime `COPY apps ./apps`). Not required. [output docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), 2026-09-18 | VERIFIED |
| `transpilePackages` | Applies to packages in `node_modules`/workspaces. There is no new workspace, so it is not needed (owner decision). [transpilePackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages) | PARTIAL (not fetched today) |
| Docker multi-stage | The `COPY apps/shared` layer must come before `RUN npm run build:frontend` (it already does, line 21→22). Fewer, coarser COPYs remove the drift from S-01. [Docker multi-stage](https://docs.docker.com/build/building/multi-stage/) | PARTIAL |
| `git mv` and history | Git does not store renames. It detects them by similarity (default 50%). Keep the move commit **free of content edits**, use `git log --follow` and `git blame -C`. [git-log --follow / -M](https://git-scm.com/docs/git-log) | PARTIAL (well-known behavior; not fetched today) |
| Import boundary | ESLint core `no-restricted-imports` with `patterns` (`group: ['**/web/*']`) on `apps/frontend/**` and `apps/shared/**`. No new dependency (the `import` plugin is not needed). [no-restricted-imports](https://eslint.org/docs/latest/rules/no-restricted-imports) | PARTIAL |

## 5. Safe step order

**Pre-condition:** commit or stash the untracked WIP (`call-deadline.jsx`) first so it is not left on the old path. Run every gate on a clean baseline.

### A — S-03 (modules)

1. Commit A1 (rename only): `git mv apps/web/<12 modules> apps/shared/panel/`. No content edits.
2. Commit A2 (paths):
   - Rewrite the 15 Next imports (`../../../web/x.mjs` → `../../../shared/panel/x.mjs`; overlay `../../../../shared/panel/`).
   - Fix `setup-messages.mjs` → `../browser/translate-catalog.mjs`.
   - Update `apps/web/app.js:3-20` and `overlay.js:1` → `../shared/panel/x.mjs`.
   - Add a `/shared/panel/` static prefix in `web-route.mjs` and `server.mjs:131`, with a test in `web-route.test.js`.
   - Update ~20 test imports.
   - Add `apps/shared/panel` to `tsconfig.web.json` and `lint:web`.
   - Remove the 12 `COPY` lines from the Dockerfile.
3. Commit A3 (guard):
   - Add `no-restricted-imports` blocking `**/web/**` in `apps/frontend/**` and `apps/shared/**`.
   - Tighten `dockerfile-frontend-imports.test.js` to "zero `apps/web` imports from `apps/frontend`".
4. Verification grep: `grep -rnE "(\.\./)+web/|apps/web/" apps/frontend apps/shared` must return only the catalog fallback (until C).

### B — S-12 (residue)

1. Remove the `/connection/:path*` filter (`next-runtime-config.mjs:9`) and adjust `next-dev-proxy.test.js:49`.
2. `/app.js` and `/styles.css` (`dev-proxy-config.mjs:48`): **blocked**. Removing them while `/` stays makes production `/` worse, and `compose-runtime.test.js:391` asserts `href="/styles.css"` on `/`, as does `next-dev-proxy.test.js:39,50`. Recommendation: do it together with `/` in the authorized S-02 cutover. [AUTO-DECISION] remove only the dead filter now → yes (reason: no behavior change; the rest is a cutover).
3. Optional: `/callback` redirect → `/connection?oauth=` (`queue-routes.mjs:315`) plus a test.
4. Keep `/overlay.html` (`dev-proxy-config.mjs:29,51`, `dev-overlay-alias.mjs`, `next-runtime-config.test.js:37`, `compose-runtime.test.js:374`).
5. `tests/integration/next-static-export.test.js`: the name and content are static-export residue. Rename or merge it into `next-runtime-config.test.js` (Resolution S-07 also lists `eslint.config.js`, `.dockerignore`, `.gitignore`, `tsconfig.json`, `next-frontend-config.test.js`; inspect them in the same pass).

### C — catalogs (separate story/commit)

1. `git mv apps/web/localization/catalogs apps/shared/localization/catalogs`, rename only.
2. Update `server.mjs:43`, `validate-localization.mjs:9`, `load-first-party-panel-fallback.mjs:4`, `Dockerfile:21` (the line becomes redundant), the 3 tests and the docs in en/pt-BR.
3. Run `npm run validate:localization`.

## 6. Risks and rollback

| Risk | Mitigation |
|---|---|
| Vanilla panel served by Fastify gets 404s on `/shared/panel/*` | Static prefix plus a test. Shims do not solve this (§1). |
| Lost lint/typecheck coverage of the moved modules | `tsconfig.web.json` + `lint:web` in A2 |
| Untracked WIP still importing `../../../web/` | Pre-condition, plus the A3 guard |
| Rename not detected (mixed edits) | A1 contains only `git mv` |
| Build passes locally but fails in Docker | `docker build --target frontend-build` is mandatory |
| S-12 B2 breaks production `/` | Do not run it without authorization for S-02 |

Rollback: `git revert` of A3→A2→A1 (atomic commits). There is no data or migration involved. Recovery uses a previous image digest, not `legacy` (owner decision).

## 7. Verification checklist

- [ ] `npm run lint`, `npm run typecheck` (incl. `typecheck:web`), `npm test`
- [ ] `npm run validate:localization`, `validate:version`, `validate:port-denylist`, `review:static`
- [ ] `npm run build:frontend` (Turbopack resolves `apps/shared/panel`)
- [ ] `docker build --target frontend-build .` and a full build (runtime stage)
- [ ] `tests/unit/dockerfile-frontend-imports.test.js`, `next-dev-proxy.test.js`, `next-runtime-config.test.js`, `web-route.test.js` (new `/shared/panel/` prefix), `windows-native-contract.test.js` (no references today; run as regression)
- [ ] `tests/integration/compose-runtime.test.js` (routes `/overlay.html`, `/`) on an isolated Compose project
- [ ] Browser: Next `/overlay`, `/queues`, `/connection`; vanilla `/` on Fastify (dev) with no 404 in the network tab
- [ ] Final grep for `apps/web/` / `../web/` in `apps/frontend`, `apps/shared`, `Dockerfile`
- [ ] Story File List and Change Log updated (en/pt-BR)

## 8. Limitations

No command was run (no build, test or Docker). `transpilePackages`, Docker, git and ESLint links were not fetched today. Their behavior is well documented but must be confirmed by the gates above.
