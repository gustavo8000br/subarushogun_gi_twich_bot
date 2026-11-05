# OPS-15 cutover — Wave 0 (dead code)

[Português brasileiro](../../pt-BR/stories/OPS-15/cutover-wave-0.md)

- **Date:** 2026-10-27
- **Executor:** `@dev` (Dex). Final verdict belongs to `@qa`; commit belongs to `@devops`.
- **Branch / base:** `feat/ops-15-next-panel` at `fb828d3` (uncommitted working tree).
- **Authorization:** owner, 2026-10-27, incremental cutover (beta with no active users; `legacy` = protected branch `a9279b2`). Plan: [`cutover-plan.md`](cutover-plan.md), Wave 0, items A-06 and A-11.
- **Scope:** Wave 0 only. No route, rewrite, alias or `/overlay.html` handling changed (that is Wave 3). Nothing from Wave 1 was done.

## What was removed

| File | Plan item | Why it is dead |
| --- | --- | --- |
| `apps/web/priority-labels.mjs` | A-06 / TS-01 | Only consumer was its own test. `app.js` stopped importing it in FND-8 (`a906756`, `test-suite-audit-2026-10-23.md:50`). |
| `tests/unit/priority-labels.test.js` | A-06 / TS-01 | Class D: it tested only the dead module. React escapes text by default, so the "does not reflect arbitrary data" guarantee needs no Next port (audit line 50). |
| `apps/frontend/scripts/create-overlay-alias.mjs` | A-11 / FT-04 (part) | Leftover from the old static export: it copied `out/overlay/index.html` to `out/overlay.html`. The panel no longer uses static export (`out/` does not exist) and nothing runs the script. |

Nothing else depended on these files, so nothing else was removed. No `package.json` script, Dockerfile line, Compose file, CI workflow or installer referenced them.

## Proof that there were no importers (before removal)

Commands run from the repository root on 2026-10-27:

```text
git grep -n -I "priority-labels" -- . ':!docs'
-> tests/unit/priority-labels.test.js:2 (the test itself, only)

git grep -n -I "create-overlay-alias" -- . ':!docs'
-> (no output)

git grep -n "frontend/scripts\|apps/web" -- Dockerfile .dockerignore apps/infra .github compose*.yaml apps/frontend/next.config.* apps/frontend/package.json
-> Dockerfile:9 (localization catalogs only) and apps/infra/scripts/start-product.mjs:5 (start-production.mjs only)
```

`Dockerfile:18` (`COPY apps ./apps`) copied both files into the runtime image as plain bytes, but nothing imported or ran them. Removing them only drops those bytes; the Dockerfile is unchanged. The remaining `docs/**` mentions are historical (audits, research, QA gates, handoffs) and were left as they are.

Basename scan over `apps/**`, `package.json`, `Dockerfile`, `compose*.yaml` and `.github/**`, counting non-test files that mention each module's name: `create-overlay-alias.mjs` = 0 and `priority-labels.mjs` = 0. Every other module in `apps/web` and `apps/frontend/scripts` had ≥ 1.

## Test-first (Red → Green)

New contract test: `tests/unit/orphan-module-contract.test.js`.

- **Rule:** every top-level `.mjs`/`.js` module in `apps/web` and `apps/frontend/scripts` must be referenced by name in at least one non-test file (`apps/**` source, HTML, JSON or YAML, root `package.json`, `Dockerfile`, `compose*.yaml`, `.github/workflows`). Code that only a test imports counts as dead. The name match is whole-name only (`dev-server.mjs` does not match `dev-server-state.mjs`), and a second case checks that matcher.
- **Why a general rule, not a hard-coded list:** it fails again if anyone adds new dead code in these two directories during the next waves. It does not replace `shared-panel-boundary.test.js` (S-03 import boundary), which Waves 3 and 4 will change.
- **Known limit:** a stale mention in a comment or string elsewhere in `apps/**` would count as a consumer, so the check can miss dead code. It never makes live code fail.

**Red** (before removal): `npx vitest run tests/unit/orphan-module-contract.test.js` → exit 1, 1 failed / 1 passed. Received `["apps/web/priority-labels.mjs", "apps/frontend/scripts/create-overlay-alias.mjs"]`, expected `[]`.

**Green** (after removal): `npx vitest run tests/unit/orphan-module-contract.test.js tests/unit/shared-panel-boundary.test.js tests/unit/dockerfile-frontend-imports.test.js` → exit 0, 3 files / 10 tests passed. That includes `shared-panel-boundary` "resolves every relative import of apps, the vanilla entrypoints and tests to an existing file", which the plan names as the Wave 0 post-removal check.

## Verification (`@dev`, development only; not the `@qa` verdict)

All commands ran with Node 24.20.0 (`nvm use`).

| Command | Exit | Result |
| --- | --- | --- |
| `npm run lint` | 0 | pass |
| `npm run typecheck` | 0 | pass |
| `npm test` (full suite, once) | 0 | 165 files / 1618 tests passed (151.8 s); last recorded baseline 165 / 1621 (FT-24 changelog entry, not re-run here): −5 removed priority-labels cases, +2 new contract cases |
| `npm run review:static` | 0 | 2 rules on 152 files, 0 findings |
| `npm run validate:localization` | 0 | pass |
| `npm run validate:version` | 0 | `v0.2.0-0000000-beta` valid |
| `npm run validate:port-denylist` | 0 | 1037 files, 0 findings |
| `git diff --check` (+ `--no-index` check of the new untracked test) | 0 | no whitespace errors |
| `docker compose -f compose.yaml -f compose.build.yaml config --quiet` | 0 | valid (render only; nothing created) |

**Docker:** the only Docker resources created were the disposable test resources that `npm test` creates and removes for its PostgreSQL/Compose integration files. Wave 0 created nothing else, and no active container, volume or image was touched. No image build was run: the Dockerfile did not change and named neither file.

**Not run:** `next build`, Docker image build, browser, OBS/CEF and Twitch. Wave 0 changes no runtime path.

## Files changed

- Removed: `apps/web/priority-labels.mjs`, `tests/unit/priority-labels.test.js`, `apps/frontend/scripts/create-overlay-alias.mjs`.
- Created: `tests/unit/orphan-module-contract.test.js`, this file and its pt-BR copy.
- Changed: `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`.
- Not changed (on purpose): `package.json`, `Dockerfile`, Compose files, CI, installers, the story and its File List. Another agent was committing story docs at the same time, so `@po`/`@dev` update the story File List in a later step.

## How to revert

Revert the Wave 0 commit (`git revert <commit>`). That restores the three files and removes the contract test. There is no data, schema, runtime or configuration effect.
