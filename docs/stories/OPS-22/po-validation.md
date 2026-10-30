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

## Addendum 2026-10-30 — revalidation of the single package (FT-25 + FT-26 + FT-36, with FT-23) (`@po`, Pax)

**Validator:** `@po` (Pax), YOLO; the owner delegated to the Orion every recommendation, and each point below is decided with its reason (`[AUTO-DECISION]`). **Inputs:** [story.md](story.md) (single cycle, owner 2026-10-30), [architecture-decisions.md](architecture-decisions.md), [data-review.md](data-review.md), [backlog-inventory](../../process/backlog-inventory.md) (rows FT-23, FT-25, FT-26, FT-36), [OPS-23 story](../OPS-23/story.md) (FT-28 dependency). The story status stays **Ready** ("validated for planning"); nothing was moved to InProgress or changed in the ACs.

### Verdict

- **Scope and ACs: GO, 8.5/10** (up from the provisional 7.5 for the widened scope). ACs 6-18 and 20-22 are testable and consistent with the owner decisions; AC 21 carries additions (a) and (b); the single-cycle decision is recorded; the `reward-worker.mjs:316` 404 fix is explicit in AC 22 (FT-26). Deductions: complexity not re-scored for the fourth slice (-0.5), open items 1, 2, 4 and 5 unsettled (-0.5), FT-23 has no ACs in a story and no issue of its own (-0.5).
- **Dispatch of `@dev`: NO-GO.** Four planning gates are open (below). The package may start only when every item in the "Required corrections" list is closed, in the order given. Status stays Ready; it is not changed.

### State of each planning gate

| Gate | State | Covers | What is missing / who |
|---|---|---|---|
| `@analyst` research | CLOSED (SUFFICIENT) | root cause, Delete Custom Reward behavior | Nothing. Do not re-research (golden rule). |
| `@architect` | **CLOSED (2026-10-30, [architect-review-ft36.md](architect-review-ft36.md))** — FT-36 re-reviewed (F15-F24, D-36-1..8); open items 1 (`attempts_exhausted`), 2 (`cycleStartAttempts`, fresh cycle of 6, `financial.operation_retry_requested`), 4 (`resolved_manual` not counted) and 5 (keep `twitch_reconciliation_degraded`) decided; complexity 20 COMPLEX (FT-36 M); order FT-25 → FT-26 → FT-36 → FT-23; FT-23 decoupled from FT-28 (D-23-1). Was PARTIAL. | FT-24, FT-25, FT-26 (ARCH §1-§6, F1-F14); FT-36 and the package (architect-review-ft36) | Nothing for `@architect`. Follow-ups handed over in the note: `@po` AC 21/AC 8/AC 20 wording, `@sm` complexity and FT-23 ACs, `@data-engineer` written confirmation (note section 6). |
| `@data-engineer` | **CLOSED (2026-10-30, [ft-36-data-engineer-confirmation.md](ft-36-data-engineer-confirmation.md))** — section 6 of the architect note confirmed (2 CONFIRMADO, 5 CONFIRMADO COM CONDIÇÃO, 0 REFUTADO); **no DDL** for FT-36 or for `payload.cycleStartAttempts`; F18 confirmed (`queue-repository.mjs:1683-1687`) and fixed by reusing the single `reward.delete` row; audit catalogue final (`actorId` on all three cancel events; `financial.operation_retry_requested`); DATA C3 (fresh cycle of 6, 401 refund) and C6 (`resolved_manual` not counted) and DATA test 3 updated in [data-review.md](data-review.md). Was PARTIAL. | FT-24 to FT-26 and FT-36, no migration | Nothing for `@data-engineer`. Conditions handed over: F21 changes two tested fixtures (`qra-postgres-fixtures.test.js:457-528`) and makes cancel stricter for existing rows (`@po`/`@architect` to acknowledge); tests T36-9b, T36-14, T36-15, T-C3 and an `EXPLAIN` record added for `@qa`. |
| `@ux-design-expert` | OPEN | none | No shared FT-23 + FT-36 plan exists yet. One plan, score >= 9.0, covering: navigation and persistent `role="status"` after create/delete (D-3/D-4), "deletion pending/blocked: N operations", the Operations blocking count, the manual-resolution wording, the destructive confirmation and refusal/blocked messages of "cancel deletion", and the texts of FT-25. Distinguish static review from browser/assistive-technology validation. |
| `@qa` test plan | OPEN | none | Plan with test classes kept separate: unit with real Twurple instances, isolated PostgreSQL with real migrations (the 12 tests of DATA §4, deletion order per redemption state, cancel deletion per state: pending, blocked, in-flight `reward.delete`, deleted), browser-only E2E with fixtures (after approved text), and the list of groups for the single `@qa` gate of the bundle. |
| GitHub issues | CLOSED for FT-25/26/36 (#98, #99, #100); **OPEN for FT-23** | — | FT-23 only references #69 (OPS-15 parent). Precedent (FT-21 = #89, FT-22 = #90, FT-24 = #82): each slice has its own sub-issue. `@devops` creates the FT-23 issue (body only, no comments) before implementation. |
| Owner (OW-16 live check) | AUTHORIZED, not scheduled | AC 19 | Not a blocker for Done (OD-22-3). |

### Required corrections (mandatory, by agent)

1. `@ux-design-expert`: single FT-23 + FT-36 plan, >= 9.0, recorded in the OPS-15 story (FT-23) and linked from OPS-22. Without it the UI parts do not start; `@architect`/`@data-engineer`/`@dev` work on the API and worker parts may be planned meanwhile.
2. `@architect`: FT-36 re-review plus the re-score of complexity, recorded in `architecture-decisions.md` (en and pt-BR); decide open items 1, 2 (mechanism), 4 and 5. `@po` recommendation for item 5 (not a decision of this validation): keep the delivered `twitch_reconciliation_degraded` line (codes and counts, already QA-verified) unless the architect shows a gap in AC 5; for item 4: `resolved_manual` does not count in `blockingOperations` once the post-resolution re-list is the guard.
3. `@data-engineer`: FT-36 written confirmation (no DDL expected), DATA C3 update, audit catalogue names for items 1-2.
4. `@qa`: test plan of the whole package (classes separated, groups listed), recorded as a file in the story folder.
5. `@devops`: issue for FT-23 (sub-issue of #69), and the bodies of #98, #99, #100 citing the single cycle (already the plan).
6. `@architect` (ordering, blocking): the inventory says FT-23 depends on **FT-28** (shared provider, OPS-23) and on FT-26. FT-28 is not in this package, so "FT-23 in the same cycle" cannot be fully true until FT-28 lands. Decide: either FT-28 goes first, or the cycle delivers FT-25/26/36 (API, worker, Operations) and FT-23 follows right after FT-28 in the same `@qa` window. Until the architect decides, treat FT-23 as "travels with the package, gated by FT-28".
7. `@sm` (bookkeeping, no AC change): add the FT-23 ACs to a story (today they live only in the inventory row, as for FT-21/FT-22); correct the inventory rows FT-25/FT-26/FT-36 whose "issue" column still says "issue to create" (#98, #99, #100); tick the gates above only when closed. `@po` re-validation box stays unticked until items 1-4 and 6 are closed; then `@po` issues the final score in a short addendum.

## Addendum 2026-10-30 — other decisions requested in the same order (`@po`, Pax)

1. **FT-07 (#87) is satisfied by FT-40 (#96): FOLD, confirmed.** Evidence (classes kept apart): runtime/integration class, `tests/integration/compose-runtime.test.js:464` ("discovers complete community catalogs after image build without restarting the API") runs on a disposable image built from the working tree: the catalogs of the host-managed community directory are added after the build, the API is not restarted, the `de` locale appears for panel, setup, chat (including a plural key) and overlay, the locale switches, and the overlay projection refreshes inside the 5 s cache window. Result 7/7 in `cutover-wave-2.md` (80.3 s) and 7/7 in [qa-gate-2026-10-30.md](../OPS-15/qa-gate-2026-10-30.md) (71 s, wave 2 commit `ec12ae0`; `@qa` CONCERNS 9.3). The unit-level pieces of the FT-07 text (invalid files, duplicate keys) are covered by unit tests (`localization-catalog.test.js`, `localization-byte-catalog.test.js`), not by Compose, and are not claimed as runtime proof. Limits: Linux/Docker only; no native OBS/CEF, Windows or macOS. Reason: the FT-07 AC is "runtime proof of a catalog installed after the build", and that is exactly this test; keeping it separate would duplicate the same evidence. Next: `@devops` edits the bodies of #85 and #87 to cite #96 and closes nothing; **closing #85/#87 needs the owner's OK** after the merge.
2. **FT-44 (read timeout and `AbortSignal`): enters OPS-23 as an acceptance criterion of slice 3 (FT-29, the polling fallback), delivered in the FT-28 + FT-29 cycle; no story of its own.** Reason: the fallback is not "bounded" without a read timeout, both touch the same client (`lib/api/client.mjs`, `loadPanelSnapshot`), it is low-to-medium severity, and a new story would add a full gate cycle for one function. Outline for `@sm` to write (en and pt-BR, `@po` approves the text): *Given* the API accepts the connection and never answers, *when* the panel reads a snapshot or polls, *then* each read ends at a bounded timeout through `AbortSignal` and the panel shows a safe, local, retryable state instead of an endless loading message; *Given* a mutation, *then* the timeout never turns it into a failure or a blind retry (the uncertain-outcome path of OPS-21 stays); *Given* one of the five snapshot reads times out, *then* `loadPanelSnapshot` does not wait without bound for the others. `@architect` fixes the timeout value and fallback policy; `@ux-design-expert` (>= 9.0) only if visible text changes (it does: the retryable state text goes into the OPS-23 UX plan). OPS-23 status and existing ACs stay as they are until `@sm` applies the AC.
3. **TS-17 (CI job for the 12 `*-browser-only` scripts): scope draft APPROVED.** Scope: every `*-browser-only` script runs in a CI workflow, a red result fails the build, the workflow-contract test pins the job, and it is stable over repeated runs (the harness defect M-2 was fixed in `8bb05d8`). Conditions: own story drafted by `@sm`; `@architect` decides the job shape, Chrome in CI and the run time (about 10 s each); no secrets and no Twitch; the workflow file is reviewed and published by `@devops` (CI/CD authority); `actionlint` stays green; a flaky script is investigated, never retried until green; going through `@qa`. Reason: M-2 stayed broken in 4 of 4 runs with no alert, so the missing alert is the defect.
4. **OPS-14 (#65): RECREATE the story from the issue body, no invention.** Reason: the owner offered "locate or recreate"; the file is not in this checkout, on `main` or on the remote (inventory and handoff), the issue body already carries the ACs and the source of truth is the issue plus the roadmap, and without the file a Ready status is impossible (no story, no GO). What `@sm` must write (en and pt-BR, `docs/stories/OPS-14/story.md`, status Draft; `@po` validates afterwards; then the OPS-16 absorption of ST-08): (a) default call message for manual and channel-point queues created without a custom message, in the configured language, interpolating `queue.slug` and the right subcommand (`!<slug> presente` in pt-BR/es, `!<slug> present` in en); (b) call renders the viewer login and the executable slug in the three languages and custom texts keep working and prevail; (c) starting service from the panel/API and from the authorized chat command creates exactly one localized announcement, with no announcement for failures, no-ops or repetitions; (d) the announcement uses the existing durable chat flow, Twitch failure stays recoverable and is not shown as confirmed delivery; (e) regression tests, catalogs, validators and documentation equivalent in en, es and pt-BR; (f) relation to OPS-15 (#69): the panel rendering may come from the new UI, the chat behavior and the criteria stay here; (g) the five variables of ST-08/OPS-16 (`{user}`, `{queue}`, `{position}`, `{uid}`, `{account}`) as a folded UI item; (h) status/sequence: after the OPS-13 native OBS acceptance, beta, no version bump for planning; parent #94. The inventory rows CH-1, CH-3, CH-4 and CH-7 of [flow-and-chat-review](../OPS-15/flow-and-chat-review.md) are the evidence for the Problem section. The issue body links to `docs/stories/OPS-14/story.md` on `main`; once the file is committed, `@devops` checks that link (body edit only). Do not wait for a worktree that cannot be reached.
5. **HD-02: moved to done as Superseded** (en `docs/human_decisions/done/`, pt-BR `docs/decisoes_humanas/concluidas/`), top note and status updated to the real state (Wave 3 commit `906fd5c`, `@qa` CONCERNS 9.0, PR #101), both OPS-15 decision indexes, the OPS-15 story file list, the overlay continuation handoffs and the session handoff note updated. Historical Change Log lines that cite the old path stay as the record.

## Addendum 2026-10-30 (c) — Orion decision on cancel with a possibly-sent DELETE, FT-23/FT-28 decoupling and re-score (`@po`, Pax)

**Decisão do Orion 2026-10-30 (Orion decision 2026-10-30).** [AUTO-DECISION] Cancel with `requestMayHaveReachedTwitch` true → **allowed** when a read-only `cancel_verification` read proves the exact reward exists and is paused; refused with `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` only when the read is inconclusive or negative after a DELETE attempt (reason: the `cancel_verification` mechanism exists for this; the residual risk is a late DELETE after the read, covered because the reward stays paused and the open action re-reads and fails safely, never reopening a queue without its reward; the existing fixtures `tests/integration/qra-postgres-fixtures.test.js` ~:457-488 and ~:497-528 stay valid). This **supersedes finding F21 and D-36-6** of [architect-review-ft36.md](architect-review-ft36.md) and the F21 condition of [ft-36-data-engineer-confirmation.md](ft-36-data-engineer-confirmation.md) at that point only. Origin: pending item P-1 of [qa-gate-2026-10-30c.md](../OPS-15/qa-gate-2026-10-30c.md). AC 21 amended in [story.md](story.md); ACs 8 and 20 do not cite refusal or reopening and are unchanged. The codes `QUEUE_DELETION_ALREADY_COMPLETED` and `QUEUE_DELETION_PAUSE_IN_PROGRESS` of D-36-6 stand. Addenda were appended to both notes; their bodies were not rewritten.

**FT-23 decoupled from FT-28 (D-23-1, `@architect`).** Recorded: item 6 of the "Required corrections" is CLOSED. FT-23 travels in this cycle with no shared provider; the inventory dependency FT-23 → FT-28 is soft (FT-28 later swaps the `navigateTo` seam); the live pending → deleted update stays with OPS-23 (FT-28/FT-29).

**Re-score and gates.** `@architect`: CLOSED. `@data-engineer`: CLOSED. `@ux-design-expert`: OPEN. `@qa` test plan: OPEN (it must include T36 "late DELETE after a verified cancel" with the mutation proof). FT-23 has acceptance criteria in the inventory but still no story (`@sm`) and no issue (`@devops`).

- **Scope and ACs: GO, 9.0/10** (was 8.5). Deductions removed: complexity re-scored (20 COMPLEX), open items 1, 2, 4, 5 settled. Remaining: FT-23 has no story file (-0.5), UX plan and `@qa` plan not yet recorded (-0.5).
- **Dispatch of `@dev`: NO-GO while the UX plan and the `@qa` test plan are open.** Status stays Ready.
