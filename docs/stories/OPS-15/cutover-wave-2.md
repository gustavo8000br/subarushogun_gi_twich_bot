# OPS-15 cutover — Wave 2 (first-party localization catalogs moved out of `apps/web`)

[Português brasileiro](../../pt-BR/stories/OPS-15/cutover-wave-2.md)

- **Date:** 2026-10-28
- **Issue:** [#96](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/96), sub-issue of [#69](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/69) (card FT-40; executes FT-05 [#85](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/85) and the string-path part of TS-04).
- **Executor:** `@dev` (Dex). Final verdict belongs to `@qa`; commit belongs to `@devops`.
- **QA verdict:** CONCERNS 9.3/10, 0 blocking issues, all 5 groups READY ([`qa-gate-2026-10-29.md`](qa-gate-2026-10-29.md)). M-1 (Wave 2 bookkeeping in the story, inventory and this record) and the doc nits L-1..L-3 are follow-ups, not blockers.
- **Commits (by `@devops`, after the `@qa` verdict):** code `ec12ae0` (15 × R100 catalog renames + the new module, consumers, `Dockerfile` and tests; 36 files); docs `b615b96` (architecture, guides, changelog, this record and the QA gate, en + pt-BR; 22 files).
- **TS-04 status:** partly delivered. The string-path check (case TS-04 in `tests/unit/shared-panel-boundary.test.js`) landed in this wave; merging the duplicated "no `apps/web` import" test (`dockerfile-frontend-imports` with `shared-panel-boundary`) stays in Wave 4 (FT-42), per [`cutover-plan.md`](cutover-plan.md) Wave 4 "Coupled changes".
- **Branch / base:** `feat/ops-15-next-panel`, base `6875575` (Wave 3 = `906fd5c`). Nothing staged or committed by `@dev`: the move is in the working tree only (15 deletions under `apps/web/localization/catalogs` + 15 untracked files under `apps/shared/localization/catalogs`, byte-identical, so `git add -A` on both paths records them as 100 % renames).
- **Authorization:** owner, 2026-10-27, incremental cutover (beta with no active users, safe structural changes until `rc`, no compatibility shims; `legacy` = protected branch `a9279b2`). Target path DP-3 = `apps/shared/localization/catalogs/` (no new Dockerfile COPY), recorded as resolved in [`docs/handoffs/resume-agents-2026-10-27.md`](../../handoffs/resume-agents-2026-10-27.md). Plan: [`cutover-plan.md`](cutover-plan.md), Wave 2 (A-05).
- **Scope:** Wave 2 only. The vanilla panel (`apps/web/app.js`, `index.html`, `styles.css` and its 8 modules) stays (Wave 4). No change in Compose, installers, CI, `package.json`, community catalog mount (`.local/community-catalogs`), product texts or locales.

## What moved or changed

| File | Change |
| --- | --- |
| `apps/web/localization/catalogs/{chat,lifecycle,overlay,panel,setup}/{en,es,pt-BR}.tsv` → `apps/shared/localization/catalogs/…` | 15 files moved unchanged. Aggregate SHA-256 `1a4a8e24da8463214a334b63a0ff1054d28babd430ca88134f089b134fbabda7` before and after, produced by `find . -type f -name '*.tsv' \| sort \| xargs sha256sum \| sha256sum` run inside the catalogs root (the input is the `sha256sum` lines, hash plus relative path, sorted by path; a hash-only sorted list gives a different value). Reproduced by `@po` on 2026-10-28 in `apps/shared/localization/catalogs` (QA gate 2026-10-29 L-2). `apps/web/localization/` no longer exists. |
| `apps/shared/localization/first-party-catalogs.mjs` (new) | `FIRST_PARTY_CATALOG_DIRECTORY = 'apps/shared/localization/catalogs'` (repository-root-relative) and `resolveFirstPartyCatalogRoot(repositoryRoot)`. Root-relative on purpose: the Next panel pages read the fallback at `next build` through `process.cwd()`, where `import.meta.url` would point into the bundle. |
| `apps/api/src/server.mjs:42` | `catalogRoot = resolveFirstPartyCatalogRoot(<repo root from import.meta.url>)` instead of `new URL('../../web/localization/catalogs/', …)`. |
| `apps/infra/scripts/validate-localization.mjs:10` | Default root resolved through the shared constant; an explicit CLI argument still wins. |
| `apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs` | `resolveFirstPartyCatalogRoot(process.cwd())` instead of `resolve(process.cwd(), 'apps/web/localization/catalogs')`. |
| `Dockerfile` | Removed `COPY apps/web/localization/catalogs ./apps/web/localization/catalogs` from the `frontend-build` stage. The existing `COPY apps/shared ./apps/shared` (frontend stage) and `COPY apps ./apps` (runtime stage) carry the catalogs. |

## Consumer searches

```text
git grep -n -I -e "apps/web/localization" -e "'web', 'localization'" -e "../web/localization" -- ':!docs/**' ':!CHANGELOG*' ':!legacy/**' ':!.aiox/**' ':!.claude/**'
-> no match (after the change)
```

Before the change the same search found the 3 runtime consumers above, `Dockerfile:9`, 11 test files (`compose-runtime`, `compose-contract`, `localization-catalog-discovery`, `panel-localization-contract`, `next-call-deadline`, `next-panel-catalogs`, `next-panel-class1-parity`, `next-queue-entry-actions`, `panel-catalog-placeholders`, `panel-confirmation-contract`, `dockerfile-frontend-imports`) and 3 E2E (`widget-link-dialog`, `queue-manual-entry-outcomes`, `queue-reward-resolution` browser-only). The API route `/api/localization/catalogs` is a URL, not a path, and did not change. Remaining doc mentions are history (stories, plans, QA gates, handoffs, inventory).

## Test-first (Red → Green)

New and changed tests (the new contract):

- `tests/unit/first-party-catalog-location.test.js` (new, 6 cases): the shared module exports `apps/shared/localization/catalogs` and resolves it from the root; exactly 5 modules × 3 locales live there and `apps/web/localization` does not exist; `server.mjs`, `validate-localization.mjs` and `load-first-party-panel-fallback.mjs` import `resolveFirstPartyCatalogRoot` from the shared module and do not spell `localization/catalogs` themselves; discovery from the shared path returns the same 5 modules / 3 locales; the default validator root is valid with the same modules/locales; the Next pt-BR fallback loads from the shared path. The last two are characterization cases (they passed before and after; they pin "no observable change").
- `tests/unit/shared-panel-boundary.test.js`, new case **TS-04**: no `apps/web` path string (`apps/web`, `'../../web/…'`, `'apps', 'web'`) in any source, script, SQL, CSS or Markdown file under `apps/frontend`, `apps/shared`, `apps/api`, `apps/infra`. The existing import check could not see string paths.
- `tests/unit/dockerfile-frontend-imports.test.js`: "only the catalogs until step C" became "copies nothing from `apps/web`" (empty list) plus no `apps/web` anywhere in the `Dockerfile`.
- `tests/integration/compose-contract.test.js`: the positive match of the catalogs COPY became "the `Dockerfile` has no `apps/web`".
- Path-only repoints (no assertion changed): `compose-runtime` (community catalog case copies `en.tsv` from the new path), `localization-catalog-discovery`, `panel-localization-contract` (class B; 10 references), `next-call-deadline`, `next-panel-catalogs`, `next-panel-class1-parity`, `next-queue-entry-actions`, `panel-catalog-placeholders`, `panel-confirmation-contract` (class B), and the 3 E2E. No class-B assertion was removed or weakened.

**Red** (tests above, production code and catalogs still at `HEAD` `6875575`):

- `npx vitest run` on the 12 affected files (`first-party-catalog-location`, `shared-panel-boundary`, `dockerfile-frontend-imports`, `next-call-deadline`, `next-panel-catalogs`, `next-panel-class1-parity`, `next-queue-entry-actions`, `panel-catalog-placeholders`, `panel-confirmation-contract`, `localization-catalog-discovery`, `panel-localization-contract`, `compose-contract`) → exit 1, **12 files failed, 44 failed / 90 passed**. Key failures: TS-04 listed exactly `load-first-party-panel-fallback.mjs:4`, `server.mjs:41`, `validate-localization.mjs:9`; `dockerfile-frontend-imports` received `['apps/web/localization/catalogs']`; `compose-contract` found `apps/web` in the `Dockerfile`; `first-party-catalog-location`: module `first-party-catalogs.mjs` not found, `apps/shared/localization/catalogs` missing (ENOENT), consumers not using the constant; repointed files: `ENOENT` / "Catalog module directory is unavailable" (`next-call-deadline` and `panel-confirmation-contract` fail at file load).

**Green** (Wave 2 working tree):

- Same 12 files + `localization-validator-cli` + `localization-catalog-route` → exit 0, **14 files / 162 tests**.

## Verification (`@dev`, development only; not the `@qa` verdict)

All commands ran with Node 24.20.0 (`nvm use`), serially, with nothing else using Docker or ports.

| Command | Exit | Result |
| --- | --- | --- |
| `npm test` (full suite, default parallel pool) | 0 | 164 files / 1617 tests (171.7 s). Wave 3 record: 163 / 1610; +1 file (`first-party-catalog-location`, 6 cases) and +1 case (TS-04) |
| `npx vitest run tests/integration/compose-runtime.test.js` (isolated, disposable image built from the working tree) | 0 | 7/7 in 80.3 s, including the image build (Next `frontend-build` stage without the `apps/web` COPY, so `next build` prerendered the panel with the fallback read from the new path), route ownership, community catalog discovery, TLS, restart and the Chromium queue journey. The M-1 flake (queue journey, `compose-runtime.test.js:1216-1222`) did not occur |
| `npm run test:e2e:widget-link:browser-only` with `APP_ORIGIN=https://localhost:3207` | 0 | PASS (Chromium 156; intercepted API fixtures) |
| `npm run test:e2e:manual-entry-outcomes:browser-only` (same origin) | 0 | PASS QRA-10 |
| `npm run test:e2e:queue-reward-resolution:browser-only` (same origin) | 0 | PASS QRA-08/09 |
| `npm run lint` | 0 | pass |
| `npm run typecheck` | 0 | pass |
| `npm run validate:localization` | 0 | `valid`, modules `chat`, `lifecycle`, `overlay`, `panel`, `setup`; locales `en`, `es`, `pt-BR` (same as before) |
| `npm run validate:version` | 0 | `v0.2.0-0000000-beta` valid |
| `npm run validate:port-denylist` | 0 | 1038 files, 0 findings |
| `npm run review:static` | 0 | 2 rules on 150 files, 0 findings |
| `git diff --check` | 0 | no whitespace errors |

The three E2E need an HTTPS app on loopback. They ran against an isolated `next dev apps/frontend` on `127.0.0.1:3207` with the local dev certificates in `.local/dev-tls` (the flags `npm run dev:start` uses), without Fastify or a database (the tests intercept every API call). The warm-up `GET /queues` returned 200, which also exercised the Next fallback loader from the new path at runtime; the Next dev log had no error. The server was stopped right after; afterwards no port 3000–3999 was listening and no `next` process was left.

**Docker:** before the work: 0 containers, 0 volumes, networks `bridge`/`host`/`none`, one image (`postgres:18.6-bookworm`). Only the disposable resources that `compose-runtime` and the PostgreSQL integration files create and remove were used. After every run: 0 containers, 0 volumes, only `postgres:18.6-bookworm`, the same three networks.

**Not run:** `npm run build:frontend` in a separate git worktree (a worktree checks out `HEAD`, which lacks the uncommitted move); the isolated build proof is the Docker `frontend-build` stage inside `compose-runtime`, which starts from a clean context without `.next`. `next-static-export` (inside `npm test`) also ran `next build` in the shared `apps/frontend/.next`. Standalone `npm run build` (product image tag) and `docker compose config --quiet` were not run separately because Compose files did not change and the image was built by `compose-runtime`. Native OBS/CEF, Firefox/WebKit and live Twitch are not affected by this wave and were not run.

## Observed risks

- **Untracked target directory.** Until `@devops` stages both paths, `git status` shows 15 deletions plus an untracked `apps/shared/localization/catalogs/`. Staging only one side would break every consumer; stage `apps/web/localization` and `apps/shared/localization` together (Git then reports renames).
- **`process.cwd()` assumption kept.** The Next fallback still depends on the process running from the repository (or image `/app`) root, as before this wave; it is now one shared constant instead of a literal. `compose-runtime` (image) and the isolated `next dev` (repo root) both exercised it.
- **Community translators** who copied files from the old path must use `apps/shared/localization/catalogs/<module>/pt-BR.tsv` as the source (TRANSLATION_GUIDE updated). The host-managed community directory is unchanged.
- **Parallel edits by other agents.** `docs/process/backlog-inventory.md` (+ pt-BR) and OPS-25/OPS-26 stories were modified in the working tree by other agents during this run; `@dev` did not touch them. The FT-40 row in the inventory still says "not started" and "DP-3 … still awaits the owner"; its owner should update it.
- Production is not changed by a commit; users see it only when a release ships.

## Story File List (suggestion for `@po`)

`@dev` did not edit `docs/stories/OPS-15/story.md` (owned by `@po`). Recorded by `@po` on 2026-10-28 as "File List — Wave 2" and a Change Log row in the OPS-15 story (QA gate 2026-10-29 M-1). Original suggestion, kept as history:

- Moved: `apps/web/localization/catalogs/**` (15 TSV) → `apps/shared/localization/catalogs/**`.
- Created: `apps/shared/localization/first-party-catalogs.mjs`, `tests/unit/first-party-catalog-location.test.js`, `docs/stories/OPS-15/cutover-wave-2.md` (+ pt-BR).
- Changed: `apps/api/src/server.mjs`, `apps/infra/scripts/validate-localization.mjs`, `apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs`, `Dockerfile`, the tests and docs listed below.
- Change Log row: "2026-10-28 — Cutover Wave 2 (FT-40): first-party catalogs moved to `apps/shared/localization/catalogs` (DP-3); TS-04 boundary test added; `@qa` verdict pending."

## Files changed

- Moved (working tree only): 15 TSV catalogs, `apps/web/localization/catalogs/` → `apps/shared/localization/catalogs/`.
- Created: `apps/shared/localization/first-party-catalogs.mjs`, `tests/unit/first-party-catalog-location.test.js`, this file and its pt-BR copy.
- Changed (code): `apps/api/src/server.mjs`, `apps/infra/scripts/validate-localization.mjs`, `apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs`, `Dockerfile`.
- Changed (tests): `tests/unit/shared-panel-boundary.test.js`, `tests/unit/dockerfile-frontend-imports.test.js`, `tests/integration/compose-contract.test.js`, `tests/integration/compose-runtime.test.js`, `tests/integration/localization-catalog-discovery.test.js`, `tests/integration/panel-localization-contract.test.js`, `tests/unit/next-call-deadline.test.jsx`, `tests/unit/next-panel-catalogs.test.js`, `tests/unit/next-panel-class1-parity.test.js`, `tests/unit/next-queue-entry-actions.test.js`, `tests/unit/panel-catalog-placeholders.test.js`, `tests/unit/panel-confirmation-contract.test.js`, `tests/e2e/widget-link-dialog-browser-only.mjs`, `tests/e2e/queue-manual-entry-outcomes-browser-only.mjs`, `tests/e2e/queue-reward-resolution-browser-only.mjs`.
- Changed (docs, en + pt-BR): `docs/TRANSLATION_GUIDE.md`, `docs/DEVELOPMENT.md` / `docs/pt-BR/DESENVOLVIMENTO.md`, `docs/architecture.md`, `docs/architecture/responsibilities.md`, `docs/front-end-architecture.md`, `docs/front-end-architecture/files-and-modules.md`, `docs/fullstack-architecture.md`, `docs/fullstack-architecture/application-modules.md`, `CHANGELOG_INTERNAL.md` / `docs/pt-BR/CHANGELOG_INTERNAL.md`.
- Not changed (on purpose): `apps/web/app.js`, `index.html`, `styles.css` and the other vanilla modules (Wave 4), `compose*.yaml`, installers, CI, `package.json`, `eslint.config.js`, `tsconfig*.json`, the story, the backlog inventory and the board.

## How to revert

Revert the Wave 2 code commit (`git revert ec12ae0`; the docs commit `b615b96` can be reverted separately). That moves the 15 catalogs back to `apps/web/localization/catalogs`, restores the literal paths in the three consumers and the `Dockerfile` COPY, deletes `first-party-catalogs.mjs` and restores the previous tests. There is no data, schema, Compose or installer effect; the catalog contents are identical on both sides.
