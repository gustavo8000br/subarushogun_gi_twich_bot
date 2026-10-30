---
name: inventory-counts-ts15
description: Inventory 110 items / board 66 active + 46 archived cards after the 2026-10-30 merges; next free IDs TS-18, FT-45; merged cards go to board section 5.1
metadata:
  type: project
---

2026-10-30: owner-approved merges (lots A and B) plus TS-16, FT-44, TS-17. Inventory = 110 (ST 19, FT 44, GV 13, TS 17, OW 17; P0 6, P1 42, P2 52, P3 10). Board = 112 cards = 66 active (28 issue cards + 36 drafts + 2 legacy) + 46 archived (table in kanban-board-design section 5.1). Active by Situação: Backlog 5, Rascunho 2, Aguardando decisão 5, Pronto 12, Em andamento 4, Em revisão 3, Bloqueado 31, Concluído 2 (TS-01, TS-15).

**Why:** counts live in four files (inventory + board, en and pt-BR); QA gates cite them, so they must move together. QA gate files and old "Update" paragraphs are historical and are not edited. Merged IDs stay in the inventory (traceability); only their cards are archived; no issue is closed without the owner's OK.

**How to apply:** next IDs are TS-18 and FT-45. Check counts with a script (rows of the card table + archived table = inventory rows). Survivor rule used: the more advanced card survives, ties go to the lower ID, unless the owner names one. OPS-14 (#65) still has no story file (inventory section 4, item 16). Pending for others: `@po` on FT-07 and FT-44 placement, `@architect` on the order of the OPS-21 cycles. Related: [[ops24-typescript-biome-draft]].
