---
name: feedback-qa-runs-final-tests
description: Permanent project rule: @qa (aiox-qa) runs the final independent test/gate validation and issues a verdict before @devops commits
metadata:
  type: feedback
---

Owner rule, permanent (2026-10-22): the final, independent run of the full suite and gates before any commit/PR/release belongs to `@qa` (agent `aiox-qa`), who returns PASS / CONCERNS / FAIL / WAIVED plus the list of path groups READY to commit. `@dev` tests during development but that does not replace `@qa`. `@devops` commits only the groups `@qa` released and never treats its own test run as independent validation.

**Why:** owner asked "não é o @qa que deveria rodar os testes?" after Orion had asked `@devops` to run the suite and commit in one step; CLAUDE.md already says "@qa valida de forma independente".

**How to apply:** order is `@dev` implements → `@qa` runs everything and writes `docs/stories/OPS-15/qa-gate-<date>.md` (en + pt-BR) → `@devops` commits locally with pathspec. Recorded in `AGENTS.md` (outside AIOX-MANAGED blocks) and `CLAUDE.md`. `@qa` cleans only disposable Docker resources it can prove the suite created (name prefix/label). Related: [[feedback-git-via-devops]], [[feedback-implementation-by-dev]].
