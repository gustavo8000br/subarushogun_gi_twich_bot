# DOC-2 — Product screenshots and visual UX preflight

[Português brasileiro](../../pt-BR/stories/DOC-2/story.md) · [Issue #40](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/40)

**Status:** Planned. Owner-requested visual preflight is recorded in `visual-preflight.md`; role-page refinement is in progress. Product screenshots and the README GIF have not been captured or delivered.
**Capability:** Product onboarding and documentation media

## Story

As a streamer or contributor,
I want accurate, calm, page-by-page visual documentation,
so I can understand the real product without confusing screenshots with browser controls or rushed screen recordings.

## Acceptance criteria

1. `$aiox-ux-design-expert` and `$aiox-architect` review every product page before media capture; the review records findings and limits for unavailable states.
2. The Commands and Roles & Permissions page follows the panel's established visual system and makes configurable and immutable access boundaries easier to scan without changing authorization behavior.
3. Every screenshot contains only the product page. Browser tabs, address bar, browser frame, and unrelated desktop UI are excluded. Do not crop away product content or controls needed to understand the screen.
4. The README presentation uses an unaccelerated, page-by-page GIF at a calm reading pace. Each page remains visible long enough to understand; do not use a sped-up tour or timelapse.
5. Screenshots and GIF show the released product at a documented version, use a safe demo state, contain no secrets or personal data, and have optimized assets, meaningful alt text, and bilingual captions/placement.
6. English and pt-BR documentation remain equivalent. Update image/link contracts and changelogs as appropriate. Do not claim screenshots or GIF are complete until the assets are present and checked.

## TDD and implementation record

- **Red — grouping behavior:** `npm test -- --run tests/unit/command-catalog-view.test.js -t 'groups configurable and fixed commands'` failed because `groupCommandPolicies` did not exist. The failure was the missing behavior, not an environment issue.
- **Red — panel contract:** `npm test -- --run tests/integration/panel-localization-contract.test.js -t 'groups command policies'` failed because the page had no grouped layout or group labels.
- **Green:** `npm test -- --run tests/unit/command-catalog-view.test.js tests/integration/panel-localization-contract.test.js` passed 26/26 after the view groups commands by configurable audience, fixed streamer/moderator, and fixed streamer-only access. `npm run validate:localization` passed for panel catalogs in English, Spanish, and pt-BR.
- **Architecture validation:** `$aiox-architect` confirmed an existing exact legacy policy containing only `everyone` was correctly enforced but visually displayed only “Everyone”, hiding the inherited audience tiers from the operator. Hierarchical policies already enumerate higher roles. No authorization or stored policy is changed.
- **Red — explicit audience display:** the unit test failed because `projectAudienceForDisplay` did not exist; adding the translation then exposed the missing catalog placeholder allowlist. **Green:** 32 tests across command view, panel contract, and catalog discovery passed; `npm run validate:localization` passed for en/es/pt-BR. `everyone` now identifies the included audience tiers, while exact legacy lists without `everyone` remain unchanged.
- **Red — save spacing:** `npm test -- --run tests/integration/panel-localization-contract.test.js -t 'groups command policies'` failed because the form did not provide spacing before the save button.
- **Green — save spacing:** the same targeted test passed (1/1) after adding a 24px top margin to the submit button and spacing below the status notice. The full suite passed 87 files / 730 tests.
- **Behavior boundary:** grouping uses the API's existing `configurable`, `immutableRoles`, and effective-role projection. It changes no policy, endpoint, persistence, or authorization rule.
- **Visual inspection limit:** a local isolated CSS/representative-markup preview was inspected; the integrated UI served from a local application build has not been visually verified. The active GHCR installation remains on the previous image.
- **Remaining:** final static gates, independent QA, integrated browser inspection, and updating Issue #40. Final screenshot/GIF production remains future DOC-2 acceptance work.

## File list

`apps/web/app.js`; `apps/web/command-catalog-view.mjs`; `apps/web/styles.css`; `apps/web/localization/catalogs/panel/en.tsv`; `apps/web/localization/catalogs/panel/es.tsv`; `apps/web/localization/catalogs/panel/pt-BR.tsv`; `apps/shared/localization/discover-catalog-module.mjs`; `tests/unit/command-catalog-view.test.js`; `tests/integration/panel-localization-contract.test.js`; `docs/stories/DOC-2/story.md`; `docs/stories/DOC-2/visual-preflight.md`; `docs/pt-BR/stories/DOC-2/story.md`; `docs/pt-BR/stories/DOC-2/visual-preflight.md`; `CHANGELOG.md`; `CHANGELOG_INTERNAL.md`; `docs/pt-BR/CHANGELOG.md`; `docs/pt-BR/CHANGELOG_INTERNAL.md`; `package.json`; `VERSION`.
