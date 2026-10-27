---
name: project-board-two-way
description: Project #5 kanban is two-way; owner edits to Status/Prioridade/Ordem/card position win; @devops syncs on every story/issue event via .local/board-sync
metadata:
  type: project
---

Project #5 (owner gustavo8000br) mirrors the stories; @devops updates it on EVERY story/issue event (new story, status change, gate verdict, issue created/edited, commit/PR, decision). Owner rule 2026-10-27.

**Why:** the owner prioritizes by moving cards; overwriting his moves from the repo loses his decisions.

**How to apply:** before each sync read the board; treat owner values in Status (Situação), Prioridade, Ordem and card position as authoritative; on disagreement REPORT the conflict, never revert. Routine: `.local/board-sync/` (`build-load.mjs` -> `load.json`, `sync.mjs --dry-run` then `--limit N`, conflicts in `report.json`; `--accept-repo ID` only with explicit owner OK). The default `Status` field cannot be renamed through the API (name is ignored); options can be replaced while preserving IDs via `updateProjectV2Field` with `id` per option. Native workflows and views are web-UI only. In zsh never put flags in a `$VAR` (no word splitting); use functions or literal args. See [[pathspec-commits]].
