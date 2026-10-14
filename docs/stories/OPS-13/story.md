# OPS-13 — Keep the OBS account widget usable after reload

[Português brasileiro](../../pt-BR/stories/OPS-13/story.md)

**Status:** Ready for Review — implementation and automated quality gates pass; owner-side native OBS runtime acceptance remains pending.
**Priority:** High
**Executor:** `$aiox-dev`.
**Quality gates:** `$aiox-architect` reviews capability handling and browser lifecycle; independent `$aiox-qa` validates reload, revocation, and account projection behavior.

## Story

As a streamer using the current-account widget in OBS,
I want the widget to remain authorized when OBS reloads its browser source,
so that the current account remains visible without recreating the widget.

## Evidence and scope

The owner reported that an individual call updates the current account in the panel but not the OBS source. The widget's configured source is `Conta atual`; reloading the browser source shows a black screen. The renderer currently reads its capability from the URL fragment and immediately removes that fragment, so a reload no longer has the capability needed for polling. The account reset command responds with the configured default label; the owner expected `Streamer`, while the product allows that default label to be edited. Reset semantics are outside this story.

## Acceptance criteria

1. After a valid capability URL is opened, reloading the OBS browser source continues to render and poll the same widget while its capability remains active.
2. The capability secret is not exposed in the visible URL after initialization and is not sent to the web server as a URL parameter.
3. Revoking or rotating the capability makes a previously loaded or reloaded widget unavailable and clears the locally retained capability.
4. The current-account widget continues to fetch fresh account labels during normal polling after an individual call.
5. Regression tests cover initial load, reload after the fragment is removed, revoked capability after reload, and fresh current-account values. User-facing documentation and story records remain equivalent in English and pt-BR.

## Quality gate plan

- `$aiox-architect`: review secret handling, browser reload behavior, and capability revocation boundaries.
- `$aiox-dev`: add a failing renderer/service test first; implement the smallest compatible change; run lint, typecheck, unit tests, full tests, static review, localization/version validation, and `git diff --check`.
- `$aiox-qa`: independently map each acceptance criterion to test or runtime evidence and provide the final score. OBS runtime acceptance is reported separately from automated browser tests.

## Tasks / subtasks (TDD order)

- [x] Add renderer and capability-link regression tests for reload persistence and revocation; record the failing result.
- [x] Preserve the active capability across reload without exposing the secret in the URL or request path.
- [x] Verify fresh account projection after an individual call and revoked-capability behavior after reload.
- [x] Update bilingual changelogs, story indexes, and handoff after implementation and QA review is requested.
- [x] Record independent QA score and its automated evidence in the QA gate.

## Dev Notes

- Account projection is served by `GET /overlay/api/widget`; the renderer polls once per second with `cache: no-store`.
- The widget capability is issued by `apps/api/src/domain/overlay-widget-service.mjs` and consumed by `apps/web/overlay-renderer.mjs`.
- No database/schema change is in scope.

## File List

- [x] `docs/stories/OPS-13/story.md`
- [x] `docs/pt-BR/stories/OPS-13/story.md`
- [x] `tests/unit/overlay-renderer.test.js`
- [x] `tests/unit/overlay-widget-service.test.js`
- [x] `tests/e2e/overlay-browser.mjs`
- [x] `apps/web/overlay-renderer.mjs`
- [x] `apps/api/src/domain/overlay-widget-service.mjs`
- [x] `CHANGELOG-beta.md`, `docs/pt-BR/CHANGELOG-beta.md`
- [x] `docs/stories.md`, `docs/pt-BR/stories.md`
- [x] `docs/session-handoff.md`, `docs/pt-BR/session-handoff.md`
- [x] `docs/qa/gates/OPS-13-overlay-capability-reload.yml`

## Dev Agent Record

### Debug Log References

- Owner reproduction: panel account changes after automatic call; OBS widget source is `Conta atual`; reloading the browser source produces a black screen.
- Owner report: `!fila conta reset` responds with a configured default label other than `Streamer`. Existing product behavior resets to the editable default label; this is not included as a code defect in this story.
- TDD RED: `npx vitest run tests/unit/overlay-renderer.test.js tests/unit/overlay-widget-service.test.js` — 3 failed initially because the renderer did not retain/recover capability across reload or clear it after rejection, and generated URLs had no stable storage reference. Independent QA then identified a possible collision between old and rotated capabilities if OBS pages share session storage; the expanded regression set reported five failures before the fix.
- TDD GREEN: the focused renderer/service suite passed **17/17** after implementing session-scoped capability retention, a random per-capability storage reference, revocation cleanup, shared-storage rotation isolation, and fresh account rendering.
- Account projection integration: `npx vitest run tests/integration/queue-repository.test.js -t 'switches account and updates the overlay after an individual call when enabled'` — 1 passed against the test suite's disposable PostgreSQL.
- Full quality gates: `npm run lint`, `npm run typecheck`, `npm test` (**106 files / 965 tests**), `npm run review:static` (0 findings), `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run sync:ide:check` (109/109), `npm run build`, and `git diff --check` passed. `npm run validate:structure` is not defined in this repository's package scripts.
- Native OBS E2E was not run because OBS/browser runtime is unavailable in this Codespace. The existing E2E now reloads the same page after its fragment has been removed, but owner-side runtime confirmation remains required.

### QA Results

- Independent `$aiox-qa` review: **PASS — 10/10** for automated OPS-13 scope. Reviewer confirmed per-capability storage isolation, secret handling, revocation cleanup, regression coverage, and reported quality gates. See `docs/qa/gates/OPS-13-overlay-capability-reload.yml`.
- Native OBS/CEF reload confirmation remains pending with the owner; automated score does not include this unexecuted runtime check.

### Independent review — 2026-10-14

- **Reviewed by:** Quinn (Test Architect)
- **Reviewed revision:** code/test working-tree digest `4ac8788bad2b72b661f67dcb5c9964757e3a633c658dc2309e4a53504b5b165b`
- **Verdict:** PASS — **10/10** for the automated OPS-13 scope. Acceptance criteria for capability retention across reload, secret removal from the visible URL/request path, revocation and rotation cleanup, per-capability storage isolation, and current-account polling have regression coverage. Focused tests passed 17/17; the full suite passed 106 files / 965 tests on rerun with `--maxWorkers=4`; the PostgreSQL tests that failed during parallel execution passed 13/13 when isolated. Lint, typecheck, build, localization/version/port-denylist checks, IDE sync, static review (0 findings), and `git diff --check` passed in the reported final gates.
- **Runtime limitation:** Native OBS/CEF reload E2E was not run in Codespaces. Owner acceptance on the native runtime remains pending and is excluded from this automated score. Existing OBS capability URLs must be regenerated after installing the fix.
- **Gate:** `docs/qa/gates/OPS-13-overlay-capability-reload.yml`. Story lifecycle status is unchanged pending owner runtime acceptance.
