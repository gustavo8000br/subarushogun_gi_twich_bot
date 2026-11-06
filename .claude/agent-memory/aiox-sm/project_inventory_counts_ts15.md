---
name: inventory-counts-ts15
description: Latest inventory/board counts (2026-11-06 fifth update) and next free IDs; supersedes older figures
metadata:
  type: project
---

2026-11-06 fifth update: inventory 168 items (ST 25, FT 85, GV 13, TS 27, OW 18; P0 6, P1 47, P2 90, P3 25). Board 122 active + 49 archived = 171 cards. Active by Situação: Backlog 56, Rascunho 8, Aguardando decisão 1, Pronto 13, Em andamento 5, Em revisão 8, Bloqueado 28, Concluído 3. Next free IDs: ST-26, FT-86, TS-28, OW-19; next story OPS-33.

**Why:** counts live in four files (inventory + board, en and pt-BR) plus stories.md and session-handoff; the `@qa` method = count rows of the board card table + archived table (5.1). Row count by type gave 36 issue cards (incl. #102) + 86 drafts, not the older 33 + 81 split (total was right).

**How to apply:** verify with an awk row count before editing counts; older Update paragraphs are historical. OPS-32 (ST-25, FT-79..FT-85) is a candidate for the 0.4.0-beta; no issue yet. See [[ops24-typescript-biome-draft]].
