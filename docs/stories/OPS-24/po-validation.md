# OPS-24 — `@po` validation (`*validate-story-draft`, 10 points)

[Português (pt-BR)](../../pt-BR/stories/OPS-24/po-validation.md)

**Validator:** `@po` (Pax) — **Date:** 2026-10-27 — **Mode:** YOLO (autonomous; decisions marked `[AUTO-DECISION]`)
**Story:** [story.md](story.md) — **Issue:** #91 (parent); slices FT-30..FT-35 just-in-time.
**Sources checked:** `.claude/rules/story-lifecycle.md`, `.aiox-core/development/tasks/validate-next-story.md`, [typescript-migration-research.md](../OPS-15/typescript-migration-research.md), [backend-migration-study.md](../../process/backend-migration-study.md), `docs/process/backlog-inventory.md` (FT-30..FT-35, sequence step 16).

## Verdict

**GO — 9.0/10.** Status: **Ready** (GO + issue #91). **UX gate confirmed not applicable** (behavior-preserving, no visible text; any visible change moves to its own story, as the story already says).

## Scores

| # | Point | Score | Evidence / note |
|---|---|---|---|
| 1 | Clear, objective title | 1.0 | TypeScript backend + ESLint → Biome. |
| 2 | Complete description | 1.0 | Defect class tied to `strict: false`; three config surfaces that ignore `.ts` named. |
| 3 | Testable ACs | 1.0 | 27 ACs; every gate proved by a planted violation (tsc, Vitest, Biome, OpenGrep). |
| 4 | Scope IN/OUT | 1.0 | Six slices; OUT: other language, bundler/`dist`, frontend/shared TS, Prisma generator change, behavior change. |
| 5 | Dependencies | 0.5 | Per-file order against OPS-22 is precise. Deduction: "OPS-23 follows the typing" does not say **which** TS slices; read literally, the whole of OPS-24 (5-7.5 person-weeks) would precede OPS-23, which is a cutover dependency — contradicting owner decision 3 ("must not freeze the cutover"). |
| 6 | Complexity | 1.0 | 19 → COMPLEX/GG; per-slice effort marked UNVERIFIED. |
| 7 | Business value | 1.0 | Turns the D-5 bug class into a compile error. |
| 8 | Risks | 1.0 | Ten risks from the note, each with mitigation. |
| 9 | Definition of Done | 1.0 | Planted-violation proofs, ESLint removed, docs en/pt-BR, CI part tied to OW-13. |
| 10 | Alignment with sources/owner decisions | 0.5 | Route A, Biome, no typescript-eslint, `AGENTS.md` rule change already decided. Deduction: `format:check` and formatting-commit timing still open (below). |

## Required correction (before OPS-23 / FT-27 starts)

1. **State which TS slices precede OPS-23.** `[AUTO-DECISION]` Recommendation → **OPS-23 waits only for TS-0 (FT-30) and TS-2 (FT-32, because FT-27 makes the outbox workers emit notifications); TS-3 (FT-33) and FT-27 are ordered by `@architect` on `http/*`; TS-1 runs after FT-24 independently; TS-4 and TS-5 never block OPS-23 or the cutover.** (Reason: honors "typing before SSE" for the files SSE touches, without letting 5-7.5 person-weeks hold a cutover dependency.) `@sm` writes this into "Dependencies" (en and pt-BR) and the inventory sequence step 16; **owner confirms (OD-24-3)**.

## `@sm` point 5 — `format:check` and the formatting commit

1. **`format:check` in the gates.** `[AUTO-DECISION]` Recommendation → **no new gate name.** In TS-0 the existing `lint`/`lint:*` scripts run `biome lint` (lint only). After the formatting commit lands, the same scripts switch to `biome check` (lint + format + import order) with warnings as errors. The gate list in `AGENTS.md`/`CLAUDE.md` and the CI workflow stay unchanged, and formatting is enforced from that point. (Reason: AC 3 already requires unchanged script names; one gate, no documentation churn; enforcement cannot start before the tree is formatted.) `@architect` confirms in TS-0; **owner decision OD-24-1**. If the owner prefers an explicit `format:check`, `@architect` adds it to the gate list in `AGENTS.md`, `CLAUDE.md` and CI in the same slice.
2. **When to schedule the formatting commit.** The formatter rewrites `apps/api` (OPS-22 branches FT-24..FT-26) **and** `apps/frontend` (FT-01, FT-28). `[AUTO-DECISION]` Recommendation → **TS-0 ships Biome as linter only; the formatting-only commit runs in the first window with no open branch on `apps/`, targeted after FT-26 and FT-01/FT-28 merge and before the cutover freeze, with its hash in `.git-blame-ignore-revs`. If no such window exists before the cutover, the formatter waits until after the cutover** (the note's fallback, Q8). **Owner decision OD-24-2.** Committing remains with `@devops` after the `@qa` verdict.

## Slice readiness

| Slice | Can go to `@dev` now? | Remaining gates |
|---|---|---|
| FT-30 (TS-0 tooling) | NOT YET — next in line | `@architect` (tsconfig/strict layout, Biome mapping, nursery-rule reporting, `AGENTS.md` text), `@qa` test plan and planted-violation method, issue. May run in parallel with FT-24 only because the write sets do not overlap (config, docs, one canary file outside `twitch/*`'s adapter and reconciliation files). |
| FT-31 (TS-1 `twitch/*`) | NO | FT-30 and FT-24 merged. |
| FT-32 (TS-2 `outbox/*`) | NO | FT-30, FT-25, FT-26 merged. |
| FT-33..FT-35 | NO | Per "Dependencies"; `@data-engineer` confirmation for FT-34. |

## Owner decisions (status updated 2026-10-28)

- **OD-24-1 — RESOLVED (owner, 2026-10-27):** Biome through `lint` (`biome check`), no new `format:check` gate (the recommendation). Story test plan item 6 updated; the quality-gate list in `AGENTS.md`/`CLAUDE.md` does not change for formatting. *(Was PENDING: formatting enforced through `lint` vs a separate `format:check` gate.)*
- **OD-24-2 — RESOLVED (owner, 2026-10-27):** one single formatting-only commit **after OPS-15 cutover Wave 4**, hash in `.git-blame-ignore-revs`; TS-0 ships Biome as linter only until then; it never runs while FT-01/FT-28 branches on `apps/frontend` are open. Replaces the earlier window recommended above (the "formatter after the cutover" path, as this validation had predicted). *(Was PENDING.)*
- **OD-24-3 — RESOLVED (owner, 2026-10-27, as written):** OPS-23 waits only for TS-0 and TS-2 (recommended). The required correction 1 was already written into the story "Dependencies" by `@sm`; the owner confirmation is now recorded there ("confirmed by the owner on 2026-10-27"). The start of FT-27 is no longer blocked by this decision. *(Was PENDING: no explicit owner confirmation had been recorded.)*
- **OW-13 — PARTIALLY RESOLVED:** the branch push was done (owner, 2026-10-27), but CI does not run on a branch push, so the CI evidence of AC 9 still needs a separate owner decision (PR or `workflow_dispatch`). AC 9 stays open.

Counts check: this file contains no backlog or board count; nothing stale to correct. Score and status unchanged (GO 9.0/10, Ready); decisions updated on 2026-10-28 by `@po`.

## Final status

Draft → **Ready** (GO 9.0/10, issue #91). Recorded in the story Change Log (en and pt-BR).
