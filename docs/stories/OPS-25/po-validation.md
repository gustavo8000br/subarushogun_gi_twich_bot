# OPS-25 — `@po` validation (`*validate-story-draft`, 10 points)

[Português (pt-BR)](../../pt-BR/stories/OPS-25/po-validation.md)

**Validator:** `@po` (Pax) — **Date:** 2026-10-28 — **Mode:** YOLO (autonomous; decisions marked `[AUTO-DECISION]`)
**Story:** [story.md](story.md) (en) and [pt-BR](../../pt-BR/stories/OPS-25/story.md), as drafted by `@sm` on 2026-10-27 (complete: every section present, Change Log and `@sm` draft check included). **Issue:** pending (#57 stays open).
**Sources checked:** `.claude/rules/story-lifecycle.md`, `.aiox-core/development/tasks/validate-next-story.md`, [OPS-13 story](../OPS-13/story.md) (status "Ready for Review", native OBS acceptance pending), [OPS-18 story](../OPS-18/story.md) (status In Progress; line 44: the renderer polls `GET /overlay/api/widget` once per second with `cache: no-store`), [OPS-15 story](../OPS-15/story.md) AC 3 (one-second no-cache reads), `apps/api/src/http/overlay-routes.mjs` (`no-store` headers), `apps/api/src/commands/catalog.mjs` (`!fila conta`, `!fila conta <nome>`, `!fila conta reset`), the three platform handoffs (all exist).

## Verdict

**GO — 9.0/10, with one required correction before execution.** Status stays **Draft**: the project rule "Ready = `@po` GO + existing issue" applies and the issue does not exist yet; the story also starts only after ST-01 (complete migration) and the board reduction (owner decision 2). `@po` does **not** mark Ready.

## Scores

| # | Point | Score | Evidence / note |
|---|---|---|---|
| 1 | Clear, objective title | 1.0 | Names the target (Next overlay), the subject (account widget) and what it replaces (OPS-13 / #57 validation). |
| 2 | Complete description | 1.0 | History of #57, why the vanilla scenario can no longer be re-run after FT-39, and why "seems not to occur" is not evidence. |
| 3 | Testable ACs | 0.5 | Ten Given/When/Then ACs with evidence classes and per-platform rows. Deduction: **AC 4 cites "the overlay refresh cadence documented in OPS-15 (5 s cache)"**, which no source supports: OPS-15 AC 3 and OPS-18 line 44 state one-second polling with `no-store`, and the overlay routes send `no-store` (see required correction 1). The 5 s target of AC 1 is a proposal for `@qa` to confirm; acceptable at story level. |
| 4 | Scope IN/OUT | 0.5 | IN/OUT are explicit and "no code change" is the right call. Deduction: the test plan item 1 ("Browser, fixtures") does not say whether it reuses the existing overlay E2E (`tests/e2e/overlay-browser-only.mjs`) or needs new test code; with "no `@dev` work" stated, new test code would be out of scope (should-fix 1). |
| 5 | Dependencies | 1.0 | ST-01, board reduction (owner), OPS-18 released, native OBS, platform handoffs; blocks #57 and OPS-13 final status. |
| 6 | Complexity | 1.0 | 9 → STANDARD, difficulty M, P2. |
| 7 | Business value | 1.0 | Closes #57 with evidence and protects the on-stream overlay. |
| 8 | Risks | 1.0 | Browser vs CEF, Linux vs owner environment, removed baseline, long wait. |
| 9 | Definition of Done | 1.0 | Evidence by class; "pending platform" rows need the owner's acceptance; owner decision on #57 recorded. |
| 10 | Alignment with sources/owner decisions | 1.0 | Matches the owner decisions of 2026-10-27 (do not close #57, `@qa` executes, `@ux-design-expert` ≥ 9.0, after ST-01 and the board reduction) and the earlier "do not close #57 on Linux evidence alone". |

**Template / executor fields:** this project's stories do not use the `executor` / `quality_gate` fields of `story-tmpl.yaml` (same as all validated OPS stories); not a deduction. **Static analysis plan:** `npm run review:static` is listed; documentation-only change; findings block; no automatic edits claimed. **Security:** AC 8 forbids the secret in the record (capability link type only); AC 6 requires the safe unauthorized state without internals. PASS.

## Required correction (owner of the edit: `@sm`, en and pt-BR, before `@qa` executes)

1. **AC 4:** replace "within the overlay refresh cadence documented in OPS-15 (5 s cache)" with the documented cadence: the renderer reads `/overlay/api/widget` once per second with `no-store` (OPS-15 AC 3; OPS-18). `[AUTO-DECISION]` Expected bound → **record the observed delay and expect the label within a few seconds of the change (`@qa` fixes the exact bound in its execution plan, with the 1 s poll as the basis)** (reason: no source gives a 5 s cache; inventing it would make the AC fail or pass for the wrong reason).

## Should-fix (non-blocking)

1. Test plan item 1: say "reuse the existing overlay browser E2E (`tests/e2e/overlay-browser-only.mjs`) as supporting evidence; no new test code in this story". If new test code proves necessary, it becomes a `@dev` task and the "no `@dev` work" sentence changes.
2. AC 1: the "refresh cache of the current page" button label is OBS UI text; record the exact OBS label used per platform in the evidence (the pt-BR OBS label differs).

## Final status

**GO 9.0/10 — Draft kept** (no issue; blocked by ST-01 and the board reduction). Next: `@sm` applies required correction 1; `@devops` creates the issue only when the story is unblocked and ready; then `@po` records the Draft → Ready transition in the story Change Log. `@po` did not edit the story file (write set of this session).
