---
name: feedback-kanban-governance
description: "Kanban ownership — @sm organizes the board (priority, requirements, difficulty, dependencies); @devops keeps it updated/synced; owner follows each implementation's line of thought there"
metadata:
  node_type: memory
  type: feedback
  originSessionId: f36acdcb-70eb-4675-8ce7-abd172911a17
  modified: 2026-10-24T03:13:39.690Z
---

On 2026-10-24 the owner asked for a kanban because the line of thought of implementations was getting lost across stories, gates, research notes, handoff, issues and commits. Owner's suggestion: GitHub Projects (alternatives researched by `@analyst` in `docs/process/kanban-research.md`).

Ownership decided by the owner: **`@sm` organizes** the board (priority, requirements, difficulty/size, dependencies, order); **`@devops` keeps it updated** (creates/moves items, syncs fields with story/issue/gate state).

**Why:** a single, always-current place to follow why each implementation exists, its decision, current gate, evidence and next step.

**How to apply:** after every relevant event (story created/validated, gate verdict, commit, decision) Orion asks `@devops` to update the board; when priorities or scope change, Orion asks `@sm` to re-organize. Orion never edits the board directly. Related: [[feedback-git-via-devops]], [[feedback-issues-body-only]], [[feedback-agent-concurrency]].

**Update 2026-10-27 — standing sync rule (owner):** after EVERY story/issue update (new story, status change, gate verdict, issue created/edited, commit/PR event, decision), Orion must ask `@devops` to update the Project #5 board, so the owner can follow planning and development. The board is **two-way**: the owner moves items to prioritize what is really necessary.

**How to apply:** before any sync `@devops` reads the board and treats the owner's changes to Situação, Prioridade, Ordem and card position as authoritative: never overwrite them from the repo; if the repo disagrees (e.g. story status vs owner's column), report the conflict instead of reverting. When the owner's priority/order changes, ask `@sm` to re-organize dependencies/sequence from the board. Orion still never edits the board directly. Related: [[feedback-git-via-devops]], [[feedback-issues-body-only]].
