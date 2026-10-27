---
name: feedback-client-confidentiality
description: "CONFIDENTIAL — other GitHub Projects/repos in the owner's account belong to other clients/products; never mention their names, repos, people or field values in this project"
metadata:
  node_type: memory
  type: feedback
  originSessionId: f36acdcb-70eb-4675-8ce7-abd172911a17
  modified: 2026-10-24T03:23:28.418Z
---

On 2026-10-24 the owner said that another GitHub Project in their account (used only as a field-structure model for this project's kanban) belongs to a client and must **never** be mentioned in this project.

**Why:** client confidentiality; this repository, its docs, issues, board and memory snapshot are separate from the owner's client work.

**How to apply:** never write the name, repository names, people, area/phase values or any content of other Projects/repos of the owner's account in this repository, its issues, the Project #5 board, commits, handoffs or the memory snapshot (do not even name them here). Refer to such a source only as "field model indicated by the owner". When dispatching agents that read the account's Projects, tell them this rule up front and grep their output files before any commit. Related: [[feedback-kanban-governance]].
