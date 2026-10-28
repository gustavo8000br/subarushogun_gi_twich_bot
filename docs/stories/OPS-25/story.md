# OPS-25 — Validate the account widget in the Next panel overlay (replaces the OPS-13 / #57 bug validation)

[Português (pt-BR)](../../pt-BR/stories/OPS-25/story.md)

**Status:** Draft (drafted by `@sm` on 2026-10-27; not yet validated by `@po`). **Issue:** pending (`@devops` creates it when the story is ready; issue [#57](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/57) stays open until then; no issue comments).
**Source:** owner observation of 2026-10-27: the account-widget reload bug that happened in the OBS overlay of the vanilla panel (issue #57, story [OPS-13](../OPS-13/story.md)) **seems not to happen** in the overlay of the Next panel; owner decision: do **not** close #57, validate the behavior in the Next overlay first; the board card of OPS-13/#57 was moved to "Rascunho" by the owner.
**Related:** OPS-13 (the original bug and its Linux OBS 32.2.2 evidence); OPS-15 (Next overlay; cutover wave 3 / FT-39 removes the vanilla overlay); OPS-18 (Current Account as the single player identity overlay); OPS-11 (account ownership, also referenced by #57); handoffs for other platforms: [Windows](../../handoffs/windows-session-handoff.md), [macOS](../../handoffs/macos-session-handoff.md), [Next overlay continuation](../../handoffs/next-overlay-continuation.md).
**Coordination required:** `$aiox-po` (validation), independent `$aiox-qa` (executes the validation), `$aiox-ux-design-expert` (reviews the experience and accessibility of the widget states, score >= 9.0 on the reviewed scope), `$aiox-devops` (issue). No `$aiox-dev` work is planned: this story validates; a defect found becomes its own bug story.

## Problem

Issue #57 was reopened after the owner saw a black screen in native OBS after reloading the Browser Source of the account widget (commit `e25836c`, vanilla overlay). The Linux OBS 32.2.2 run passed (CEF 127), so the owner environment was never proven. Since then the OBS overlay moved to the Next panel (OPS-15) and the vanilla overlay is being removed (cutover wave 3, FT-39). After that removal the original failing scenario can no longer be reproduced on the vanilla overlay; the only reproducible target is the Next overlay. The bug appears not to occur there, but "appears" is not evidence: nothing recorded proves that the Next overlay keeps the account label after a Browser Source reload, without expiry, and across account changes.

## Owner decisions (2026-10-27)

1. #57 is **not** closed now; this validation story replaces the validation of the OPS-13 bug and is the condition to close it.
2. The story starts only after the **complete migration of the panel** (OPS-15, ST-01) and after the **drastic reduction of the board tasks**; the owner expects it to be done probably only after both.
3. `@qa` executes; `@ux-design-expert` reviews the experience and accessibility with a score of at least 9.0 on the reviewed scope.

## Story

As a streamer who shows the current account in OBS,
I want proof that the account widget of the Next overlay survives a Browser Source reload, never expires by itself and follows account changes made from chat or from the panel,
so that I can trust the overlay on stream and issue #57 can be closed with evidence instead of an impression.

## Scope

**In:**

- Reproduce, on the Next overlay, the scenario that failed on the vanilla overlay: reload the Browser Source in OBS and check the account label.
- Check absence of expiry, account change by chat (`!fila conta`) and by the panel, widget revocation, and the safe state shown when the widget is not authorized.
- Run on native OBS on Linux (record OBS and CEF versions); Windows and macOS later, from the platform handoffs.
- `@ux-design-expert` review of the widget states (loading, authorized label, unauthorized) for readability and accessibility.

**Out:**

- Any code change to the overlay or the widget (a defect found here becomes a separate bug story; no fix is mixed into this validation).
- Re-running the vanilla overlay (removed in FT-39; the original failure stays recorded as historical evidence on `e25836c`).
- OBS plugins, scene design or any new widget feature.
- Closing #57 (only `@devops`, only with the owner's explicit OK after the verdict).

## Acceptance criteria

Evidence classes are recorded separately: automated browser (fixtures), native OBS/CEF, and per-platform. Nothing about a platform is claimed before it runs.

1. **Given** the Next overlay with the account widget link added as an OBS Browser Source on native OBS (Linux), **when** the source is reloaded (refresh button and "refresh cache of the current page"), **then** the Current Account label is shown again, with no black screen and no authorization error. The measured time to show the label is recorded (a target of up to 5 s is proposed; `@qa` confirms it against the first load).
2. **Given** the same source, **when** it is reloaded 10 times in a row, **then** every reload shows the label.
3. **Given** the widget link issued before, **when** the panel session has expired and after the API restarts, **then** a reload still shows the label: the widget does not expire by itself and stops working only when the operator revokes it.
4. **Given** the label is on screen, **when** the current account changes through the chat command `!fila conta`, **then** the label shows the new account without reloading, within the overlay refresh cadence documented in OPS-15 (5 s cache); the observed delay is recorded.
5. **Given** the label is on screen, **when** the current account changes in the panel, **then** the same result as AC 4 holds.
6. **Given** the operator revokes the widget, **when** the source is reloaded, **then** the overlay shows the safe unauthorized state (no account label, no internals) and a new link works after re-issue.
7. **Given** the widget is loading, authorized and unauthorized, **when** `@ux-design-expert` reviews these states, **then** the label is legible over a transparent and over a dark background, the unauthorized state is understandable without technical text, and the score is at least 9.0 on the reviewed scope. The record states what the review covers (static review versus visual, browser and assistive-technology validation).
8. **Given** the evidence of AC 1-6 on Linux, **then** OBS and CEF versions, date, commit and the Next overlay URL type (capability link, no secret in the record) are written in this story, in English and pt-BR.
9. **Given** sessions on Windows and macOS become available (handoffs above), **when** AC 1-6 run there, **then** each platform result is recorded separately; until then those rows stay "pending platform" and are never inferred from Linux.
10. **Given** all ACs pass, **then** `@qa` issues a verdict and the owner decides on closing #57 (`@devops` closes it and edits the main body of the issue). **Given** any AC fails, **then** a bug story is created, OPS-13 is reconsidered, and #57 stays open.

## Dependencies

- **Depends on:** ST-01 (complete OPS-15 migration, including cutover wave 3 / FT-39 and the Next overlay as the only overlay); the drastic reduction of the board tasks (owner decision; probably only after); OPS-18 (account projection) in a released state; a native OBS on the test machine; the platform handoffs for AC 9.
- **Blocks:** closing issue #57 and the final status of OPS-13.

## Risks

- **Fixture or browser pass mistaken for OBS evidence:** CEF behavior differs from Chromium. Mitigation: AC 1-6 require native OBS; browser runs are a separate class.
- **Linux is not the owner environment:** the original failure was seen on the owner machine. Mitigation: AC 9 and a pending-platform row; do not close #57 on Linux evidence alone (consistent with the earlier decision).
- **Removed baseline:** after FT-39 the failing scenario cannot be re-run. Mitigation: keep the `e25836c` record as the historical baseline and compare behavior, not code.
- **Long wait:** the story depends on a large migration; the bug may be forgotten. Mitigation: the card exists on the board (Bloqueado by ST-01) and #57 stays open.

## Complexity (estimate by `@sm`)

Scope 2, integration 2, infrastructure 1, knowledge 2, risk 2 = **9 → STANDARD**. Difficulty **M** (several sittings with native OBS and one UX review), priority **P2**.

## Business value

Closes a long-open issue with evidence, protects the on-stream overlay and removes the doubt left by moving the overlay from the vanilla to the Next panel.

## Test plan

1. **Browser (Chromium, fixtures, no Twitch):** overlay states and account-change projection, as supporting evidence only.
2. **Native OBS/CEF (Linux now; Windows and macOS later):** AC 1-6 executed by `@qa` with the owner's authorization for any live step; versions recorded.
3. **UX review:** `@ux-design-expert` on AC 7.
4. **Gates before closing:** the documentation gates required by the project for a documentation-only change (`npm run validate:version`, `npm run review:static`); `@qa` issues the verdict.

## Planning gates before implementation

- [ ] `@po` validation (10 points) and GO.
- [ ] `@devops` creates the GitHub issue when the story is ready (#57 stays open until then).
- [ ] `@ux-design-expert` review plan for the widget states, score >= 9.0 on the reviewed scope.
- [ ] `@qa` execution plan for native OBS (Linux now; Windows and macOS when sessions exist).
- [ ] ST-01 done and the board task reduction done (owner dependency).

## UX note

The widget has no new design here. The review covers the existing states only. A change to the widget text or layout found necessary becomes a separate story with its own UX plan (>= 9.0).

## Definition of Done

- AC 1-8 and 10 have recorded evidence by class; AC 9 rows are executed or explicitly marked "pending platform" with the owner's acceptance.
- `@qa` verdict recorded; File List and checklists updated in English and pt-BR; the owner decision on #57 recorded.

## SM draft validation (story-draft-checklist, 2026-10-27)

1. Goal and context: clear (bug history, why a validation story). PASS.
2. Technical guidance: no code change; platforms, tools and handoffs named. PASS.
3. References: OPS-13, #57, handoffs and the commit of the original failure. PASS.
4. Self-containment: baseline, assumptions and the removed-baseline risk stated. PASS.
5. Testing: evidence classes separated; native OBS required. PASS.
6. Static analysis: documentation-only story; `npm run review:static` listed in the gates. PASS.
- Result: ready for `@po`. The 5 s target of AC 1 and the refresh cadence of AC 4 are proposals marked as such; no other requirement was invented.

## File List

- `docs/stories/OPS-25/story.md` (new)
- `docs/pt-BR/stories/OPS-25/story.md` (new)
- `docs/stories.md` (index entry)
- `docs/pt-BR/stories.md` (index entry)

## Change Log

- 2026-10-27 — `@sm` (River): story drafted from the owner observation that the OPS-13 / #57 reload bug seems not to occur on the Next overlay. Status Draft. Issue pending.
