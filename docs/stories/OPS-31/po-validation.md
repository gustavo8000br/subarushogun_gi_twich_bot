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
