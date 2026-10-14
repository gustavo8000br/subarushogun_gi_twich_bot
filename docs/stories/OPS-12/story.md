# OPS-12 — Plan an intuitive installer experience for release candidate ([issue #60](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/60))

[Português brasileiro](../../pt-BR/stories/OPS-12/story.md)

**Status:** Ready for Review — planning deferred until `.release-stage` is `rc`. The design workflow has not started.
**Priority:** Planned for the release-candidate stage.
**Executor:** `$aiox-ux-design-expert` leads UX planning; `$aiox-master` orchestrates the AIOX planning workflow. `$aiox-dev` implements only after the plan and acceptance criteria are approved.
**Quality gates:** `$aiox-architect` reviews technical feasibility and boundaries; independent `$aiox-qa` reviews acceptance criteria and implementation evidence. UX review by `$aiox-ux-design-expert` is required for the visual and interaction design.

## Story

As a streamer installing the application,
I want a clearer installer experience with visible progress,
so that I can understand what the installer is doing and when it has finished.

## Stage gate and scope

This story is intentionally deferred while the product stage is beta. Do not start discovery, UX research, workflow planning, visual design, or implementation until `.release-stage` contains `rc`.

After the gate is met, run the complete applicable AIOX planning workflow. `$aiox-ux-design-expert` plans the user flow, visual direction, and accessible progress indicator for every supported installer platform. Refine this story with the planning outputs and approved acceptance criteria before implementation starts. The bar's states, wording, presentation, and behavior remain open design decisions until that workflow.

The existing unified installer lifecycle is documented in [OPS-5](../OPS-5/story.md) and is the baseline to inspect when this story is activated. Do not presume a new framework, interaction pattern, or platform capability before the planning review.

## Acceptance criteria

1. The story remains deferred while `.release-stage` is `beta`; no UX planning or implementation for this story begins before the configured stage is `rc`.
2. At RC, the applicable end-to-end AIOX planning workflow is completed and recorded, including product/flow review, UX design, technical feasibility review, and independent QA review of the plan.
3. `$aiox-ux-design-expert` documents the installer flow and a visual/interaction direction for all supported installer platforms, based on the current installer behavior and project artifacts.
4. The approved design includes a progress bar. It specifies accessible name/status announcements, keyboard and screen-reader behavior, and how progress is represented for each in-scope installer operation. Exact states and copy are decided during planning.
5. The English and pt-BR story versions contain equivalent planning results and refined, verifiable implementation acceptance criteria before implementation begins.
6. The refined implementation plan identifies relevant regression tests and project quality gates; database or financial behavior is not changed as part of installer UX unless separately approved and planned.

## Quality gate plan

- Planning: `$aiox-master` coordinates the complete applicable AIOX workflow; `$aiox-ux-design-expert` owns UX flow and visual specification.
- Feasibility: `$aiox-architect` reviews platform boundaries and implementation feasibility after UX planning.
- Independent plan review: `$aiox-qa` checks acceptance criteria for observable, testable behavior and verifies that each supported platform is covered.
- Implementation (only after the RC planning gate): `$aiox-dev` follows TDD, runs `npm run lint`, `npm run typecheck`, and `npm test`, and updates equivalent English/pt-BR documentation. `$aiox-qa` independently validates the implementation. Add platform-native installer checks based on the approved design and existing CI capabilities.
- Documentation-only changes in this draft: verify bilingual parity, links, `git diff --check`, and repository structure validation. No implementation QA score is claimed for a deferred planning story.

## Tasks / Subtasks

- [ ] Wait until `.release-stage` is `rc`; record the stage/version evidence before activating this story.
- [ ] `$aiox-master`: select and run the complete applicable AIOX planning workflow; record workflow artifacts and decisions.
- [ ] `$aiox-ux-design-expert`: inspect OPS-5 and current platform installers; plan the user flow, visual design, accessible progress bar, and platform-specific behavior.
- [ ] `$aiox-architect`: review the proposed design for technical feasibility and platform constraints.
- [ ] `$aiox-qa`: review the plan and refine measurable acceptance criteria independently.
- [ ] Update both story versions, implementation tasks, file lists, and affected user documentation with equivalent approved content.
- [ ] Only after planning reviews pass, hand the refined implementation scope to `$aiox-dev` for test-first implementation and cross-platform validation.

## Dev Notes

- Current `.release-stage` is `beta` (checked 2026-10-14). This story is a backlog placeholder, not authorization to start its planning workflow now.
- Confirmed owner requirement: make the installer more intuitive and include a progress bar.
- Visual specifics, progress phases, terminology, platform differences, and detailed acceptance criteria are intentionally left to RC-stage planning.
- Existing installer lifecycle reference: `docs/stories/OPS-5/story.md` and `docs/pt-BR/stories/OPS-5/story.md`.
- Keep the English and pt-BR stories equivalent.

## File List

- [x] `docs/stories/OPS-12/story.md`
- [x] `docs/pt-BR/stories/OPS-12/story.md`
- [x] `docs/stories.md`
- [x] `docs/pt-BR/stories.md`
- [x] `docs/session-handoff.md`
- [x] `docs/pt-BR/session-handoff.md`

## Change Log

| Date | Change | Author |
| --- | --- | --- |
| 2026-10-14 | Created deferred RC-stage story from owner direction; recorded progress bar requirement and planning gate without beginning UX planning. | `$aiox-master` |
