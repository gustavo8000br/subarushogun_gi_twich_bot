# Development stories — index

[Português brasileiro](pt-BR/stories.md) · [Back to README](../README.md)

**Updated:** 2026-11-05 (version `0.3.0-beta`). This page is only an **index**: ID, title, issue, status and link. Each story at `docs/stories/<ID>/story.md` is the source of acceptance criteria, evidence and file list. This does not close stories or authorize a release. The long text that used to live here (TDD evidence for FND-1 to FND-7, planning notes and the planning file list) is in the [stories history](archive/stories-history.md).

See also: [current roadmap](project-completion-roadmap.md) · [backlog inventory](process/backlog-inventory.md) (section 2.1: 0.4.0-beta scope) · [session handoff](session-handoff.md). OPS-14 (#65, localized call instructions) has no story file yet: see the [roadmap](project-completion-roadmap.md). The [TWITCH-CAPABILITY-GAP-ANALYSIS](stories/TWITCH-CAPABILITY-GAP-ANALYSIS.md) crosses the official Twitch features with the stories. The original planning (FND-0) is in the [spec](stories/FND-0/spec/spec.md).

## In progress, in review or awaiting the owner

| ID | Title | Issue | Status | Story |
|---|---|---|---|---|
| OPS-15 | Next.js panel and OBS overlay (cutover merged in PR #101) | [#69](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/69) | In Progress (closing gates) | [OPS-15](stories/OPS-15/story.md) |
| OPS-18 | Current Account as the single player identity overlay | [#77](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/77) | In Progress | [OPS-18](stories/OPS-18/story.md) |
| OPS-19 | Confirm the Twitch reward when service starts | [#78](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/78) | In Progress | [OPS-19](stories/OPS-19/story.md) |
| OPS-22 | Recover the `unknown` financial state and delete queues safely | [#80](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/80) | InReview | [OPS-22](stories/OPS-22/story.md) |
| FND-9 | Manual and reward-backed queue modes | [#19](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/19) | Ready for Review; owner acceptance pending | [FND-9](stories/FND-9/story.md) |
| OPS-13 | OBS account widget usable after reload | [#57](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/57) | Ready for Review; native OBS acceptance pending (see OPS-25) | [OPS-13](stories/OPS-13/story.md) |

## Ready (validated, waiting to start)

| ID | Title | Issue | Status | Story |
|---|---|---|---|---|
| OPS-21 | Harden the panel API contract (idempotency, session recovery, error codes) | — | Ready | [OPS-21](stories/OPS-21/story.md) |
| OPS-23 | Real-time panel updates (SSE) and shared state (0.4.0-beta) | [#81](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/81) | Ready | [OPS-23](stories/OPS-23/story.md) |
| OPS-24 | Backend in TypeScript and Biome instead of ESLint (0.4.0-beta) | [#91](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/91) | Ready | [OPS-24](stories/OPS-24/story.md) |
| OPS-27 | Automatic guard against leaks of sensitive data (outside 0.4.0-beta) | [#104](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/104) | Ready | [OPS-27](stories/OPS-27/story.md) |

## Done

| ID | Title | Issue | Status | Story |
|---|---|---|---|---|
| FND-1 | Version identity and local runtime foundation | [#3](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/3) | Done | [FND-1](stories/FND-1/story.md) |
| FND-2 | Queue domain, validation, ordering and parser | [#2](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/2) | Done | [FND-2](stories/FND-2/story.md) |
| FND-3 | Durable outbox and financial recovery | [#5](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/5) | Done | [FND-3](stories/FND-3/story.md) |
| FND-4 | Twitch OAuth, adapters and reconciliation | [#4](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/4) | Done | [FND-4](stories/FND-4/story.md) |
| FND-5 | Chat commands, calls, service lifecycle and account ownership | [#1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1) | Done | [FND-5](stories/FND-5/story.md) |
| FND-6 | Local panel, protected API and operator documentation | [#6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6) | Done | [FND-6](stories/FND-6/story.md) |
| FND-7 | Configurable local OBS overlay widgets | [#7](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/7) | Done | [FND-7](stories/FND-7/story.md) |
| FND-8 | Product-wide localization | [#18](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/18) | Done | [FND-8](stories/FND-8/story.md) |
| OPS-1 | CI for API, infrastructure and web | [#20](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/20) | Done | [OPS-1](stories/OPS-1/story.md) |
| OPS-2 | Localize the Twitch setup status in the panel | [#21](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/21) | Done | [OPS-2](stories/OPS-2/story.md) |
| OPS-3 | Command catalog and role permissions | [#17](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/17) | Done | [OPS-3](stories/OPS-3/story.md) |
| OPS-4 | MIT license | [#29](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/29) | Done | [OPS-4](stories/OPS-4/story.md) |
| OPS-5 | Unified cross-platform lifecycle installer | [#30](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/30) | Done | [OPS-5](stories/OPS-5/story.md) |
| OPS-6 | Clear runtime status and guided panel states | [#32](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/32) | Done | [OPS-6](stories/OPS-6/story.md) |
| OPS-7 | Hierarchical chat-command permissions | [#39](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/39) | Done | [OPS-7](stories/OPS-7/story.md) |
| OPS-8 | Automatic Twitch recovery after network interruptions | [#41](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/41) | Done | [OPS-8](stories/OPS-8/story.md) |
| OPS-9 | Unified command access rules | — | Done | [OPS-9](stories/OPS-9/story.md) |
| OPS-10 | Separate PR CI from main image delivery | [#45](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/45) | Done | [OPS-10](stories/OPS-10/story.md) |
| OPS-11 | Queue calls, permissions, presence and removed rewards | [#57](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/57) | Done | [OPS-11](stories/OPS-11/story.md) |
| DOC-1 | Concise README and focused documentation navigation | — | Done | [DOC-1](stories/DOC-1/story.md) |

## Planned (draft, backlog, deferred)

| ID | Title | Issue | Status | Story |
|---|---|---|---|---|
| OPS-25 | Validate the account widget on the Next overlay (native OBS) | [#109](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/109) | Draft | [OPS-25](stories/OPS-25/story.md) |
| OPS-26 | System chat commands: `ping` with real latency, then `status` (0.4.0-beta) | [#108](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/108) | Draft | [OPS-26](stories/OPS-26/story.md) |
| OPS-17 | Multilingual viewer chat commands | [#73](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/73) | Draft | [OPS-17](stories/OPS-17/story.md) |
| OPS-20 | Choose who is eligible for point refunds | [#76](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/76) | Draft (refined) | [OPS-20](stories/OPS-20/story.md) |
| OPS-28 | Widen the OpenGrep static-scan rules | [#107](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/107) | Draft | [OPS-28](stories/OPS-28/story.md) |
| OPS-29 | Clean install in CI on Linux, macOS and Windows | [#106](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/106) | Draft | [OPS-29](stories/OPS-29/story.md) |
| OPS-30 | CI job for the browser E2E scripts (0.4.0-beta) | [#105](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/105) | Draft | [OPS-30](stories/OPS-30/story.md) |
| OPS-31 | Natural queue notices and refund of channel points by group (owner proposal, 0.4.0-beta+) | [#115](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/115) | Ready | [OPS-31](stories/OPS-31/story.md) |
| OPS-16 | Explain the custom queue call-message variables | [#72](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/72) | Backlog | [OPS-16](stories/OPS-16/story.md) |
| OPS-12 | Installer UX planning for the release candidate | [#60](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/60) | Ready for Review; deferred until `rc` | [OPS-12](stories/OPS-12/story.md) |
| DOC-2 | Product screenshots and visual UX preflight | [#40](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/40) | Planned | [DOC-2](stories/DOC-2/story.md) |
| DOC-3 | Full documentation consistency audit | [#48](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/48) | Planned | [DOC-3](stories/DOC-3/story.md) |
