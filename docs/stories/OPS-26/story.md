# OPS-26 — System chat commands: `ping` with the real Twitch latency and the streamer-only `status` command

[Português (pt-BR)](../../pt-BR/stories/OPS-26/story.md)

**Status:** Draft (drafted by `@sm` on 2026-10-27; not yet validated by `@po`). **Issue:** pending (`@devops` creates it when the story is ready; no issue comments).
**Source:** defect **D-8** found in the live battery of 2026-10-26: the chat answered `Pong 🏓 Bot ativo · v0.2.0-0000000-beta · Twitch: latência indisponível` ([live-battery-2026-10-26-results.md](../OPS-15/live-battery-2026-10-26-results.md), LB-23) while `/health` reported `twitch_api_ping_ms: 219` on the same instance (owner report, 2026-10-27); the owner has seen "unavailable" several times. Owner request of 2026-10-27: a streamer-only `status` command.
**Related:** OPS-15 (the Next panel; this story starts only after its branch is merged); OPS-22 (financial operations shown by `status`); OPS-23 (SSE; none of its code is reused here); OPS-14 / #65 (localized chat behavior, no story file in the repository); the command catalog and localization catalogs (pt-BR, en, es).
**Registered items:** inventory ST-19 (this story, which carries defect D-8), TS-13 and TS-14 (tests; part of this story since 2026-10-30, with no cards of their own), OW-17 (owner live check of `ping`/`status`); see [backlog-inventory](../../process/backlog-inventory.md).
**Why LB-23 is PASS and D-8 is a defect:** the live battery graded LB-23 **PASS** because it checked only that the bot answers `ping`; on 2026-10-27 the owner classified the missing latency (`latência indisponível` while `/health` showed 219 ms) as defect D-8. Both statements are true; the battery result is not rewritten.
**Coordination required:** `$aiox-po` (validation, exact version format), `$aiox-architect` (how to measure latency without rate-limit pressure or cost; where `status` reads its data), `$aiox-ux-design-expert` (chat texts and formats, score >= 9.0 on the reviewed scope), independent `$aiox-qa`, `$aiox-devops` (issue). `$aiox-analyst` only if a GAP appears (a light Helix endpoint to measure latency): check [research-index.md](../../research-index.md) first.

## Problem

- **D-8 — the chat `ping` does not carry the Twitch latency the system already measures.** `/health` computes the probe time (`health-route.mjs`, `pingMs`), while the chat reply reads `twitchHealth?.pingMs` (`apps/api/src/commands/help.mjs:76-79`) and falls back to "unavailable" when it receives nothing. Why the chat does not receive the `/health` measurement is **not yet verified**; the investigation is part of this story.
- **The streamer has no single chat view of the bot health.** There is no command that shows rewards, uptime, connections, latency, version, queues and pending operations in one answer.

## Owner decisions (2026-10-27)

1. This is a new story, status Draft, that enters **only after the migration/cutover and after the branch `feat/ops-15-next-panel` is merged into `main`**: ST-01 (#69) integrated in `main` is an explicit dependency; the card stays Blocked until then. Priority P2, difficulty M.
2. The `ping` answer **always** carries the real Twitch response time; never "unavailable" when Twitch responds. The expected format is `Pong 🏓 - vMAJOR.MINOR.PATCH-stage - <value>ms.` (example `Pong 🏓 - v0.2.0-beta - 219ms.`). The real version string today is `v0.2.0-0000000-beta` (see `validate:version`); **Fixed by `@po` (2026-10-28, `[AUTO-DECISION]`): the owner format is binding, without the commit segment.** If the owner wants the commit segment back, that is a new owner decision. `@architect` only confirms where the string comes from.
3. An **automated test is mandatory** (owner decision): it fails if the chat ping does not bring the value in ms when `/health` or the adapter has a measurement, covering the cases measurement present, absent and Twitch failing; plus a live check in the owner checklist.
4. `status` is **streamer-only** (owner/streamer; viewers get a short refusal); the permission is fixed in the command catalog, not configurable by viewers.

## Story

As the streamer,
I want the chat `ping` to show the real Twitch latency and a `status` command that summarizes the bot,
so that I can see on stream, in one message, whether the bot and Twitch are healthy, without opening the panel and without a misleading "unavailable".

## Scope

**In:**

- Fix D-8: investigate the cause, make `ping` use a real measurement, short honest error with a code when the measurement truly fails.
- Format of `ping` as decided (owner decision 2).
- New `status` command, streamer-only. Proposed **minimum list** (extensible; every item traces to the owner request): created rewards per queue (synced / paused / open); bot uptime; Twitch connection (API, chat, integration: connected / degraded); Twitch response time; version; active and open queues; pending operations and `needs_review` count. Nothing sensitive: no tokens, UID, chat or redemption text.
- Messages fit the chat length limit (split or abbreviate); texts localized in pt-BR, en and es.
- Fixed permission in the command catalog.

**Out:**

- Changing who may run other commands, or making the `status` permission configurable.
- New commands beyond the owner request. **Suggestion for the owner (not in scope):** `version` and `uptime` as separate commands only if `status` does not already cover them; today it does.
- Panel changes, SSE, or changes to `/health` beyond what the architect needs to share the measurement.
- Version bump, commit, push, PR, release.

## Acceptance criteria

Evidence classes stay separate: unit, integration (PostgreSQL where data is read), chat E2E with fixtures, and live channel. Every behavior starts with a failing test.

1. **Given** the adapter or `/health` has a latency measurement, **when** a viewer or the streamer runs `ping`, **then** the reply is `Pong 🏓 - vMAJOR.MINOR.PATCH-stage - <value>ms.` (no commit segment; example `Pong 🏓 - v0.2.0-beta - 219ms.`; the version string comes from the same source as `validate:version`, with no second version constant) with the measured value and never "unavailable". **Test (mandatory):** fails if the value is missing while a measurement exists; the unit test also asserts the version form.
2. **Given** no measurement exists yet, **when** `ping` runs, **then** the bot takes a measurement (one light Helix call) and answers with it; **given** the measurement fails, **then** it answers a short honest error with a code (no invented value, no internal message), and the failure is logged without user data. **Test (mandatory):** the three cases, present / absent / Twitch failing.
3. **Given** many `ping` commands in a short time, **when** they run, **then** the measurement is cached or limited so that Twitch rate limits and cost are not stressed; the policy is fixed by `@architect` and tested with fake timers.
4. **Given** the investigation of D-8, **then** the cause (why the chat did not use the `/health` measurement) is recorded in this story with the evidence, and the fix is test-first.
5. **Given** the streamer runs `status`, **when** it answers, **then** it shows the minimum list above in localized text, within the chat limit (the bound is the 500-character limit of the existing `bounded()` helper in `apps/api/src/commands/help.mjs`; split into several messages when needed), with no token, UID, chat or redemption text.
6. **Given** a viewer (or any non-streamer) runs `status`, **when** it is processed, **then** the reply is a short localized refusal and no data is shown; the permission lives in the command catalog and cannot be changed through the panel.
7. **Given** pt-BR, en and es, **when** `ping` and `status` answer, **then** the texts exist in the three catalogs and `npm run validate:localization` passes; `@ux-design-expert` approves formats and wording (>= 9.0 on the reviewed scope, stating what the review does not cover).
8. **Given** the chat is exercised with fixtures (E2E), **then** `ping` and `status` produce the expected outbound messages for connected, degraded and failing Twitch.
9. **Given** the owner runs the live check (OW-17), **then** the real `ping` on the channel shows a value in ms close to the `/health` value of the same instance, and the real `status` shows the expected fields; the result is recorded as a separate live-evidence class.

## Dependencies

- **Depends on:** ST-01 / issue #69 integrated in `main` (explicit); `@po` GO and `@devops` issue; `@architect` decision on measurement and data source; `@ux-design-expert` plan; OPS-22 delivered or stable for the operations part of `status`.
- **Write set:** chat command handlers, the command catalog and the three chat catalogs (after cutover wave 2 / DP-3 they live in `apps/shared/localization/catalogs/`; the story starts after the merge, so use that path); coordinate with OPS-24 (TypeScript) if files were converted by then.
- **TS-13 and TS-14 are part of this story (owner, 2026-10-30):** TS-13 (the mandatory D-8 test, AC 1-2) and TS-14 (the `status` tests, AC 3 and 5-8) are written Red-first by `@dev` inside this story; they are no longer separate items on the board. No AC change.

## Risks

- **Rate limit and cost:** a Helix call per `ping` could be abused by chat spam. Mitigation: AC 3.
- **Leak of sensitive data in `status`:** Mitigation: explicit allowlist of fields, test that asserts the exact output keys.
- **Chat length limit and three languages:** Mitigation: AC 5 and 7 with length tests per language.
- **Root cause unknown:** the cause of D-8 may be wiring or timing, not only formatting. Mitigation: AC 4 before the fix.

## Complexity (estimate by `@sm`)

Scope 2, integration 3, infrastructure 1, knowledge 2, risk 2 = **10 → STANDARD**. Difficulty **M**, priority **P2**.

## Business value

The streamer sees a truthful latency and the whole bot status inside the chat, and a recurring false "unavailable" disappears.

## Test plan

1. **Unit:** latency measurement and formatting (present, absent, failing), version form, message splitting by language, rate policy with fake timers, `status` field allowlist.
2. **Integration:** `status` reading queues, rewards and operations from isolated PostgreSQL with real migrations (never mocks of Prisma).
3. **Chat E2E (fixtures):** AC 8.
4. **Live channel:** AC 9, owner-gated (OW-17), recorded separately.
5. **Gates:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static`; `@qa` issues the verdict before `@devops` commits.

## Planning gates before implementation

- [ ] `@po` validation (10 points) and GO; exact version form fixed.
- [ ] `@devops` creates the issue.
- [ ] `@architect`: measurement method, cache/limit, data source of `status`.
- [ ] `@ux-design-expert`: chat texts and formats, score >= 9.0.
- [ ] `@qa` test plan.
- [ ] `@analyst` note only if a GAP exists (light Helix endpoint); `docs/research-index.md` checked first.
- [ ] Branch `feat/ops-15-next-panel` merged into `main` (ST-01 / #69 integrated).

## Definition of Done

- ACs 1-8 have Red-first evidence by class; AC 9 executed with the owner or explicitly waived by the owner.
- All quality gates green; `@qa` verdict recorded; File List and checklists updated in English and pt-BR.

## SM draft validation (story-draft-checklist, 2026-10-27)

1. Goal and context: clear (D-8 evidence, owner request). PASS.
2. Technical guidance: files named as leads; root cause explicitly unverified. PASS.
3. References: LB-23 and the live results. PASS.
4. Self-containment: format, permission and dependencies stated. PASS.
5. Testing: mandatory three-case test, classes separated. PASS.
6. Static analysis: `npm run review:static` in the gates. PASS.
- Result: ready for `@po`. The field list of `status` is a proposal marked as such; nothing else was invented.

## File List

- `docs/stories/OPS-26/story.md` (new)
- `docs/pt-BR/stories/OPS-26/story.md` (new)
- `docs/stories.md` (index entry)
- `docs/pt-BR/stories.md` (index entry)

## Change Log

- 2026-10-27 — `@sm` (River): story drafted from defect D-8 (LB-23) and the owner request for the streamer-only `status` command. Status Draft. Blocked until the branch is merged into `main`.
- 2026-10-28 — `@sm` (River): applied `@po` required corrections 1-3 and should-fix 1-2. AC 1 now fixes the version form (`vMAJOR.MINOR.PATCH-stage`, no commit segment); D-8 and OW-17 are named with their inventory IDs (ST-19, TS-13, TS-14, OW-17, already in the inventory since the fifth update); the LB-23 PASS versus D-8 explanation is in the header; the write set names the post-wave-2 catalog path; AC 5 states the 500-character bound. Status unchanged (Draft; `@po` owns status).
- 2026-10-28 — `@sm` (River): pt-BR decision 2 aligned to the en text (version form fixed without the commit segment; removed the stale "with or without the commit segment" wording that contradicted AC 1). No change to the en body.
- 2026-10-30 — `@sm` (River): recorded that inventory items TS-13 and TS-14 are part of this story (owner-approved merge); no AC, scope or status change.
