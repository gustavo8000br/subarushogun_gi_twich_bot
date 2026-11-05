# OPS-30 — CI job for the browser E2E scripts (`*-browser-only`)

[Português (pt-BR)](../../pt-BR/stories/OPS-30/story.md)

**Status:** Draft (drafted by `@sm` on 2026-11-04; not yet validated by `@po`). **Issue:** [#105](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/105) (created by `@devops` before 2026-11-05 from [improvement-issue-bodies-2026-11-04.md](../../process/improvement-issue-bodies-2026-11-04.md); no issue comments).
**Source:** idea #1 of the [improvement survey](../../process/improvement-ideas-2026-11-04.md) (owner request, 2026-11-04); inventory item **TS-17**, whose own story this is (owner decision of 2026-10-30: own story, going through `@qa`). Evidence: no workflow runs the browser scripts; `queue-lifecycle` stayed broken in 4 of 4 runs without any alert (finding M-2, a harness defect fixed in `8bb05d8`).
**Related:** TS-15 (flaky Chromium queue-deletion test, done), OPS-15 wave 4 / FT-42 (repoints the `web` job, renamed `frontend`), OPS-27 and OPS-29 (they also change CI jobs; workflow edits are serialized), [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (9.5 ruler, idea #1, actions AÇ-01..AÇ-05).
**Registered items:** inventory ST-23 (this story), TS-17 (the test item it delivers), FT-51 and FT-52 (slices); see [backlog-inventory](../../process/backlog-inventory.md).
**Count note:** the survey says 12 scripts; `tests/e2e/` holds **13** `*-browser-only` files and `package.json` 13 matching entries on 2026-11-04. The first action confirms the number; the job list comes from the folder, so the count cannot go stale again.
**Coordination required:** `$aiox-po` (validation), `$aiox-architect` (job shape, Chrome in CI, Next dev over HTTPS, run time and timeout), `$aiox-devops` (issue; reviews the workflow; **no workflow change without `@architect` and `@devops`**), independent `$aiox-qa` (test plan, stability evidence, the 9.5 attestation). `$aiox-ux-design-expert` and `$aiox-data-engineer`: not applicable (no visible text, no schema).

## Problem

- The scripts that exercise the real panel in a real browser run only when someone remembers to run them. A break stays invisible: `queue-lifecycle` was red in 4 of 4 runs and nothing alerted anyone.
- A script that is unstable is not trustworthy either, and the usual reflex of rerunning until it passes hides the defect that makes it unstable.

## Story

As the owner who relies on browser evidence for every panel change,
I want every browser E2E script to run in CI and fail the build when one breaks, with instability investigated instead of retried,
so that a broken panel flow is seen on the pull request and not on a live stream.

## Scope

**In (two slices, in this order):**

- **FT-51 — the CI job and its contract.** A job that starts the Next panel in development over HTTPS, uses Chrome, and runs every `*-browser-only` script; a red script fails the job. The script list is derived from the folder (or pinned and checked against it) so a new script cannot be left out. Failure artifacts (logs, screenshots) are uploaded without secrets. A workflow-contract test pins the job, the absence of retries and the list drift check.
- **FT-52 — stability proof and flake policy.** Repeated runs show every script is stable; each unstable script gets a recorded root cause and a fix (test-first when the cause is in the product); the policy "investigate, never rerun until green" is written and enforced by the contract test (no retry setting, no tolerated failure).

**Out of scope:**

- New E2E scenarios (those belong to FT-03/FT-06), native OBS and real Twitch, Windows and macOS browsers.
- Changing product behavior other than a test-first fix of a real defect the job exposes.
- Marking the job as a required repository check (a repository setting; recorded as a follow-up for the orchestrator and `@devops`, no owner decision invented).
- Release, tag, bump.

## Acceptance criteria

Evidence classes stay separate: contract, local runs, CI. Every behavior starts with a failing test.

1. **Given** the `*-browser-only` files in `tests/e2e/`, **when** the job runs, **then** every one of them runs; a contract test fails if a file exists that the job would not run.
2. **Given** one script made to fail on purpose (planted break, discarded afterwards), **when** the job runs, **then** the job is red and names the script.
3. **Given** the job, **then** it starts Next dev over HTTPS and uses Chrome exactly as the scripts expect locally; the measured run time is recorded and a timeout with margin is set by `@architect`.
4. **Given** a failure, **then** logs and screenshots are uploaded as artifacts and contain no token, header or chat/redemption body (checked with the OPS-27 check once it exists, by hand until then).
5. **Given** the workflow, **then** no retry, no rerun action and no tolerated failure exist for these scripts; the contract test fails if one is added.
6. **Given** the full set run consecutively on a clean checkout, **then** it passes with no failure for the number of runs `@architect` fixes (proposal: 10 local runs); **given** the job on distinct commits, **then** it is green without any rerun for the number of runs `@architect` fixes (proposal: 5).
7. **Given** a script that fails once, **then** the root cause is recorded in the story evidence and fixed; it is not rerun to green.
8. **Given** the documentation, **then** a page in English and pt-BR states the policy, how to run one script locally and how to read the artifacts; the documentation-contract tests pass.
9. **Given** the quality gates, **then** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` and `npm run review:static` are green.

## Dependencies

- **Depends on:** `@po` GO and issue; the `@architect` design; the `@devops` review of the workflow; script stability (TS-15 done; M-2 fixed in `8bb05d8`).
- **Serialized with** OPS-27 FT-46 and OPS-29 (same workflow files, one write set at a time). The survey order is OPS-27, then idea #2, then this story, then OPS-29.
- **OPS-15 wave 4 (FT-42):** repoints the `web` job (renamed `frontend`); the new job gets a distinct name and is revisited when wave 4 lands.
- **CI evidence:** a pull request or a workflow dispatch (delegated to the orchestrator); CI does not run on plain branch pushes.

## Risks

1. **An unstable script blocks every pull request.** Mitigation: FT-52 before relying on the job; instability is a defect to fix, not to hide.
2. **Chrome or HTTPS setup differs in CI.** Mitigation: AC 3 states the exact set-up; first run on a throwaway branch.
3. **Run time grows the pipeline.** Mitigation: the measured time is recorded; `@architect` may split the job.
4. **Artifacts leak data.** Mitigation: AC 4.
5. **Workflow edit conflicts.** Mitigation: serialization above.

## Complexity (estimate by `@sm`, to be confirmed by `@architect`)

Scope 2, integration 3, infrastructure 3, knowledge 2, risk 3 = **13 → STANDARD**. Difficulty **M**, priority **P2**.

## Business value

The only evidence that exercises the real panel in a real browser becomes automatic and trusted; a flow that breaks is caught on the pull request.

## Test plan (test-first)

1. **Contract:** the workflow-contract test pins the job, the list drift check and the absence of retries.
2. **Planted break:** `@qa` makes one script fail on a throwaway branch and confirms the red job.
3. **Stability:** the consecutive local runs and the CI runs of AC 6, with every failure investigated.
4. **Gates:** the seven project gates; `@qa` issues the verdict before `@devops` commits.

## Meta 9,5 (survey of 2026-11-04)

Current score (Orion's estimate): **4.0**. Target: **9.5**. The `@qa` attests the score with the ruler of [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (idea #1). Exit criteria: all browser scripts in the job with a drift check (AC 1); a planted break turns the job red (AC 2); no retry anywhere, pinned by the contract (AC 5); stability numbers met without rerun (AC 6, 7); artifacts safe (AC 4); policy documented in both languages (AC 8). No part depends on the owner.

## Planning gates before implementation

- [ ] `@po` validation (10 points) and GO.
- [ ] `@devops` creates the GitHub issue.
- [ ] `@architect`: job shape, Chrome and HTTPS set-up, timeout, stability numbers, name against wave 4.
- [ ] `@qa` test plan (planted break, stability method, artifact check).
- [ ] UX and data gates: not applicable; `@po` confirms at validation.

## Definition of Done

- ACs 1 to 9 have recorded evidence by class; the CI part is executed on a pull request or dispatch or recorded as pending.
- Quality gates green; `@qa` verdict and 9.5 attestation recorded; File List and checklists updated in English and pt-BR.

## SM draft validation (story-draft-checklist, 2026-11-04)

1. Goal and context: clear (invisible breaks, 4 of 4 failures, retry reflex). PASS.
2. Technical guidance: job shape named, open points assigned to `@architect`; count discrepancy (12 versus 13) surfaced. PASS.
3. References: survey idea #1, TS-17, TS-15, M-2 fix. PASS.
4. Self-containment: scope, out of scope, serialization and CI evidence path stated. PASS.
5. Testing: contract, planted break, stability runs. PASS.
6. Static analysis: `npm run review:static` in the gates. PASS.
- Result: ready for `@po`. Stability numbers are marked as proposals for `@architect`.

## File List

- `docs/stories/OPS-30/story.md` (new)
- `docs/pt-BR/stories/OPS-30/story.md` (new)
- `docs/stories.md` and `docs/pt-BR/stories.md` (index entry)
- `docs/process/backlog-inventory.md` and `docs/process/kanban-board-design.md` and pt-BR twins (items ST-23, FT-51, FT-52; TS-17 points here)

Implementation files will be listed here by `@dev` after the gates.

## Change Log

- 2026-11-04 — `@sm` (River): story drafted from idea #1 of the improvement survey and from inventory TS-17. Status Draft. Slices FT-51 and FT-52 registered.
