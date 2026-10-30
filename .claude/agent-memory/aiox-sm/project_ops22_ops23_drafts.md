---
name: project-ops22-ops23-drafts
description: OPS-22 (financial recovery/queue deletion) and OPS-23 (SSE real-time + shared panel state) drafted 2026-10-27; inventory IDs ST-15/16, FT-21..29, OW-16
metadata:
  type: project
---

OPS-22 and OPS-23 were drafted by @sm on 2026-10-27 as dependencies of the OPS-15 cutover (owner decision). Inventory items added: ST-15, ST-16, FT-21..FT-29, OW-16 (85 items total, 87 board cards).

**Why:** live battery defects D-1..D-7; owner chose SSE now (polling 5 s/2 s only as fallback), 6 bounded attempts then audited manual resolution for `unknown`.

**How to apply:** next free story ID is OPS-24. Inventory and kanban design are bilingual and must be edited together. UX gate (>= 9.0) was assigned only to OPS-23 and FT-23 by owner instruction; OPS-22 left a flagged open question for @po.
