# OPS-31 — `@po` validation (`*validate-story-draft`, 10 points)

[Português (pt-BR)](../../pt-BR/stories/OPS-31/po-validation.md)

**Validator:** `@po` (Pax) — **Date:** 2026-11-06 — **Mode:** YOLO (decisions marked `[AUTO-DECISION]`)
**Story:** [story.md](story.md) — **Issue:** none yet. **Sources checked:** the `@analyst` note ([2026-11-06-queue-group-refund](../../research/2026-11-06-queue-group-refund/README.md)), [issue-body-changes-2026-11-06b](../../process/issue-body-changes-2026-11-06b.md), OPS-20 and OPS-22 stories, the inventory (ST-24, FT-71..FT-78).

## Verdict

**GO — 8.7/10** (after the `@po` edits listed below, applied to the story in English and pt-BR). **Status stays Draft**: project rule, Ready = GO + existing issue. The `@devops` creates the issue; then the `@po` (or the `@sm`) flips Draft to Ready. Ready means "validated for planning"; each slice still needs the `@architect`, `@data-engineer` and `@ux-design-expert` (>= 9.0) gates before the `@dev`.

## Scores

| # | Point | Score | Note |
|---|---|---|---|
| 1 | Clear title | 1.0 | Names both outcomes. |
| 2 | Description | 1.0 | Silent queue and irreversible fulfill. |
| 3 | Testable ACs | 0.9 | 25 Given/When/Then ACs with evidence classes; ACs 26-28 added for the gaps below. |
| 4 | Scope IN/OUT | 0.9 | Clear; the slice letters of the inventory (FT-77 "h", FT-78 "i") were out of step and are fixed (g, h). |
| 5 | Dependencies | 0.7 | Specialists listed; the story order put FT-77 before FT-76 (corrected); the relation to OPS-20 was only "merged or superseded". Now stated (see below). |
| 6 | Complexity | 0.9 | 17, COMPLEX, GG; `@architect` confirms. |
| 7 | Business value | 0.9 | Natural queue and rewarding groups; points retention accepted by the owner. |
| 8 | Risks | 0.8 | Seven risks with mitigation; abuse had no AC (AC 27); the end of service with an unresolved "check group" entry was missing (AC 21 completed). |
| 9 | Definition of Done | 0.8 | By class; real-test items closed or pending; now covers ACs 1-28. |
| 10 | Alignment with sources | 0.8 | Every AC traces to an owner decision or note section. Gap: bulk closings (clear, delete, viewer leaves) were not covered by the owner decision (AC 26, AUTO-DECISION). |

## Corrections applied by the `@po` (story, en and pt-BR)

1. Order: FT-76 before FT-77 (the inventory already had FT-77 blocked by FT-76); AC 20 closed by FT-76 on top of FT-72.
2. AC 21: if the service ends with an "check group" entry unresolved, the conclusion does not decide for it.
3. AC 26 (bulk closings: clear, delete, waiting removal, viewer leaves, removed while called): nothing automatic, one batch choice, batched lookup. `[AUTO-DECISION]` extends the owner decision of 2026-11-06; `@architect` confirms or returns it as an owner question.
4. AC 27 (abuse): record limits in force (FT-70), live item 2 closes the limit restore.
5. AC 28: the refusal refund of a paused or closed queue is a separate case from the group refund.
6. Inventory and board: FT-77 is slice g and FT-78 slice h (en and pt-BR).

## Coherence with OPS-20 and OPS-22

- **OPS-20 (#76, Draft refined, "subscribers only" rule):** heavy overlap and two real conflicts. (a) OPS-20 refunds at every trigger (removed while called, no-show, viewer leaves, clear, delete); OPS-31 has one moment (end of service) and the streamer decides on the spot for closings. (b) OPS-20 default audience is subscribers (mods/VIPs/streamer opt-in, configurable gifted/tier); OPS-31 uses an explicit set of groups (empty refunds nobody). **Position: union under OPS-31** (one decision service, one persisted decision, one `unknown` model); OPS-31 supersedes the OPS-20 rule and audiences; OPS-20 keeps only the batch lookup of queue clear, the non-eligible handling and the subscriber definition options until the `@architect` rules. OPS-20 is not implemented separately and stays open until that record.
- **OPS-22 (#80):** reused unchanged (outbox, read-verify, manual resolution); the end-of-service cancel and the "do not refund" fulfill are outbox intents; the two `unknown` states must not be mixed in the panel.
- **What the `@architect` must decide:** (1) confirm the OPS-20 union and what remains of OPS-20; (2) one terminal intent per redemption and the exact mapping for "do not refund" (fulfill or another outcome); (3) own list per queue or per channel (note D-5); (4) per-trigger outcome and batch choice for bulk closings (AC 26); (5) send queue and priority for chat notices; (6) subscriber definition options (gifted/tier) in or out; (7) confirm complexity 17.
- **For the owner (only if the `@architect` returns it):** AC 26 extension to bulk closings. No other question is pending.

## Test plan, risks and targets

Plan accepted: unit with fake Twurple, isolated PostgreSQL with real migrations, widget on native OBS as a separate class, real run in the authorized test channel by the `@qa` with the six open items (note section 11), seven gates. Risks (race fulfill/cancel, lookup failure, retention, abuse, UID in logs, chat rate limit) are covered by ACs 4, 13-15, 18-19, 21, 23, 27. UX target >= 9.0 before the `@dev`; `@qa` verdict before `@devops` commits. Owner items: reauthorization of the channel (new scopes), the real redemptions (Orion in Chrome), points-retention acceptance (done).

## Reconfirmation after the `@architect` design (2026-11-11)

**Validator:** `@po` (Pax), YOLO. **Sources:** [architect-design](architect-design.md) (D-31-1..D-31-11, section 9 wording, section 11 owner items). **Verdict: GO reconfirmed, 9.3/10** (previous 8.7). Status stays **Ready** (issue #115 exists). No code, git or GitHub action was taken.

| # | Point | Before | Now | Note |
|---|---|---|---|---|
| 1 | Clear title | 1.0 | 1.0 | Unchanged. |
| 2 | Description | 1.0 | 1.0 | Unchanged. |
| 3 | Testable ACs | 0.9 | 1.0 | 33 ACs; the open design questions in ACs 10, 20 and 26 are now concrete (one list per channel, max 500; "do not refund" = fulfill at the choice; two-step batch with counts). New ACs 29-33 are Given/When/Then. |
| 4 | Scope IN/OUT | 0.9 | 0.9 | Gifted/tier options explicitly out; R1/R2 are backlog, not scope. |
| 5 | Dependencies | 0.7 | 0.9 | Order FT-71..FT-78 confirmed with real dependencies (FT-72 after FT-71; FT-76 after 72, 74, 75; FT-77 after 76; FT-73 independent); OPS-20 substituted. Open: `@data-engineer` and `@ux-design-expert` gates. |
| 6 | Complexity | 0.9 | 1.0 | 19, COMPLEX (scope 5, integration 4, infrastructure 2, knowledge 3, risk 5); confirmed by `@architect`. |
| 7 | Business value | 0.9 | 0.9 | Unchanged. |
| 8 | Risks | 0.8 | 0.8 | The design lists ten risks with residuals (section 5); the story keeps its seven and points to the design. Not raised: the story list was not rewritten. |
| 9 | Definition of Done | 0.8 | 0.9 | Covers ACs 1-33 by class. |
| 10 | Alignment with sources | 0.8 | 0.9 | Every new AC traces to a D-31 decision; the AC 26 extension is confirmed by `@architect`. |

**Checklist of 10 points:** all pass (>= 7 required; total 9.3).

**Decisions of this pass (AUTO-DECISION, reversible):**
- OW-31-1: keep "nothing automatic for members" (reason: owner rule of 2026-11-06; the alternative contradicts AC 31). The owner may reverse it; it blocks nothing.
- Own-list maximum 500: accepted (AC 10).
- Numbering: new ACs appended as 29-33 so that references in the inventory, board and handoff to ACs 1-28 stay valid.

**What changes for the test plan (to `@qa`):** isolated PostgreSQL with a **race barrier** (pairs conclude x remove-with-no-refund, two opposite choices, start x remove, two "retry now", clear x conclude; exactly one financial task; `settlement.contradictory_request` when the choices differ) and a run **without the advisory lock** proving the unique index alone refuses the second task; migration tests (existing queues keep `fulfill_on_start`, every constraint refuses the invalid row; the API refuses `refund_on_end` before FT-76, AC 30); the decision is immutable; batch counts by outcome, stale snapshot refused, deletion waits while a pending state exists (AC 32); lookup mapping for 401/403/429/5xx/timeout/malformed/missing scope with a fake Twurple, chunks of 100, 429 wait then `unknown`; double cancel with the **real** Twurple class (AC 19); limiter with an injected clock; logs with no id, login or label; real channel in two runs (notices after FT-71..73, money after FT-74..77) with the six open items. One `@qa` gate at the end; FT-76 and FT-77 are validated together.

**Pending (not done here):**
- `@devops`: close issue #76 as superseded by #115 (or update its body; never a comment) and update the OPS-20 entry in the inventory and board; register R1 (no work) and R2 (follow-up: fulfill a normal redemption after a no-show or a called removal with the switch off) in the backlog.
- Specialist gates still open: `@data-engineer` (questions of design section 10), `@ux-design-expert` (>= 9.0), `@qa` test plan.
- Owner: nothing blocking. For FT-78 only: reconnect the test channel with the new scopes and make the real redemptions.
