# FT-09 — `@po` decision: do FT-01..FT-08 block the final review?

[Português (pt-BR)](../../pt-BR/stories/OPS-15/po-validation-ft-09.md)

**Validator:** `@po` (Pax) — **Date:** 2026-11-06 — **Mode:** YOLO. **Criterion (orchestrator):** FT-09 scores the complete migration and lists the checks not run; polish or optional-test slices do not block (they become known gaps of the review scope); slices that are necessary parity block.
**Evidence read:** inventory rows FT-01..FT-10; [cutover plan](cutover-plan.md) (section 3 and waves). The plan has no section named "final review preconditions"; the only gate it states for the final review is the one in the FT-09 row.

## Decision

**Only FT-06 (the route/action traceability and parity-matrix reconciliation) blocks FT-09. FT-01..FT-05, FT-07, FT-08 and TS-10 no longer block.** The "Blocked by" column of FT-09 is updated (inventory and board design, en and pt-BR). No real doubt remained, so no owner pop-up is needed.

| Item | Nature | Decision | Reason |
|---|---|---|---|
| FT-01 | Page polish toward 10/10 (UX scores 6.0 to 8.0) | Does not block | Polish. The review scores the migration as it stands; the pages below 10/10 and the pending UX plans are listed as known gaps. |
| FT-02 | CH-2 placeholder validation on queue creation | Does not block | A defect that already existed in the legacy panel's API, not a regression of the migration; small and test-first. The review records it as a finding if still open. |
| FT-03 | Eight E2E scenarios | Does not block | Optional tests; merged into FT-06 and unrun scenarios are listed by the review. |
| FT-04 | Static-export residue | Satisfied | Covered by waves FT-37 and FT-39 (done). |
| FT-05 | Move catalogs | Satisfied | Executed by FT-40 (wave 2, merged in PR #101). |
| FT-06 | Endpoint inventory to route/action traceability, parity-matrix reconciliation | **Blocks (traceability part)** | Necessary parity: the review cannot score "the complete migration" without the matrix against which every route and action is checked. Its dependence on FT-01 applies only to the E2E scenarios carried from FT-03, not to traceability (FT-06 row adjusted). |
| FT-07 | Community catalog runtime proof | Does not block | Merged into FT-40; the review confirms the 2026-10-20 compose run and lists any rest. |
| FT-08 | QRA-13 / QRA-02 findings | Does not block | Subsumed: FT-09 repeats the legacy-test audit, which re-verifies them; merged into FT-02. |
| TS-10 | Port class-B contracts | Satisfied | Merged into FT-42 and done by wave 4 (merged). |

## Consequences

- FT-09 stays Ready; it can be scheduled when FT-06 traceability is closed.
- The review report must list as "known gaps of the scope" the open items of FT-01, FT-02, FT-03 and FT-07 (and any unrun check: AC 10 builds, axe, es/pt-BR rendering).
- Risk accepted: pages still under 10/10 are scored as they are; a later UX change reopens only the affected page.
