---
name: inventory-counts-ts15
description: Latest inventory/board counts (2026-11-06) and next free IDs; supersedes older 110/66 figures
metadata:
  type: project
---

2026-11-06: inventory 147 items (ST 23, FT 67, GV 13, TS 26, OW 18; P0 6, P1 47, P2 72, P3 22). Board plan 150 cards = 102 active (33 issue cards + 69 drafts) + 48 archived. Active by Situação: Backlog 37, Rascunho 7, Aguardando decisão 2, Pronto 12, Em andamento 5, Em revisão 8, Bloqueado 30, Concluído 1. Next free IDs: TS-27, FT-68, OW-19, ST-24.

**Why:** counts live in four files (inventory + board, en and pt-BR) plus stories.md and session-handoff; the `@qa` method = count rows of the board card table + archived table (5.1). Merged IDs stay in the inventory.

**How to apply:** verify with a script before editing counts; Update paragraphs of older dates are historical and stay. Pending IDs 2026-11-06 are drafts (no issue yet). See [[ops24-typescript-biome-draft]].
