---
name: project-board-two-way
description: Project #5 kanban is two-way; owner edits to Status/Prioridade/Ordem/card position win; @devops syncs on every story/issue event via .local/board-sync; never set Concluído before PR merge while the native auto-close workflow is on
metadata:
  type: project
---

Project #5 (owner gustavo8000br) mirrors the stories; @devops updates it on EVERY story/issue event (new story, status change, gate verdict, issue created/edited, commit/PR, decision). Owner rule 2026-10-27.

**Why:** the owner prioritizes by moving cards; overwriting his moves from the repo loses his decisions.

**How to apply:** before each sync read the board; treat owner values in Status (Situação), Prioridade, Ordem and card position as authoritative; on disagreement REPORT the conflict, never revert. Routine: `.local/board-sync/` (`build-load.mjs` -> `load.json`, `sync.mjs --dry-run` then `--limit N`, conflicts in `report.json`; `--accept-repo ID` only with explicit owner OK). The default `Status` field cannot be renamed through the API (name is ignored); options can be replaced while preserving IDs via `updateProjectV2Field` with `id` per option. Native workflows and views are web-UI only. Side effect seen 2026-10-27: setting Status=Concluído on an issue card makes the native Project workflow close the issue (closer ProjectV2, as the owner account) — #82 was closed this way while its commit was still unpushed (reopened 2026-10-27, card back to Em revisão).

**Rule (owner, 2026-10-27):** moving a card to Concluído must NOT be used before the PR is merged while the native workflow "Close issues when status changes" (Auto-close issue) is enabled; the owner will disable it in the web UI (Project #5 -> ... -> Workflows). Done = merged; until then keep Em revisão. If the workflow is still on, never set Concluído on an issue card ahead of merge; in overrides.json use Em revisão. In zsh never put flags in a `$VAR` (no word splitting); use functions or literal args. See [[pathspec-commits]].
