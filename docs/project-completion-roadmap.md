# Project completion roadmap — remaining approved work

[Português brasileiro](pt-BR/project-completion-roadmap.md)

**Reviewed:** 2026-10-19 against the current story sources, session handoff, and `.release-stage` (`beta`).
**Purpose:** Cross-story view of unfinished project work. Existing stories/issues remain the source of acceptance criteria and status. This roadmap does not close stories, authorize release, or replace their QA gates.

## Current project picture

The immediate active implementation is the Next.js panel/OBS migration in [OPS-15](stories/OPS-15/story.md), which remains **In Progress**. This does not mean every open project task belongs in OPS-15. Other unfinished work retains its own story and owner acceptance.

## Remaining work, ordered by dependencies

| Order | Existing story | Recorded status | Remaining work from its acceptance criteria | Dependency / exit evidence |
|---|---|---|---|---|
| 1 | [OPS-15](stories/OPS-15/story.md) | In Progress | Finish Windows-local dev database/session verification; expand the endpoint/action/test matrix; close panel/overlay parity and runtime catalog evidence; perform implementation architecture/UX/QA reviews; validate production-like Compose and real Windows installer; test native OBS/CEF; rehearse rollback; audit legacy tests; only then propose a cutover. | All OPS-15 acceptance criteria and environment-specific evidence. Vanilla remains until parity, audits, reviews, OBS/CEF, and rollback pass; cutover/removal requires explicit owner authorization. |
| 2 | [FND-9](stories/FND-9/story.md) | Ready for Review; owner acceptance pending | Owner performs native Windows product acceptance and explicitly authorized live Twitch lifecycle/financial acceptance; record outcomes without inferring remote success from mocks. | Owner evidence for local behavior and Twitch confirmation; then story/issue status may be updated by the authorized workflow. |
| 3 | [OPS-13](stories/OPS-13/story.md) | Ready for Review; native OBS acceptance pending | Owner verifies the current-account widget survives native OBS Browser Source/CEF reload using the accepted capability flow; record OBS/CEF versions and result. | Native OBS/CEF evidence; Chromium automation is not a substitute. |
| 4 | [OPS-14 / issue #65](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/65) | Open; Ready for Review; not started | After OPS-13 is fixed and accepted by the owner, implement localized queue-call instructions using executable queue slugs and exactly one durable/recoverable public chat announcement for each successful service-start transition, preserving custom messages and en/es/pt-BR behavior. | The issue says implementation follows accepted OPS-13. Preserve this as separate chat behavior; OPS-15 only migrates its panel presentation. |
| 5 | [DOC-2](stories/DOC-2/story.md) | Planned; role-page refinement and visual preflight recorded | Complete the integrated role-page/browser review, capture product-only screenshots and a calm page-by-page README GIF from the released version with safe demo data, add accessible alt text/captions, and verify bilingual placements/assets. | Capture only after UI and demo states are stable; do not use secrets or personal data. |
| 6 | [DOC-3](stories/DOC-3/story.md) | Planned; issue #48 | After FND-9 and DOC-2, audit maintained product/contributor docs against implementation and evidence, fix contradictions/dead links, preserve historical claims, and validate bilingual equivalence with independent QA. | Explicit dependencies in DOC-3; record any claims that remain unverified. |
| 7 | [OPS-12](stories/OPS-12/story.md) | Ready for Review; deferred | Wait while `.release-stage` is `beta`. At `rc`, run the planned AIOX discovery/UX/architecture/QA workflow before defining implementation details. | `.release-stage` must first change to `rc`; current value is `beta`. No planning or implementation starts before that gate. |

## Guardrails

- FND-9 remains pending owner acceptance; OPS-13 remains pending native OBS acceptance; OPS-15 remains In Progress. This roadmap changes none of those statuses.
- Do not delete the vanilla panel or move the fixed local `legacy` recovery pointer before OPS-15 parity, legacy-test audit, architecture/UX/QA review, native OBS/CEF checks, production-like deployment validation, and isolated rollback are complete.
- Do not create a PR, merge, publish a release, promote beta to RC, or perform live Twitch financial operations without the authorization required by the existing stories and repository rules.
- For product-facing changes, use `$aiox-ux-design-expert`; database/schema changes require `$aiox-data-engineer`; implementation QA remains independent.
- Record work in the owning story in both languages. This roadmap is a navigation aid, not evidence that a gate passed.

## Change record

| Date | Change | Owner |
|---|---|---|
| 2026-10-19 | Added an evidence-scoped view of open project stories and their recorded dependencies; no status changed. | `$aiox-sm` |
