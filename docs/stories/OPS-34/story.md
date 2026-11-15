# OPS-34 — Type-check the test files (`tests/`) and bring them into `npm run typecheck` (P-03, post-beta)

[Português (pt-BR)](../../pt-BR/stories/OPS-34/story.md)

**Status:** Draft (drafted by `@sm` on 2026-11-13). **Post-beta:** by owner decision of 2026-11-13 this story is **not** part of `v1.0.0-beta`; it is done **after** the beta, together with the TypeScript migration (OPS-24). Not validated yet: `@po` validates when it is scheduled. **Issue:** [#121](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/121).
**Source:** owner decision of 2026-11-13 (P-03 becomes a story after the beta, with the TypeScript migration); report of the CI hardening slice of 2026-11-13 in [OPS-15](../OPS-15/story.md) (search "P-03": "P-03 deferred (411 type errors)"); [open acceptance criteria ledger](../../process/open-acceptance-criteria-2026-11-10.md).
**Related:** OPS-24 (#91, backend to TypeScript and Biome; this story starts only when its slice TS-0 has landed and shares its `tsconfig` layout), OPS-30 (browser E2E scripts in CI, which live in `tests/e2e/`), P-02 (tests already linted by ESLint, done 2026-11-13).
**Registered items:** inventory **ST-26** (this story) and slices **FT-86..FT-89**. The number OPS-33 is reserved by the 2026-11-11 handoff (engineering and performance story) and was not reused. See [backlog-inventory](../../process/backlog-inventory.md).
**Coordination required:** `$aiox-po` (validation), `$aiox-architect` (tsconfig layout, strictness, ratchet design), `$aiox-analyst` (only for a GAP in `docs/research-index.md`), `$aiox-devops` (issue, CI job), independent `$aiox-qa` (verdict and mutation validation).

## Problem

- `npm run typecheck` (`tsc --noEmit`) includes only `apps/**/*.js` and `apps/**/*.mjs` (`tsconfig.json`). The roughly 227 files in `tests/` (`unit` 172, `integration` 27, `e2e` 18, `helpers` 9, `platform` 1) are outside it.
- When P-03 was tried on 2026-11-13 (CI hardening slice), **411 TypeScript errors** appeared and the item was deferred. Test fakes that are plain objects instead of library classes are exactly the kind of boundary defect that motivated OPS-24 (Twurple getter that did not exist, `error.status` instead of `statusCode`); today the checker cannot see them in the tests.
- Turning the check on in one step would be a 411-error commit, or tempt a relaxed `tsconfig`. Both are unacceptable.

## Story

As a maintainer,
I want the test files to be type-checked by the same gate as the application code,
so that fakes, fixtures and helpers cannot silently drift from the real types and a green `npm run typecheck` means the tests are covered too.

## Scope

**In:**

- **FT-86 (a)** baseline and scaffolding: `tsconfig.tests.json` extending the root config, a per-folder error baseline recorded in the repository, and a ratchet script that fails when the count of errors rises.
- **FT-87 (b)** `tests/helpers`, `tests/platform` and the shared fakes/fixtures (they are imported by the rest, so they go first).
- **FT-88 (c)** `tests/unit` (172 files), in batches by subfolder or prefix.
- **FT-89 (d)** `tests/integration` and `tests/e2e`, then folding the check into `npm run typecheck`, removing the ratchet and wiring CI.

**Out of scope:** converting test files from `.js`/`.jsx` to `.ts` (that belongs to OPS-24); changing application behavior; changing the test framework; raising `strict` for the application code (separate decision); `@ts-nocheck` or `@ts-ignore` as a way out.

## Acceptance criteria

Evidence classes stay separate: static (tsc), unit/integration test runs, mutation check. Each batch of fixes keeps `npm test` green.

### Group A — baseline and ratchet (FT-86)

1. **Given** `tsconfig.tests.json`, **then** it extends the root `tsconfig.json`, includes `tests/**/*.js`, `tests/**/*.mjs` and `tests/**/*.jsx`, and **does not** override or loosen any `compilerOptions` already in the root config (`strict`, `checkJs`, `skipLibCheck`, `types`, module settings); a contract test fails if a rule is relaxed.
2. **Given** the first run, **then** the baseline lists the error count per folder (the 411 of 2026-11-13 are re-measured and recorded with the date and the `tsc` version) in a file committed to the repository.
3. **Given** the ratchet script, **when** the total or any folder count is higher than the baseline, **then** it exits non-zero and prints the new errors; when lower, it fails until the baseline is lowered in the same commit (the count only goes down).
4. **Given** the ratchet, **then** it is run by `npm run typecheck:tests` and by the CI quality job; it never writes to the baseline in CI.

### Group B — shared helpers and fixtures (FT-87)

5. **Given** `tests/helpers` and `tests/platform`, **then** `tsc -p tsconfig.tests.json` reports **0 errors** in them, with typed fakes (JSDoc) that are assignable to the real library types (Twurple classes, Prisma client types) instead of untyped plain objects.
6. **Given** a shared fake, **then** its type is derived from the real type (for example `Pick`/`Partial` of the library class, or a documented cast with a reason), not from a copy that can drift.

### Group C — unit tests (FT-88)

7. **Given** `tests/unit`, **then** the work proceeds in batches (by subfolder or file prefix), one batch per commit, each batch ending with 0 errors in its files and a lower baseline.
8. **Given** a batch, **then** no `// @ts-nocheck`, `// @ts-ignore` or `any` cast is added without a one-line justification; every `// @ts-expect-error` carries a reason and is itself covered by a test that proves the error is expected.
9. **Given** a batch, **then** `npm test` still passes with the same number of tests (no test deleted or skipped to silence an error).
10. **Given** all batches, **then** `tests/unit` reports 0 errors.

### Group D — integration, e2e and final gate (FT-89)

11. **Given** `tests/integration` and `tests/e2e`, **then** they report 0 errors under the same rules as AC 8 and 9; integration tests keep using the real PostgreSQL (no mocks of Prisma introduced to satisfy types).
12. **Given** the end state, **then** `npm run typecheck` covers `tests/` and exits 0 with **0 errors in `tests/`**, the baseline file and the ratchet script are removed, and `tsconfig.tests.json` (or the merged config) still contains no relaxed rule.
13. **Given** the CI workflow, **then** the quality job runs the tests type-check and a workflow-contract test asserts it.
14. **Given** the final state, **then** the total count went from the re-measured baseline (411 on 2026-11-13) to 0, with the per-folder history recorded in the Change Log.

### Group E — validation by mutation and gates

15. **Given** the type gate, **then** mutation validation is recorded: (i) change a fake so it no longer matches the real type and show `npm run typecheck` fails in `tests/`; (ii) revert and show it passes; (iii) add a loosened `strict` option and show the contract test of AC 1 fails; (iv) raise a folder count and show the ratchet of AC 3 fails (while the ratchet exists).
16. **Given** the quality gates, **then** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` and `npm run review:static` are green; the `@qa` verdict is recorded.

## Dependencies

- **Post-beta only.** Starts after `v1.0.0-beta` is out and after OPS-24 slice TS-0 (config layout), so the tests config is created once and not redone.
- Suggested order: FT-86 -> FT-87 -> FT-88 -> FT-89. FT-87 first because helpers are imported everywhere.
- Never two `@dev` agents on the same test folder; batches of FT-88 are serialized or split by disjoint file sets.
- Any test file still being changed by OPS-24 conversions is fixed in that story's commit, not here, to avoid conflicts.

## Risks

1. **Churn conflicts with OPS-24 and open stories.** Mitigation: post-beta start, disjoint batches, rebase before each batch.
2. **Pressure to silence errors with `any`/`@ts-ignore`.** Mitigation: ACs 1, 8 and 15 (no relaxation, justified escapes, mutation proof).
3. **Real defects revealed in the application code.** A type error may expose a genuine bug. Mitigation: report it, fix test-first in the application as a separate commit and keep this story's diff to tests.
4. **Typing fakes makes them brittle.** Mitigation: derive from the real types (AC 6), not copies.
5. **Baseline drift while the work is spread across weeks.** Mitigation: the ratchet only goes down (AC 3).

## Complexity (estimate by `@sm`, to be confirmed by `@architect`)

Scope 4, integration 2, infrastructure 2, knowledge 3, risk 2 = **13 -> STANDARD** (6 phases). Difficulty **G**, priority **P3** (post-beta, quality hardening).

## Points for `@po` and `@architect`

1. Whether `strict` stays `false` for the tests until the application moves to `strict` (this story only forbids loosening, it does not raise it).
2. Whether the folded check is a single `tsc` run or the project-references layout chosen by OPS-24.
3. Whether the ratchet can be a small Node script or must reuse an existing quality-gate helper.

## Test plan

1. **Contract tests:** `tsconfig.tests.json` extends root and loosens nothing; CI runs the check; ratchet fails on a rise and on an un-lowered baseline.
2. **Static:** `tsc -p tsconfig.tests.json` per folder, counts compared with the baseline.
3. **Regression:** `npm test` before and after each batch with the same test count.
4. **Mutation (AC 15):** the four mutations recorded with command and result.
5. **Gates:** the full battery of AC 16 by the independent `@qa`.

## Planning gates before implementation

- `@po` validation (GO >= 7) and the issue created by `@devops` (mandatory before implementation).
- `@architect` opinion on tsconfig layout and the ratchet.
- No `@ux-design-expert` gate: no user-facing change.
- Research: none new; consult `docs/research-index.md` first (TypeScript migration note in [OPS-15](../OPS-15/typescript-migration-research.md) is the base).

## Pending items

- **GitHub issue:** every new story requires an issue created by `@devops` before implementation. **Created:** [#121](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/121) by `@devops` on 2026-11-13 (body only, never comments); the number is also in `docs/stories.md` and in the board.
- `@po` validation.
- Board sync by `@devops` (cards ST-26 and FT-86..FT-89 are registered by `@sm` as drafts).

## Definition of Done

- ACs 1 to 16 have recorded evidence by class; the mutation results are in the Change Log.
- Quality gates green; `@qa` verdict recorded; File List and checklists updated in English and pt-BR.

## SM draft validation (story-draft-checklist, 2026-11-13)

1. Goal and context: clear (411 errors, tests outside the gate). PASS.
2. Technical guidance: incremental by folder, ratchet, no relaxation; open points assigned. PASS.
3. References: OPS-15 report, ledger, OPS-24. PASS.
4. Self-containment: scope, out of scope, post-beta decision stated. PASS.
5. Testing: contract, static counts, regression, mutation. PASS.
6. Static analysis: `npm run review:static` in the gates. PASS.
- Result: ready for `@po` when scheduled (post-beta). The 227 file count and 411 errors must be re-measured at the start of FT-86.

## File List

- `docs/stories/OPS-34/story.md` (new)
- `docs/pt-BR/stories/OPS-34/story.md` (new)
- `docs/stories.md` and `docs/pt-BR/stories.md` (index entry)
- `docs/process/backlog-inventory.md`, `docs/process/kanban-board-design.md` and pt-BR twins (ST-26, FT-86..FT-89)

Implementation files will be listed here by `@dev` after the gates.

## Change Log

- 2026-11-13 — `@sm` (River): story drafted from the owner decision (P-03 after the beta, with the TypeScript migration). Status Draft. [AUTO-DECISION] story number → OPS-34 (reason: OPS-33 is reserved by the 2026-11-11 handoff for the engineering/performance story). [AUTO-DECISION] inventory IDs → ST-26, FT-86..FT-89 (reason: next free after ST-25 and FT-85). [AUTO-DECISION] priority P3, difficulty G, board order 20 (reason: post-beta quality hardening, below the beta line).
