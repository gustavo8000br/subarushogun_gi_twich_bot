# Resume agents — 2026-10-29 (quota interruption at 90%)

Owner warned at 90% session quota (safe limit 85%). The running agent was stopped; nothing else was running. **First thing next session: re-dispatch the agent below with its brief, before any new work.**

## State of the repository at the stop
- Branch `feat/ops-15-next-panel`; pushed up to `e01fce3` (FT-22). Draft PR #101 is open and `CONFLICTING` with `main`, so GitHub runs no CI.
- Commit `879c569` (docs/governance: `AGENTS.md`, `CLAUDE.md`, handoff, two agent memories) exists LOCALLY and is NOT pushed.
- **A merge of `origin/main` (`a9279b2`, PR #70 + main's bump to 0.2.1) is IN PROGRESS** (`.git/MERGE_HEAD` exists; `git merge --no-commit --no-ff` by `@devops`). Do NOT run `git merge --abort` unless the work is to be redone; do NOT commit the merge before the checks below.
- Files still `UU` (conflict markers already removed by `@dev`, edits NOT verified and NOT `git add`ed): `CHANGELOG-beta.md`, `docs/pt-BR/CHANGELOG-beta.md`, `tests/unit/panel-catalog-placeholders.test.js`, `tests/unit/panel-confirmation-contract.test.js`. `CHANGELOG_INTERNAL.md` (+pt-BR) show `MM` (merged by git, then edited by `@dev`).
- No test, lint or actionlint was run after the edits. Docker clean, no dev server running.

## Agent interrupted: `@dev` (task "Resolve merge conflicts and validate Actions workflow")
Stopped right after writing the changelog resolutions (last action: "Now write the changelog resolutions"). Unknown whether the two test files were resolved with the #70 assertions, and TASK 2/3 were not started.

**Brief to re-dispatch (same as the original):**
1. Resolve the 4 conflicts: (a) `CHANGELOG-beta.md` + pt-BR: main added a `v0.2.1-beta` entry in the OLD format; keep it at the top converted to the new format (legend, coloured square + text label, `> [!WARNING]` only for incompatible changes, exact `## vX.Y.Z-beta`, newest first, en/pt-BR mirrored) with main's content preserved, above `v0.2.0-beta` and `v0.1.0-beta`; check what `@dev` already wrote instead of redoing it. (b) `panel-catalog-placeholders` and `panel-confirmation-contract` tests: keep the branch's new catalog paths (`apps/shared/localization/catalogs/`) and add main's #70 assertions (`git show a9279b2 -- <file>`); never weaken a class B assertion; check the #70 intent (queue title in the final delete confirmation) already exists in the Next panel; if not, stop and report.
2. Post-merge coherence without conflicts: `docs/VERSIONING.md` (+pt-BR), `documentation-contract.test.js`, `release-notes.test.js`, `CHANGELOG_INTERNAL.md` (+pt-BR) and the handoff must keep the new bump policy (dense bumps, MAJOR in beta, reset per stage, `-stable`, push/PR delegated) and the plan 0.2.1; the handoff keeps the branch's state block.
3. Validate `.github/workflows/*` against the Next panel and current tests (npm scripts that exist, moved paths `apps/web/localization` → `apps/shared/localization`, job `web` vs `frontend` (do NOT rename before Wave 4), files removed in waves 0-3, Node 24.20.0, Playwright, Docker); run `actionlint`; fix any mismatch (and `tests/unit/ci-workflow-contract.test.js` if it pins wording) BEFORE the push, with minimal justified changes and no weakened gate.
Rules: `@dev` does NOT run `git add/commit/merge/push`; no full suite; nothing outside the project; no servers. Lean local checks: no conflict markers, lint, typecheck, validate:version/localization/port-denylist, review:static, `git diff --check`, vitest on touched files and contract tests (documentation-contract, ci-workflow-contract, release-notes, panel-catalog-placeholders, panel-confirmation-contract, next-panel-catalogs, localization-parity). Report resolutions, workflow changes, results and the exact paths for `@devops` to `git add`.

## Then (owner decision of 2026-10-29: this round skips `@qa`; GitHub Actions replaces it)
- `@devops`: `git add` the paths `@dev` lists, conclude the merge commit, push the branch (no force; the PR delegation covers push/PR, NOT merge to `main`), watch the CI of PR #101 and report.
- **DEBT:** the independent `@qa` verdict is still owed for the merge commit, `AGENTS.md`, `CLAUDE.md`, the handoff and the workflow changes; the first gate after the quota reset covers them using the CI result as evidence.
- Then the plan in `docs/session-handoff.md`: `@sm` (merge batches), `@po` (OPS-22 as one package + FT-05/FT-07 via FT-40), `@devops` (board/issues), `@ux-design-expert` (one plan FT-23 + FT-36), `@dev` (OPS-22 + FT-23 in one cycle), `@qa` + `@devops`.
