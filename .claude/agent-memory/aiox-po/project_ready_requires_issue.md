---
name: ready-requires-issue
description: Project rule for story status — Ready only with @po GO plus an existing GitHub issue; PO validation files live next to the story
metadata:
  type: project
---

A story moves Draft → Ready only with `@po` GO (≥ 7/10) **and** an existing GitHub issue; without the issue it stays Draft even after GO. The issue number is recorded in the story header (en and pt-BR).

**Why:** owner rule (every story/roadmap needs an issue created by `@devops` before implementation; issues are edited only in the body, never commented).

**How to apply:** record the validation in `docs/stories/<ID>/po-validation.md` + `docs/pt-BR/stories/<ID>/po-validation.md`; Ready means "validated for planning" — per-slice gates (@architect, @data-engineer, UX ≥ 9.0) still decide when a slice goes to `@dev`. OPS-15 slices (FT-xx) often have ACs only in `docs/process/backlog-inventory.md`, not in the story — flag that to `@sm`.
