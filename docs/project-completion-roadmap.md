# Project roadmap — where we are and what is next

[Português brasileiro](pt-BR/project-completion-roadmap.md) · [Back to README](../README.md)

**Updated:** 2026-11-05, for `0.3.0-beta` (`.release-stage` = `beta`). This is a navigation page: stories and issues remain the source of acceptance criteria and status, and this page does not close stories, pass gates or authorize a release. The public, user-facing list is in the [project roadmap](ROADMAP.md); the full backlog is in the [backlog inventory](process/backlog-inventory.md); the previous (dense) version of this page is kept in the [archive](archive/project-completion-roadmap-2026-10-21.md).

## 1. Where we are (v0.3.0-beta)

- **Next.js panel and OBS overlay.** The cutover of [OPS-15](stories/OPS-15/story.md) is merged into `main` (PR #101). The old vanilla panel is gone; the panel is `apps/frontend`. `legacy` is a historical reference only, not a fallback: recovery is a forward fix or redeploying a previous image digest ([Versioning](VERSIONING.md)).
- **Financial recovery.** [OPS-22](stories/OPS-22/story.md): the `unknown` financial state can be resolved and queue deletion completes safely, with verified cancellation. Independent QA gate of 2026-11-06: 9.2/10, CONCERNS approved ([gate](stories/OPS-15/qa-gate-2026-11-06.md)).
- **Real `ping`.** The `ping` chat command reports real Twitch latency (first slice of [OPS-26](stories/OPS-26/story.md)).
- **Live test (2026-11-06 gate):** native OBS, queue and reward creation, redemption, fulfillment, deletion, stop, on the owner's exclusive test channel, with no failure.
- **Still unproven:** native Windows and macOS runs, and live Twitch financial cancellation in production. Linux (Ubuntu) is the only platform validated by a person.

## 2. What is missing before calling OPS-15 and the Ready stories finished

| Item | Story | What is left |
|---|---|---|
| Closing gates of the Next cutover | [OPS-15](stories/OPS-15/story.md) | Final story closure and board bookkeeping after the merge; follow-ups are listed below. |
| Owner acceptance of local queues | [FND-9](stories/FND-9/story.md) (#19) | The owner tests native Windows and the explicitly authorized live Twitch lifecycle; record results without inferring remote success from mocks. |
| OBS account widget after reload | [OPS-13](stories/OPS-13/story.md) / [OPS-25](stories/OPS-25/story.md) | Native OBS/CEF evidence on the Next overlay; run the [native OBS runbook](stories/OPS-25/obs-native-runbook.md). Chromium automation is not a substitute. |
| Localized call instructions | OPS-14 (#65) | No story file yet; implementation follows the accepted OBS widget behavior. Separate chat behavior. |
| Documentation | [DOC-2](stories/DOC-2/story.md), [DOC-3](stories/DOC-3/story.md) | Screenshots and GIF from stable UI; then the full documentation audit. |
| Installer UX | [OPS-12](stories/OPS-12/story.md) (#60) | Deferred until `.release-stage` is `rc`. |

## 3. Next: 0.4.0-beta

The owner chose this scope on 2026-11-05 (source: [backlog inventory, section 2.1](process/backlog-inventory.md); [OPS-27](stories/OPS-27/story.md) is **out**). Nothing here authorizes a bump: the version policy in `AGENTS.md` applies.

| Theme | Items |
|---|---|
| Real-time panel (SSE) | [OPS-23](stories/OPS-23/story.md) (#81) |
| TypeScript backend, typed panel JSX, Biome | [OPS-24](stories/OPS-24/story.md) (#91), TS-16 |
| System chat commands | `status` command ([OPS-26](stories/OPS-26/story.md), #108), TS-14 |
| Robustness | read timeout in panel requests (FT-44); `retryOutboxManually` for legacy rows (FT-41-L1); OPS-22 follow-ups TS-19, TS-20 |
| CI | job for the 14 `*-browser-only` scripts ([OPS-30](stories/OPS-30/story.md), #105); clean install ([OPS-29](stories/OPS-29/story.md), #106); static-scan rules ([OPS-28](stories/OPS-28/story.md), #107); `queue: max` in workflows (TS-21) |
| Quality from the 2026-11-06 gate | TS-22 to TS-26, FT-64 |
| Widget and panel findings (UX) | FT-61, FT-62 (owner OK), FT-63, FT-67; runbook and `dev:start` notes FT-65, FT-66 |

Dependency order inside the scope: OPS-24 first slices, then OPS-23; the rest is independent and ordered by the board.

## 4. Pending owner items

- **OW-18:** before streaming with the production scene, replace the "Nome da fila" source with the new widget link (links are never written in docs).
- **Tag and release of `v0.3.0-beta`:** merge is done (D-06 satisfied); the tag/release stays reserved to the owner (D-07).
- Native Windows/macOS acceptance sessions (the owner will provide them later).
- FND-9 acceptance and OPS-14 story decision (see section 2).
- Disable the GitHub Project workflow "Close issues when status changes".

## 5. Risks

- **Quota and serial work:** one agent at a time; one `@qa` gate per bundle. Plan by bundle, not by slice.
- **Unproven platforms:** Windows, macOS and production Twitch cancellation have no evidence yet; claims stay limited to what ran.
- **Dense history:** long evidence lives in stories and the [archive](archive/stories-history.md); keep this page and the [story index](stories.md) short.
- **Test stability:** flaky Chromium cases are tracked as TS items (see 0.4.0-beta).

## 6. Guardrails

- No PR merge, tag, release, rc/stable bump or live financial operation without the authorization the repository rules require.
- Product-facing changes go through `@ux-design-expert` (minimum 9.0/10); database changes through `@data-engineer`; independent `@qa` validates once per story or bundle.
- Record work in the owning story in both languages.
