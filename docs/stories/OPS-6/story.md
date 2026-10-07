# OPS-6 — Clear runtime status and guided panel states

[Português brasileiro](../../pt-BR/stories/OPS-6/story.md)

**Priority:** High — operational trust and first-run guidance.
**Status:** Done — independent QA PASS, 100/100.
**Type:** Frontend / accessibility / product usability.
**Executor:** @dev
**Quality gate:** @qa
**Research:** [`ux-research.md`](ux-research.md) and [pt-BR equivalent](../../pt-BR/stories/OPS-6/ux-research.md).
**GitHub issue:** [#32](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/32) (open).

## Story

**As a** streamer operating the local panel,
**I want** the running version and real connection state to remain visible, with clear next steps for incomplete and empty states,
**so that** I can trust the panel and know what to do during setup and live operation.

## Background and scope

The Chrome audit on 2026-10-07 showed that `/health` returned `v0.6.0-b6ccd0f-alpha`, a connected database, and an unconfigured Twitch API, while the panel showed only “VERSÃO LOCAL”, “Verificando”, and “Conectando”. `refresh()` applies translations after writing these values, and the translated static placeholders overwrite them. The audit also found a misleading queue empty-state instruction, a generic first-run call to action, a duplicate locale selector, and small operational helper text.

This story improves the existing local streamer panel only. It does not change API contracts, Twitch/OAuth behavior, queue or point policies, streamer-authored content, or add a new visual framework.

## Acceptance Criteria

1. **Given** `/api/state` returns a product version, **when** the panel loads, refreshes, or changes locale, **then** the global header shows that exact `product_version` and static translations do not replace it.
2. **Given** `/health` returns database and Twitch states, **when** the overview renders or refreshes in any supported locale, **then** it shows those current localized states; a null ping is labeled “Sem medição” or the selected-language equivalent, not as a connection state.
3. **Given** the installation is not connected, **when** the streamer opens the overview, **then** the primary action opens Twitch connection. **Given** an eligible connected installation with no queues, **when** the overview renders, **then** the action opens new-queue setup. **Given** queues exist, **when** the overview renders, **then** the action opens queue operations. The UI does not claim the stream is ready while setup is incomplete.
4. **Given** there are no queues, **when** the streamer opens queue operations, **then** the empty state offers a working action appropriate to setup and never refers to a form “above” on another page.
5. **Given** Twitch credentials are not validated, **when** the streamer visits connection setup, **then** the disabled connection action has a nearby explanation and a clear path to configure credentials. Secret values remain masked and are not repeated in explanatory copy.
6. **Given** the streamer edits product language, **when** they use Settings, **then** that is the only locale editing control and the panel/product-owned copy continues to update as before.
7. **Given** the streamer views operational labels, helper text, or role controls, **when** using desktop or mobile layouts and keyboard navigation, **then** text is readable, the current visual identity is retained, and focused controls remain visibly identifiable.
8. **Given** there are no financial operations, **when** the streamer opens that page, **then** its empty state explains what appears there and distinguishes pending/unknown from confirmed results without implying points were refunded or consumed.
9. **Given** viewport widths of 320 px, 768 px, and 1280 px, **when** the streamer opens each affected page, **then** no unintended horizontal page overflow occurs and primary actions remain reachable.
10. **Given** the English, Spanish, and Brazilian Portuguese panel catalogs, **when** the updated catalog validation runs, **then** every changed product-owned string has valid equivalent entries and no backend error, raw Twitch status, secret, or API detail is rendered as UI copy.

## Tasks / Subtasks

- [x] Add regression tests first for dynamic runtime version and health values surviving localization.
- [x] Add focused tests for setup-dependent overview/empty-state navigation and safe state labels.
- [x] Implement the smallest rendering and copy changes that satisfy the tests.
- [x] Remove the duplicate header locale editor while keeping the Settings editor functional.
- [x] Adjust scoped typography, spacing, focus and responsive styles for the inspected panel pages.
- [x] Update affected EN and pt-BR stories, catalog strings, version docs, and changelogs.
- [x] Inspect the running panel at 320/768/1280 px and verify the connected/ineligible state, reported version/status, and next action.
- [x] Run the relevant gates and full test suite; independent QA is recorded separately below.
- [x] Add the keyboard-focus regression test before correcting panel navigation focus and verify the computed browser style.

## UX Research

See the linked UX research artifact. Evidence is from the streamer's request, Chrome inspection of all eight panel pages, a read-only `/health` response, and source inspection. No multi-user study or live Twitch operation is claimed.

## Quality Gate Plan

**Primary type:** Frontend / UI behavior.
**Complexity:** Medium; static panel, locale flow, state-dependent navigation, and responsive styling.
**Required agents:** @dev implementation; @ux-design-expert visual review; @qa independent acceptance review; @devops for GitHub issue/PR operations.

- [x] Regression tests demonstrate Red before implementation and Green after implementation.
- [x] `npm run lint:web`
- [x] `npm run typecheck:web`
- [x] `npm run validate:localization`
- [x] `npm run review:static`
- [x] `npm test`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run validate:version`
- [x] `docker compose config --quiet`
- [x] `git diff --check`
- [x] Manual browser verification at the three specified widths in all supported product locales.
- [x] Independent @qa review records score and verdict before merge.

## TDD Evidence

1. **Runtime and navigation regression — Red:** `npm test -- --run tests/unit/panel-navigation.test.js tests/integration/panel-localization-contract.test.js` failed 5 tests (2 missing state-dependent navigation helpers; 3 missing panel contracts for the duplicate locale editor, credential prerequisite ordering, and localized empty-state copy). The other 18 tests passed. Failures were behavioral/contract failures, not syntax or environment failures.
2. **Green/refactor:** added pure navigation decisions, dynamic status rendering after localization, catalog-backed empty-state guidance, a single Settings locale editor, and credential-first connection guidance. The first follow-up run exposed two stale contract assertions expecting dynamic/static labels in the HTML; the tests were corrected to verify runtime-fed elements are excluded from static localization and all dynamic copy exists in all three catalogs. Final focused command `npm test -- --run tests/unit/panel-navigation.test.js tests/integration/panel-localization-contract.test.js tests/unit/health-status.test.js` passed 27/27. The complete `npm test` passed 644/644 across 87 files.
3. **Refactor/browser verification:** rebuilt the local Compose bot image and restarted only the bot service with existing database and secret volumes. Chrome showed `v0.6.0-0000000-alpha` before the version bump, database connected, Twitch channel ineligible, and 197 ms ping. At 320, 768, and 1280 px, `document.documentElement.scrollWidth` equaled `innerWidth`; the ineligible no-queue CTA opened channel connection details. No Twitch reward, chat, or OAuth write was performed.
4. **Responsive QA regression — Red:** `npm test -- --run tests/integration/panel-localization-contract.test.js -t 'stacks command policy content at narrow mobile widths'` failed because the narrow breakpoint did not override the policy card's 280 px minimum grid track. This reproduced the QA finding as a behavioral style contract failure.
5. **Responsive fix — Green/refactor:** added the mobile one-column grid override in `apps/web/styles.css`; the same focused command passed (1 passed, 17 skipped). Rebuilt and restarted only the active bot service without deleting or recreating database/secrets volumes. Chrome confirmed all eight panel pages fit without overflow at 320, 768, and 1280 px (24/24 checks). The running panel showed `v0.7.0-0000000-alpha`, database connected, Twitch `ineligible` localized as “Canal não elegível,” and a 193 ms Twitch ping. Full `npm test` passed 645/645 across 87 files; all lint, typecheck, localization, OpenGrep, version, Compose, and diff checks passed. No Twitch writes were performed.
6. **Keyboard-focus QA regression — Red/Green:** Chrome keyboard navigation showed `:focus-visible` on a panel navigation button while computed `outline-style` remained `none`, because a more specific hover/focus rule disabled it. Added a regression assertion in `tests/integration/panel-localization-contract.test.js`; Red failed because the visible focus override was absent. Split hover and focus styling and gave focused navigation buttons a 2 px accent outline; the focused test passed (1 passed, 18 skipped), and Chrome computed `outline-style: solid` for a keyboard-focused navigation button.
7. **Final browser/build verification:** checked all eight panel pages at 320, 768, and 1280 px in pt-BR, English, and Spanish (72/72 checks had `scrollWidth <= innerWidth`), then restored the saved locale to pt-BR. After the focus regression was added, final `npm test` passed 646/646 across 87 files, and lint, typecheck, web lint/typecheck, localization validation, OpenGrep (0 findings), version, Compose, and diff checks passed. The final Compose image/runtime continues to report `v0.7.0-0000000-alpha`; no Twitch write operation was performed.

## QA Results

### Review Date: 2026-10-07

### Reviewed By: Quinn (Test Architect)

**Gate:** FAIL — 80/100. The manual responsive sweep confirmed the product version, connected/ineligible Twitch state, contextual next action, queue and financial empty states at desktop. However, `document.documentElement.scrollWidth` is 538 px on the Chat Commands page at a 320 px viewport, so AC-9 is not met. The other 23 viewport/page combinations fit. Static analysis, full tests (644/644), lint, typecheck, localization, version, Compose and diff gates passed. No Twitch write operation was performed.

### Gate Status

Gate: FAIL → docs/qa/gates/OPS-6-clear-runtime-status-and-guided-panel-states.yml

### Review Date: 2026-10-07 — Final Re-review

### Reviewed By: Quinn (Test Architect)

### Reviewed Revision: `working-tree-sha256:884d6ba5b20faeff08430feaede5d8e3b94b9636cfc0249b3700c8b245c6f70c`

### Code Quality Assessment

**PASS — 100/100 (10/10).** The panel changes keep runtime/API values separate from catalog copy, put state-dependent navigation in pure helpers, and render dynamic content as text. The QA-discovered mobile overflow and keyboard focus defects were both reproduced with regression tests before their fixes. All 10 acceptance criteria are covered; the final full suite passed 646/646 tests across 87 files.

### Requirements Traceability

- **AC-1:** Panel localization contract keeps API-driven version values out of static `data-i18n` targets; browser showed `v0.7.0-0000000-alpha` after locale changes.
- **AC-2:** `tests/unit/health-status.test.js` covers localized health labels; real `/health` returned database `connected`, Twitch `ineligible`, and 201 ms. The panel renders these localized values in all three locales.
- **AC-3:** `tests/unit/panel-navigation.test.js` covers disconnected, eligible, ineligible, and existing-queue next actions; Chrome confirmed the ineligible connected channel is directed to connection details.
- **AC-4:** Panel catalog integration contracts cover queue-empty guidance; all eight pages were inspected in each product locale.
- **AC-5:** Panel contract checks credential form ordering and prerequisite copy; connected-channel Chrome state was read-only. The live unconfigured wizard was not mutated for this review.
- **AC-6:** Contract checks prove a single locale control; browser changed pt-BR → English → Spanish → pt-BR and confirmed localized panel copy, restoring the user's original language.
- **AC-7:** Responsive sweep covered all 24 page/width combinations per locale; keyboard navigation computed `:focus-visible`, `outline-style: solid`, and 2 px width.
- **AC-8:** Catalog contract requires the financial empty-state explanation; the operations page showed the localized no-operations state.
- **AC-9:** Eight pages × three widths × three locales passed (72/72, `scrollWidth <= innerWidth`).
- **AC-10:** `npm run validate:localization` passed for all five catalog modules and locales `en`, `es`, and `pt-BR`; integration contracts require the changed panel keys in all three catalogs.

### Refactoring Performed

No code was edited by QA. The developer fixed the two review findings test-first: the Commands grid now stacks at the narrow breakpoint, and panel navigation focus has a visible accent outline.

### Compliance Check

- Coding Standards: ✓ ESM/JSDoc, safe text rendering, and no API/domain scope changes.
- Project Structure: ✓ Changes remain in `apps/web`, tests, and bilingual documentation.
- Testing Strategy: ✓ Both QA fixes recorded behavioral Red/Green; `npm test` passed 646/646.
- All ACs Met: ✓ Manual, unit, integration, and catalog validation evidence covers AC-1 through AC-10.

### Security Review

PASS. OpenGrep scanned 70 application JavaScript files with 0 findings. The changes did not add endpoints, alter OAuth, expose secrets, or perform Twitch writes. Chrome reported an unrelated `share-modal.js` error from an installed browser extension; no application-origin console errors were observed.

### Performance Considerations

PASS. No additional network requests, polling loops, or persistence writes were added by the panel changes. Health latency stayed within the observed local read-only range (193–201 ms during this review).

### Files Modified During Review

- `docs/qa/gates/OPS-6-clear-runtime-status-and-guided-panel-states.yml`
- `docs/stories/OPS-6/story.md`
- `docs/pt-BR/stories/OPS-6/story.md`

### Gate Status

Gate: PASS — 100/100 → `docs/qa/gates/OPS-6-clear-runtime-status-and-guided-panel-states.yml`
Risk profile: `docs/qa/assessments/OPS-6-risk-20261007.md` and pt-BR equivalent
NFR assessment: `docs/qa/assessments/OPS-6-nfr-20261007.md` and pt-BR equivalent

### Lifecycle Transition

PASS: InReview → Done.

## File List

- [x] `apps/web/app.js`
- [x] `apps/web/index.html`
- [x] `apps/web/styles.css`
- [x] `apps/web/panel-navigation.mjs`
- [x] `apps/web/localization/catalogs/panel/en.tsv`
- [x] `apps/web/localization/catalogs/panel/es.tsv`
- [x] `apps/web/localization/catalogs/panel/pt-BR.tsv`
- [x] `tests/unit/panel-navigation.test.js`
- [x] `tests/integration/panel-localization-contract.test.js`
- [x] `docs/stories/OPS-6/story.md` and `docs/pt-BR/stories/OPS-6/story.md`
- [x] `docs/stories/OPS-6/ux-research.md` and `docs/pt-BR/stories/OPS-6/ux-research.md`
- [x] `docs/stories.md` and `docs/pt-BR/stories.md`
- [x] Version files, bilingual versioning docs, and changelogs
- [x] `docs/qa/assessments/OPS-6-{risk,nfr}-20261007.md` and pt-BR equivalents
- [x] `docs/qa/gates/OPS-6-clear-runtime-status-and-guided-panel-states.yml`

## Change Log

| Date | Change | Agent |
| --- | --- | --- |
| 2026-10-07 | Drafted high-priority panel clarity story from Chrome UX audit; no implementation evidence recorded yet | @sm |
| 2026-10-07 | Implemented and tested runtime/health persistence across locale changes, contextual setup and queue actions, localized empty-state guidance, and responsive readability; independent QA pending | @dev |
| 2026-10-07 | QA Gate FAIL — InReview → InProgress — commands page overflows at 320 px (AC-9) | @qa |
| 2026-10-07 | Final QA Gate PASS — 100/100 — InReview → Done — responsive layout and keyboard focus verified across supported locales | @qa |
