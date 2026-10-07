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
| OPS-5 — Cross-platform lifecycle installer ([#30](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/30)) | InReview in PR #36; Linux/macOS Actions passed, Windows rerun pending after run 37637259314 failed to observe Compose startup; independent QA pending |
| OPS-6 — Clear runtime status and guided panel states ([#32](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/32)) | Complete; merged in PR #33; independent QA PASS 100/100 |

See the detailed acceptance criteria and implementation evidence in the [story index](stories.md) and its [pt-BR version](pt-BR/stories.md).

## Candidate stories for later planning

These owner-requested ideas are backlog candidates, not scoped stories or issues yet:

- Recover Twitch API/EventSub connectivity automatically after temporary network loss, sleep, shutdown, or restart when persisted OAuth credentials remain valid; do not request a new login for a transient outage.
- Add carefully selected product screenshots to the English and pt-BR documentation, with an agreed capture/update process.
