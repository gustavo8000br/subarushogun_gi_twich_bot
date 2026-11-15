# OPS-31 — Research gaps (design v2)

[Português (pt-BR)](../../pt-BR/stories/OPS-31/research-gaps.md)

**Verdict (`@architect`, 2026-11-15):** the research index is sufficient for design v2 (row 27, SUFFICIENT; no REFRESH trigger fired: `@twurple/*` is still 8.2.0 in `package.json:70-84`); no request goes to `@analyst`.

The remaining unknowns are not web research: the six live-test items of the story, plus "does a paused reward accept redemptions" (audit W4-3), are closed by the real-channel runs (FT-78); "does `@twurple/api` 8.2.0 accept a per-call timeout" is a local source read by `@dev`.
