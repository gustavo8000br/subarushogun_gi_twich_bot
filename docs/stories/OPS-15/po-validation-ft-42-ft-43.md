# TS-10, FT-42 (with TS-12) and FT-43 — `@po` validation (cutover waves 4 and 6)

[Português (pt-BR)](../../pt-BR/stories/OPS-15/po-validation-ft-42-ft-43.md)

**Validator:** `@po` (Pax) — **Date:** 2026-11-05 — **Mode:** YOLO (`[AUTO-DECISION]` marks autonomous choices)
**Slices:** TS-10, FT-42 (carries TS-12) and FT-43 (rows in [backlog-inventory.md](../../process/backlog-inventory.md)) of [OPS-15](story.md) — **Issue:** [#69](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/69) (the OPS-15 issue exists; same pattern as the sibling waves).
**Sources:** [cutover-plan.md](cutover-plan.md) (wave 4, wave 6, DP-3, DP-4, DP-5), [test-suite-audit-2026-10-23.md](test-suite-audit-2026-10-23.md) (classes B and C), [po-validation-ft-41.md](po-validation-ft-41.md), `.claude/rules/story-lifecycle.md` (10 points). Code state read on `feat/ops-15-next-panel` at `ea1b1c4` plus the uncommitted FT-41 patch.

## Verdicts

| Slice | Verdict | Score | Status change |
|---|---|---|---|
| **TS-10** (port the class-B contracts) | **GO** | **9.0/10** | not started -> Ready |
| **FT-42 + TS-12** (remove the vanilla panel and the class-C tests) | **GO** | **9.1/10** | not started -> Ready |
| **FT-43** (final cleanup) | **GO** | **9.3/10** | not started -> Ready |

"Ready" means validated for planning; the slice gates still apply (`@dev` test-first, one `@qa` gate at the end of the cutover with score >= 9.0, `@devops` commits).

## Findings that change the plan (state of the code today)

1. **The 8 `web-route` cases of TS-12 are already gone.** `tests/unit/web-route.test.js` and `web-route-vanilla-modules.test.js` left with wave 1 (FT-38). TS-12 now covers **5 class-C files**: `call-notification-actions`, `dom-localization`, `panel-error-presentation`, `vanilla-fulfillment-feedback`, `queue-onboarding-flow` (all `tests/unit/*.test.js`). `priority-labels` left with wave 0.
2. **`panel-localization-contract.test.js` is larger than the audit line suggests.** About 22 cases read `apps/web/index.html`, `app.js` or `styles.css`. Only two are named as unported contracts (focus ring, mobile stacking). `@dev` must classify every case (AC-TS10-7) before the file is deleted or rewritten.
3. **The `typecheck:web` baseline of 59 errors is obsolete.** Since 2026-10-29 `tsconfig.web.json` no longer includes `apps/frontend/**/*.jsx` (TS-16 returns it later), so after the removal the typecheck covers only `apps/shared/panel`. The "59 must not grow" rule is replaced by AC-42-7.
4. **`API_ONLY` has one remaining occurrence** (`apps/frontend/scripts/dev-runtime-config.mjs:20`); the server no longer reads it. `@fastify/static` has no importer under `apps/` (only `package.json:57` and the lockfile).
5. **Other tests already pin the cutover:** `first-party-catalog-location.test.js` (no `apps/web/localization`), `shared-panel-boundary.test.js:49,97`, `dockerfile-frontend-imports.test.js:81-87`, `orphan-module-contract.test.js:10` (guards `apps/web`). They are updated in AC-42-5.

## 10-point checklist

| # | Point | TS-10 | FT-42/TS-12 | FT-43 | Note |
|---|---|---|---|---|---|
| 1 | Title | 1.0 | 1.0 | 1.0 | Names scope and wave. |
| 2 | Description | 0.9 | 1.0 | 1.0 | Cutover plan wave 4/6 + audit classes B/C. |
| 3 | Testable ACs | 0.8 | 0.8 | 0.9 | Inventory rows had no numbered ACs; AC-TS10-n, AC-42-n and AC-43-n below (Given/When/Then). |
| 4 | Scope IN/OUT | 0.9 | 0.9 | 1.0 | OUT in AC-TS10-8, AC-42-9, AC-43-5. |
| 5 | Dependencies | 0.9 | 0.9 | 1.0 | See "Order and blockers". |
| 6 | Complexity | 0.9 | 0.9 | 1.0 | Plan: ports 6-12 h `@dev` + 2-4 h browser; wave 4 3-5 h; wave 6 1-2 h. |
| 7 | Business value | 0.9 | 1.0 | 0.8 | Removes the last duplicate panel without losing contracts; wave 6 is hygiene. |
| 8 | Risks | 0.9 | 0.9 | 0.9 | Vacuous ports (mutation check), a Next defect exposed by a port (AC-TS10-9), CI check rename. |
| 9 | Definition of Done | 0.9 | 0.9 | 0.9 | Common gates in the plan section 4 plus the ACs. |
| 10 | Alignment | 1.0 | 1.0 | 1.0 | Traces to plan wave 4/6, DP-3/4/5, audit; no invention. |

Averages: TS-10 9.0, FT-42/TS-12 9.1, FT-43 9.3; none below 0.8.

## Order and blockers for `@dev`

**Execution order (one `@dev`, serial, red before green; the single `@qa` gate is at the end of the whole cutover):**
FT-41 patch (done, uncommitted) -> **TS-10** -> **FT-42/TS-12** -> **FT-43**. TS-10 must be green and shown non-vacuous before any vanilla file or test is deleted; FT-43 starts only after FT-42.

**Blockers for starting TS-10: none.** FT-41 touches API/repository/tests of the archive route only (disjoint write set), so it does not block. FT-23, ST-15 and ST-16 gate OPS-15 completion, not these waves (DP-0).
**Nothing depends on the owner to start or finish the code.** Two items are outside the code and are not blockers for `@dev`: (a) `@devops` must check, before merging the branch, whether the CI check `app-quality (web)` is a required check in the repository ruleset and update it for the DP-5 rename (GitHub setting, not part of the diff; CI does not run on branch pushes today); (b) OW-06 (assistive technology) stays an OPS-15 Done gate.

## Other agents: what is really needed

| Agent | Needed? | When | Why |
|---|---|---|---|
| `@ux-design-expert` | **Yes, validation only, after implementation** (no plan before) | Together with the final gate, on the TS-10 browser checks | DP-4 requires UX + `@qa` for focus ring and mobile layout. TS-10 adds tests for existing Next UI and changes no UI by default, so a plan beforehand adds no value. Scope of the score (>= 9.0, scoped): focus ring on panel navigation, command-policy stacking at 390 px, reward settings/resolution dialogs at 390 and 768 px, axe. **If a port exposes a Next defect and `@dev` must change CSS/markup (AC-TS10-9), a short UX note on that change is required before the gate**, not before starting. |
| `@architect` | **No** | — | The plan already decides everything: DP-3 (done), DP-5 (rename to `frontend`), restricted-import guard kept. The only design choice left (`lint:frontend`/`tsconfig.frontend.json` scope) is fixed in AC-42-6. Call the `@architect` only if `@dev` finds a Next defect that needs structural change. |
| `@data-engineer` | **No (confirmed)** | — | No schema, migration, query or repository change in TS-10, FT-42 or FT-43. |
| `@analyst` | **No** | — | Repository-internal work; no LACUNA in `docs/research-index.md` applies (plan header). |
| `@qa` | Yes, one gate at the end | After FT-43 | Must record, per removed test, the Next test that holds the contract (R5), and the mutation check (AC-TS10-10). |

## Acceptance criteria — TS-10

Order for `@dev`: write each port; a port that passes immediately is a characterization, so prove it is not vacuous (AC-TS10-10); a port that fails is a real Next defect (AC-TS10-9). No vanilla file is touched in TS-10.

- **AC-TS10-1 (confirmation fails closed).** Given the Next lifecycle/clear confirmation dialog (`queue-lifecycle-actions.jsx`, `queue-list.jsx`) in jsdom where `showModal` is missing or the dialog is already open, when the operator triggers a destructive action, then no API request is sent and the action never runs without an explicit accept click. Source contract: `panel-confirmation-contract.test.js` "fails closed when the dialog cannot be opened or is already open".
- **AC-TS10-2 (double confirmation).** Given a queue whose reward sync is uncertain, when the operator chooses local deletion, then `archive-local/challenge` is requested first, `archive-local/confirm` is sent only after a second, separate accept on the final dialog, and cancelling at either step sends nothing further. Source: `panel-confirmation-contract.test.js` "requires two separate confirmations before deleting locally when reward sync is uncertain".
- **AC-TS10-3 (reward dialogs, browser).** Given Chromium at 390x844 and 768x900 (extend an existing browser-only script such as `queue-reward-settings-recovery-browser-only.mjs`), when the reward settings and reward resolution dialogs are open, then the dialog fits inside the viewport (internal scroll, no horizontal overflow), its actions are separated by at least 12 px and the notice text is at least 14 px. Source: `reward-dialog-contract.test.js` "gives the dialog responsive space and separates its actions".
- **AC-TS10-4 (health).** Given the Next overview in pt-BR, when `twitch_api: 'not_configured'` and `twitch_api_ping_ms: null`, then no numeric ping is shown ("Sem medição") and no internal value leaks; and when `twitch_api: 'retrying'`, then the state reads "Reconectando" and the overall severity is the attention level, not an error and not healthy. Source: `health-status.test.js` cases at lines 26 and 42.
- **AC-TS10-5 (connection, safe error).** Given the Next connection page and a credential validation that fails with a backend error whose message contains a secret-like string, when the form is submitted, then the visible alert is the localized safe text and the raw message never appears in the DOM; the client secret field is cleared after the async validation. Source: `web-application-setup.test.js` (2 cases).
- **AC-TS10-6 (locale picker fallback).** Given a persisted locale whose catalog is incomplete or absent, when the Settings locale picker renders, then the selected option is pt-BR; an in-progress user choice is preserved across a catalog refresh and the persisted locale is shown when there is no pending choice. Source: `locale-picker-state.test.js` (3 cases; the two already-covered ones are confirmed, not duplicated).
- **AC-TS10-7 (`panel-localization-contract`).** Given the roughly 22 cases that read `apps/web/*`, when `@dev` classifies them, then a table in the story (or the wave note) maps each case to (a) the Next test or catalog test that already holds it, (b) a new Next test, or (c) "vanilla-only markup, removed" with the reason. Two cases need browser proof (Chromium, axe, 390 px): the visible keyboard focus ring on panel navigation controls, and command-policy cards stacked to one column at narrow widths. The first-party catalog-coverage case ("covers every static text and accessible-label key") must remain, repointed to the Next/shared sources.
- **AC-TS10-8 (OUT).** No production code change unless AC-TS10-9; no vanilla file edited or removed; no new dependency.
- **AC-TS10-9 (a port exposes a Next defect).** Given a port that is red against Next, when the cause is a missing behavior, then `@dev` fixes it with the smallest change test-first and records it; a change to visible UI needs the UX note above; a change that is not small (new component, API contract) stops and is reported to Orion before continuing. `[AUTO-DECISION]` no owner decision (reason: the contract was already owned by the product; parity is the goal).
- **AC-TS10-10 (non-vacuity).** Each port that passes on first run is shown to fail once after a one-line break of the behavior (mutation check), recorded in the wave note; `@qa` repeats it on a sample.

## Acceptance criteria — FT-42 (carries TS-12)

Prerequisite: all AC-TS10-n green.

- **AC-42-1 (Red).** Add the contract first: `apps/web` does not exist, and no file in `apps/`, `tests/`, config or CI references a removed path. Seen red before the deletion.
- **AC-42-2 (removal of the panel).** Delete `apps/web/app.js`, `index.html`, `styles.css`, `application-setup.mjs`, `call-notification-actions.mjs`, `dom-localization.mjs`, `health-status.mjs`, `locale-picker-state.mjs`, `panel-confirmation.mjs`, `panel-error-presentation.mjs`, `queue-onboarding-flow.mjs`; the directory `apps/web` no longer exists. `legacy` is untouched.
- **AC-42-3 (TS-12 tests).** Delete the class-C files `call-notification-actions`, `dom-localization`, `panel-error-presentation`, `vanilla-fulfillment-feedback`, `queue-onboarding-flow` and the five class-B files `panel-confirmation-contract`, `reward-dialog-contract`, `health-status`, `web-application-setup`, `locale-picker-state` (tests only after their AC-TS10 equivalents pass), and remove or rewrite `panel-localization-contract.test.js` according to AC-TS10-7. `@dev` records, per removed test, the Next test or class reason (R5).
- **AC-42-4 (the 8 `web-route` cases).** Recorded as already delivered by wave 1; confirm by `git grep` that `web-route` has no test or importer.
- **AC-42-5 (coupled assertions, same change).** `shared-panel-boundary.test.js` and `dockerfile-frontend-imports.test.js` assert that `apps/web` does not exist instead of crawling it, and the duplicated "no apps/web import" case is merged (TS-04); `orphan-module-contract.test.js` stops guarding `apps/web`; `first-party-catalog-location.test.js`, `next-dev-proxy.test.js` and `compose-runtime.test.js` keep passing without vanilla references.
- **AC-42-6 (job rename, DP-5).** Rename `lint:web`/`typecheck:web` to `lint:frontend`/`typecheck:frontend`, `tsconfig.web.json` to `tsconfig.frontend.json` (includes `apps/shared/panel/**/*.mjs`; JSX stays out until TS-16), the CI matrix `[api, infra, frontend]` in `quality-gates.yml`, and `ci-workflow-contract.test.js` (lint target `apps/shared/panel`). `eslint.config.js`: drop the `apps/web/**/*.js` glob, keep the restricted-import rule as a guard with a reworded message. Update every script, doc or workflow reference to the old names.
- **AC-42-7 (typecheck count).** Record the `typecheck:frontend` result before/after; it must be green (JSX excluded) and the error count must not grow. The old "59" baseline is retired.
- **AC-42-8 (gates and E2E).** All 15 browser-only E2E pass; `actionlint` on the workflow; the common gates of plan section 4.
- **AC-42-9 (OUT).** No change to Next features, the overlay, `apps/shared`, the API; no GitHub operation; the Biome migration (FT-30) is not started here (wave 4 goes first); `unarchive`, FT-41 files and TS-16 untouched.
- **AC-42-10 (docs, en + pt-BR).** Architecture/development docs listed in plan section 1.2 (A-05, A-10) and wave 4 "Docs" updated; `AGENTS.md`/`CLAUDE.md` sentences about removing the vanilla panel become history (wording reviewed by Orion/`@po`); internal changelog en/pt-BR.

## Acceptance criteria — FT-43

Prerequisite: FT-42 done (wave 1 is done).

- **AC-43-1 (Red, flag).** Add a test in `tests/unit/next-dev-runtime-config.test.js` that the dev runtime environment contains no `API_ONLY`; seen red, then remove line 20 of `dev-runtime-config.mjs` and its other references (`git grep` finds none in code, scripts, Compose or docs outside history).
- **AC-43-2 (dependency).** Given `git grep "@fastify/static" apps tests` is empty, when it is removed from `package.json` and `package-lock.json` (via `npm`), then `npm ls @fastify/static` is empty and the lockfile diff contains only that package (and any dependency left unused by it), reviewed by `@qa`. If another importer exists, the dependency stays and the reason is recorded.
- **AC-43-3 (wording).** No "removed with the vanilla panel" or equivalent transitional text remains in code comments or current docs (history in changelogs and closed qa-gates may stay). Remove stale comments such as the S-03 note in `ci-workflow-contract.test.js`.
- **AC-43-4 (story closure).** `@po` marks AC 9 and AC 15 superseded/closed in the OPS-15 story (en + pt-BR) with a Change Log row, after FT-42 is merged into the work; this is a `@po` action, not `@dev`.
- **AC-43-5 (OUT and gates).** No new compatibility shim; no runtime behavior change; common gates plus `npm ls` proof; rollback = revert.

## Files touched by `@po`

`docs/stories/OPS-15/po-validation-ft-42-ft-43.md` and its pt-BR twin; `docs/process/backlog-inventory.md` (+ pt-BR; rows FT-42, FT-43, TS-10, TS-12); `docs/stories/OPS-15/story.md` (+ pt-BR; Change Log).
