---
name: inventory-counts-ts15
description: Inventory 107 items / board 109 cards after TS-15 (2026-10-28); next free TS ID is TS-16; OPS-14 story missing is an owner decision
metadata:
  type: project
---

2026-10-28: TS-15 (flaky Chromium queue-deletion test, compose-runtime.test.js:1216-1222, finding M-1) added. Inventory = 107 (ST 19, FT 43, GV 13, TS 15, OW 17; P2 49); board = 109 cards (27 issues + 80 drafts + 2 legacy), Backlog 5.

**Why:** counts live in four files (inventory + board, en and pt-BR); QA gates cite them, so they must move together. QA gate files are historical and are not edited.

**How to apply:** next TS ID is TS-16. OPS-14 (#65) has no story file: pending owner decision (inventory section 4, item 16); do not invent it. ST-04 keeps story status "Ready for Review"; card in Rascunho is a board state. Related: [[ops24-typescript-biome-draft]].
