# OPS-29 — Clean install in CI: clean clone and first use on Linux, macOS and Windows

[Português (pt-BR)](../../pt-BR/stories/OPS-29/story.md)

**Status:** Draft (drafted by `@sm` on 2026-11-04; not yet validated by `@po`). **Issue:** [#106](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/106) (created by `@devops` before 2026-11-05 from [improvement-issue-bodies-2026-11-04.md](../../process/improvement-issue-bodies-2026-11-04.md); no issue comments).
**Source:** idea #10 of the [improvement survey](../../process/improvement-ideas-2026-11-04.md) (owner request, 2026-11-04). Evidence: the Compose `create_host_path` bug showed only on a fresh runner, because every earlier run happened with the folder already created ([session-handoff](../../session-handoff.md), state of 2026-10-30).
**Related:** OPS-30 and OPS-27 (they also add or change CI jobs; workflow edits are serialized); OPS-12 (installer UX for `rc`, deferred); OPS-15 (cutover wave 4 repoints the `web` job); [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (9.5 ruler, idea #10, actions AÇ-43..AÇ-47).
**Registered items:** inventory ST-22 (this story), FT-49 and FT-50 (slices); see [backlog-inventory](../../process/backlog-inventory.md).
**Coordination required:** `$aiox-po` (validation), `$aiox-architect` (job shape per operating system, what each hosted runner can honestly prove, run time), `$aiox-devops` (issue; reviews the workflow), independent `$aiox-qa` (test plan, planted regression, the 9.5 attestation), `$aiox-analyst` only for a GAP (container engine on hosted macOS and Windows runners; check [research-index.md](../../research-index.md) first). `$aiox-ux-design-expert`: not applicable (no visible text change). `$aiox-data-engineer`: only to confirm that "update keeps the data" does not change a schema.

## Problem

- Today the installer smoke runs on Linux, macOS and Windows runners with an isolated fake Docker (reusable quality gates), and the Compose integration runs on Linux with the working tree and folders that already exist. No job starts from a **clean clone with no pre-existing folder** and walks the first-use flow a new person follows: install, start, open the panel, update.
- The bug class "works because the folder was already there" is invisible to every run that reuses a prepared checkout. It surfaced only on a fresh runner, after the fact.
- The runners differ: real Linux containers run on the Linux runner; the macOS and Windows hosted runners may not provide a Linux container engine (not verified here). What each job proves must be stated, not implied.

## Story

As the owner who ships an installer to people who have no folders prepared,
I want a CI job that starts from a clean clone and walks the first-use flow on each operating system with nothing pre-created,
so that a defect that depends on pre-existing state fails in CI instead of on a new machine.

## Scope

**In (two slices, in this order):**

- **FT-49 — Linux, real Docker.** Clean clone in an empty workspace; an assertion step proves the data and bind-mount folders do not exist at the start; documented first-use flow: install, start, open (the panel and `/health` answer), update (a second run to a newer tag, data kept). Planted-regression proof (below).
- **FT-50 — macOS and Windows.** The same flow in the steps each hosted runner can honestly prove (packaging, installer launch from a clean user directory with no application folder; real container steps only if the runner has an engine). Every step records whether it ran against real Docker or the isolated fake, so the evidence class is explicit; what cannot be proven in CI stays declared and stays with the owner items (D-05 for macOS, OW-01 for Windows).

**Out of scope:**

- A real Windows or macOS machine (owner evidence, OW-01 and D-05), native OBS and real Twitch (OW-03, OW-04, OW-16).
- Changing installer behavior, Compose files or product code other than a test-first fix of a defect the new job finds.
- Installer UX for `rc` (OPS-12). Release, tag, bump.

## Acceptance criteria

Evidence classes stay separate: unit/contract, CI on real Docker, CI with the isolated fake, owner. Every behavior starts with a failing test.

1. **Given** the job starts, **when** the first step runs, **then** an assertion proves each data folder and bind-mount source folder is absent (listed by `@architect` from the Compose and installer files), and the job fails if one exists; the assertion helper has a unit test for both outcomes.
2. **Given** a clean clone on the Linux runner with real Docker, **when** the flow runs, **then** install, start, open (panel and `/health` answer) and update pass in that order with no folder created by hand.
3. **Given** the update step, **when** it runs against a newer tag, **then** the data created before the update is still present after it, and the version shown changes.
4. **Given** a planted regression that makes the flow depend on a pre-existing folder (the reverse of the `create_host_path` fix), **when** the job runs, **then** it fails; the planted change is proven by `@qa` on a throwaway branch or by the local equivalent, then discarded.
5. **Given** the macOS and Windows jobs, **when** they run, **then** each step is labeled "real Docker" or "isolated fake", the clean-directory assertion passes, and the documentation states what the fake does not prove.
6. **Given** the existing installer-smoke job, **then** it is reused or extended, not duplicated; the `@architect` records the overlap decision.
7. **Given** the workflow-contract test, **then** it pins the three operating systems, the clean-state assertion and the step order.
8. **Given** the job's measured run time, **then** it is recorded in the evidence and stays within the timeout `@architect` fixes.
9. **Given** the documentation, **then** a page in English and pt-BR explains the clean-install check, its evidence classes and its limits; the documentation-contract tests pass.
10. **Given** the quality gates, **then** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` and `npm run review:static` are green.

## Dependencies

- **Depends on:** `@po` GO and issue; the `@architect` design (workflow edits only with it and the `@devops` review); CI evidence needs a pull request or a workflow dispatch (delegated to the orchestrator).
- **Serialized with** OPS-27 FT-46 and OPS-30 (same workflow files, one write set at a time); order recommended by the survey: after OPS-27 and OPS-30.
- **OPS-15 wave 4 (FT-42):** repoints the `web` job (renamed `frontend`); job names added here must not collide with that change.
- **Runner capability:** whether macOS and Windows hosted runners can run Linux containers is a GAP check (research-index first, `@analyst` only if it is a GAP). The result decides how much FT-50 can prove for real.

## Risks

1. **A green job on the fake Docker is read as real validation.** Mitigation: AC 5 labels every step; the documentation states the limit.
2. **Long run time on three runners.** Mitigation: AC 8, one job per operating system, no new matrix beyond the three.
3. **Workflow edit conflicts.** Mitigation: serialization above.
4. **The job finds a real defect and grows the scope.** Mitigation: each defect is its own test-first fix recorded in the evidence.
5. **Image or network flakiness on hosted runners.** Mitigation: a flaky step is investigated and never rerun until it passes.

## Complexity (estimate by `@sm`, to be confirmed by `@architect`)

Scope 3, integration 2, infrastructure 4, knowledge 3, risk 2 = **14 → STANDARD**. Difficulty **M**, priority **P2**.

## Business value

A new person's first install is exercised on every change, so a missing-folder class of bug stops being discovered by the first real user.

## Test plan (test-first)

1. **Unit:** the clean-state assertion helper (absent / present).
2. **Contract:** workflow-contract test pins systems, assertion and order.
3. **CI real Docker (Linux):** the full flow; **CI isolated fake (macOS, Windows):** the steps that runner can prove, labeled.
4. **Planted regression:** `@qa` reintroduces the pre-existing-folder dependency on a throwaway branch and confirms the job fails.
5. **Gates:** the seven project gates; `@qa` issues the verdict before `@devops` commits.

## Meta 9,5 (survey of 2026-11-04)

Current score (Orion's estimate): **6.0**. Target: **9.5**. The `@qa` attests the score with the ruler of [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (idea #10). Exit criteria: clean-state assertion on every operating system (AC 1, 5); real-Docker flow on Linux with update and data kept (AC 2, 3); planted regression turns the job red (AC 4); every step labeled by evidence class (AC 5); contract test and documentation (AC 7, 9). Part depends on runner capability and the owner: real Windows and macOS evidence stays with OW-01 and D-05, so the coverage dimension is defined as "everything a hosted runner can prove, residual declared"; agents never claim the owner part.

## Planning gates before implementation

- [ ] `@po` validation (10 points) and GO.
- [ ] `@devops` creates the GitHub issue.
- [ ] `@architect`: job shape per operating system, assertion list, overlap with the existing installer smoke, timeout.
- [ ] `@data-engineer`: confirm "update keeps the data" implies no schema change (or not applicable).
- [ ] `@qa` test plan (planted regression, evidence classes, labels).
- [ ] `@analyst` note only if the container-engine question is a GAP; [research-index.md](../../research-index.md) checked first.
- [ ] UX gate: not applicable; `@po` confirms at validation.

## Definition of Done

- ACs 1 to 10 have Red-first evidence by class; the CI part is executed on a pull request or dispatch or recorded as pending.
- Quality gates green; `@qa` verdict and 9.5 attestation recorded; File List and checklists updated in English and pt-BR.

## SM draft validation (story-draft-checklist, 2026-11-04)

1. Goal and context: clear (bug class, current coverage, gap). PASS.
2. Technical guidance: existing jobs named, runner differences stated, open points assigned to `@architect`. PASS.
3. References: survey idea #10, session handoff, quality-gates workflow. PASS.
4. Self-containment: evidence classes and limits explicit. PASS.
5. Testing: assertion unit test, contract, planted regression. PASS.
6. Static analysis: `npm run review:static` in the gates. PASS.
- Result: ready for `@po`. The runner-capability question is marked unverified, not assumed.

## File List

- `docs/stories/OPS-29/story.md` (new)
- `docs/pt-BR/stories/OPS-29/story.md` (new)
- `docs/stories.md` and `docs/pt-BR/stories.md` (index entry)
- `docs/process/backlog-inventory.md` and `docs/process/kanban-board-design.md` and pt-BR twins (items ST-22, FT-49, FT-50)

Implementation files will be listed here by `@dev` after the gates.

## Change Log

- 2026-11-04 — `@sm` (River): story drafted from idea #10 of the improvement survey. Status Draft. Slices FT-49 and FT-50 registered.
