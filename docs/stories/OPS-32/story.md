# OPS-32 — Queue cycle calendar: automatic reset by game, per-game presets and the "Old queues" tab

[Português (pt-BR)](../../pt-BR/stories/OPS-32/story.md)

**Status:** Draft (drafted by `@sm` on 2026-11-06). Not validated yet: `@po` validates next; the issue **#117** was created by `@devops` on 2026-11-06 before the GO (Ready still needs the `@po` GO). **Issue:** [#117](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/117) (text in [issue-body-changes-2026-11-06c](../../process/issue-body-changes-2026-11-06c.md)). **Scope of the 0.4.0-beta:** **candidate**; the owner decides whether it enters the 0.4.0-beta or comes later (pending question in the issue text).

**Source:** owner decisions of 2026-11-06 and the `@analyst` research note [2026-11-06-queue-calendar](../../research/2026-11-06-queue-calendar/README.md) (self-assessment 8.9/10; the official game pages could not be read, so **every catalog row needs the owner's confirmation against the in-game countdown** before it enters; sections cited below as "note §N").
**Related:** OPS-31 (#115, refund by group and chat notices; **this story depends on it**), OPS-22 (financial recovery; the outbox and its read-verify are reused), OPS-23 (SSE), OPS-20 (superseded by OPS-31), the [queue-group-refund note](../../research/2026-11-06-queue-group-refund/README.md).
**Registered items:** inventory **ST-25** (this story) and slices **FT-79..FT-85**. See [backlog-inventory](../../process/backlog-inventory.md).
**Coordination required:** `$aiox-po` (validation), `$aiox-architect` (scheduler, idempotency, archive model), `$aiox-data-engineer` (schema, 7-day purge), `$aiox-ux-design-expert` (plan and review, minimum 9.0, before the `@dev`), `$aiox-analyst` (done: the note; new research only for a GAP), `$aiox-devops` (issue), independent `$aiox-qa` (test plan, real-channel run, verdict).

## Problem

- The games the streamers play reset their endgame modes on a schedule (monthly or per game version). Today the streamer must remember the moment, close the queue by hand and decide what happens to the viewers who were still waiting, and must create the queues and rewards for each game from scratch.
- Points of redemptions that stay pending are held by Twitch; when a queue is wiped, the streamer needs time to decide (also when offline at the reset), person by person or in batch, whether the points return.

## Story

As a streamer,
I want to choose my game and have the queue restart by itself at the game's reset time, with queues and rewards suggested for that game and the old queue kept for 7 days,
so that I do not have to watch the clock and I can still return the points of the people who were left waiting.

## Owner decisions taken as given (2026-11-06)

- **(a) Calendar of cycles:** the queue **restarts by itself** at the reset time for **known games**; the **streamer chooses the game** (and the server/region).
- **(b) Presets:** choosing the game, the product **suggests creating the queues and rewards** (presets are **editable**; nothing is created until the streamer confirms).
- **(c) "Old queues" tab with 7-day retention:** the restarted queue goes there; the streamer, even if offline at the reset, decides later, person by person or in batch, whether the points return.
- **(d) What happens to redemptions still pending after the 7 days** is the **default policy the streamer defines in Settings** (it also applies when the reset happened with the streamer offline). Possible values: refund, keep pending, fulfill. `@analyst` recommendation: refund on day 7 with a warning on days 5 to 6; "keep" and "fulfill" as explicit alternatives. **Final values: point for `@po`/`@architect`** (see "Points for `@po` and `@architect`").

## Scope

**In (slices, in the suggested order of the Dependencies section):**

- **FT-79 (a)** versioned catalog of games, modes and cycles, with the owner's confirmation per row.
- **FT-80 (b)** game and server selection and the **suggestion of queues and rewards** (editable presets).
- **FT-81 (c)** automatic restart and the **"calendar expired"** state.
- **FT-82 (d)** "Old queues" tab and the 7-day retention.
- **FT-83 (e)** default policy in Settings and the warning before the end of retention.
- **FT-84 (f)** batch cancels at the end of retention.
- **FT-85 (g)** real tests on the test channel.

**Out of scope:** cycles defined by the streamer (the owner did not ask; **future question**: do streamers need their own cycles, for games outside the catalog?); auto-restart for a game outside the catalog (a "custom" game exists, with no presets and no automatic restart); logos, game art or any game asset; a persistent roster of viewers; a legal opinion on trademarks (general observations only, note §9); release, tag, bump.

## Acceptance criteria

Evidence classes stay separate: unit, isolated PostgreSQL integration with an injected clock, fake Twurple, real channel. Every behavior starts with a failing test.

### Group A — versioned catalog (FT-79)

1. **Given** the catalog, **then** it is a versioned file in the repository with a schema (`game` with names in en/es/pt-BR, `server` with a fixed UTC offset in minutes, `mode`, `cycles[]` with `starts_at_utc`, `ends_at_utc`, `source_url`, `verified_at`, `confidence`), reviewed in PR; an invalid file fails the schema test (note §3).
2. **Given** a row, **then** instants are stored in UTC and the logic uses fixed offsets (no daylight-saving rule); IANA zones are used only to **show** the time in the streamer's zone with `Intl`, and the display is readable by assistive technology.
3. **Given** a cycle row, **then** it is usable for an automatic restart only when the owner's confirmation against the in-game countdown is recorded (`verified_at` and the confirmation reference); an unconfirmed row is flagged and never used for a restart (note §7 item 2).
4. **Given** the two stable Genshin rules (Spiral Abyss on the 16th, Imaginarium Theater on the 1st, at 04:00 server time), **then** an optional monthly rule may generate rows, but each generated row still needs `verified_at` or an expiry date.
5. **Given** the catalog, **then** the panel shows "calendar verified on ..." with its version, and a CI alarm fires when the last confirmed row is less than 14 days ahead (the 14 days and the 45 days of AC 12 are parameters for `@architect`).
6. **Given** names of games and modes, **then** only plain text is used (no logos or game art) with a clear "not affiliated with the publishers" notice.

### Group B — selection and presets (FT-80)

7. **Given** the settings of a queue, **when** the streamer picks a game and a server (region) from the catalog, **then** only the streamer's server decides the cycle; **given** a game not in the catalog, **then** it can be typed as "custom": no presets and no automatic restart.
8. **Given** a known game chosen, **then** the panel shows a **preview** of the queues and rewards it suggests (names in pt-BR, en and es; order; cost and cooldown taken from the streamer's existing defaults, never from this story); optional ones are off by default; every field is editable.
9. **Given** the preview, **then** **nothing is created** (no queue and no Twitch API call) until the streamer confirms; on confirmation the creation uses the existing queue and reward flows; if part of it fails, the panel says exactly what was created and what was not; nothing is created silently.
10. **Given** the preset names, **then** they are marked as proposals until the owner confirms the official pt-BR and es names in each game's client; **given** the UI copy, **then** it does not assert game mechanics (note §4, co-op caveat).

### Group C — automatic restart and "calendar expired" (FT-81)

11. **Given** a queue linked to a known game and mode and a confirmed future row, **when** the cycle ends (clock injected in tests), **then** the active queue is closed and archived atomically (entries, positions, status, redemption ids, refund state), a new active queue starts with the same configuration (reward and OPS-31 settings), and the job is idempotent per `(queue, cycle)`.
12. **Given** no confirmed future row, or `confidence` below medium, or `verified_at` older than the limit (45 days, parameter), **then** the product **refuses the automatic restart**, the panel shows **"calendar expired"** (with the catalog date) and the queue keeps running; the product never restarts by guess.
13. **Given** a restart missed because the service was down, **then** it runs when the service returns and is recorded as late; **given** the streamer offline at the cycle end, **then** the restart still runs (remote calls need only a valid token; real test T2).
14. **Given** entries at the restart, **then** entries still waiting are **not** refunded or fulfilled by the restart: they move with the queue to "Old queues" (owner decisions c and d; the note §5 suggested applying the default policy at the reset, and this story applies it only at the end of retention); entries in service are not touched (OPS-31: refund only when service ends); [design question for `@architect`: where the in-service entry is concluded].
15. **Given** the restart, **then** the streamer may enable a chat notice and a panel notice ("queue restarted for the new cycle"), using the OPS-31 notices and its bounded send queue; no text carries a user id.

### Group D — "Old queues" tab and retention (FT-82)

16. **Given** archived queues, **then** the "Old queues" tab lists them read-only with counts per status, the pending count and "N days left"; per person and in batch the streamer can refund, fulfill (with confirmation) or keep.
17. **Given** a decision there, **then** it is persisted before the Twitch call and uses the OPS-22 outbox with one terminal intent per redemption (OPS-31 AC 18); a second cancel (404) resolves as already done.
18. **Given** a reward or queue deletion, **then** it stays blocked while an archived queue still has pending redemptions (deleting a reward with pending redemptions makes Twitch mark them fulfilled without refund; the existing block is extended to archived queues).
19. **Given** day 7 after the archive and the settlement of the pending items, **then** the Twitch user ids are purged and only aggregate counts remain; **given** ids kept during retention, **then** they are personal data: the privacy text says so and logs carry counts and reason codes only (no user id, login, chat or redemption body).

### Group E — default policy in Settings and warnings (FT-83)

20. **Given** Settings, **then** the streamer sets the **default policy** for redemptions still pending at day 7 with the values refund, keep pending, fulfill; the recommended default is **refund**; **fulfill** is irreversible and needs an explicit opt-in with a confirmation text (a fulfilled redemption can never be refunded). [Final values: point for `@po`/`@architect`.]
21. **Given** a reset with the streamer offline, **then** the same default policy applies at the end of retention if the streamer did not decide earlier.
22. **Given** an archived queue with pending redemptions, **then** the streamer is warned on days 5 to 6 (panel banner and, if enabled, chat or overlay notice) and again 24 hours before the end, and each warning says what will happen with the current policy.
23. **Given** the policy changes while a queue is archived, **then** the rule (snapshot at archive time or read at day 7) is defined by `@architect` and shown in the panel.

### Group F — batch cancels at the end of retention (FT-84)

24. **Given** the end of retention, **then** a job applies the policy to the pending items in chunks of up to 50 ids per call and one `reward_id` per call, with backoff on 429 honoring `Ratelimit-Reset`; a queue with thousands of entries is a few dozen calls.
25. **Given** an invalid token, an outage or an absent answer, **then** the item stays in the outbox in a safe state and the panel shows it; an absent response is never taken as confirmation; the job is idempotent and resumes after downtime, with visible partial progress.
26. **Given** the value "fulfill" without the opt-in of AC 20, **then** it never runs.

### Group G — real tests (FT-85)

27. **Given** the exclusive SubaruShogun test channel, **then** `@qa` runs the four checks of the list below with a verdict, recorded by class; no platform result outside what was run is claimed. The checks that overlap OPS-31 (expiry of an `UNFULFILLED` redemption, restored limits) run once.

### Cross-cutting

28. **Given** logs and errors, **then** no user id, login, token, header, chat or redemption body appears; unexpected failures return the generic localized text with `referenceId`.
29. **Given** the documentation, **then** the user guide, panel copy, privacy text and docs exist in English and pt-BR; localization and documentation-contract tests pass.
30. **Given** the quality gates, **then** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` and `npm run review:static` are green.

## Dependencies

- **Before the `@dev`:** `@analyst` note (done); `@architect`, `@data-engineer` and `@ux-design-expert` (score at least 9.0) opinions; `@po` GO and the issue; **OPS-31** (#115): chat notices (FT-71), the settlement and decision model (FT-74..FT-76) and the outbox intents are reused; this story starts only after the OPS-31 design is closed.
- **Suggested order:** FT-79 (catalog, with the owner's row-by-row confirmation) -> FT-80 (selection and presets) -> **FT-82** (archive and "Old queues": the restart needs somewhere to send the queue) -> FT-81 (restart and "calendar expired") -> FT-83 (policy and warnings) -> FT-84 (batch at the end) -> FT-85 (real tests, after each group). FT-79 and FT-80 may be planned in parallel by `@ux-design-expert` and `@architect`.
- **Owner action:** confirm each catalog row against the in-game countdown (Genshin: Adventurer's Handbook/Spiral Abyss screen; Honkai: Star Rail: Memory/Endgame screens; Zenless Zone Zero: Compendium; Wuthering Waves: Guidebook > Daily Activities and the Tower screen). Suggested game order: Genshin Impact first, then Honkai: Star Rail, Zenless Zone Zero and Wuthering Waves. [AUTO-DECISION: initial list and order follow note §7 item 1 → Genshin first (reason: only game with stable monthly rules).]

## Risks

1. **The catalog ages with every game version** (about every 6 weeks). Mitigation: AC 3, 5, 12 (refuse the restart, "calendar expired"); maintenance per version (`@analyst` researches, `@dev` edits the file, `@qa` runs the schema test).
2. **Wrong reset hour** (ZZZ 04:00 vs 05:00; Honkai: Star Rail hour unconfirmed). Mitigation: the owner confirms with the in-game countdown.
3. **Time zone and server confusion.** Mitigation: fixed UTC offsets for logic, `Intl` only to display (AC 2); the streamer's server decides.
4. **Points held up to 7 days** plus the warning time, and the **expiry of an `UNFULFILLED` redemption**, which is unknown: only a real test closes it (T1). Mitigation: warnings (AC 22), default policy (AC 20).
5. **Batch cancels on day 7 and the Helix rate limit.** Mitigation: AC 24 and 25 (chunks of 50, backoff, 404 as done).
6. **Twitch user ids kept up to 7 days are personal data** (GDPR/LGPD, general observation). Mitigation: purge (AC 19), privacy text, logs without UID.
7. **Game and mode names are trademarks of the publishers.** Mitigation: plain text only, "not affiliated" notice, custom games without presets (AC 6, 7); not legal advice.
8. **Fulfill on day 7 is irreversible.** Mitigation: explicit opt-in with confirmation (AC 20).

## Complexity (estimate by `@sm`, to be confirmed by `@architect`)

Scope 4, integration 3, infrastructure 3 (scheduler), knowledge 3, risk 4 = **17 → COMPLEX** (6 phases plus a revision cycle). Difficulty **GG**, priority **P2**.

## Points for `@po` and `@architect`

1. **Final values of the default policy** (refund, keep pending, fulfill; whether "fulfill" is offered at all; the recommended default is refund with warnings on days 5 to 6).
2. Scheduler placement (worker with a PostgreSQL advisory lock vs in-process timer), idempotency key per `(queue, cycle)`, behavior on downtime, and how the archived queue links to the outbox (note §8).
3. Archive model and the purge job (soft archive vs copy), index on `(queue_id, cycle_id)`, retention of Twitch user ids, migration of existing queues (`@data-engineer`).
4. Policy snapshot at archive time vs read at day 7 (AC 23) and the meaning of "keep" (the entry leaves the product and the redemption stays `UNFULFILLED` in Twitch; ids are purged).
5. Where an entry that is in service at the restart is concluded (AC 14).
6. Parameters of the guardrails: minimum confidence (medium), freshness (45 days), CI alarm (14 days).
7. Which entries remain "pending" after OPS-31: normal redemptions are fulfilled when service starts, so the pending ones are waiting entries and special-group entries in service or unresolved.

## Test plan

1. **Unit and fake Twurple:** catalog schema and rules; guardrails (refuse the restart, "calendar expired"); policy per value; double cancel with the real Twurple class; chunking and backoff on 429.
2. **Isolated PostgreSQL with real migrations and an injected clock:** atomic archive and new queue, idempotency per `(queue, cycle)`, late restart after downtime, purge at day 7, constraint of one terminal intent.
3. **Panel:** component tests and the browser scripts for the game picker, the preview, the "Old queues" tab and the warnings; visual evidence separate from static review.
4. **Real channel (SubaruShogun test channel):** `@qa` creates queues and rewards; the Orion performs the redemption actions in Chrome; `@qa` records the verdict.
5. **Gates:** the seven project gates; `@qa` verdict before `@devops` commits.

### What only a real test closes (note §6)

1. **T1:** whether Twitch expires or auto-refunds an `UNFULFILLED` redemption.
2. **T2:** whether `Update Redemption Status` works while the broadcaster is offline.
3. **T3:** whether a cancel restores the per-user and per-stream limits or the cooldown for the new cycle.
4. **T4:** whether pending redemptions of an archived queue appear in the Twitch Reward Requests queue mixed with the new cycle's items.

## Planning gates before implementation

- [ ] `@po` validation (10 points) and GO.
- [ ] `@devops` creates the GitHub issue.
- [ ] `@architect` design.
- [ ] `@data-engineer` schema opinion.
- [ ] `@ux-design-expert` plan and review, score at least 9.0.
- [ ] `@qa` test plan.
- [ ] Owner confirms each catalog row (before FT-81 can run for real).

## Definition of Done

- ACs 1 to 30 have recorded evidence by class; the four real-test items are closed or recorded as pending.
- Quality gates green; `@qa` verdict recorded; File List and checklists updated in English and pt-BR.

## SM draft validation (story-draft-checklist, 2026-11-06)

1. Goal and context: clear (manual reset and setup per game; points of the people left waiting). PASS.
2. Technical guidance: design from the note; open points assigned to specialists. PASS.
3. References: note sections, OPS-31, OPS-22. PASS.
4. Self-containment: scope, out of scope, owner decisions (a to d) and the deviation from note §5 stated. PASS.
5. Testing: unit, PostgreSQL with injected clock, real channel, four open items. PASS.
6. Static analysis: `npm run review:static` in the gates. PASS.
- Result: ready for `@po`. Questions to the owner: enters the 0.4.0-beta or later (pending in the issue text); own cycles (future); confirmation of each catalog row (owner action). Priority and order are proposals.

## File List

- `docs/stories/OPS-32/story.md` (new)
- `docs/pt-BR/stories/OPS-32/story.md` (new)
- `docs/stories.md` and `docs/pt-BR/stories.md` (index entry)
- `docs/process/backlog-inventory.md`, `docs/process/kanban-board-design.md` and pt-BR twins (ST-25, FT-79..FT-85; ST-24 aligned)
- `docs/process/issue-body-changes-2026-11-06c.md` and pt-BR twin (issue text)
- `docs/session-handoff.md` and pt-BR twin (state block)

Implementation files will be listed here by `@dev` after the gates.

## Change Log

- 2026-11-06 — `@sm` (River): story drafted from the owner decisions and the `@analyst` note. Status Draft. Slices FT-79..FT-85 registered. [AUTO-DECISION] item ID in the inventory → ST-25 (reason: next free story ID); all priorities P2, board order 9.0 (after OPS-31). [AUTO-DECISION] the restart does not apply the default policy; it only archives (reason: owner decisions c and d put the decision in "Old queues" and the policy at the end of retention; this adjusts note §5). OPS-32 registered as a candidate for the 0.4.0-beta (decision pending).
