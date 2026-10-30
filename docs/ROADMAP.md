# Project roadmap

[Português brasileiro](pt-BR/ROADMAP.md) · [Back to README](../README.md)

Status checked against the story files on 2026-10-21. The product stage is `beta` (`.release-stage`); no public release has been published yet. Open issues are planning/acceptance work, not a promise of release timing. The dependency order of the remaining work is kept in the [project completion roadmap](project-completion-roadmap.md); this table only summarizes each story's recorded status.

| Story | Status |
| --- | --- |
| FND-1 — Version identity and local runtime foundation ([#3](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/3)) | Done |
| FND-2 — Queue domain and PostgreSQL ordering ([#2](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/2)) | Complete |
| FND-3 — Durable financial outbox and recovery ([#5](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/5)) | Complete; live point operations not verified |
| FND-4 — Twitch OAuth, rewards, EventSub and reconciliation ([#4](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/4)) | Complete; authorized live reward acceptance remains unverified |
| FND-5 — Chat commands, service, timeout and account ([#1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1)) | Complete; live point operations not verified |
| FND-6 — Streamer panel and local security ([#6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6)) | Complete; live Twitch writes remain unverified |
| FND-7 — Local OBS widgets ([#7](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/7)) | Complete; QA PASS 9.2/10. Windows/macOS OBS trust and live Twitch writes remain unverified |
| FND-8 — Product localization ([#18](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/18)) | Complete; merged in PR #31; QA PASS 9.2/10 |
| FND-9 — Manual/reward-backed queues by Twitch capability ([#19](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/19)) | Ready for Review; critical deletion regression fixed. Owner native Windows acceptance and authorized live Twitch lifecycle/financial acceptance remain pending |
| OPS-1 — CI for API, infra and web ([#20](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/20)) | Complete; merged in PR #12 |
| OPS-2 — Safe localized Twitch status ([#21](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/21)) | Complete; initial mapping in PR #13, precedence/localization in FND-8 PR #31 |
| OPS-3 — Command catalog and role permissions ([#17](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/17)) | Complete; merged in PR #24 |
| OPS-4 — MIT license ([#29](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/29)) | Complete; merged in PR #25 |
| OPS-5 — Cross-platform lifecycle installer ([#30](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/30)) | Complete; merged in PR #37; independent AIOX-QA PASS 100/100. Linux real Compose lifecycle passed; physical Windows/macOS acceptance remains unverified |
| OPS-6 — Clear runtime status and guided panel states ([#32](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/32)) | Complete; merged in PR #33; independent QA PASS 100/100 |
| OPS-7 — Hierarchical command permissions and follower role ([#39](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/39)) | Done; QA 10/10; merged in PR #42 |
| OPS-8 — Automatic Twitch reconnection ([#41](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/41)) | Complete; merged in PR #43; QA PASS 9.5/10 |
| OPS-9 — Unified command access rules | Complete; merged in PR #44; AIOX-QA PASS |
| OPS-10 — Separate PR CI from main image delivery ([#45](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/45)) | Complete; merged in PR #46 (`01c63d9`); QA PASS 9.4/10 |
| OPS-11 — Queue calls, permissions, presence and removed Twitch rewards ([#57](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/57)) | Done; independent QA PASS 10/10 |
| OPS-12 — Intuitive installer experience for release candidate ([#60](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/60)) | Ready for Review; planning deferred until `.release-stage` is `rc` |
| OPS-13 — OBS account widget usable after reload | Ready for Review; owner native OBS/CEF acceptance pending |
| OPS-14 — Localized queue-call instructions and service-start announcement ([#65](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/65)) | Open; starts after OPS-13 is accepted |
| OPS-15 — Modular Next.js panel and OBS overlay ([#69](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/69)) | In Progress; parity, reviews, production-like validation and the owner-authorized cutover remain open |
| OPS-16 — Explain custom queue call-message variables ([#72](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/72)) | Backlog; not started |
| OPS-17 — Multilingual viewer chat commands ([#73](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/73)) | Backlog; refinement required |
| OPS-18 — Current Account as the single player identity overlay ([#77](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/77)) | In Progress |
| OPS-19 — Confirm Twitch reward when service starts ([#78](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/78)) | In Progress |
| OPS-20 — Choose who is eligible for point refunds ([#76](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/76)) | Draft; starts after the OPS-15 panel migration |
| DOC-2 — Accurate bilingual product screenshots ([#40](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/40)) | Open; screenshot/GIF work planned after FND-9; visual preflight is recorded |
| DOC-3 — Full documentation consistency and UX-style audit ([#48](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/48)) | Planned after FND-9 and DOC-2; issue and bilingual story are published |

See the detailed acceptance criteria and implementation evidence in the [story index](stories.md) and its [pt-BR version](pt-BR/stories.md).

## Candidate stories for later planning

These owner-requested ideas are backlog candidates, not scoped stories or issues yet:

- Add carefully selected product screenshots to the English and pt-BR documentation, with an agreed capture/update process.
- **Historical sequence note (2026-10-07):** FND-9 → DOC-2 → DOC-3 (#48, full documentation audit). OPS-7 merged in PR #42; OPS-8 merged in PR #43 with QA PASS 9.5/10; OPS-9 merged in PR #44; OPS-10 merged in PR #46 with QA PASS 9.4/10. The owner requested a visual preflight and Roles & Permissions correction before FND-9; DOC-2 records the review and media requirements. Screenshot/GIF work remains after FND-9. That note predates the owner's change of the stage to `beta`; the current active work is OPS-15 and the current order is in the [project completion roadmap](project-completion-roadmap.md). Public release timing is not scheduled, and only the owner can change the stage again or publish a release.
