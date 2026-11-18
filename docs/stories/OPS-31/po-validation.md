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

## Re-validation after design v2.4 (2026-11-15)

**Validator:** `@po` (Pax), YOLO. **Sources:** [architect-design-v2](architect-design-v2.md) (sections 3.10-3.13, 14, 17), [ux-plan-v2](ux-plan-v2.md), [decisions-for-owner](decisions-for-owner.md), [data-engineer-review](data-engineer-review.md). **Verdict: GO, 9.1/10** (previous 9.3; lower only because three specialist gates are still open and the new ACs rest on a few HYPOTHESES). Status stays **Ready** (issue #115 exists). No code, git or GitHub action was taken.

| # | Point | Score | Note |
|---|---|---|---|
| 1 | Clear title | 1.0 | Unchanged. |
| 2 | Description | 1.0 | Unchanged. |
| 3 | Testable ACs | 0.9 | 41 ACs; the new 34-41 each carry an *Evidence* line by class. Lowered: merge-window range, 90-day retention and 48 h stale value are still HYPOTHESES of the design (the range 1-60, default 10, is now an owner decision). |
| 4 | Scope IN/OUT | 0.9 | Live session and policy are in scope through P5b/P6b/P7; LIVE-1 states what they must never touch. |
| 5 | Dependencies | 0.8 | Packages P0..P8 with gates listed in the story; `@data-engineer` (M2a/M3/M4), `@ux-design-expert` (score) and `@qa` plan still open. |
| 6 | Complexity | 1.0 | 19, COMPLEX; P7 very high. |
| 7 | Business value | 0.9 | Unchanged. |
| 8 | Risks | 0.8 | Design lists the residual risks (section 6, 3.11 E); the story list still keeps its seven (cap and live-session risks live in the design). |
| 9 | Definition of Done | 0.9 | Now ACs 1-41. |
| 10 | Alignment with sources | 0.9 | Every new AC traces to O-1..O-10, Q-1..Q-4, DB-5 or the owner decisions of 2026-11-15. |

**Checklist of 10 points:** all pass (>= 7 required; total 9.1).

**Owner decisions applied (2026-11-15):** (1) "Decide for the N waiting": no preselection, button disabled until an explicit choice (AC 36; the "preselected" wording of design 3.10 is superseded, UX 3.13 E); (2) live merge window 1 to 60 minutes, default 10 (AC 40); (3) Q-1: the streamer's chat `concluir` equals the panel (AC 41). Q-3, Q-4, DB-5, O-1..O-10 already decided and reflected.

**Decisions of this pass (AUTO-DECISION, reversible):** new ACs appended as 34-41 instead of 13-17 (those numbers exist; ACs 1-33 are cited by the inventory, board and handoff); P6b slice id proposed as FT-90 (next free in the inventory; `@devops`/`@sm` register it; the inventory is not edited here); amended ACs 3, 4, 5, 17, 27, 30 with design section 17 items 1-4 and 8.

**Pending for `@qa` (test plan):** add the cases of the *Evidence* lines of ACs 34-41: policy truth table (every event x value, disagreement => `wait`); migration invariants and optimistic rev race; no-preselection component and API test; state `CHECK`s and absorbing trigger, race barrier external settlement x local choice; pending-decisions route shape, limits 200/20 and indexes; cap barrier race, fake clock, failed refund returns no budget, no worker write to `redemptions`; live-session reducer cases (duplicate, out of order, boundary +/- 1 s, `rerun`, single stale `null`, Helix down, revocation, first install), static test for LIVE-1 and the mutation test; chat `concluir` by role; log checks with no id, login or label; real-channel run C needs the owner streaming. Gates A/B/C and whether P5b rides with Gate C are the `@qa`/Orion call.

**Pending for `@data-engineer`:** confirm the two M2a columns `settlement_cause` (closed list of five, `CHECK`) and `settled_external_at` plus the partial indexes (pending list and last-20 history); regenerate the section 2.2 DDL from design v2.4 when P5 starts; M3 and M4 deltas (DB-1..DB-11 already answered in the DE review section 9).

**Other pending (not done here):** `@ux-design-expert` score >= 9.0 on plan v2; `@devops` items of the previous pass (issue #76, inventory/board for OPS-20, R1/R2) and registering FT-90.

## Reconfirmation after design v2.6 (2026-11-15)

**Validator:** `@po` (Pax), YOLO. **Sources:** [architect-design-v2](architect-design-v2.md) (3.15, section 17 items 19-23, section 18, 3.14 E.1-E.2 for G-B3 and G-B6). **Verdict: GO reconfirmed, 9.1/10** (unchanged). Status stays **Ready** (issue #115 exists). No code, git or GitHub action was taken.

**Applied to the story (en and pt-BR), no new AC, numbering unchanged:**
- AC 27: the cap is the streamer's choice per queue; it only makes an automatic refund wait; "maximum N per person per live" is true only for `after_n`.
- AC 35: `PUT` and `GET` carry `reentryCapHold`, `reentryCapCountsManual` and `effectiveBudget`; before P7 a change of either (like S2..S5 and the window) is refused with `policy_not_active`, atomically; an equal body writes nothing (N-5); 400 for invalid values with no coercion.
- AC 37: the closed list has six causes (adds `batch_deferred`); the cause exists exactly while the row is `awaiting_choice`.
- AC 39: semantics of `after_n` (N pass, next waits) and `at_n` (the Nth waits; `N = 1` holds every automatic refund); equality at the cap declared (`count < budget` passes); a refund the streamer chooses is never held and counts only when `reentryCapCountsManual` is true; origin stored so a setting change applies to past refunds; evidence replaced by the truth table of both configurations plus the barrier race in both orders with counting on (automatic against manual of the same person; two simultaneous automatic refunds of one person cannot occur). This closes G-B3 and G-B6 of the `@qa` plan.
- Packages: P5b carries the two queue columns, `refund_origin` and its `CHECK`, with M3a always present; P7 enforces the boundary and the manual-count setting and writes `refund_origin`. No gate or order changed.

| # | Point | Score | Note |
|---|---|---|---|
| 1-2 | Title, description | 1.0 | Unchanged. |
| 3 | Testable ACs | 0.9 | 41 ACs; the amended ACs keep an *Evidence* line by class; AC 39 is now a closed truth table plus a race with a barrier, no ambiguous wording ("maximum N" no longer stands alone). |
| 4 | Scope IN/OUT | 0.9 | Two settings only; the design lists what was considered and not offered (exception list, caps by role, other over-cap outcome, separate manual number). |
| 5 | Dependencies | 0.8 | Unchanged: `@data-engineer` (M2a/M3/M3a, trigger and `INCLUDE` questions), `@ux-design-expert` score, `@qa` plan update. |
| 6 | Complexity | 1.0 | 19, COMPLEX; the two settings add a column pair and a stored origin, no new package. |
| 7 | Business value | 0.9 | The streamer decides how the live behaves (owner request). |
| 8 | Risks | 0.8 | Unchanged; a held row can show a count below the budget after a loosening (UX wording, design 3.15 F and H). |
| 9 | Definition of Done | 0.9 | ACs 1-41. |
| 10 | Alignment with sources | 0.9 | Traces to the owner decisions of 2026-11-15 (G-B6 configurable, sixth code `batch_deferred`) and to design 3.15. |

**Checklist of 10 points:** all pass (>= 7 required; total 9.1).

**Decisions of this pass (AUTO-DECISION, reversible):** (1) no new AC for the two settings; they are folded into ACs 35 and 39 so references to ACs 1-41 stay valid (reason: stable numbering). (2) The audit and log wording of AC 39 stays `settlement.reentry_cap_hit` with `windowKind` (reason: unchanged by the design).

**Pending for `@qa`:** add the v2.6 bullet of design section 13 to the plan (truth table of both configurations, the race in both orders, past refunds re-evaluated after a setting change, `batch_deferred`, pre-P7 refusal of the two fields), and close G-B3 and G-B6 in the plan table. **Pending for `@data-engineer`:** the sixth code in the DB-12 `CHECK` (M2a); M3 columns, `queues_reentry_cap_hold_check`, `redemptions_refund_origin_check` as `NOT VALID`; M3a always present; whether `refund_origin` is an `INCLUDE` column of the refunded index and whether the guard trigger freezes it once set. **Pending for `@ux-design-expert`:** two controls, effective-budget text, the `at_n` with `N = 1` warning, the "limit changed after this was held" line, the sixth cause line, the block hidden before P7 (the read-only look was dropped; see the v2.8 pass below). **Other pending:** the `@devops` items of the previous passes and the registration of FT-90.

## Reconfirmation after design v2.8 and the owner decisions on the panel (2026-11-15)

**Validator:** `@po` (Pax), YOLO. **Sources:** [architect-design-v2](architect-design-v2.md) v2.8 (3.16 D and E), [ux-plan-v2](ux-plan-v2.md) (U-1, U-16, U-18, U-19, U-20), [qa-test-plan](qa-test-plan.md) (`K39-02`, `K39-05`). **Verdict: GO reconfirmed, 9.1/10** (unchanged). Status stays **Ready** (issue #115). No code, git or GitHub action was taken.

**Owner decisions recorded:**
- `at_n` with a limit of 1: a **confirmation dialog** before saving (U-20); it replaces the earlier "no dialog" recommendation.
- The policy block is **hidden before P7** (`enforcementActive`); the **loss of the preview of the settings before P7 is accepted by the owner**.
- Radio texts (U-16, U-19): **confirmed by `@po`, no change.** "Let N refunds through, hold the next one (default)" and "Hold the refund number N already" agree with AC 39 (`after_n`: N go through, the next waits; `at_n`: the Nth waits, N-1 go through). The examples for 3 (first 3 go through and the 4th waits; first 2 go through and the 3rd waits) match the truth table (`count < budget`, budget N or N-1). The labels carry no ordinal; only the examples do.

**Applied to the story (en and pt-BR), no new AC, numbering unchanged:**
- AC 27: an `at_n` save with a limit of 1 asks for confirmation.
- AC 35: the panel renders the policy block only when `enforcementActive` is true (missing means hidden); no read-only look; evidence: component test.
- AC 37: the `reentry_cap` cause cannot show before P7.
- AC 39: new evidence item 4 (radio texts, dialog behavior and its non-triggers, `K39-02`).
- Packages: P5b notes the block hidden until `enforcementActive`; P7 carries the dialog. No gate or order changed.
- The UX plan and the `@qa` plan already follow these decisions; nothing in the story or here still says "no dialog" or "read-only before P7".

| # | Point | Score | Note |
|---|---|---|---|
| 1-2 | Title, description | 1.0 | Unchanged. |
| 3 | Testable ACs | 0.9 | 41 ACs; the dialog has literal triggers and non-triggers (`K39-02`); the hidden block has a component test (`K39-05`). |
| 4 | Scope IN/OUT | 0.9 | The dialog is client-only; the server contract is unchanged (design 3.16 E). |
| 5 | Dependencies | 0.8 | Unchanged: `@data-engineer` opinion on M2a/M3/M3a. The UX score (9.1) and the `@qa` plan already cover the dialog. |
| 6 | Complexity | 1.0 | 19, COMPLEX; no change. |
| 7 | Business value | 0.9 | A deliberate act for a choice that holds every automatic refund (owner). |
| 8 | Risks | 0.8 | The owner accepts that the settings cannot be previewed before enforcement exists. |
| 9 | Definition of Done | 0.9 | ACs 1-41. |
| 10 | Alignment with sources | 0.9 | Traces to the owner decisions of 2026-11-15 and to design v2.8. |

**Checklist of 10 points:** all pass (>= 7 required; total 9.1).

**Pending:** `@data-engineer` (M2a/M3/M3a, trigger and `INCLUDE` questions); the `@devops` items of earlier passes and the registration of FT-90.
