# OPS-22 — `@po` validation (`*validate-story-draft`, 10 points)

[Português (pt-BR)](../../pt-BR/stories/OPS-22/po-validation.md)

**Validator:** `@po` (Pax) — **Date:** 2026-10-27 — **Mode:** YOLO (autonomous; decisions marked `[AUTO-DECISION]`)
**Story:** [story.md](story.md) — **Issue:** #80 (parent); slice 1 FT-24 = #82; FT-25/FT-26 issues just-in-time.
**Sources checked:** `.claude/rules/story-lifecycle.md` (10 points), `.aiox-core/development/tasks/validate-next-story.md`, [redemption-sync-research.md](../OPS-15/redemption-sync-research.md), [panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md) sections 5-7, [live-battery results](../OPS-15/live-battery-2026-10-26-results.md), `docs/process/backlog-inventory.md` (FT-24..FT-26, OW-16). `architecture-decisions.md` and `data-review.md` were being written by other agents during this validation and were not used as inputs.

## Verdict

**GO — 9.5/10.** Status: **Ready** (GO + issue #80). Ready means "validated for planning"; implementation of each slice still follows the slice gates below.

## Scores

| # | Point | Score | Evidence / note |
|---|---|---|---|
| 1 | Clear, objective title | 1.0 | Names both outcomes (recover `unknown`, safe queue deletion). |
| 2 | Complete description | 1.0 | D-5/D-6 evidence, VERIFIED root cause (~90%), collateral defects, terminal `unknown`, deletion block. |
| 3 | Testable ACs | 1.0 | 19 Given/When/Then ACs, evidence class per AC, Red-first, PostgreSQL assertions (AC 9, 17). |
| 4 | Scope IN/OUT | 1.0 | Three slices; OUT excludes FT-23 navigation, OPS-20 refund rules, periodic loop, dev DB migration. |
| 5 | Dependencies | 1.0 | `@data-engineer` (AC 12), OPS-21 contract (AC 18), OW-16, write-set clash with OPS-21 slices 4-5. |
| 6 | Complexity | 1.0 | 19 → COMPLEX/GG, per-slice sizes; `@architect` confirms. |
| 7 | Business value | 1.0 | Viewers' points settled; cutover blocker removed. |
| 8 | Risks | 1.0 | Double financial action, charging without service, 90% confidence, test blindness. |
| 9 | Definition of Done | 1.0 | ACs 1-18 by class; AC 19 executed or owner-waived; "no `unknown` becomes confirmation". |
| 10 | Alignment with sources/owner decisions | 0.5 | Matches owner decisions (6 attempts, manual resolution, deletion states for FT-23). Deduction: AC 13 edge case below and the UX rule question (point 2 of the `@sm` list) were left open. |

## Decisions on the `@sm` points

1. **UX review of new visible text (`@sm` point 2).** The owner exempted OPS-22 from the mandatory 9.0 gate, but the project rule (AGENTS.md / CLAUDE.md, "UX e pesquisa") requires a plan and review for any change that affects users. `[AUTO-DECISION]` Recommendation → **no separate UX gate for OPS-22; the new visible strings and states of FT-25/FT-26 ("deletion pending", "deletion blocked: N operations need review", the Operations blocking count and the manual-resolution wording) are added to the scope of the FT-23 `@ux-design-expert` plan (score ≥ 9.0) and must be approved there before the UI part of FT-25/FT-26 ships** (reason: same screens and same outcome channel as FT-23; one review, no new gate; the architect review already listed "UX for manual path" for S-F). FT-24 has no visible text (logs only) and is not affected. **Owner decision pending** (confirm or waive explicitly).
2. **"Cancel deletion" (`@sm` point 3, open question 1).** `[AUTO-DECISION]` → **OUT of OPS-22** (reason: not in the owner decisions; it adds a reverse transition — un-pause the reward, restore the queue — with its own financial edge cases; retry-now plus audited manual resolution already guarantee a way out). If the owner wants it, `@sm` adds a backlog item linked to OPS-22; no story change now.
3. **Cancel (refund), not fulfill, open redemptions on deletion (`@sm` point 4, AC 13).** **Validated.** It is what the panel dialog promises, what the live run expected, and the documented Delete Custom Reward behavior (implicit FULFILLED) would keep viewers' points without service. **Required clarification before FT-26 starts (not blocking FT-24/FT-25):** AC 13 must say that "open redemption" means `UNFULFILLED` **with no financial task in flight**; a redemption whose `redemption.fulfill` (service already started) is pending, retrying or `unknown` is governed by AC 14 (blocks deletion) and is **never** cancelled by the deletion flow, so a served viewer is not refunded by mistake. `@sm` adds this sentence to AC 13 (en and pt-BR); `@architect` confirms it in the state machine.
4. **Retry count (open question 2).** "6 attempts in total, including the first" is consistent with the owner decision; `@architect` fixes the wait values (cap 1 h).
5. **Done vs live evidence (open question 3).** `[AUTO-DECISION]` → **Done on PostgreSQL and real-class evidence; AC 19 is a separate owner acceptance recorded in the story** (reason: OW-16 depends on the owner's account and schedule; DoD already allows an explicit waiver).

## Slice readiness

| Slice | Issue | Can go to `@dev` now? | Remaining gates |
|---|---|---|---|
| FT-24 (slice 1, ACs 1-5) | #82 | **YES** — P0, owner order "financial recovery first" | None besides Red-first and `@qa`. Write set: `twitch/helix-adapter`, `twitch/reconciliation`, the shared error-classification function used by the workers. Do not run in parallel with another `@dev` on the same files. |
| FT-25 (slice 2, ACs 6-12) | to create (just-in-time) | NO | `@architect` wait values/state names; `@data-engineer` AC 12 answer; UX copy via FT-23 plan (owner decision above); issue. |
| FT-26 (slice 3, ACs 13-18) | to create (just-in-time) | NO | FT-25 merged; AC 13 clarification; OPS-21 idempotency contract; issue. |

## Required corrections

1. (Before FT-26) AC 13: add the "no financial task in flight" clarification above — `@sm`, en and pt-BR.
2. (Bookkeeping) The planning-gate box "`@po` validation (10 points) and GO" and "`@devops` creates the GitHub issue" can be ticked by `@sm` (this validation was limited to the Status and Change Log fields).
3. (Bookkeeping) Inventory and board: FT-24 issue #82, OPS-22 parent #80; FT-24 card from "Blocked / Planning @po" to "Ready / Implementation @dev" — `@sm` (inventory) and `@devops` (board).

## Owner decisions (status updated 2026-10-27, see the addendum below)

- **OD-22-1 — DECIDED (owner, 2026-10-27):** the new visible text of OPS-22 joins the FT-23 UX plan (score ≥ 9.0), no gate of its own. Matches the recommendation.
- **OD-22-2 — DECIDED (owner, 2026-10-27):** "cancel deletion" is **IN** OPS-22 as slice FT-36. Overrules the `@po` recommendation (decision 2 above is superseded).
- **OD-22-3 — DECIDED (owner, 2026-10-27):** OPS-22 may reach Done without live evidence; AC 19 is a separate owner acceptance. Matches the recommendation. *(Was PENDING until 2026-10-27.)*
- **OW-16 — AUTHORIZED (owner, 2026-10-27):** the live check is authorized; it runs as an automated live validation after FT-25 and FT-26 are delivered (not scheduled yet). *(Was PENDING until 2026-10-27.)*

## Annex — OPS-15 slices FT-21 and FT-22 (validated in the same session)

These slices belong to OPS-15, not to OPS-22; they are recorded here only because this validation was limited to the OPS-22/23/24 files. Their ACs live today in the inventory row and the architect review, section 4 — **not in the OPS-15 story**.

| Slice | Issue | Verdict | Can go to `@dev` now? | What `@sm` must add |
|---|---|---|---|---|
| FT-21 (D-1, `!<queue> limpar CONFIRMAR`) | #89 | **GO** — testable, XS, no DB/UX gate | **YES** | An "FT-21" slice section in OPS-15 (en and pt-BR) with: (1) Given `limpar`/`clear` followed by the localized confirm label in any case or accent (`CONFIRMAR`, `Confirmar`, `confirmár`, `en` `confirm`), when handled, then `clearConfirmation.confirm` is called exactly once; (2) lowercase keeps working; (3) any other word stays `INVALID_SYNTAX` and nothing is cleared; (4) the handler uses the parser's result (`confirm: true` or `args.length === 1`), never a literal compare; Red tests for parser and handler; source LB-35. |
| FT-22 (D-2, `(posição ?)`) | #90 | **GO, conditional** | **YES, after the `@data-engineer` written confirmation** that `outbox.payload` JSON holds `{ previousPosition }` with no DDL (the architect expects none) | An "FT-22" slice section in OPS-15 with: (1) calling a waiting entry at position N from the panel or from chat stores `{ previousPosition: N }` in the outbox payload and the notice shows `posição N` (LB-29 expected `1`); (2) the worker reads the claimed task value, not `entry.callPosition`; (3) a legacy row with `payload: {}` falls back to the audit `previousPosition`; (4) evidence: worker unit test plus PostgreSQL integration with real migrations. |

Write-set note: FT-21 and FT-22 both touch `commands/chat-handler.mjs` (lines 266 and 207-208) — serialize them (FT-21 first, it is smaller) or give both to one `@dev`. FT-24 shares no file with FT-21; it may run in parallel with FT-21. Inventory still shows #69 for both: `@sm` updates to #89 and #90.

## Final status

Draft → **Ready** (GO 9.5/10, issue #80). Recorded in the story Change Log (en and pt-BR).

## Addendum 2026-10-27 — re-validation of the widened scope ("cancel deletion", FT-36)

**Validator:** `@po` (Pax), YOLO. **Inputs:** owner decisions of 2026-10-27 relayed by `@aiox-master` (also in `docs/session-handoff.md`), [sm-pending-edits.md](sm-pending-edits.md) E16, the FT-36 inventory row, [architecture-decisions.md](architecture-decisions.md) and [data-review.md](data-review.md) (both written for the earlier scope; neither covers the reverse transition). The story text itself is being edited by `@sm` (E1-E17) and was not changed by `@po`.

**Counts check:** this file contains no backlog or board count, so there was nothing stale to correct. Reference for other documents: inventory **93 items**, board **95 cards** (figures relayed by `@aiox-master` on 2026-10-27; owned by `@sm`/`@devops`).

**The 9.5/10 applies only to the earlier scope (slices FT-24..FT-26).** For the widened scope the verdict is **provisional GO — 7.5/10** (status stays **Ready**; the readiness of FT-24..FT-26 is unchanged):

| # | Point | Provisional | Reason for the deduction |
|---|---|---|---|
| 1, 2, 7 | Title, description, value | 1.0 each | Unchanged. |
| 3 | Testable ACs | 0.5 | The FT-36 AC exists only as a proposal (E16), not yet in the story; the race with an in-flight `reward.delete` is not specified. |
| 4 | Scope IN/OUT | 0.5 | Until E16 lands, the story still lists "cancel deletion" as an open question / out of scope. |
| 5 | Dependencies | 1.0 | FT-26 first (same files, deletion states); OPS-21 contract; `@architect`, `@data-engineer`, FT-23 UX plan named. |
| 6 | Complexity | 0.5 | 19 COMPLEX was scored for three slices; `@architect` must re-score with a fourth slice. |
| 8 | Risks | 0.5 | Reverse-transition risks (reopening a reward Twitch already deleted, a refund being "undone", a pause revert that cannot be verified) are not yet in the Risks section. |
| 9 | Definition of Done | 0.5 | DoD does not yet name FT-36 evidence (PostgreSQL per state: pending, blocked, in-flight `reward.delete`, deleted). |
| 10 | Alignment with owner decisions | 1.0 | OD-22-1 and OD-22-2 are now decided and reflected. |

**E16 AC text (owned by `@po`): accepted as the base**, with two required additions for `@sm` to include when applying E16 (en and pt-BR): (a) **Given** a `reward.delete` that is claimed, in flight, `retry` or `unknown`, **when** the operator asks to cancel, **then** the cancel is refused with an enumerated `code` (or waits for a positive remote read) and the queue is never reopened while the reward's existence on Twitch is unproven; (b) **Given** the pause revert cannot be verified by a read, **then** the queue stays in a visible blocked state with an operator action, never reopened as if the reward were active. `@architect` may refine the mechanism; the "no assumption without a positive read" rule is not negotiable.

**Before FT-36 can go to `@dev` (and before `@po` issues a final score for the widened scope):**

1. `@architect` — design the reverse transition (`deleting` → reopened), the race with an in-flight `reward.delete`/DELETE call, what happens to cancel tasks already `confirmed`/`pending`, the enumerated `code` values, and re-score OPS-22 complexity.
2. `@data-engineer` — transitions and the PostgreSQL test plan for each state; confirm "no DDL" (expected) in writing; check lease-guarded cancellation of pending `reward.delete`/pause tasks and that canceled redemptions never come back.
3. `@ux-design-expert` — the "cancel deletion" action, its refusal/blocked messages and confirmation go into the FT-23 plan (≥ 9.0) per OD-22-1.
4. `@sm` — apply E16 with additions (a) and (b), update Scope, Complexity ("to re-evaluate"), Risks and DoD.
5. `@devops` — FT-36 issue just-in-time (sub-issue of #80; body only, no comments).
6. `@qa` — test plan for FT-36.

**Slice readiness, updated:** FT-24 (#82) **delivered** test-first and committed locally (`@qa` CONCERNS 8.6 code / 8.4 docs, no blockers, [qa-gate-2026-10-27.md](qa-gate-2026-10-27.md); no push). FT-25 and FT-26 unchanged (gates in the table above; FT-25 includes the `reward-worker.mjs:316` 404 fix from QA finding C-1 per the handoff). **FT-36: NOT READY** (items 1-6 above). The OPS-15 annex slices FT-21 and FT-22 are ordered by the owner: FT-21 then FT-22 in sequence (same file). Note for `@dev`: with FT-24 delivered, the `Ready → InProgress` transition belongs in the OPS-22 Change Log (owner of that edit: `@dev`/`@sm`, not this validation).

## Addendum 2026-10-28 — owner decisions of 2026-10-27 recorded (`@po`, Pax)

**Resolved (owner, 2026-10-27, relayed by `@aiox-master`):**

- **OD-22-3 — RESOLVED:** OPS-22 may reach Done without live evidence; AC 19 becomes a separate owner acceptance.
- **OW-16 — RESOLVED (authorized):** the live check is authorized and will run as an automated live validation after FT-25 and FT-26 are delivered.

**Still pending (unchanged by these decisions):**

- **Re-validation of the widened scope ("cancel deletion", FT-36): PENDING.** The story text now carries AC 21 with additions (a) and (b), the reverse-transition risk, the "to re-evaluate" complexity and AC 21 in the test plan, so points 3, 4 and 8 of the provisional table are expected to rise; `@po` does **not** issue the final score yet because the `@architect` re-review and complexity re-score, the `@data-engineer` re-review and the `@qa` test plan for FT-36 are still open (planning-gate boxes still unticked). **FT-36: NOT READY.** The provisional GO 7.5/10 stays in force for the widened scope; the 9.5/10 still applies to FT-24..FT-26.
- **Required edit for `@sm` (story owner), en and pt-BR:** the "Definition of Done" still says "AC 19 is either executed with the owner or explicitly waived by the owner". Align it with OD-22-3: Done does not require AC 19; AC 19 is recorded as a separate owner acceptance (automated live run after FT-25/FT-26, OW-16). `@po` did not edit the story (write set of this session).

No status change (OPS-22 stays **Ready**; FT-24 delivered).
