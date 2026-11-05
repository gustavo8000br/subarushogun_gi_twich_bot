# OPS-15 — Test suite audit (relevance, obsolescence and CI cost), 2026-10-23

[Português brasileiro](../../pt-BR/stories/OPS-15/test-suite-audit-2026-10-23.md)

**Author:** `@qa` (Quinn). **Branch:** `feat/ops-15-next-panel` (working tree with uncommitted @dev changes to the Docker test cleanup). **Mode:** read-only. No test, source, config or existing doc was changed or removed.

**Owner question:** are the ~1,579 tests still valid for current work, or are some obsolete and only spending CI time?

**Short answer:** almost all of them are relevant. 135 of 163 files (≈90% of the tests) exercise the current product (class A). One file is obsolete now (class D: its target module has no importer). Six vanilla files go with the cutover (C). Seven vanilla files still hold contracts that need a Next equivalent first (B). Two integration files are redundant or misplaced (E), and twelve are governance/documentation contracts, almost all still current (F). Removing obsolete tests would save **seconds, not minutes**. The real CI time sits in the integration layer (PostgreSQL containers, a full `next build`, the Compose stack) and in Vitest per-file worker startup. That is where acceleration pays off.

## Evidence levels (what was measured and what was not)

| Item | Level | Note |
|---|---|---|
| Inventory (files, `it`/`test` count, imports, target existence, production importers) | **Static, verified** | Read-only scripts over `tests/` and `apps/`; every relative import and every referenced repo path exists (0 missing) |
| Unit test count (142 files, 1,286 tests, all passing) | **Measured** | `vitest run tests/unit --reporter=json`, exit 0 |
| Unit durations (per file and phases) | **Measured, NOT reliable** | Two runs while another suite ran in parallel on the same machine/worktree (load average 9.01 on 4 cores at 23:42). Run 1: 50.1 s wall, 304% CPU. Run 2: 76.4 s (tests 43%, environment 31%, import 18%, transform 6%). Use for **ranking only**. Do **not** use them to decide removals. Isolated measurement pending |
| Integration test count | **Static lower bound + derived** | Regex count ≥254 in 21 files (`it.each` expands at runtime). Derived total ≈284 = 1,565 (gate 2026-10-23) − 1,281 unit tests at gate time. Not run |
| Integration durations | **Pending measurement** | Not run (coordinator instruction: no Docker/integration during this audit). Only recorded numbers: full `npm test` 105 s parallel / 240 s serial (`qa-gate-2026-10-23.md`) |
| CI job durations | **Measured (history)** | `gh run view` for the last 5 PR CI runs and 1 Main CD run (2026-10-14/15, `main`). The current branch has **no CI run** (19 commits ahead of `main`), so these numbers predate the Next panel tests |
| Savings | **Estimates** | Marked "est." below; derived from the contended measurements and the Vitest diagnostic |

The ~1,579 figure from the owner is consistent with 1,286 unit tests (measured) plus ≈284 integration tests (derived) ≈ 1,570. The remainder is probably the @dev's in-progress test changes; not verified.

## What `npm test` and CI run

- `npm test` = `vitest run`, `include: ['tests/**/*.test.{js,jsx}']` (`vitest.config.js`): **142 unit + 21 integration files**. `tests/e2e/*.mjs` (15 browser scripts, separate `test:e2e:*` npm scripts) and `tests/platform/installer-native.mjs` are **not** in `npm test`.
- CI (`.github/workflows/quality-gates.yml`, reused by `ci.yml` for PRs and `main-cd.yml` for `main`): `app-quality` matrix (api, infra, web: lint + typecheck), `lint-tests` (`npm run lint` + `npm run typecheck`), `installer-smoke` (linux/macos/windows, runs `tests/platform/installer-native.mjs`), `tests` (`npm test`, unit + PostgreSQL + Compose, timeout 35 min), `static-analysis` (actionlint, OpenGrep, `validate:version`, `validate:localization`), `container-build` (Compose config + image build), aggregate `quality-gate`.

## Totals by class

Class legend: **A** current product (keep), **B** vanilla with a contract to port first, **C** vanilla already covered by Next (remove with the vanilla), **D** obsolete now, **E** duplicated/redundant or misplaced, **F** governance/docs/framework contract.

| Class | Unit files | Unit tests (measured) | Integration files | Integration tests (static ≥) | Total files | Total tests |
|---|---|---|---|---|---|---|
| A | 119 | 1,174 | 16 | ≥220 | 135 | ≥1,394 |
| B | 6 | 35 | 1 | ≥22 | 7 | ≥57 |
| C | 6 | 18 | 0 | 0 | 6 | 18 |
| D | 1 | 5 | 0 | 0 | 1 | 5 |
| E | 0 | 0 | 2 | ≥4 | 2 | ≥4 |
| F | 10 | 54 | 2 | ≥8 | 12 | ≥62 |
| **Total** | **142** | **1,286** | **21** | **≥254 (≈284 derived)** | **163** | **≥1,540 (≈1,570)** |

Sub-file findings, not reflected in the file class: 3 tests in `fnd7-documentation-contract` (F) behave as D, 1 test in `dockerfile-frontend-imports` (A) is E, and 8 of 10 tests in `web-route` (B) are C.

## Classification evidence

### D — obsolete now

- `tests/unit/priority-labels.test.js` (5 tests) → `apps/web/priority-labels.mjs`. Nothing in `apps/` imports `priorityBenefitLabel` or `priority-labels`; the only consumer is the test (`grep -rn "priorityBenefitLabel\|priority-labels" apps` → only the module itself). `git log -S"priority-labels" -- apps/web/app.js` shows that `app.js` stopped using it in FND-8 (`a906756`). The preliminary audit classed it 2; it is dead code today, independent of the cutover. React escapes text by default, so the "does not reflect arbitrary data" guarantee does not need a new Next test.
- `tests/unit/fnd7-documentation-contract.test.js`, 3 of 6 tests: "reports FND-7 completion and independent QA…" (asserts roadmap text `qa pass 9.2/10`), "records that Chrome link copy…" (asserts validation notes) and "keeps the focused roadmap aligned with the merged FND-6 status". These freeze **historical status text** of closed stories. They protect no current rule and break legitimate doc edits. The other 3 tests (widget/HTTPS guidance, certificate paths, macOS steps) protect current user documentation (F).

### C — vanilla already covered by Next (remove in the cutover change)

| File | Tests | Next coverage (evidence) |
|---|---|---|
| `unit/call-notification-actions.test.js` | 1 | entry-actions resend tests; `queue-call-resend-browser-only` E2E (preliminary audit) |
| `unit/dom-localization.test.js` | 5 | DOM text-node translation exists only in `apps/web/app.js` |
| `unit/panel-error-presentation.test.js` | 4 | Next operations/entry-action error tests (preliminary audit) |
| `unit/vanilla-fulfillment-feedback.test.js` | 2 | `next-queue-entry-actions` fulfillment-pending tests |
| `unit/queue-onboarding-flow.test.js` | 4 | **Upgraded from 1 to C**: ported on 2026-10-21 (`next-queue-onboarding.test.jsx`, `getQueueSettingsFeedback`), per the closure section of `legacy-test-audit.md` |
| `unit/web-route-vanilla-modules.test.js` | 2 | New since the preliminary audit (S-03). Serves the module graph of `app.js`/`overlay.js`; falls with the vanilla |

### B — vanilla, contract still to port (do not remove before the Next equivalent passes)

| File | Tests | Contract still missing in Next |
|---|---|---|
| `unit/panel-confirmation-contract.test.js` | 11 | `next-panel-class1-parity` already covers no native `confirm()` and the hide/archive wording. Still missing: fail closed when the dialog cannot open or is already open, and double confirmation when reward sync is uncertain |
| `unit/reward-dialog-contract.test.js` | 2 | Close/cancel `type="button"` ported; "responsive dialog space and separated actions" not ported (needs a browser) |
| `unit/health-status.test.js` | 7 | **Downgraded from 2 to B**: `next-overview-panel.test.jsx` has no explicit test for "does not invent a ping for an unconfigured channel" or "automatic reconnection shown as retrying" (only a severity test, :122). The preliminary audit said "otherwise class 1" |
| `unit/web-application-setup.test.js` | 2 | **Downgraded from 2 to B**: `next-connection-page.test.jsx` covers callback alerts but not "never show the raw Twitch/backend message on credential validation failure" |
| `unit/locale-picker-state.test.js` | 3 | **Downgraded from 2 to B**: no explicit Next test for the pt-BR fallback when the persisted catalog is incomplete |
| `unit/web-route.test.js` | 10 | 2 cases stay as current API contracts ("API-only mode without browser UI routes", "serves only shared localization ESM"); 8 cases (`/`, `/app.js`, vanilla pages) are C |
| `integration/panel-localization-contract.test.js` | ≥22 | Mixed 1/2 (preliminary audit): focus ring and mobile stacking of command policies need browser validation; repoint the catalog tests |

### E — duplicated, redundant or misplaced

- `integration/queue-repository-chat.test.js` (3 tests): uses mocked Prisma (`vi.fn`, 19 occurrences) inside `tests/integration`. Project rule: PostgreSQL guarantees require real PostgreSQL with real migrations, never Prisma mocks. This is a unit test in the wrong layer. The real-PG proof of the same behavior is in `queue-repository.test.js:1005-1064` (persisted retry time, resend without changing the deadline, late confirmation). Recommendation: move it to `tests/unit` (or delete the cases already proven in PG). Time impact: neutral; the gain is accurate evidence.
- `integration/next-static-export.test.js` (1 test): runs a full `next build apps/frontend` inside `npm test`, and the CI `container-build` job builds the same frontend inside the image (`compose-contract.test.js:164` asserts `RUN npm run build:frontend` in the Dockerfile). The route/manifest assertions are unique; the **build is duplicated** in CI. The name is stale (production is a runtime server, not a static export).
- `unit/dockerfile-frontend-imports.test.js` test "never imports apps/web from the Next frontend after the S-03 relocation" duplicates `shared-panel-boundary.test.js` "forbids Next, shared and API server code from importing apps/web". Neither catches the remaining `process.cwd()`-based path to `apps/web/localization/catalogs` in `apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs:4`, because that path is a string, not an import.
- CI level (not a test file): the `app-quality` api and infra matrix entries are strict subsets of `lint-tests` (`eslint apps tests` and root `tsconfig.json` with `apps/**/*.mjs`). The `web` entry is **not** redundant: it is the only typecheck of `apps/frontend/**/*.jsx` (the root `tsconfig.json` includes only `.js`/`.mjs`).

### F — governance, documentation and framework contracts

All 12 files reference paths that exist and reflect current rules: OpenGrep as the only reviewer (`aiox-static-review`, `opengrep-quality-gate`), release/changelog/installation policy (`documentation-contract`), README links (`readme-structure`), `.gitignore` (`local-ignore-policy`), Prisma pin, quality scripts, Vitest discovery, Codespaces (`.devcontainer/` exists), the image publication workflow and the CI aggregate gate. Exception: the 3 historical-status tests in `fnd7-documentation-contract` (see D). At the cutover, `ci-workflow-contract.test.js:21` (`web` lint target `apps/web apps/shared/panel`) must change together with `package.json` `lint:web`/`typecheck:web`.

### A — current product, with notes

- Every `apps/shared/panel/*` and `apps/shared/browser/*` module is imported by `apps/frontend` (checked one by one), so its tests are A. This includes `call-deadline-presentation.test.js`, a class-1 gap in the preliminary audit that is now used by Next `call-deadline.jsx`.
- Tests of test helpers (`compose-origin-environment`, `obs-websocket-auth`, `png-alpha`, `with-timeout`) protect `tests/e2e/overlay-browser.mjs`; `isolated-*-cleanup`/`isolated-postgres-image` protect the integration infrastructure (being changed by @dev now).
- Entry points without importers are valid (Next app router files, `dev-stop.mjs`, `validate-port-denylist.mjs`, `create-release-notes.mjs`, all invoked by npm scripts, Next or `release.yml`).
- Cutover-coupled A tests: `next-dev-proxy.test.js:32-39` (pins `/`, `/styles.css`, `/app.js`), `compose-runtime.test.js:372` (asserts vanilla `/`), `shared-panel-boundary`, `dockerfile-frontend-imports`.
- Observation outside the test classification: `apps/frontend/scripts/create-overlay-alias.mjs` has no reference in code, scripts or the Dockerfile (architect's "dead static-export leftover"), and it has no test.

## Time

### 15 slowest unit files (run 1, contended, ranking only)

| # | File | ms | Tests | Cause (read from code / per-test timings) |
|---|---|---|---|---|
| 1 | `unit/bootstrap-secret.test.js` | 8,091 | 10 | 3 TLS tests run real OpenSSL key/cert generation (3.6 s + 3.0 s + 1.5 s) |
| 2 | `unit/next-widgets-page.test.jsx` | 7,784 | 23 | jsdom + React Testing Library, 23 interaction flows |
| 3 | `unit/port-denylist-validation.test.js` | 3,643 | 2 | 1 test scans the whole checkout (3.6 s) |
| 4 | `unit/queue-routes.test.js` | 2,928 | 165 | Fastify inject; 165 tests (≈18 ms each) |
| 5 | `unit/next-operations-page.test.jsx` | 2,426 | 16 | jsdom/RTL |
| 6 | `unit/next-queue-clear-ui.test.jsx` | 2,283 | 4 | jsdom/RTL, `waitFor` flows (≈1 s in one test) |
| 7 | `unit/next-connection-page.test.jsx` | 1,850 | 16 | jsdom/RTL |
| 8 | `unit/next-command-permissions-page.test.jsx` | 1,848 | 9 | jsdom/RTL |
| 9 | `unit/next-overview-panel.test.jsx` | 1,707 | 4 | jsdom/RTL |
| 10 | `unit/next-queue-reward-settings-dialog.test.jsx` | 1,528 | 6 | jsdom/RTL |
| 11 | `unit/next-account-settings-page.test.jsx` | 1,500 | 6 | jsdom/RTL |
| 12 | `unit/next-locale-picker.test.jsx` | 1,468 | 4 | jsdom/RTL |
| 13 | `unit/next-queue-lifecycle-actions.test.jsx` | 1,181 | 5 | jsdom/RTL |
| 14 | `unit/next-queue-creation-form.test.js` | 1,102 | 11 | jsdom/RTL |
| 15 | `unit/next-queue-onboarding.test.jsx` | 969 | 8 | jsdom/RTL |

All 15 are class A. The 6 C files together add ≈0.3 s of test time; the 7 B files ≈0.5 s; the D file 9 ms. Vitest's own diagnostic (run 2): "142 workers spawned · ~827 ms startup each … at least ~38.29 s faster with `isolate: false`". Per-file startup (spawn + environment) costs more than all vanilla tests combined.

### Integration (pending measurement)

Not run. Recorded: full suite 105 s parallel and 240 s serial (`qa-gate-2026-10-23.md`, 162 files, 1,565 tests, warm image), and a cold `postgres:18.6-bookworm` pull broke the 30 s `docker run` timeout in run 1. Read from code: 7 files start their own PostgreSQL container and run `prisma migrate deploy` (`postgres-foundation`, `queue-repository`, `command-policy-persistence`, `command-policy-v3-migration`, `overlay-widget-repository`, `tombstone-index-plan`, `qra-postgres-fixtures`); `compose-runtime` brings up the full Compose stack; `next-static-export` runs `next build`. **Measure per file after the @dev finishes the Docker cleanup work**, with `--reporter=json` and nothing else running.

### CI (history, `main`, 2026-10-14/15)

| Job | Duration (6 runs) |
|---|---|
| Vitest unit, PostgreSQL, and Compose integration (`npm test`) | 72–83 s (critical path) |
| Native windows installer smoke | 59–73 s |
| Compose configuration and production image build | 50–59 s |
| Workflow lint, OpenGrep, version/localization | 25–33 s |
| Native macos installer smoke | 18–31 s |
| api / infra / web lint and typecheck (each) | 17–25 s |
| Lint tests and shared project files | 18–24 s |
| Native linux installer smoke | 17–22 s |
| Required quality gate | 2–4 s |
| Main CD: publish multi-platform image | 175 s |
| Main CD: beta Windows installer | 60 s |

Step-level timings are not available through `gh run view --json` (null timestamps), so the `npm ci` vs `npm test` split is unknown. These runs predate the Next panel tests (`main` has 106 test files, the branch has 163). On this branch, expect the `tests` job to stay on the critical path and grow (est. 2–3 min on a 4-vCPU runner, by analogy with the local 105 s). The first CI run of the branch will measure it.

## Recommendations (prioritized)

Nothing is deleted without a story + GitHub issue (@devops) + owner decision. Class B leaves only after the Next equivalent passes. Savings are estimates, and the unit numbers come from contended runs.

1. **Accelerate (biggest gain, class A).**
   a. Integration PostgreSQL: one container per run (Vitest `globalSetup`) with a fresh database per file (e.g. `CREATE DATABASE … TEMPLATE` after one `migrate deploy`) instead of 7 containers × migrate. Est. 20–60 s of the 105 s; pending measurement. Coordinate with the @dev's ongoing cleanup work and @data-engineer.
   b. `next-static-export`: avoid a second `next build` in CI (reuse the `container-build` artifact, or move the manifest assertions into that job). Est. one full build (30–90 s CPU); pending measurement.
   c. Vitest worker startup: evaluate `isolate: false` (or a separate project) **only for node-environment files without module-level state**. Vitest estimates ≤38 s; real gain unknown until measured in isolation. Needs proof that no test leaks state.
   d. `bootstrap-secret`: generate the TLS CA/cert once per file (`beforeAll`) and assert idempotence on it. Est. −4 to −5 s of file time.
   e. `port-denylist-validation`: run the real scan as a CI step (`npm run validate:port-denylist` in `static-analysis`, which is not there today) and keep the fake-scanner test in the unit suite. Est. −3.6 s of unit time; keeps the guarantee.
2. **Remove now (D), with a story/issue:** `priority-labels.test.js` together with the dead `apps/web/priority-labels.mjs` (≈1 s with worker startup, est.); rewrite or remove the 3 historical-status tests of `fnd7-documentation-contract` (time ≈0; less doc brittleness).
3. **Fuse/move (E):** move `queue-repository-chat` to `tests/unit` (rule compliance); merge the duplicated "no apps/web import" test into `shared-panel-boundary` and add a check for `process.cwd()`/string paths to `apps/web`; in CI, drop the api/infra `app-quality` entries (≈2 runner jobs × 20 s plus `npm ci` each; no wall-clock change, they run in parallel); keep `web`, renamed to frontend at the cutover.
4. **Port before removing (B):** "no invented ping" and "reconnection = retrying" (overview), "no raw Twitch message" (connection page), pt-BR fallback for an incomplete catalog (locale picker), fail-closed dialog and double confirmation (confirmation), responsive reward dialog and focus ring/mobile layout (browser validation). Keep the 2 API-only/shared-ESM cases of `web-route`.
5. **Remove in the cutover (C):** the 6 C files plus the 8 vanilla cases of `web-route`, in the same change that removes `apps/web` and updates `next-dev-proxy:32-39`, `compose-runtime:372`, `ci-workflow-contract:21`, `lint:web`/`typecheck:web` and the E2E scripts that read `apps/web/localization/catalogs` or open `/overlay.html`. Est. ≈0.3 s of test time + ≈5 s of worker startup CPU (≈1.5 s wall on 4 workers).

## Pending

- Isolated unit timing (nothing else running), the same command with `--reporter=json`.
- Per-file integration timing after the @dev's Docker cleanup work.
- Exact integration test count (run, not static).
- First CI run of this branch (job durations with the Next tests).
- The vanilla classification (B/C) stays **preliminary** until the complete migration; it must be repeated with the final QA and architecture reviews, as `legacy-test-audit.md` requires.
- Out of scope: `tests/e2e/*` (15 manual browser scripts) and `tests/platform/installer-native.mjs` (CI installer smoke) were not classified per test.

## Appendix — per-file inventory

Times are from run 1 (contended, ranking only). Integration counts are static lower bounds. "Target" lists up to 2 production modules imported (paths relative to `apps/`); "—" means the test reads files, runs scripts or tests helpers.

| File | Area | Tests | ms | Target | Class | Note |
|---|---|---|---|---|---|---|
| `unit/aiox-static-review.test.js` | Test helpers / governance | 4 | 286 | — | **F** | Current rule: OpenGrep is the only reviewer; blocks the old provider name |
| `unit/api-runtime-config.test.js` | API runtime | 2 | 9 | `api/src/runtime-config.mjs` | **A** |  |
| `unit/bootstrap-secret.test.js` | Infra / installer / release | 10 | 8091 | — | **A** | Slowest unit file: 3 TLS tests run real OpenSSL (~8 s); writes to OS tmpdir |
| `unit/call-deadline-presentation.test.js` | Shared panel (used by Next) | 4 | 7 | `shared/panel/call-deadline-presentation.mjs` | **A** | Was class 1 gap; module is now shared and used by Next `call-deadline.jsx` |
| `unit/call-notification-actions.test.js` | Vanilla panel | 1 | 14 | `web/call-notification-actions.mjs` | **C** | Covered by Next entry-action resend tests + E2E |
| `unit/call-timeout-loop.test.js` | Outbox workers | 1 | 14 | `api/src/outbox/timeout-loop.mjs` | **A** |  |
| `unit/chat-command-handler.test.js` | Chat commands | 32 | 169 | `api/src/commands/chat-handler.mjs`, `api/src/domain/clear-confirmation.mjs` +1 | **A** |  |
| `unit/chat-outbox-worker.test.js` | Outbox workers | 4 | 17 | `api/src/outbox/chat-worker.mjs` | **A** |  |
| `unit/ci-workflow-contract.test.js` | Test helpers / governance | 10 | 97 | — | **F** | Current; `web` lint target (`apps/web apps/shared/panel`, :21) must change at cutover |
| `unit/clear-confirmation.test.js` | Domain | 2 | 13 | `api/src/domain/clear-confirmation.mjs` | **A** |  |
| `unit/command-authorization.test.js` | Chat commands | 10 | 30 | `api/src/commands/authorization.mjs` | **A** |  |
| `unit/command-catalog-view.test.js` | Shared panel (used by Next) | 7 | 18 | `shared/panel/command-catalog-view.mjs` | **A** |  |
| `unit/command-catalog.test.js` | Chat commands | 5 | 14 | `api/src/commands/catalog.mjs` | **A** |  |
| `unit/command-help.test.js` | Chat commands | 6 | 16 | `api/src/commands/help.mjs` | **A** |  |
| `unit/command-parser.test.js` | Chat commands | 39 | 32 | `api/src/commands/parser.mjs` | **A** |  |
| `unit/compose-origin-environment.test.js` | Infra / installer / release | 2 | 7 | — | **A** | Helper of `tests/e2e/overlay-browser.mjs` |
| `unit/database-url.test.js` | Infra / installer / release | 3 | 33 | `infra/src/database-url.mjs` | **A** |  |
| `unit/dev-overlay-alias.test.js` | HTTP API | 3 | 188 | `api/src/http/dev-overlay-alias.mjs` | **A** |  |
| `unit/dev-preflight.test.js` | Dev tooling | 9 | 33 | `frontend/scripts/dev-preflight.mjs` | **A** |  |
| `unit/dev-stop.test.js` | Dev tooling | 17 | 75 | `frontend/scripts/dev-database.mjs`, `frontend/scripts/dev-server-state.mjs` +1 | **A** |  |
| `unit/dockerfile-frontend-imports.test.js` | Architecture boundary | 4 | 76 | — | **A** | Test "never imports apps/web from Next" duplicates `shared-panel-boundary` (E, 1 test) |
| `unit/documentation-contract.test.js` | Test helpers / governance | 18 | 118 | — | **F** | Current release/changelog/install policy |
| `unit/dom-localization.test.js` | Vanilla panel | 5 | 14 | `web/dom-localization.mjs` | **C** | DOM translation is vanilla-only |
| `unit/entry-transitions.test.js` | Domain | 22 | 27 | `api/src/domain/entry-transitions.mjs` | **A** |  |
| `unit/error-diagnostics.test.js` | Observability | 3 | 11 | `api/src/observability/error-diagnostics.mjs` | **A** |  |
| `unit/eventsub-runtime.test.js` | Twitch integration | 8 | 31 | `api/src/twitch/eventsub-runtime.mjs`, `api/src/commands/authorization.mjs` +1 | **A** |  |
| `unit/financial-outbox-worker.test.js` | Outbox workers | 9 | 37 | `api/src/outbox/financial-worker.mjs` | **A** |  |
| `unit/fnd7-documentation-contract.test.js` | Test helpers / governance | 6 | 13 | — | **F** | 3 of 6 tests freeze historical FND-7/FND-6 status text (roadmap "qa pass 9.2/10", validation notes): D candidates |
| `unit/health-route.test.js` | HTTP API | 11 | 365 | — | **A** |  |
| `unit/health-status.test.js` | Vanilla panel | 7 | 18 | `web/health-status.mjs` | **B** | Was class 2 with caveat. `next-overview-panel` has no explicit "does not invent a ping" nor "reconnection = retrying" test |
| `unit/hierarchical-command-policy.test.js` | Chat commands | 2 | 9 | `api/src/commands/catalog.mjs` | **A** |  |
| `unit/installer-locale-default.test.js` | PostgreSQL / persistence | 2 | 20 | `api/src/persistence/queue-repository.mjs` | **A** |  |
| `unit/isolated-compose-cleanup.test.js` | Infra / installer / release | 3 | 11 | — | **A** | Helper of `compose-runtime` |
| `unit/isolated-postgres-cleanup.test.js` | PostgreSQL / persistence | 11 | 31 | — | **A** | Helper of PG integration; being changed by @dev now |
| `unit/isolated-postgres-image.test.js` | PostgreSQL / persistence | 5 | 11 | — | **A** | New, uncommitted (@dev, Docker cleanup) |
| `unit/local-ignore-policy.test.js` | Test helpers / governance | 4 | 12 | — | **F** | Current .gitignore policy |
| `unit/local-session.test.js` | HTTP API | 6 | 220 | `api/src/http/local-session.mjs` | **A** |  |
| `unit/locale-picker-state.test.js` | Vanilla panel | 3 | 6 | `web/locale-picker-state.mjs` | **B** | Was class 2 with caveat. pt-BR fallback for an incomplete catalog not explicit in Next |
| `unit/localization-byte-catalog.test.js` | Localization | 3 | 9 | `shared/localization/parse-catalog-bytes.mjs` | **A** |  |
| `unit/localization-catalog.test.js` | Localization | 9 | 16 | `shared/localization/tsv-catalog.mjs` | **A** |  |
| `unit/localization-decoding.test.js` | Localization | 4 | 11 | `shared/localization/decode-catalog-bytes.mjs` | **A** |  |
| `unit/localization-parity.test.js` | Localization | 11 | 25 | `shared/localization/validate-catalog-set.mjs` | **A** |  |
| `unit/localization-translation.test.js` | Localization | 10 | 57 | `shared/localization/translate-catalog.mjs` | **A** |  |
| `unit/next-account-settings-page.test.jsx` | Next panel | 6 | 1500 | `frontend/features/settings/account-settings-page-content.jsx` | **A** |  |
| `unit/next-api-client.test.js` | Next panel | 8 | 129 | `frontend/lib/api/client.mjs`, `frontend/features/queues/queue-entry-actions.mjs` | **A** |  |
| `unit/next-call-deadline.test.jsx` | Next panel | 9 | 179 | `frontend/features/queues/call-deadline.jsx` | **A** |  |
| `unit/next-command-permissions-page.test.jsx` | Next panel | 9 | 1848 | `frontend/features/commands/command-permissions-page-content.jsx` | **A** |  |
| `unit/next-commands-route.test.js` | Next panel | 1 | 6 | — | **A** |  |
| `unit/next-connection-page.test.jsx` | Next panel | 16 | 1850 | `frontend/features/connection/connection-page-content.jsx` | **A** |  |
| `unit/next-dev-env.test.js` | Dev tooling | 5 | 48 | `frontend/scripts/dev-env.mjs`, `frontend/scripts/dev-database.mjs` | **A** |  |
| `unit/next-dev-proxy.test.js` | Dev tooling | 6 | 16 | `frontend/scripts/dev-proxy-config.mjs`, `frontend/scripts/next-runtime-config.mjs` | **A** | Lines 32-39 pin vanilla `/`, `/styles.css`, `/app.js`; update at cutover |
| `unit/next-dev-runtime-config.test.js` | Dev tooling | 7 | 10 | `frontend/scripts/dev-runtime-config.mjs` | **A** |  |
| `unit/next-frontend-config.test.js` | Next panel | 2 | 10 | — | **A** |  |
| `unit/next-locale-persistence.test.js` | Next panel | 5 | 22 | `frontend/lib/i18n/persist-product-locale.mjs` | **A** |  |
| `unit/next-locale-picker.test.jsx` | Next panel | 4 | 1468 | `frontend/features/panel-shell/panel-shell.jsx` | **A** |  |
| `unit/next-operations-page.test.jsx` | Next panel | 16 | 2426 | `frontend/features/operations/operations-page-content.jsx` | **A** |  |
| `unit/next-operations.test.js` | Next panel | 8 | 21 | `frontend/features/operations/operations.mjs` | **A** |  |
| `unit/next-overlay-root.test.js` | Next panel | 3 | 90 | `frontend/app/(overlay)/overlay/overlay-root.jsx`, `frontend/app/(overlay)/overlay/page.jsx` | **A** |  |
| `unit/next-overview-panel.test.jsx` | Next panel | 4 | 1707 | `frontend/features/panel-shell/panel-shell.jsx`, `frontend/lib/api/client.mjs` | **A** |  |
| `unit/next-overview-projection.test.js` | Next panel | 6 | 14 | `frontend/features/overview/queue-summary.mjs` | **A** |  |
| `unit/next-panel-catalogs.test.js` | Next panel | 5 | 52 | `shared/localization/tsv-catalog.mjs`, `frontend/lib/i18n/panel-catalogs.mjs` | **A** |  |
| `unit/next-panel-class1-parity.test.js` | Next panel | 4 | 24 | — | **A** |  |
| `unit/next-panel-shell.test.js` | Next panel | 3 | 60 | `frontend/features/panel-shell/panel-shell.jsx`, `frontend/features/overview/queue-summary-cards.jsx` | **A** |  |
| `unit/next-panel-snapshot.test.js` | Next panel | 5 | 29 | `frontend/features/panel-shell/load-panel-snapshot.mjs`, `frontend/features/overview/queue-summary.mjs` | **A** |  |
| `unit/next-queue-clear-ui.test.jsx` | Next panel | 4 | 2283 | `frontend/features/queues/queue-list.jsx` | **A** |  |
| `unit/next-queue-clear.test.js` | Next panel | 4 | 16 | `frontend/features/queues/queue-clear.mjs` | **A** |  |
| `unit/next-queue-creation-form.test.js` | Next panel | 11 | 1102 | `frontend/features/queues/new-queue-form.jsx` | **A** |  |
| `unit/next-queue-creation.test.js` | Next panel | 20 | 35 | `frontend/features/queues/queue-creation.mjs` | **A** |  |
| `unit/next-queue-entry-actions-feedback.test.jsx` | Next panel | 2 | 251 | `frontend/features/queues/queue-list.jsx` | **A** |  |
| `unit/next-queue-entry-actions.test.js` | Next panel | 64 | 68 | `frontend/features/queues/queue-entry-actions.mjs` | **A** |  |
| `unit/next-queue-history.test.js` | Next panel | 5 | 20 | `frontend/features/queues/queue-history.mjs` | **A** |  |
| `unit/next-queue-lifecycle-actions.test.jsx` | Next panel | 5 | 1181 | `frontend/features/queues/queue-lifecycle-actions.jsx` | **A** |  |
| `unit/next-queue-lifecycle-recovery.test.jsx` | Next panel | 1 | 468 | `frontend/lib/api/client.mjs`, `frontend/features/panel-shell/panel-provider.jsx` | **A** |  |
| `unit/next-queue-lifecycle.test.js` | Next panel | 14 | 30 | `frontend/features/queues/queue-lifecycle.mjs` | **A** |  |
| `unit/next-queue-list.test.js` | Next panel | 25 | 463 | `frontend/features/queues/queue-list.jsx` | **A** |  |
| `unit/next-queue-onboarding.test.jsx` | Next panel | 8 | 969 | `frontend/features/queues/queue-settings-form.jsx`, `frontend/features/queues/queue-list.jsx` | **A** |  |
| `unit/next-queue-reward-recovery.test.jsx` | Next panel | 1 | 658 | `frontend/lib/api/client.mjs`, `frontend/features/panel-shell/panel-provider.jsx` | **A** |  |
| `unit/next-queue-reward-resolution.test.js` | Next panel | 4 | 18 | `frontend/features/queues/queue-reward-resolution.mjs` | **A** |  |
| `unit/next-queue-reward-settings-dialog.test.jsx` | Next panel | 6 | 1528 | `frontend/features/queues/queue-reward-settings-dialog.jsx`, `frontend/features/queues/queue-reward-resolution-dialog.jsx` | **A** |  |
| `unit/next-queue-reward-settings.test.js` | Next panel | 19 | 30 | `frontend/features/queues/queue-reward-settings.mjs` | **A** |  |
| `unit/next-queue-settings-form.test.jsx` | Next panel | 2 | 959 | `frontend/features/queues/queue-settings-form.jsx`, `shared/browser/translate-catalog.mjs` +1 | **A** |  |
| `unit/next-queue-settings-recovery.test.jsx` | Next panel | 1 | 968 | `frontend/lib/api/client.mjs`, `frontend/features/panel-shell/panel-provider.jsx` +1 | **A** |  |
| `unit/next-queue-settings.test.js` | Next panel | 22 | 28 | `frontend/features/queues/queue-settings.mjs` | **A** |  |
| `unit/next-root-layout-hydration.test.js` | Next panel | 2 | 5 | `frontend/app/(panel)/layout.jsx`, `frontend/app/(overlay)/layout.jsx` | **A** |  |
| `unit/next-runtime-config.test.js` | Dev tooling | 5 | 15 | `frontend/scripts/next-runtime-config.mjs` | **A** |  |
| `unit/next-settings-route.test.js` | Next panel | 1 | 3 | — | **A** |  |
| `unit/next-widgets-page.test.jsx` | Next panel | 23 | 7784 | `frontend/features/widgets/widgets-page-content.jsx`, `frontend/lib/i18n/panel-catalogs.mjs` | **A** |  |
| `unit/obs-websocket-auth.test.js` | Test helpers / governance | 1 | 4 | — | **A** | Helper of `tests/e2e/overlay-browser.mjs` |
| `unit/opengrep-quality-gate.test.js` | Test helpers / governance | 1 | 10 | — | **F** | Current (OpenGrep owner decision) |
| `unit/outbox-loop.test.js` | Outbox workers | 2 | 71 | `api/src/outbox/loop.mjs` | **A** |  |
| `unit/overlay-projection-service.test.js` | Domain | 4 | 25 | `api/src/domain/overlay-projection-service.mjs` | **A** |  |
| `unit/overlay-renderer.test.js` | Shared panel (used by Next) | 13 | 40 | `shared/panel/overlay-renderer.mjs` | **A** |  |
| `unit/overlay-routes.test.js` | HTTP API | 5 | 297 | `api/src/http/local-session.mjs`, `api/src/http/overlay-routes.mjs` | **A** |  |
| `unit/overlay-widget-form.test.js` | Shared panel (used by Next) | 4 | 16 | `shared/panel/overlay-widget-form.mjs` | **A** |  |
| `unit/overlay-widget-policy.test.js` | Domain | 5 | 17 | `api/src/domain/overlay-widget-policy.mjs` | **A** |  |
| `unit/overlay-widget-service.test.js` | Domain | 4 | 18 | `api/src/domain/overlay-widget-service.mjs` | **A** |  |
| `unit/panel-catalog-placeholders.test.js` | Shared panel (used by Next) | 6 | 39 | `shared/panel/panel-catalog.mjs`, `shared/browser/translate-catalog.mjs` | **A** |  |
| `unit/panel-confirmation-contract.test.js` | Vanilla panel | 11 | 49 | `web/panel-confirmation.mjs` | **B** | Partly ported (`next-panel-class1-parity`: no `confirm()`, wording). Still to port: fail closed when the dialog cannot open, double confirmation on uncertain sync |
| `unit/panel-error-presentation.test.js` | Vanilla panel | 4 | 11 | `web/panel-error-presentation.mjs` | **C** | Covered by Next operations/entry-action error tests |
| `unit/panel-navigation.test.js` | Shared panel (used by Next) | 6 | 19 | `shared/panel/panel-navigation.mjs` | **A** |  |
| `unit/pending-queue-reward-compatibility.test.js` | Twitch integration | 4 | 29 | `api/src/twitch/pending-queue-reward-compatibility.mjs` | **A** |  |
| `unit/png-alpha.test.js` | Test helpers / governance | 2 | 11 | — | **A** | Helper of `tests/e2e/overlay-browser.mjs` |
| `unit/port-denylist-validation.test.js` | Infra / installer / release | 2 | 3643 | `infra/scripts/validate-port-denylist.mjs` | **A** | Scans the whole checkout (~3.6 s); the only CI enforcement of the port denylist (CI does not run `validate:port-denylist`) |
| `unit/priority-labels.test.js` | Vanilla panel | 5 | 9 | `web/priority-labels.mjs` | **D** | `apps/web/priority-labels.mjs` has no importer anywhere (dropped from `app.js` in FND-8, a906756) |
| `unit/prisma-dependency-security.test.js` | Test helpers / governance | 2 | 8 | — | **F** | Current dependency pin |
| `unit/quality-script-contract.test.js` | Test helpers / governance | 1 | 5 | — | **F** | Current scripts |
| `unit/queue-action-state.test.js` | Shared panel (used by Next) | 13 | 25 | `shared/panel/queue-action-state.mjs` | **A** |  |
| `unit/queue-confirmation-copy.test.js` | Shared panel (used by Next) | 3 | 5 | `shared/panel/queue-confirmation-copy.mjs` | **A** |  |
| `unit/queue-domain-service.test.js` | Domain | 7 | 32 | `api/src/domain/queue-service.mjs` | **A** |  |
| `unit/queue-keys.test.js` | Domain | 28 | 21 | `api/src/domain/queue-keys.mjs` | **A** |  |
| `unit/queue-onboarding-flow.test.js` | Vanilla panel | 4 | 9 | `web/queue-onboarding-flow.mjs` | **C** | Was class 1; ported 2026-10-21 (`next-queue-onboarding`, `getQueueSettingsFeedback`) |
| `unit/queue-routes.test.js` | HTTP API | 165 | 2928 | `api/src/http/local-session.mjs`, `api/src/http/queue-routes.mjs` +4 | **A** |  |
| `unit/queue-settings-version.test.js` | Shared panel (used by Next) | 2 | 6 | `shared/panel/queue-settings-version.mjs` | **A** |  |
| `unit/queue-sync-status.test.js` | Shared panel (used by Next) | 2 | 5 | `shared/panel/queue-sync-status.mjs` | **A** |  |
| `unit/queue-transition-boundary.test.js` | PostgreSQL / persistence | 1 | 16 | `api/src/persistence/queue-repository.mjs` | **A** |  |
| `unit/readme-structure.test.js` | Test helpers / governance | 7 | 34 | — | **F** | Current (broken-link check) |
| `unit/release-notes.test.js` | Infra / installer / release | 4 | 15 | `infra/scripts/create-release-notes.mjs` | **A** |  |
| `unit/reward-dialog-contract.test.js` | Vanilla panel | 2 | 7 | — | **B** | Close button ported; "responsive dialog space" not ported |
| `unit/reward-link-dialog.test.js` | Shared panel (used by Next) | 4 | 29 | `shared/panel/reward-link-dialog.mjs` | **A** |  |
| `unit/reward-outbox-worker.test.js` | Outbox workers | 29 | 101 | `api/src/outbox/reward-worker.mjs` | **A** |  |
| `unit/runtime-composition.test.js` | HTTP API | 5 | 314 | `api/src/runtime.mjs`, `api/src/health-route.mjs` | **A** |  |
| `unit/safe-http-error-handler.test.js` | HTTP API | 1 | 220 | `api/src/http/safe-http-error-handler.mjs` | **A** |  |
| `unit/setup-messages.test.js` | Shared panel (used by Next) | 44 | 44 | `shared/panel/setup-messages.mjs` | **A** |  |
| `unit/shared-panel-boundary.test.js` | Architecture boundary | 4 | 135 | — | **A** | Architecture boundary; vanilla parts change at cutover |
| `unit/structured-logger.test.js` | Observability | 5 | 19 | `api/src/observability/structured-logger.mjs` | **A** |  |
| `unit/test-discovery-contract.test.js` | Test helpers / governance | 1 | 5 | — | **F** | Current Vitest include |
| `unit/twitch-adapter.test.js` | Twitch integration | 23 | 46 | `api/src/twitch/helix-adapter.mjs` | **A** |  |
| `unit/twitch-auth-runtime.test.js` | Twitch integration | 11 | 97 | `api/src/twitch/auth-runtime.mjs` | **A** |  |
| `unit/twitch-event-processor.test.js` | Twitch integration | 4 | 27 | `api/src/twitch/redemption-processor.mjs` | **A** |  |
| `unit/twitch-integration.test.js` | Twitch integration | 23 | 203 | `api/src/twitch/integration.mjs`, `api/src/twitch/credential-fingerprint.mjs` | **A** |  |
| `unit/twitch-oauth.test.js` | Twitch integration | 8 | 21 | `api/src/twitch/oauth.mjs` | **A** |  |
| `unit/twitch-reconciliation.test.js` | Twitch integration | 26 | 145 | `api/src/twitch/reconciliation.mjs` | **A** |  |
| `unit/twitch-route-integration-proxy.test.js` | Twitch integration | 1 | 11 | `api/src/twitch/route-integration-proxy.mjs` | **A** |  |
| `unit/uid.test.js` | Domain | 11 | 13 | `api/src/domain/uid.mjs` | **A** |  |
| `unit/vanilla-fulfillment-feedback.test.js` | Vanilla panel | 2 | 6 | — | **C** | Covered by `next-queue-entry-actions` |
| `unit/version-policy.test.js` | Infra / installer / release | 11 | 12 | — | **A** |  |
| `unit/web-application-setup.test.js` | Vanilla panel | 2 | 15 | `web/application-setup.mjs`, `web/panel-error-presentation.mjs` | **B** | Was class 2 with caveat. No Next test that a raw Twitch/backend message is never shown on credential validation |
| `unit/web-route-vanilla-modules.test.js` | Vanilla panel (Fastify serving) | 2 | 236 | `api/src/web-route.mjs` | **C** | Serves the vanilla module graph (S-03); not in the preliminary audit |
| `unit/web-route.test.js` | Vanilla panel (Fastify serving) | 10 | 405 | `api/src/web-route.mjs` | **B** | Mixed: 2 API-only/shared-ESM cases stay (port/keep); 8 cases for `/`, `/app.js`, vanilla pages fall with the vanilla |
| `unit/windows-installer-first-run.test.js` | Infra / installer / release | 11 | 25 | — | **A** |  |
| `unit/windows-native-contract.test.js` | Dev tooling | 8 | 30 | `frontend/scripts/dev-database.mjs`, `frontend/scripts/dev-preflight.mjs` | **A** |  |
| `unit/with-timeout.test.js` | Test helpers / governance | 2 | 16 | — | **A** | Helper of `tests/e2e/overlay-browser.mjs` |
| `integration/codespaces-contract.test.js` | Test helpers / governance | ≥3 | pending | — | **F** | `.devcontainer/` exists; current. No Docker |
| `integration/command-policy-persistence.test.js` | PostgreSQL / persistence | ≥4 | pending | `api/src/persistence/queue-repository.mjs` | **A** |  |
| `integration/command-policy-v3-migration.test.js` | PostgreSQL / persistence | ≥2 | pending | `api/src/persistence/queue-repository.mjs` | **A** |  |
| `integration/compose-contract.test.js` | Infra / installer / release | ≥12 | pending | — | **A** |  |
| `integration/compose-runtime.test.js` | Infra / installer / release | ≥6 | pending | — | **A** | Case at :372 asserts vanilla `/` (temporary); invert at cutover. Full Compose stack |
| `integration/container-publish-contract.test.js` | Infra / installer / release | ≥5 | pending | — | **F** | Current `main-cd.yml` contract. No Docker |
| `integration/localization-catalog-bundle.test.js` | Localization | ≥4 | pending | `shared/localization/discover-catalog-bundle.mjs` | **A** |  |
| `integration/localization-catalog-discovery.test.js` | Localization | ≥5 | pending | `shared/localization/discover-catalog-module.mjs` | **A** |  |
| `integration/localization-catalog-route.test.js` | Localization | ≥6 | pending | `api/src/http/local-session.mjs`, `api/src/http/localization-routes.mjs` | **A** |  |
| `integration/localization-validator-cli.test.js` | Localization | ≥2 | pending | — | **A** |  |
| `integration/next-static-export.test.js` | Next panel | ≥1 | pending | — | **E** | Runs a full `next build`; the CI `container-build` job builds the same frontend inside the image. Assertions unique; build cost duplicated. Name is stale (no static export) |
| `integration/overlay-widget-repository.test.js` | PostgreSQL / persistence | ≥13 | pending | `api/src/persistence/overlay-widget-repository.mjs`, `api/src/persistence/queue-repository.mjs` | **A** |  |
| `integration/panel-localization-contract.test.js` | Localization | ≥22 | pending | `shared/localization/discover-catalog-module.mjs` | **B** | Mixed 1/2 (preliminary audit). Focus ring and mobile stacking still need browser validation |
| `integration/postgres-foundation.test.js` | PostgreSQL / persistence | ≥3 | pending | — | **A** |  |
| `integration/product-locale-projection.test.js` | Infra / installer / release | ≥3 | pending | `infra/src/product-locale-projection.mjs` | **A** |  |
| `integration/qra-postgres-fixtures.test.js` | PostgreSQL / persistence | ≥6 | pending | `api/src/domain/queue-service.mjs`, `api/src/domain/clear-confirmation.mjs` +3 | **A** |  |
| `integration/queue-repository-chat.test.js` | PostgreSQL / persistence | ≥3 | pending | `api/src/persistence/queue-repository.mjs`, `api/src/domain/queue-service.mjs` | **E** | Mocked Prisma (`vi.fn`) in the integration folder; it is a unit test. Real-PG proof is in `queue-repository.test.js` (:1005-1064) |
| `integration/queue-repository.test.js` | PostgreSQL / persistence | ≥144 | pending | `api/src/domain/queue-service.mjs`, `api/src/domain/queue-keys.mjs` +5 | **A** |  |
| `integration/tombstone-index-plan.test.js` | PostgreSQL / persistence | ≥1 | pending | — | **A** |  |
| `integration/unified-installer.test.js` | Infra / installer / release | ≥4 | pending | — | **A** |  |
| `integration/version-cli.test.js` | Infra / installer / release | ≥5 | pending | — | **A** |  |
