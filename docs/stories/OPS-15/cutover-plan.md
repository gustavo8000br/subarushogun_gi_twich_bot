# OPS-15 — Part-by-part cutover plan (vanilla panel retirement)

[Português brasileiro](../../pt-BR/stories/OPS-15/cutover-plan.md)

- **Author:** `@architect` (Aria), 2026-10-27. Read-only code analysis. No code, test, config, story or inventory changed; no server, Docker, test, GitHub or Twitch operation.
- **Trigger:** owner decision of 2026-10-27 (`docs/session-handoff.md:9`): the legacy vanilla panel (`apps/web`) is abandoned. The owner **expressly authorized** the early cutover of what is already validated and, as the rest gets validated, the cutover of the rest: part by part, an `@qa` verdict per part, `@dev` test-first, `@devops` commits. Push, PR, tag and release still need a separate OK.
- **Recovery:** branch `legacy` exists and is protected (`a9279b2`, 42 files under `apps/web`, ruleset `legacy-no-delete-no-force-push`; `git rev-parse legacy origin/legacy` = `a9279b2c…`, checked 2026-10-27). It is a historical reference, **not** a fallback. Rollback of every wave = `git revert` of that wave's commit.
- **Labels:** VERIFIED = read in code/docs; PARTIAL = code read, runtime not reproduced; UNVERIFIED = inference to prove by test. Evidence classes: **U** unit, **I** isolated PostgreSQL with real migrations, **B** browser-only Chromium with intercepted API, **C** production-like Compose stack (real Next + Fastify + PostgreSQL), **L** live Twitch, **N** native OBS/CEF.
- **Research:** none needed. Every decision here is about this repository's own routing and file layout; no LACUNA in `docs/research-index.md` applies.

## 0. Key finding: the runtime cutover has mostly happened already

Before planning waves, the current production topology must be stated precisely, because it changes what "cutting" means.

| Fact | Evidence | Label |
|---|---|---|
| In production, Next owns every panel route except `/`: `/queues/`, `/new-queue/`, `/operations/`, `/commands/`, `/widgets/`, `/settings/` and `/connection` return Next HTML (`panel-shell`, `x-powered-by: Next.js`). | `tests/integration/compose-runtime.test.js:393-418`; story Change Log `docs/stories/OPS-15/story.md:813-814` | VERIFIED (C, 2026-10-20) |
| Only `/`, `/styles.css` and `/app.js` are still rewritten to Fastify (`beforeFiles`). | `apps/frontend/scripts/dev-proxy-config.mjs:46-47`; pinned by `tests/unit/next-dev-proxy.test.js:32-43,50` | VERIFIED |
| The vanilla `/` in production is a **non-functional shell**: `index.html` loads `/app.js`, which imports `./application-setup.mjs`, `../shared/panel/*.mjs` and `../shared/browser/*.mjs` (`apps/web/app.js:1-21`); none of those paths is rewritten, so they reach Next and 404. | `structural-review.md` S-02 (`docs/stories/OPS-15/structural-review.md:41-45`); `dev-proxy-config.mjs:40-51` | VERIFIED in config; runtime PARTIAL (the Compose test only asserts the HTML, `compose-runtime.test.js:387-391`) |
| In development the vanilla is not served at all: the launcher sets `API_ONLY: 'true'` and `registerWebRoutes` returns early. | `apps/frontend/scripts/dev-runtime-config.mjs:20`; `apps/api/src/web-route.mjs:14`; story `:895` | VERIFIED |
| Fastify listens only on container loopback; Compose publishes only the Next port, and the installers package that same `compose.yaml`. The Fastify static root (vanilla panel and vanilla overlay) is unreachable from the host. | `compose.yaml:54-57,67-68`; `apps/infra/scripts/package-installer.mjs:41` | VERIFIED |
| OBS URLs `…/overlay.html?ref=…#token` are served by Next (`afterFiles` rewrite to `/overlay`), never by the vanilla overlay. | `dev-proxy-config.mjs:49`; `compose-runtime.test.js:374-385`; Linux OBS 32.2.2 / CEF 127 run against Next, story `:193` | VERIFIED (C, N-Linux) |

**Consequence.** The vanilla panel is **not a working fallback** anywhere in production or development. Its only remaining runtime effect is to shadow the Next overview at `/` with a broken shell. Therefore:

1. Moving `/` to Next is a **fix**, not a risk to parity: nothing usable is lost.
2. The open Next defects (D-3, D-4, D-7, D-5) are defects of the panel that users already run on every deep route. Keeping `apps/web` does not mitigate them. They block **OPS-15 completion and parity acceptance** (AC 1, AC 7), not **source removal**.
3. What really gates the deletion of `apps/web` is **test coverage** (class B contracts still only asserted against vanilla files) and **one runtime dependency**: the first-party catalogs live in `apps/web/localization/catalogs` (`apps/api/src/server.mjs:41`; line 43 when this plan was written, 41 after Wave 3 commit `69e9534`; `Dockerfile:9`, `apps/infra/scripts/validate-localization.mjs:9`, `apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs:4`).

This plan separates three verdicts per part: **runtime** (who serves it), **source removal** (can the vanilla file and its tests be deleted) and **parity acceptance** (can OPS-15 count the surface as done). Only the first two are "cutover"; the third remains an OPS-15 gate.

## 1. Inventory of parts

### 1.1 Panel routes and pages

| Part | What Next does | Evidence by class | Missing | Runtime | Source removal | Parity acceptance | What `@qa` must give |
|---|---|---|---|---|---|---|---|
| **P-01 `/` Overview** (INV-01/04) | Reads `/api/state`, `/api/setup`, `/api/queues`, `/health`; health severity, account, unresolved operations, queue counts, last reconciliation; manual refresh and 5 s polling while visible (`apps/frontend/features/panel-shell/panel-shell.jsx:44-57`). | U: `next-overview-panel.test.jsx:104,122,135,156`, `next-overview-projection`, `next-panel-snapshot`, `next-panel-shell`. Scoped QA 10/10 (story `:898`), UX 9.2 (story `:897`); later static page review 7.0 (story `:915`). Dev runtime: `/` is Next (story `:781`). C: **not run** (shadowed). L/B: none. | C proof of `/` owned by Next; class-B contracts of `health-status.test.js` ("does not invent a ping", "reconnection shown as retrying", `test-suite-audit-2026-10-23.md:70`). First-run landing differs: vanilla opened Connection when disconnected (`apps/shared/panel/panel-navigation.mjs:4-6`); Next shows the overview with a "connect" next-step card (`panel-navigation.mjs:9-12`). | **READY TO CUT** (wave 1) | MISSING EVIDENCE (`health-status.mjs` waits for TS-10) | MISSING EVIDENCE (FT-01 polish, D-7/OPS-23) | Verdict on wave 1: inverted Compose assertion green, overlay and route-ownership cases green, browser smoke of `/` |
| **P-02 `/connection` + `/callback`** (INV-02) | Credentials, OAuth start, eligibility, reconciliation; callback stays in Fastify and returns 303 to the Next page. | U: `next-connection-page.test.jsx` (16). Dev: declined OAuth through the proxy (`endpoint-catalog-inventory.md`, Change record 2026-10-19). C: `compose-runtime.test.js:420-433`. L: OAuth not run (OW-04). | Port "never show the raw Twitch/backend message on credential validation" (`test-suite-audit-2026-10-23.md:71`). | Already Next | MISSING EVIDENCE (`application-setup.mjs`, TS-10) | MISSING EVIDENCE (OW-04 live) | Verdict on the TS-10 port |
| **P-03 `/queues`** (INV-05/06, QRA-01, 03–23) | Full list, settings, reward settings, history, move, priority, manual entry, transitions, call/resend, clear, open/close, manual mode, local archive, unarchive, delete/cancel. | U+I for all QRA; B for 01–04, 08–10, 12, 22, 23; C for 01, 03, 05–07, 11, 13–17, 19–22 (`queue-route-action-inventory.md:9-33`). L partial: LB-05/06/27–31/34/42/43 (`live-battery-2026-10-26-results.md:7-21`). | D-3 delete feedback lost on unmount (`panel-defects-architecture-review.md:40`), D-7 no auto refresh outside Overview/Operations (`:18`), D-5 deletion stuck in `deleting` (`live-battery-2026-10-26-results.md:38-39`); class B: fail-closed dialog and double confirmation on uncertain sync (`test-suite-audit-2026-10-23.md:68`), responsive reward dialog (`:69`). | Already Next | MISSING EVIDENCE (`panel-confirmation.mjs`, reward dialog in `index.html`/`styles.css`, TS-10) | **BLOCKED** by D-3 (FT-23), D-7 (OPS-23 FT-27..29), D-5 (OPS-22 FT-25/26/36) | Verdict on TS-10 ports; separately, FT-23/OPS-22/OPS-23 gates |
| **P-04 `/new-queue`** (QRA-02) | Manual and Channel Points creation, uncertain-result recovery, onboarding guidance. | U, I, B (`queue-creation-accepted/uncertain-browser-only`), C (manual-only). L: LB-05/06 PASS. | D-4 no navigation to the created queue (`panel-defects-architecture-review.md:33-36`). | Already Next | **READY** (its vanilla counterpart `queue-onboarding-flow.mjs` is class C, ported 2026-10-21, `test-suite-audit-2026-10-23.md:61`), but the file is imported by `app.js` and leaves with wave 4 | **BLOCKED** by D-4 (FT-23) | — |
| **P-05 `/operations`** (INV-07) | Operation list, retry, resolve-unknown, reconciliation; own 5 s loop (`operations-page-content.jsx:111-124`). | U: `next-operations` (8), `next-operations-page` (16). L observed: "Estado desconhecido" + Retry (`live-battery-2026-10-26-results.md:37`). B/C: none. | Populated browser states (FT-03 E5); OPS-22 manual-resolution path. Vanilla counterpart `panel-error-presentation.mjs` is class C but is still imported by the class-B `web-application-setup.test.js`. | Already Next | Leaves with wave 4 | MISSING EVIDENCE (B) + OPS-22 | — |
| **P-06 `/commands`** (INV-08) | Command policy editing, follower default, fixed-role lock. | U: `next-command-permissions-page` (9), `next-commands-route`. UX 9.1 with axe (story `:117`). | Visible focus ring and mobile stacking of command policies still asserted only in `panel-localization-contract.test.js` (`legacy-test-audit.md:55`; `test-suite-audit-2026-10-23.md:74`). | Already Next | MISSING EVIDENCE (browser validation) | MISSING EVIDENCE | Verdict on the browser check |
| **P-07 `/settings` + locale** (INV-03/08) | Account/default, persisted product locale with revision. | U: `next-account-settings-page` (6), `next-locale-picker`, `next-locale-persistence`. Dev runtime locale persistence through the proxy (story `:158-159`). UX 9.3. | Port pt-BR fallback for an incomplete persisted catalog (`test-suite-audit-2026-10-23.md:72`). | Already Next | MISSING EVIDENCE (`locale-picker-state.mjs`, TS-10) | MISSING EVIDENCE | Verdict on the TS-10 port |
| **P-08 `/widgets`** (INV-09) | Widget CRUD, one-time link dialog, regenerate/revoke/delete. | U: `next-widgets-page` (23); B: `widget-link-dialog-browser-only` PASS on Chrome 156 (`qa-gate-2026-10-23.md:82`); UX 9.2; QA PASS 9.3 (`:93`). | No vanilla-only contract left; vanilla code lives inside `app.js`. | Already Next | **READY** (physically leaves with `app.js`, wave 4) | MISSING EVIDENCE (FT-03 E2 revoke) | — |
| **P-09 `/overlay.html` OBS overlay** (INV-10) | Next `/overlay` route with its own bundle, 1 s no-cache polling, fragment removal, per-ref storage. | U: `overlay-renderer`, `next-overlay-root`; B: overlay browser-only, parity (7 types / 8 sources / 10 revisions) and bundle boundary (story `:182-184`); C: `compose-runtime.test.js:374-385`; N: Linux OBS 32.2.2 / CEF 127 (story `:193`). | Windows/macOS native OBS (OW-03, MAC-01). | Already Next | Vanilla overlay files **READY TO CUT** after wave 1 (wave 3) | MISSING EVIDENCE (OW-03) | Verdict on wave 3 |

### 1.2 Server artifacts and files

| Part | Current role | Evidence / consumers | Verdict | Wave |
|---|---|---|---|---|
| **A-01** rewrites `/`, `/styles.css`, `/app.js` (`dev-proxy-config.mjs:46-47`) | Shadow the Next overview with the broken vanilla shell | Pinned by `next-dev-proxy.test.js:32-43,50` and `compose-runtime.test.js:387-391` | **READY TO CUT** | 1 |
| **A-02** `registerWebRoutes` + `apps/api/src/web-route.mjs` (static root `apps/web`, prefixes `/shared/browser/`, `/shared/panel/`) | Serves the vanilla panel, the vanilla overlay and the shared ESM over HTTP to the vanilla only | Call at `apps/api/src/server.mjs:128-136`; only HTTP consumer is the vanilla (`web-route.mjs:10-11`); `shared/browser/translate-catalog.mjs` is imported directly by `chat-handler.mjs:5` and Next, not over HTTP | **READY TO CUT** | 1 |
| **A-03** `apps/web/overlay.html`, `overlay.js`, `overlay.css` | Second vanilla overlay (architecture concern "medium", `legacy-test-audit.md:12`) | No host-reachable route (A-02 private; `compose.yaml:67-68`); read by `shared-panel-boundary.test.js:69-71` | **READY TO CUT** after wave 1 | 3 |
| **A-04** `apps/web/app.js`, `index.html`, `styles.css` + 8 vanilla modules | The vanilla panel | Read by class-B tests (`panel-confirmation-contract`, `reward-dialog-contract`) and class-C tests; `shared-panel-boundary.test.js:61` resolves every import of `app.js`, so modules imported by `app.js` cannot be deleted before `app.js` | **MISSING EVIDENCE** (TS-10 ports) | 4 |
| **A-05** catalogs `apps/web/localization/catalogs/**` (15 TSV) | First-party catalogs for API, validator, Next fallback, image | `server.mjs:41`, `validate-localization.mjs:9`, `load-first-party-panel-fallback.mjs:4`, `Dockerfile:9`; 12 test files + 3 E2E; `docs/TRANSLATION_GUIDE.md:12`, `docs/DEVELOPMENT.md:90` | **READY TO CUT** (relocation, FT-05) | 2 |
| **A-06** `apps/web/priority-labels.mjs` + `tests/unit/priority-labels.test.js` | Dead code | No importer in `apps/` since FND-8 (`test-suite-audit-2026-10-23.md:50`) | **READY TO CUT** | 0 |
| **A-07** `/overlay.html` aliases: Next dev rule (`dev-proxy-config.mjs:27`), production `afterFiles` (`:49`), Fastify dev 307 alias (`apps/api/src/http/dev-overlay-alias.mjs:11-18`, registered at `server.mjs:119-122`), URL generator (`apps/api/src/domain/overlay-widget-service.mjs:40`) | Keep every issued OBS capability URL valid | AC 3 and AC 8 (story `:97,107`); OW-09 | **NOT A BLOCKER — may be removed with the vanilla overlay** (OW-09 resolved 2026-10-27: no active users, no compatibility shims until `rc`/`stable`; the Next overlay replaces it). Before removal, `@po` rewords AC 3/AC 8 (they still name the exact `/overlay.html` URL) and the URL generator moves to the Next route in the same wave | 3 (optional, together with A-03) |
| **A-08** `POST /api/queues/:queueId/archive` (QRA-18) + `repository.archiveQueue` | API-only route, no consumer in either panel | Route `apps/api/src/http/queue-routes.mjs:686-697`; method `apps/api/src/persistence/queue-repository.mjs:562-584`; owner decision to retire it with the vanilla (`docs/session-handoff.md:84`); worker branch `archiveAfterConfirm` (`apps/api/src/outbox/reward-worker.mjs:174`) | **READY TO CUT** with conditions (section 3) | 5 |
| **A-09** `API_ONLY` flag (`dev-runtime-config.mjs:20`, `server.mjs:133`) and `@fastify/static` (`package.json:56`) | Only meaningful while A-02 exists | Only importer of `@fastify/static` is `web-route.mjs:1` | READY after wave 1 | 6 |
| **A-10** lint/typecheck/CI `web` target (`package.json:49,52`, `tsconfig.web.json:7-9`, `eslint.config.js:32,43-51`, `.github/workflows/quality-gates.yml:17`, `tests/unit/ci-workflow-contract.test.js:19-27`) | Lints/typechecks `apps/web` + `apps/shared/panel` + `apps/frontend/**/*.jsx` | `web` is the only typecheck of `apps/frontend/**/*.jsx` (`test-suite-audit-2026-10-23.md:81`), so it must be repointed, not dropped | READY with wave 4 | 4 |
| **A-11** `apps/frontend/scripts/create-overlay-alias.mjs` | Dead static-export leftover | No reference in code, scripts or Dockerfile (`test-suite-audit-2026-10-23.md:93`; FT-04) | **READY TO CUT** | 0 |

## 2. Cut order in small reversible waves

Rules for every wave: `@po` story text first where noted (section 5, DP-0/DP-8); one commit per wave by `@devops` after the `@qa` verdict; `@dev` test-first (Red recorded before Green); no parallel waves that touch the same file or run Compose/the full suite at the same time; push/PR/tag/release not included. Rollback = `git revert <wave commit>`; no wave has a migration or data change.

### Wave 0 — dead code (no parity dependency)

- **Removes:** `apps/web/priority-labels.mjs`, `tests/unit/priority-labels.test.js` (TS-01); `apps/frontend/scripts/create-overlay-alias.mjs` (FT-04 part).
- **Tests to port first:** none (class D; React escapes text, `test-suite-audit-2026-10-23.md:50`).
- **Red/Green:** "Red" here is a contract proof: `git grep` shows no importer of either file; after removal, `shared-panel-boundary.test.js:61` (every relative import resolves) still passes.
- **Compose / proxy / installers / CI:** no change. **Docs:** `CHANGELOG_INTERNAL.md` + pt-BR; story File List.
- **Revert:** revert the commit.
- **Readiness:** READY TO CUT.

### Wave 1 — Next owns `/` in production; Fastify stops serving static files (runtime cutover)

- **Removes:** the three rewrites at `dev-proxy-config.mjs:46-47`; the `registerWebRoutes` call at `server.mjs:128-136` and `apps/api/src/web-route.mjs` (option A, DP-2). Files under `apps/web` stay on disk in this wave so that class-B tests keep running.
- **Tests changed in the same commit (Red first):**
  - `tests/unit/next-dev-proxy.test.js:32-43,50`: assert that no production rewrite targets `/`, `/styles.css`, `/app.js` or any vanilla asset (the S-02 contract test), and that `/overlay.html` stays in `afterFiles`.
  - `tests/integration/compose-runtime.test.js:387-391`: invert to `/` = 200, `x-powered-by: Next.js`, `class="panel-shell"`, `data-next-panel-entry`, no `app-shell`; add `/app.js` and `/styles.css` → not 200 HTML/JS from Fastify. Rename the test (it no longer "documents vanilla root").
  - `tests/unit/web-route.test.js` (10 cases) and `tests/unit/web-route-vanilla-modules.test.js` (2): removed with `web-route.mjs`. The two class-1 cases (`web-route.test.js:16` "API-only mode without browser UI routes", `:32` "serves only shared localization ESM") are re-expressed: the first as "Fastify registers no static file handler" (new contract test reading `server.mjs` or a Fastify inject of `GET /` → JSON 404, never HTML), the second becomes obsolete because no HTTP consumer of `/shared/browser/` remains (`@qa` confirms the reclassification to C).
- **Compose / installers:** `compose.yaml` unchanged under option A (option B would add `API_ONLY=true` there and to every installer-generated Compose). Installers unchanged (`package-installer.mjs:41` packages the same file).
- **Docs (en + pt-BR together):** `docs/front-end-architecture/runtime-and-boundaries.md`, `files-and-modules.md`, `verification.md`, `docs/fullstack-architecture/application-modules.md`, `docs/architecture/responsibilities.md` (transitional vanilla `/` → Next owns `/`); `docs/DEVELOPMENT.md:90`; internal changelog; product-facing beta changelog entry if the owner wants one (DP-7). Story/inventory rows INV-11 updated by their owners (`@po`/`@dev`), not by this plan.
- **Revert:** revert the commit; `/` returns to the broken vanilla shell. No data effect.
- **Readiness:** **READY TO CUT.** The only missing evidence is what the wave itself produces (C proof of `/`).

### Wave 2 — move the first-party catalogs out of `apps/web` (FT-05)

- **Target:** `apps/shared/localization/catalogs/<module>/<locale>.tsv` via `git mv` (DP-3). Reason: `apps/shared` is already copied into both image stages (`Dockerfile:10`, `:19`) and sits next to the loader code (`apps/shared/localization/discover-catalog-bundle.mjs`).
- **Changes:** `server.mjs:41` (`../../shared/localization/catalogs/`), `validate-localization.mjs:9`, `load-first-party-panel-fallback.mjs:4` (keep a single exported path constant in `apps/shared/localization` used by all three; keep it repository-root-relative because the panel pages are prerendered at `next build` in the `frontend-build` stage, which is UNVERIFIED until the isolated build passes), delete `Dockerfile:9`. Community mount unchanged (`compose.yaml:73-74`, `.local/community-catalogs`), so installers do not change.
- **Tests:** repoint the 12 test files and 3 E2E that read the old path (`tests/integration/panel-localization-contract.test.js`, `localization-catalog-discovery.test.js:29`, `tests/unit/next-queue-entry-actions.test.js`, `next-panel-catalogs`, `panel-catalog-placeholders`, `next-call-deadline`, `next-panel-class1-parity`, `dockerfile-frontend-imports`, `panel-confirmation-contract`; `tests/e2e/widget-link-dialog-browser-only.mjs`, `queue-manual-entry-outcomes-browser-only.mjs`, `queue-reward-resolution-browser-only.mjs`). Change `dockerfile-frontend-imports.test.js:86` from "only the catalogs until step C" to "no `apps/web` COPY". Add TS-04: a string-path check that fails on any `apps/web` path in `apps/frontend`, `apps/shared`, `apps/api`, `apps/infra` (Red today on `load-first-party-panel-fallback.mjs:4` and `server.mjs:41`).
- **Docs:** `docs/TRANSLATION_GUIDE.md:12` + pt-BR (community translators), `docs/DEVELOPMENT.md` + `DESENVOLVIMENTO.md`, architecture `files-and-modules.md` (en/pt-BR), changelog.
- **Revert:** revert the commit (pure move).
- **Readiness:** **READY TO CUT.** Independent of wave 1, but both edit `server.mjs`: run them in sequence.

### Wave 3 — remove the vanilla overlay

- **Removes:** `apps/web/overlay.html`, `overlay.js`, `overlay.css`. Adjust `tests/unit/shared-panel-boundary.test.js:69-71` (keeps the `app.js` assertion until wave 4).
- **Precondition:** wave 1 merged (Fastify no longer serves the static root). The Next overlay is untouched. The aliases (A-07) may be removed in this wave (OW-09 resolved 2026-10-27), only after `@po` rewords AC 3/AC 8 and with the OBS URL generator and overlay tests moved to the Next route in the same commit; otherwise they stay untouched.
- **Tests to port first:** none; the overlay contracts already run against Next (B trio, C, N-Linux).
- **Revert:** revert the commit.
- **Readiness:** **READY TO CUT** after wave 1.

### Wave 4 — remove the vanilla panel (`app.js`, `index.html`, `styles.css`, remaining modules) and the `apps/web` directory

- **Must be ported BEFORE (TS-10), exact list from `legacy-test-audit.md` and `test-suite-audit-2026-10-23.md` class B:**
  1. `panel-confirmation-contract.test.js`: the dialog fails closed when it cannot open or is already open; double confirmation when the reward sync is uncertain (`test-suite-audit-2026-10-23.md:68`). Already ported: no native `confirm()`, no hide/archive wording (`next-panel-class1-parity.test.js`, `legacy-test-audit.md:54`).
  2. `reward-dialog-contract.test.js`: responsive dialog space and separated actions, browser check (`:69`). Already ported: close/cancel `type="button"`.
  3. `health-status.test.js`: no invented ping for an unconfigured channel; automatic reconnection shown as retrying (`:70`).
  4. `web-application-setup.test.js`: never show the raw Twitch/backend message on credential validation failure (`:71`).
  5. `locale-picker-state.test.js`: pt-BR fallback when the persisted catalog is incomplete (`:72`).
  6. `panel-localization-contract.test.js`: visible focus ring and mobile stacking of command policies (browser validation, `legacy-test-audit.md:55`); catalog cases already repointed in wave 2.
  7. `web-route.test.js` class-1 cases: done in wave 1.
  For ported contracts that pass immediately (characterization), `@qa` proves they are not vacuous by breaking the behavior once (mutation check) instead of a historical Red.
- **Removes after the ports pass:** `apps/web/app.js`, `index.html`, `styles.css`, `application-setup.mjs`, `call-notification-actions.mjs`, `dom-localization.mjs`, `health-status.mjs`, `locale-picker-state.mjs`, `panel-confirmation.mjs`, `panel-error-presentation.mjs`, `queue-onboarding-flow.mjs` → `apps/web` no longer exists. Tests removed: class C `call-notification-actions`, `dom-localization`, `panel-error-presentation`, `vanilla-fulfillment-feedback`, `queue-onboarding-flow` (`test-suite-audit-2026-10-23.md:55-62`) and the five class-B files above after their Next ports pass.
- **Coupled changes (same commit):** `shared-panel-boundary.test.js` (cases at `:46`, `:61`, `:69`: assert `apps/web` does not exist instead of crawling it), `dockerfile-frontend-imports.test.js:73,81` (drop `apps/web` branches; merge the duplicate with `shared-panel-boundary`, TS-04), `package.json:49` `lint:web` → `apps/shared/panel` (+ JSX covered by root lint), `tsconfig.web.json:7-8`, `eslint.config.js:32` (drop `apps/web/**/*.js` glob) and `:43-51` (keep the restricted-import rule as a guard, reword the message), `ci-workflow-contract.test.js:19-27` and `quality-gates.yml:17` (keep the `web` job, optionally renamed `frontend`, DP-5).
- **Docs:** every architecture/development doc listed in section 1.2 A-05/A-10 (en + pt-BR), `AGENTS.md`/`CLAUDE.md` sentences about "removing the vanilla panel" become history, changelog.
- **Coordination:** OPS-24 (FT-30..35) migrates lint from ESLint to Biome and touches `eslint.config.js`/`package.json`; do wave 4 before the Biome commit or rebase it explicitly. OPS-23 FT-28 touches `apps/frontend/app/(panel)/layout.jsx`/`panel-shell.jsx`; wave 4 does not.
- **Revert:** revert the commit; nothing in runtime depends on the restored files.
- **Readiness:** **MISSING EVIDENCE** (items 1–6).

### Wave 5 — retire `POST /api/queues/:queueId/archive` (QRA-18)

- **Removes:** route `queue-routes.mjs:686-697`; `repository.archiveQueue` (`queue-repository.mjs:562-584`) — its only caller is the route (VERIFIED by `git grep`). **Keeps** the `archiveAfterConfirm` branch of the reward worker (`reward-worker.mjs:174`) and `unarchive` (used by Next, `apps/frontend/features/queues/queue-lifecycle.mjs:67`).
- **Tests:** remove/replace the archive cases in `tests/unit/queue-routes.test.js` (12 references), `tests/integration/qra-postgres-fixtures.test.js:740-754`, `tests/integration/queue-repository.test.js:1384`; add a Red test that `POST /api/queues/:id/archive` now returns the generic JSON 404 (never HTML, never a session bypass).
- **Docs:** INV-06 route list (`endpoint-catalog-inventory.md`), QRA-18 row, `docs/prd/functional-requirements.md:16` FR-10 "archive" and `docs/front-end-spec/information-architecture.md:7` (the operator archive is now `archive-local`; wording by `@po`/`@pm`, en + pt-BR); OPS-21 response-shape publication must not list it.
- **Revert:** revert the commit (no schema change).
- **Readiness:** **READY TO CUT** once `@data-engineer` confirms that keeping the worker branch is enough for `reward.set_open` rows with `archiveAfterConfirm: true` already present in installed databases, and `@po` accepts the FR-10 wording.

### Wave 6 — final cleanup

- **Removes:** `API_ONLY` (`dev-runtime-config.mjs:20`; `apiOnly` in `server.mjs:133` is already gone with wave 1), `@fastify/static` from `package.json:56` + lockfile (only if no other importer), obsolete transitional wording ("removed with the vanilla panel") in code comments and docs. Story ACs 9/15 marked as superseded or closed by `@po`.
- **Readiness:** READY after waves 1 and 4.

**Recommended sequence:** 0 → 1 → 3 → 2 → 5 → (TS-10 ports) → 4 → 6. Waves 0, 1, 3 and 2 can be handed to `@dev` now, one at a time.

## 3. What cannot be cut yet, and why

| Item | Why | Depends on |
|---|---|---|
| ~~`/overlay.html` and all its aliases (A-07)~~ | **No longer a blocker (OW-09 resolved 2026-10-27).** No active users exist, so no compatibility shim is kept until `rc`/`stable`; the aliases may leave with the vanilla overlay (wave 3). | Only a `@po` rewording of AC 3/AC 8 before the alias removal |
| `apps/shared/panel/*` and `apps/shared/browser/translate-catalog.mjs` | Used by Next (`overlay-root.jsx:4`, features) and by the API (`chat-handler.mjs:5`); only their HTTP serving disappears in wave 1 | — |
| Vanilla files read by class-B tests (wave 4) | The behavioral contracts would be lost | TS-10 (`legacy-test-audit.md:43,55`) |
| Reward worker `archiveAfterConfirm` branch | Durable outbox rows may already exist in installed databases | `@data-engineer` |
| Parity acceptance of `/queues` and `/new-queue` (not the source removal) | D-3/D-4 (FT-23), D-7 (OPS-23), D-5 (OPS-22). Per their stories they are "dependencies of the OPS-15 cutover" (`docs/stories/OPS-22/story.md:7,89`; `docs/stories/OPS-23/story.md:7,82`; AC 7 at story `:105`). This plan reads that as a dependency of **OPS-15 completion**, because the vanilla offers no working fallback (section 0); DP-0 was confirmed by the owner on 2026-10-27 and recorded in story AC 15 | OPS-22, OPS-23, FT-23 |
| Owner-only acceptance: Windows installer on real Docker (OW-01), Windows dev flow (OW-02), native OBS on Windows (OW-03), live Twitch (OW-04, OW-16), assistive technology (OW-06), macOS (OW-07) | Not reproducible by agents; required for OPS-15 Done, **not** for any wave above, because no wave changes the Next overlay, installers or Twitch paths | Owner |
| D-1/D-2 (FT-21/FT-22) | Chat/outbox defects, unrelated to `apps/web`; no wave touches `chat-handler.mjs` | Already sequenced |

## 4. Acceptance criteria per wave and `@qa` verdict

Common gates for every wave (run by `@qa`, serially, with nothing else using Docker or ports): `npm run lint`, `npm run typecheck`, `npm test` (full suite), `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static`, `npm run sync:ide:check`, `git diff --check`; en/pt-BR doc parity; changelogs updated (newest first); no Docker leftovers.

| Wave | Additional gates | Manual owner evidence | `@qa` verdict expected |
|---|---|---|---|
| 0 | `git grep` proof of zero importers before removal | none | PASS / CONCERNS with the READY-TO-COMMIT list |
| 1 | Red recorded for the inverted `next-dev-proxy` and `compose-runtime` assertions; `npm run build:frontend` in an isolated worktree (no shared `.next`); `npm run build` (image); `docker compose config --quiet`; full `compose-runtime.test.js` (route ownership, Chromium journey, community catalog, TLS, restart); overlay `browser-only`, `parity-browser-only`, `bundle-boundary`; Chromium smoke of `/` at 390×844/768×900/1440×900 (no overflow, overview renders, polling runs) | optional: owner opens `/` on the next local build | PASS required (C class is mandatory here) |
| 2 | TS-04 Red then Green; localization integration tests; `compose-runtime` community-catalog case; `build:frontend` (isolated) + image build; the 3 E2E that read catalogs | none | PASS |
| 3 | overlay E2E trio; `compose-runtime` overlay case | none (Linux OBS evidence stays valid: the Next overlay is unchanged) | PASS |
| 4 | each TS-10 port green and shown non-vacuous; browser validation of focus ring / mobile stacking (axe + viewport); all 15 browser-only E2E; `actionlint`; `ci-workflow-contract`; `typecheck:web` count recorded (pre-existing 59 at `qa-gate-2026-10-27.md:29`, must not grow) | none required for the commit; OW-06 (AT) remains an OPS-15 Done gate | PASS; CONCERNS acceptable only for documented, non-contract findings |
| 5 | Red for archive 404 JSON; `queue-routes`, `qra-postgres-fixtures`, `queue-repository` on isolated PostgreSQL with real migrations | none | PASS |
| 6 | `npm ls @fastify/static` empty if removed; lockfile diff reviewed | none | PASS |

`@qa` must also state, for each wave, which evidence classes were run and which were not (L and N are never implied by these waves).

## 5. Risks, estimates and owner decisions

### Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | The "broken vanilla `/`" claim is VERIFIED in config but not reproduced at runtime | Wave 1's Compose run is the proof; if `/` was functional (it should not be), the decision does not change because the owner abandoned the vanilla |
| R2 | First-run landing changes: disconnected users see the overview with a "connect" card instead of Connection (`panel-navigation.mjs:4-12`) | DP-1; `@ux-design-expert` scoped note; no new UI |
| R3 | Catalog move breaks the Next build because the fallback is read at build time with `process.cwd()` (UNVERIFIED) | Isolated `build:frontend` + image build are wave-2 gates; keep one shared path constant |
| R4 | Concurrent write sets: OPS-24 Biome (ESLint config), OPS-23 FT-28 (panel layout), other agents editing story/inventory now | Serialize waves; wave 4 before the Biome commit; story/inventory edits only by their owners |
| R5 | Test count drops and is read as coverage loss | `@qa` records, per removed test, the Next test that holds its contract (or the class C/D reason) |
| R6 | Story text contradicts the plan: AC 9 and line 37 still name `legacy` = `845a58f` as a local pointer and require a rollback rehearsal (story `:37,109,195`); AC 15 and `:197` forbid removal before full transfer (`:118`) | DP-8: `@po` rewrites them before `@dev` starts (Article III/IV). **Resolved 2026-10-27:** AC 9, AC 15, the `legacy` bullet and the two gate checkboxes were rewritten by `@po` |
| R7 | Commits are not a deployment: production users see the cutover only when a release ships | Release stays a separate owner OK; DP-7 for the beta changelog wording |
| R8 | `typecheck:web` scope change alters the pre-existing 59-error baseline | Record the count before/after in wave 4; it is not a project gate today (`qa-gate-2026-10-27.md:29`) |

### Estimates (agent effort, ranges; `@qa` time includes the full suite and Compose runs)

| Wave | `@dev` | `@qa` |
|---|---|---|
| 0 | 0.5–1 h | 0.5–1 h |
| 1 | 3–6 h | 2–3 h |
| 2 | 3–5 h | 1.5–2.5 h |
| 3 | 1–2 h | 1 h |
| 5 | 2–4 h (+ `@data-engineer` 0.5–1 h) | 1.5–2 h |
| TS-10 ports | 6–12 h (+ browser validation 2–4 h) | 2–3 h |
| 4 | 3–5 h | 3–4 h |
| 6 | 1–2 h | 1 h |
| **Total** | **≈ 20–41 h** | **≈ 12–18 h** |

### Decisions that depend on the owner (recommended option first)

| ID | Decision | Recommendation and trade-off |
|---|---|---|
| DP-0 | Do OPS-22/OPS-23/FT-23 block the **removal** of vanilla, or only **OPS-15 completion**? | **RESOLVED (owner, 2026-10-27): only OPS-15 completion**, not vanilla removal. Recorded in story AC 15 |
| DP-1 | Accept the current Next overview (static page review 7.0, story `:915`) as the production landing before FT-01 polish, including the first-run difference | **RESOLVED (owner, 2026-10-27): accepted.** The Next overview becomes the production home page; the first-run difference (disconnected users see a "connect" card instead of Connection) goes into the beta changelog (DP-7) |
| DP-2 | Wave 1 option A (delete `registerWebRoutes`) vs B (`API_ONLY=true` in Compose and every installer-generated Compose) | **RESOLVED (owner, 2026-10-27): option A**, delete `registerWebRoutes` and `web-route.mjs` |
| DP-3 | Catalog target path | `apps/shared/localization/catalogs/` (no new Dockerfile COPY). Alternative: top-level `localization/catalogs/` needs new COPY lines in both stages and a new lint/type scope |
| DP-4 | Browser validation of focus ring / mobile stacking for wave 4: `@ux-design-expert` with Playwright + axe, or owner visual check | `@ux-design-expert` + `@qa`; the owner AT check (OW-06) stays an OPS-15 Done gate |
| DP-5 | Rename the CI `web` job to `frontend` in wave 4 | Rename together with `ci-workflow-contract` and `package.json`; or keep the name to avoid touching required-check settings (then `@devops` updates nothing on GitHub) |
| DP-6 | QRA-18: remove `repository.archiveQueue` together with the route | **RESOLVED (owner, 2026-10-27): yes**, delete `archiveQueue` and `POST /api/queues/:queueId/archive`, keep the worker `archiveAfterConfirm` branch. `@data-engineer` (live rows) and `@po` (FR-10 wording) still confirm before wave 5 |
| DP-7 | Product-facing changelog line for "the panel home is now the Next overview" | Add it in `CHANGELOG-beta.md` (en/pt-BR as per project rule) when the release is prepared |
| DP-8 | `@po` rewrites AC 9, AC 15 and story lines 37/195/197 to the 2026-10-27 decision (remote protected `legacy` = `a9279b2`, part-by-part cutover, no rollback rehearsal) | **RESOLVED (`@po`, 2026-10-27):** story rewritten (en + pt-BR, Change Log row). Wave 0 can be handed to `@dev` |
| OW-09 | Keep the `/overlay.html` aliases | **RESOLVED (owner, 2026-10-27): not required.** There is no active user until `rc`/`stable`, so any structural change is safe and no compatibility shim is kept; the aliases may be removed with the vanilla overlay and the Next overlay replaces it. Permanent project rule: no compatibility shims while there are no users; revisit when entering `rc`/`stable`. Pending: `@po` rewording of AC 3/AC 8 before the removal |

**First wave order (owner, 2026-10-27):** Wave 0 (dead code: `priority-labels.mjs` and its test, `create-overlay-alias.mjs`), then Wave 1 (`/` to Next). One wave at a time, `@qa` verdict after each. The owner expressly authorized the early cutover and the cutover of the rest as it is validated.

## Not executed

No test, build, server, Docker, browser, GitHub or Twitch operation. The SYNAPSE diagnostic task attached to the request is outside this read-only architecture mission and was not run. Line numbers were read on `feat/ops-15-next-panel` at `28cd87a` (clean tree) on 2026-10-27; other agents are editing stories and inventories now, so story line references may shift.
