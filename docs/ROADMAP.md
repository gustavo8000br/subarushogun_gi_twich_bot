# Project roadmap

[Português brasileiro](pt-BR/ROADMAP.md) · [Back to README](../README.md)

Status checked against the local story index and GitHub issues on 2026-10-07. Open issues are planning/acceptance work, not a promise of release timing.

| Story | Status |
| --- | --- |
| FND-1 — Version identity and local runtime foundation ([#3](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/3)) | In progress; manual Windows rerun of the startup-helper fix remains open |
| FND-2 — Queue domain and PostgreSQL ordering ([#2](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/2)) | Complete |
| FND-3 — Durable financial outbox and recovery ([#5](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/5)) | Complete; live point operations not verified |
| FND-4 — Twitch OAuth, rewards, EventSub and reconciliation ([#4](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/4)) | Complete; authorized live reward acceptance remains unverified |
| FND-5 — Chat commands, service, timeout and account ([#1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1)) | Complete; live point operations not verified |
| FND-6 — Streamer panel and local security ([#6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6)) | Complete; live Twitch writes remain unverified |
| FND-7 — Local OBS widgets ([#7](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/7)) | Complete; QA PASS 9.2/10. Windows/macOS OBS trust and live Twitch writes remain unverified |
| FND-8 — Product localization ([#18](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/18)) | Complete; merged in PR #31; QA PASS 9.2/10 |
| FND-9 — Manual queues for ineligible channels ([#19](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/19)) | Open planning issue; implementation not started |
| OPS-1 — CI for API, infra and web ([#20](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/20)) | Complete; merged in PR #12 |
| OPS-2 — Safe localized Twitch status ([#21](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/21)) | Complete; initial mapping in PR #13, precedence/localization in FND-8 PR #31 |
| OPS-3 — Command catalog and role permissions ([#17](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/17)) | Complete; merged in PR #24 |
| OPS-4 — MIT license ([#29](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/29)) | Complete; merged in PR #25 |
| OPS-5 — Cross-platform lifecycle installer ([#30](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/30)) | Complete; merged in PR #37; independent AIOX-QA PASS 100/100. Linux real Compose lifecycle passed; physical Windows/macOS acceptance remains unverified |
| OPS-6 — Clear runtime status and guided panel states ([#32](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/32)) | Complete; merged in PR #33; independent QA PASS 100/100 |
| OPS-7 — Hierarchical command permissions and follower role ([#39](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/39)) | Done; QA 10/10; merged in PR #42 |
| OPS-8 — Automatic Twitch reconnection ([#41](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/41)) | Complete; merged in PR #43; QA PASS 9.5/10 |
| OPS-9 — Unified command access rules | Complete; merged in PR #44; AIOX-QA PASS |
| OPS-10 — Separate PR CI from main image delivery ([#45](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/45)) | In progress; reusable quality gates and main-only CD are being implemented |
| DOC-2 — Accurate bilingual product screenshots ([#40](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/40)) | Open; screenshot/GIF work planned after FND-9; visual preflight is recorded |
| DOC-3 — Full documentation consistency and UX-style audit | Owner-requested next story after OPS-8, FND-9, and DOC-2; not yet planned or published as an issue |

See the detailed acceptance criteria and implementation evidence in the [story index](stories.md) and its [pt-BR version](pt-BR/stories.md).

## Candidate stories for later planning

These owner-requested ideas are backlog candidates, not scoped stories or issues yet:

- Add carefully selected product screenshots to the English and pt-BR documentation, with an agreed capture/update process.
- **Current authorized sequence:** OPS-10 → FND-9 → DOC-2 → DOC-3 (full documentation audit). OPS-7 merged in PR #42; OPS-8 merged in PR #43 with QA PASS 9.5/10; OPS-9 merged in PR #44. The owner requested a visual preflight and Roles & Permissions correction before FND-9; DOC-2 records the review and media requirements. Screenshot/GIF work remains after FND-9. The owner conditionally authorized `beta` only after OPS-8, FND-9, and DOC-2 complete; DOC-3 remains the requested final documentation audit. Do not promote the stage before the release condition is met.
