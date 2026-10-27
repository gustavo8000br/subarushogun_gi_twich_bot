# OPS-23 — `@po` validation (`*validate-story-draft`, 10 points)

[Português (pt-BR)](../../pt-BR/stories/OPS-23/po-validation.md)

**Validator:** `@po` (Pax) — **Date:** 2026-10-27 — **Mode:** YOLO (autonomous; decisions marked `[AUTO-DECISION]`)
**Story:** [story.md](story.md) — **Issue:** #81 (parent); slices FT-27..FT-29 just-in-time.
**Sources checked:** `.claude/rules/story-lifecycle.md`, `.aiox-core/development/tasks/validate-next-story.md`, [sse-research.md](../OPS-15/sse-research.md), [panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md) sections 1, 3, 6-7, [OPS-15 story](../OPS-15/story.md) lines 44 and 105, `docs/process/backlog-inventory.md`.

## Verdict

**GO — 9.0/10.** Status: **Ready** (GO + issue #81). No slice goes to `@dev` yet: the `@architect` design and the `@ux-design-expert` plan (≥ 9.0) are still open, and owner order puts typing and OPS-22 first.

## Scores

| # | Point | Score | Evidence / note |
|---|---|---|---|
| 1 | Clear, objective title | 1.0 | SSE + shared state. |
| 2 | Complete description | 1.0 | D-7 with VERIFIED causes (lost 5 s parity, provider per page, no push channel). |
| 3 | Testable ACs | 0.5 | 19 Given/When/Then ACs with evidence classes. Deduction: latency targets and the 2 s fallback window ("about 60 s") are still to be fixed by `@architect`/`@qa`; AC 19 depends on a UX plan not yet written. Acceptable at story level, must be closed before FT-29. |
| 4 | Scope IN/OUT | 1.0 | Three slices; OUT: FT-23 messages, WebSocket, SWR/TanStack, overlay polling. |
| 5 | Dependencies | 1.0 | SSE note (done), architect design, UX ≥ 9.0, write-set clash with FT-01 and OPS-21 slice 3. |
| 6 | Complexity | 1.0 | 18 → COMPLEX/GG with slice sizes. |
| 7 | Business value | 1.0 | Removes the most visible parity regression; cutover dependency. |
| 8 | Risks | 1.0 | Proxy buffering, 6-connection limit, cross-process events, draft loss, reconnect loops, OPS-15 wording. |
| 9 | Definition of Done | 1.0 | Real browser and Compose evidence required; OPS-15 wording reconciled. |
| 10 | Alignment with sources/owner decisions | 0.5 | Matches "SSE now, polling 5 s / 2 s only as fallback" (owner prevails over the note's 15-30 s). Deduction: OPS-15 AC 7 still says "no panel WebSocket" and "existing polling cadence" — reconciliation pending owner approval (below). |

## `@sm` point 1 — reconcile OPS-15 AC 7 with OPS-23

OPS-15 is **not** edited by this validation. Proposed exact wording, to be applied by `@po` in OPS-15 (en and pt-BR, with a Change Log line) **after the owner approves it**:

- **OPS-15 line 44 (en), replace with:** "The existing bounded polling behavior and its focus/context handling remain in effect until OPS-23 delivers the panel event stream. Real-time panel updates use Server-Sent Events (SSE), delivered by OPS-23 (owner decision 2026-10-27), with the 5 s / 2 s polling kept only as the fallback when the stream is unavailable. This story does not introduce a panel WebSocket."
- **OPS-15 line 44 (pt-BR), replace with:** "O polling limitado existente e o comportamento de preservação de foco/contexto continuam até a OPS-23 entregar o fluxo de eventos do painel. As atualizações em tempo real do painel usam Server-Sent Events (SSE), entregues pela OPS-23 (decisão do proprietário de 2026-10-27), e o polling de 5 s / 2 s fica apenas como fallback quando o fluxo estiver indisponível. Esta story não introduz WebSocket para o painel."
- **OPS-15 AC 7, line 105 (en), replace the opening "Existing polling cadence/semantics," with:** "Existing refresh semantics (the 5 s / 2 s polling cadence remains as the fallback of the OPS-23 SSE channel, which a cutover dependency delivers),"
- **OPS-15 AC 7, line 105 (pt-BR), replace "Polling e semântica atuais," with:** "Semântica atual de atualização (a cadência de polling de 5 s / 2 s permanece como fallback do canal SSE da OPS-23, entregue como dependência do cutover),"

Status: **owner decision pending (OD-23-1)**. Until then OPS-15 and OPS-23 are consistent only by reading SSE as "not a WebSocket"; the DoD of OPS-23 keeps the reconciliation as a closing condition.

## Other decisions

1. `[AUTO-DECISION]` AC 2 "notifications are invalidation signals (topic + version, no body)" → **accepted as a design input** (reason: one sanitized source of truth for DTOs and privacy rules; `@architect` confirms in the design).
2. `[AUTO-DECISION]` Ordering against OPS-24 → OPS-23 starts after the TypeScript slices that share its write set, not after all of OPS-24 (see the OPS-24 validation, required correction 1); otherwise the cutover would wait for 5-7.5 person-weeks of typing, contradicting OPS-24 decision 3.
3. FT-28 (shared provider) shares files with FT-01: `@architect` orders them; never two `@dev` agents on the same files.

## Slice readiness

| Slice | Can go to `@dev` now? | Remaining gates |
|---|---|---|
| FT-27 (SSE backend, ACs 1-7) | NO | `@architect` design (event model, cross-process path, cap, heartbeat), order vs TS-2/TS-3; `@data-engineer` only if a DB mechanism is chosen; issue. |
| FT-28 (shared state, ACs 8-11) | NO | `@architect` order vs FT-01; UX plan ≥ 9.0; issue. |
| FT-29 (client live refresh, ACs 12-19) | NO | FT-27, FT-28; latency targets and fallback window fixed; UX plan ≥ 9.0; issue. |

## Required corrections

1. (Before FT-29) `@architect`/`@qa` fix the latency target and the 2 s fallback window in AC 14 (story text by `@sm`/`@po`).
2. (Before closing) OPS-15 wording reconciled after OD-23-1.
3. (Bookkeeping) `@sm` ticks the `@po` GO and issue boxes; inventory/board show #81.

## Owner decisions pending

- **OD-23-1:** approve the OPS-15 wording above (recommended).

## Final status

Draft → **Ready** (GO 9.0/10, issue #81). Recorded in the story Change Log (en and pt-BR).
