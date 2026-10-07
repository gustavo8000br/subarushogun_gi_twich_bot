# Story OPS-2: Localize Twitch setup status in the panel

[Português brasileiro](../../pt-BR/stories/OPS-2/story.md)

**Complexity:** SMALL
**Executor:** @dev
**Quality gate:** @qa
**Capability:** Local setup panel
**GitHub issue:** [#21](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/21)

## Status

**Done in source — independent QA PASS 9.3/10; issue #21 body synchronized and remains open until this implementation is merged by PR.**

## Story

**As a** streamer configuring the local Twitch integration,
**I want** the connection status pill to use clear pt-BR text,
**so that** internal API status codes are not presented as product copy.

## Acceptance Criteria

1. Twitch setup status codes shown in the visible panel are mapped to safe, user-facing Portuguese labels; `ineligible` says that Affiliate/Partner eligibility is required.
2. Unknown status values use a generic Portuguese fallback and are never shown raw.
3. The existing detailed eligibility explanation remains visible in Portuguese.
4. The FND-8 plan records product-wide localization: pt-BR default from installation, editable in the panel; English and Spanish; community catalogs divided by module and locale; coverage for panel, chat commands/messages, OBS widget product copy and local setup/update/uninstall tools. FND-8 implementation remains a separate story.

## TDD Evidence

- **Status label Red:** `npm test -- --run tests/unit/setup-messages.test.js` — 2 failed because `twitchStatusLabel` did not exist; the contract required Portuguese labels for `ineligible`, connection states, and unknown values.
- **Status label Green:** the same focused command passed 5 tests after adding an allowlisted pt-BR status map and unknown-state fallback.
- **UI wiring Red:** `npm test -- --run tests/unit/web-route.test.js` failed because the served panel script still rendered `setup.status.toUpperCase()` directly.
- **UI wiring Green:** `npm test -- --run tests/unit/setup-messages.test.js tests/unit/web-route.test.js` — 6 passed after wiring the localized label into the Twitch status pill and replacing the raw status DOM attribute with presentation categories.
- **Focused validation:** `npx eslint apps/web tests/unit/setup-messages.test.js tests/unit/web-route.test.js --max-warnings=0` and `npx tsc --noEmit -p tsconfig.json` passed.
- **Full suite:** `npm test` — 45 files and 285 tests passed.
- **Quality gates:** `npm run lint`, `npm run typecheck`, `npm run validate:version`, `docker compose config --quiet`, `npm run review:static` (OpenGrep; 40 files, 0 findings), and `git diff --check` passed.
- **Independent QA finding and regression fix (2026-10-06):** initial QA was CONCERNS (8.6/10): when the setup projection contains `connected: true` and `status: 'ineligible'`, the pill incorrectly said `Conectado` and its visual category was connected. A regression test was added first; `npm test -- --run tests/unit/setup-messages.test.js` failed with expected `Afiliado ou Parceiro necessário`, received `Conectado`. Green adds shared safe `twitchStatusState()` that prioritizes ineligibility and drives both the label and pill category. The focused suite then passed 6/6; `npm test -- --run tests/unit/setup-messages.test.js tests/unit/web-route.test.js` passed 11/11. Independent QA re-review PASS 9.3/10 closed both findings; no live Twitch account was used.
- **Second regression fix and final QA (2026-10-06):** QA found stale eligibility could mask a newer `reconnect_required` status. Added the regression test first; focused Red expected `Reconexão necessária` but received `Afiliado ou Parceiro necessário`. Green now gives a known operational status precedence over stale eligibility, while `connected + ineligible` remains visibly ineligible. `npm test -- --run tests/unit/setup-messages.test.js tests/unit/web-route.test.js` passed 12/12; `npm run lint:web` and `npm run typecheck:web` passed. Independent QA re-review PASS 9.3/10 closed both findings. No live Twitch account was used.

## File List

`apps/web/app.js`; `apps/web/setup-messages.mjs`; `tests/unit/setup-messages.test.js`; `tests/unit/web-route.test.js`; `docs/stories/OPS-2/story.md`; `docs/pt-BR/stories/OPS-2/story.md`; `docs/qa/gates/OPS-2-twitch-status-pt-br.yml`; `docs/pt-BR/qa/gates/OPS-2-twitch-status-pt-br.yml`; `docs/stories.md`; `docs/pt-BR/stories.md`; `README.md`; `README.pt-BR.md`; `CHANGELOG.md`; `CHANGELOG_INTERNAL.md`; `docs/pt-BR/CHANGELOG.md`; `docs/pt-BR/CHANGELOG_INTERNAL.md`.

## QA Results

### Review Date: 2026-10-06

### Reviewed By: Quinn (AIOX QA)

- Initial independent review of `c008f07`: CONCERNS, 8.6/10. It reproduced the connected-but-ineligible pill mismatch.
- Independent QA reviewed both test-first fixes and issued final PASS 9.3/10. It confirmed safe fallback behavior; no authenticated browser/Twitch operation was necessary or claimed.

### Gate Status

Gate: PASS, 9.3/10 → `docs/qa/gates/OPS-2-twitch-status-pt-br.yml` and `docs/pt-BR/qa/gates/OPS-2-twitch-status-pt-br.yml`.

## Change Log

| Date | Version | Change | Agent |
| --- | --- | --- | --- |
| 2026-10-06 | 0.5.2 | Two stale-status precedence defects fixed test-first; independent QA PASS 9.3/10, status InReview → Done | @qa |
