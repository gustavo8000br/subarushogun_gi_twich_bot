---
name: board-count-method
description: How to verify the "Counts" line of docs/process/kanban-board-design.md (issues vs drafts, Situação totals) during docs rechecks
metadata:
  type: project
---

The board design "Counts" line splits 107 inventory cards into issues + drafts. "Issues" = cards whose issue column is `#N` **plus** those marked `issue nova (agora)`; drafts = `rascunho`. Verified at HEAD 2bb16e0: 20 `#N` + 7 `issue nova` = 27, 80 `rascunho`.

When a draft card becomes an issue (e.g. FT-40 rascunho -> #96 on 2026-10-28), the Situação totals can be updated correctly while the issue/draft split is forgotten (gate 2026-10-29b M-1). A converted `issue nova (agora)` -> `#N` does not change the split.

The card table is the rows with a Situação value in column 4; another table in the same file also has `OW-*` rows (decision table), so filter on Situação or OW counts come out 19 instead of 17.

**Why:** a plain row grep over-counts and the split is easy to miss.
**How to apply:** in board/inventory rechecks, count with awk filtering col 4 on the 8 Situação values, compare with `git show HEAD:<file>`, and check both the Situação sum and the issue/draft split. See [[new-machine-env-quirks]].
