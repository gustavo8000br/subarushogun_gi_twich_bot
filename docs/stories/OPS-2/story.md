# Story OPS-2: Localize Twitch setup status in the panel

[Português brasileiro](../../pt-BR/stories/OPS-2/story.md)

**Complexity:** SMALL
**Executor:** @dev
**Quality gate:** @qa
**Capability:** Local setup panel
**GitHub issue:** [#21](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/21)

## Status

**InProgress**

## Story

**As a** streamer configuring the local Twitch integration,
**I want** the connection status pill to use clear pt-BR text,
**so that** internal API status codes are not presented as product copy.

## Acceptance Criteria

1. Twitch setup status codes shown in the visible panel are mapped to safe, user-facing Portuguese labels; `ineligible` says that Affiliate/Partner eligibility is required.
2. Unknown status values use a generic Portuguese fallback and are never shown raw.
3. The existing detailed eligibility explanation remains visible in Portuguese.
4. The future localization direction is recorded: pt-BR default, English and Spanish, with community contributions for additional panel/frontend languages. Full i18n implementation is explicitly outside this regression fix.

## TDD Evidence

- **Status label Red:** `npm test -- --run tests/unit/setup-messages.test.js` — 2 failed because `twitchStatusLabel` did not exist; the contract required Portuguese labels for `ineligible`, connection states, and unknown values.
- **Status label Green:** the same focused command passed 5 tests after adding an allowlisted pt-BR status map and unknown-state fallback.
- **UI wiring Red:** `npm test -- --run tests/unit/web-route.test.js` failed because the served panel script still rendered `setup.status.toUpperCase()` directly.
- **UI wiring Green:** `npm test -- --run tests/unit/setup-messages.test.js tests/unit/web-route.test.js` — 6 passed after wiring the localized label into the Twitch status pill and replacing the raw status DOM attribute with presentation categories.
- **Focused validation:** `npx eslint apps/web tests/unit/setup-messages.test.js tests/unit/web-route.test.js --max-warnings=0` and `npx tsc --noEmit -p tsconfig.json` passed.
- **Full suite:** `npm test` — 45 files and 285 tests passed.
- **Quality gates:** `npm run lint`, `npm run typecheck`, `npm run validate:version`, `docker compose config --quiet`, `npm run review:static` (OpenGrep; 40 files, 0 findings), and `git diff --check` passed.

## File List

`apps/web/app.js`; `apps/web/setup-messages.mjs`; `tests/unit/setup-messages.test.js`; `tests/unit/web-route.test.js`; `docs/stories/OPS-2/story.md`; `docs/pt-BR/stories/OPS-2/story.md`; `docs/stories.md`; `docs/pt-BR/stories.md`; `README.md`; `README.pt-BR.md`; `CHANGELOG.md`; `CHANGELOG_INTERNAL.md`; `docs/pt-BR/CHANGELOG.md`; `docs/pt-BR/CHANGELOG_INTERNAL.md`.

## QA Results

Formal @qa review is pending because the story is still `InProgress` and has no `Change Log` section, so it does not meet the review workflow preconditions. No QA gate or QA approval is claimed.
