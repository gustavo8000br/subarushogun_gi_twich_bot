# DOC-1 — Concise README and focused documentation navigation

[Português brasileiro](../../pt-BR/stories/DOC-1/story.md)

**Status:** Done — merged in PR #35 (`dd21c8f`). README/documentation contract tests passed 22/22; all 653 repository tests and local quality gates passed.
**Capability:** Project documentation and onboarding
**GitHub issue:** None; requested directly by the project owner.

## Story

As a streamer, operator, or contributor,
I want the root README to orient me quickly and link to focused guides,
so that I can find installation, product operation, development, contribution, and roadmap information without scanning a long mixed-purpose document.

## Acceptance criteria

1. Both root READMEs are professional, parallel English/pt-BR landing pages no longer than 120 lines.
2. Platform-specific installation, product use, development, contribution rules, and roadmap live in focused guides with reciprocal language links.
3. README local links resolve and guide links point to the correct language counterparts.
4. Contributor documentation defines the same README structure/length standard so future edits stay consistent.
5. No operational command, security limitation, test result, or current story status is contradicted by the new navigation pages.
6. Changelogs, this story, and the story index record the documentation-only change in both languages.

## TDD evidence

- **Red — structure contract:** `npx vitest run tests/unit/readme-structure.test.js` failed 5/5 before documentation changes. Both root files were 447 lines (expected maximum 120), the focused guide links did not exist, and no contribution guide defined the standard.
- **Green:** `npx vitest run tests/unit/readme-structure.test.js` passed 7/7 after adding concise landing pages, bilingual focused guides, and the contribution standard. The contract checks both line limits, reciprocal language/guide links, local README links, and the written 120-line standard.
- **Regression contract migration:** the first full `npm test` after restructuring exposed 10 failures in existing documentation contracts that still read installation, updater, OBS, and roadmap details from the old root README. No product behavior failed. Updated those checks to read the focused bilingual guides and corrected their assertions to match current lifecycle script names and recorded FND-7 evidence.
- **Green after migration:** `npx vitest run tests/unit/readme-structure.test.js tests/unit/documentation-contract.test.js tests/unit/fnd7-documentation-contract.test.js` passed 22/22. Full `npm test` passed 653/653 across 88 files; lint, typecheck, version/localization/port-denylist validation, OpenGrep, Compose config, and `git diff --check` passed.
- **Refactor:** moved platform prerequisites and certificate steps into installation guides; moved user setup prerequisites out of the operation manual and linked it to installation; separated development/contribution requirements and the full roadmap. Updated updater/uninstaller references to the canonical lifecycle script names and added concise service-status/log commands to the user manuals. The manual now links to installation steps instead of relying on a long root README.

## File list

`README.md`; `README.pt-BR.md`; `docs/INSTALLATION.md`; `docs/pt-BR/INSTALACAO.md`; `docs/USER_GUIDE-en_US.md`; `docs/MANUAL_DE_USUARIO-pt_BR.md`; `docs/DEVELOPMENT.md`; `docs/pt-BR/DESENVOLVIMENTO.md`; `docs/CONTRIBUTING.md`; `docs/pt-BR/CONTRIBUICAO.md`; `docs/ROADMAP.md`; `docs/pt-BR/ROADMAP.md`; `docs/stories/DOC-1/story.md`; `docs/pt-BR/stories/DOC-1/story.md`; `docs/stories.md`; `docs/pt-BR/stories.md`; `tests/unit/readme-structure.test.js`; `CHANGELOG_INTERNAL.md`; `docs/pt-BR/CHANGELOG_INTERNAL.md`.
