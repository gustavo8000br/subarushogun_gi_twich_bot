# Research note: queue calendar (game cycles), per-game presets and the "Old queues" tab

[Português brasileiro](../../pt-BR/research/2026-11-06-queue-calendar/README.md)

- Author: `@analyst` (Atlas). Consulted: 2026-11-05. Desk research; it does not replace a test in the project environment.
- Labels: **VERIFIED** (official source or repo code), **PARTIAL** (secondary source, consistent), **UNVERIFIED** (conflicting or inferred), **TEST** (only a live test closes it).
- Index checked first (`docs/research-index.md`): no row covered game cycles. Row #27 already says that the expiry of `UNFULFILLED` redemptions is UNVERIFIED; this note did one more search on 2026-11-05 and found nothing (see section 6).

## 1. Executive summary

1. **Two kinds of cycle.** (a) *Calendar rules* that are stable and computable: Genshin Spiral Abyss on the 16th and Imaginarium Theater on the 1st of each month, always at the 04:00 daily reset of the player's server. (b) *Version-driven cycles* that shift with patches: Genshin Stygian Onslaught, Honkai: Star Rail, Zenless Zone Zero and Wuthering Waves modes. These cannot be derived from a rule; they need dated rows.
2. **Recommended model: a versioned catalog of dated cycle rows, plus optional monthly rules.** Server offsets are **fixed UTC offsets** (America UTC-5, Europe UTC+1, Asia and TW/HK/MO UTC+8), so no daylight-saving logic is needed on the game side. DST only matters when *showing* the time in the streamer's own zone (use `Intl`/IANA for display only).
3. **Staleness is the main risk.** Version cycles last about 6 weeks (Genshin 7.2 launches 2026-11-04; HSR 4.6 launched 2026-09-28). The product must refuse to auto-reset when the catalog has no confirmed future row, and tell the streamer (never reset "by guess").
4. **Confidence is medium for the table in section 2.** Official HoYoverse pages (hoyolab, genshin.hoyoverse.com, wiki) are rendered by JavaScript and returned no text to the fetch tool; Fandom returned HTTP 402. The table rests on guide sites and on search snippets of official pages. Each row says so. The design therefore tells the owner to confirm each row against the **in-game countdown** before it enters the catalog.
5. **Retention (7 days):** keep archived entries and pending redemptions in the product; the default policy for what remains pending is chosen in Settings. Recommended default: **refund at day 7, after a warning at day 5-6**, with "keep" and "fulfill" as explicit alternatives. Refund volume is not a rate-limit problem (50 ids per call). The real unknowns are **TEST** items (section 6).

## 2. Table of cycles (consulted 2026-11-05)

Common server facts (PARTIAL): daily reset 04:00 server time in Genshin; servers America UTC-5 (09:00 UTC), Europe UTC+1 (03:00 UTC), Asia UTC+8 (20:00 UTC on the previous day), TW/HK/MO also UTC+8 but a separate server. Guides say the offsets do not follow DST (the "5 AM" figures for US viewers are a display effect); one guide claims the reset moved to 5 AM, so this stays PARTIAL.

| Game / mode | Cycle | Reset moment | Stable or patch-driven | Source (type) | Confidence |
|---|---|---|---|---|---|
| Genshin: Spiral Abyss (floors 9-12; 1-8 permanent) | Monthly, **day 16** (e.g. 2026-09-16 to 2026-10-16; next 2026-11-16 by pattern) | 04:00 server time | Stable rule since Imaginarium Theater was added (earlier it was 1st and 16th; older guides still say so) | HoYoWiki and HoYoLAB cycle page 2026/09/16-10/16, and "new season on October 16" in the 7.1 notes, as search snippets (official, not readable in full); Sportskeeda, bittopup (secondary) | Medium-high |
| Genshin: Imaginarium Theater | Monthly, **day 1** to 03:59 on day 1 of the next month (Season 29: 2026-11-01 04:00 to 2026-12-01 03:59) | 04:00 server time | Stable rule | gamemarket.gg (secondary); GenshinBuilds timeline shows other windows (labeling unclear) | Medium |
| Genshin: Stygian Onslaught | About **42 days**, aligned with version phases (starts seen: Apr 15, May 27, Jul 8, Aug 19, Sep 30, 2026; next about Nov 11 by arithmetic) | Listed around 10:00 server time (likely after the maintenance window) | **Patch-driven** | GenshinBuilds timeline (secondary); Timesaver conflicts | Low-medium |
| Honkai: Star Rail: Memory of Chaos, Pure Fiction, Apocalyptic Shadow, Anomaly Arbitration | Each ~**5-6 weeks**, offset inside the version. Version 4.6: Anomaly Arbitration 09-28 (ends 11-11), MoC 09-28 and again 11-02, Apocalyptic Shadow 10-05, Pure Fiction 10-19 | At the daily reset of each server (hour not given by the page; HSR also uses a 04:00 server reset, UNVERIFIED here) | **Patch-driven** | allthings.how (secondary); NA starts one day earlier than EU/Asia in the page | Medium for 4.6 dates, low for the hour |
| Zenless Zone Zero: Deadly Assault | **2 weeks** (e.g. 2026-01-16 to 01-30) | Server daily reset; sources split between 04:00 and 05:00 | Fairly stable; version changes can move it | Game8, Gfinity, GameWith (secondary) | Medium (days), low (hour) |
| Zenless Zone Zero: Shiyu Defense (Critical Node) | Sources conflict: **4 weeks** (older) vs **2 weeks** (Game8 version 2.5 schedule) | Same as above | Changed in patch 2.5 | Game8 (secondary) | Low |
| Wuthering Waves: Tower of Adversity (Hazard Zone) | About **28 days** (earlier 14 days, changed in 2.1) | Server time is China-based UTC+8; daily reset 04:00; regional conversions differ between guides | Patch-driven | TOPUPLive 3.7 guide (2026-10-20), Game8, iQOO (secondary) | Low-medium |
| Wuthering Waves: Whimpering Wastes | Monthly | Same | Patch-driven | Game8 (secondary) | Low |

What is **stable**: Genshin Spiral Abyss (16th) and Theater (1st), both at 04:00 server time; the existence of three regional offsets. What **changes by patch**: everything else, including the date a mode starts inside the version, the cycle length of Shiyu Defense, and the one-day shift between NA and EU/Asia launch dates.

Official source to cite for each row once confirmed: the in-game countdown (Genshin: Adventurer's Handbook/Spiral Abyss screen; HSR: Memory/Endgame screens; ZZZ: Compendium; WuWa: Guidebook > Daily Activities and the Tower screen), plus each game's official version notice.

## 3. Recommended model

**Catalog = versioned file in the repository (JSON/YAML with a schema), not a database table edited by hand.** Review in PR, validated in CI.

- `game` (id, localized names en/es/pt-BR), `server` (id, fixed UTC offset in minutes, e.g. America -300, Europe +60, Asia +480, TW-HK-MO +480), `mode` (id, localized names), `cycles[]` with `starts_at_utc`, `ends_at_utc`, `source_url`, `verified_at`, `confidence`.
- For the two Genshin monthly modes, an optional **rule** (`monthly`, day, local time 04:00, offset) may *generate* rows for the next N months, but each generated row still needs `verified_at` or an expiry.
- Store instants in UTC; compute with fixed offsets (plain arithmetic, no library). `IANA` zones (`Etc/GMT+5` has an inverted sign, avoid it; `Asia/Shanghai` has no DST) are only needed to **display** the time in the streamer's zone with `Intl.DateTimeFormat` (ECMA-402, already in the project via FND-8).
- **Streamer chooses game and server (region).** Viewers on other servers do not change the queue; only the streamer's server decides the cycle.
- **Guardrails:** (1) auto-reset only for a row with `confidence >= medium` and `verified_at` within 45 days; (2) if the catalog has no future row, show "calendar expired" in the panel and keep the queue running; (3) the scheduler job is idempotent per `(queue, cycle)`; a missed reset (service down) runs on restart and is recorded as late; (4) catalog version is shown in the panel ("calendar verified on ...").
- **Maintenance:** one update per game version (about every 6 weeks). Suggested owner: `@analyst` researches, `@dev` edits the file, `@qa` runs the schema test. Alarm in CI when the last row is less than 14 days ahead.
- **Prior art (PARTIAL):** event trackers and fan calendars for these games (for example GenshinBuilds timeline) publish dated windows per version rather than computing them, which supports the dated-row model. I did not find a Twitch queue bot that auto-resets on game cycles; treat the feature as new (UNVERIFIED claim of absence).

## 4. Suggested presets (editable, created only after confirmation)

Localized labels below are **proposals**; confirm the official pt-BR and es names in each game's own client before shipping (UNVERIFIED).

| Game | Mode (en / es / pt-BR) | Cycle | Suggested queue | Suggested reward |
|---|---|---|---|---|
| Genshin Impact | Imaginarium Theater / Teatro Imaginario / Teatro Imaginário | Monthly, day 1 | "Teatro: co-op run" (1 slot at a time) | "Join the Theater queue" |
| Genshin Impact | Spiral Abyss / Abismo Espiral / Abismo Espiral | Monthly, day 16 | "Abismo: floors 9-12 help" | "Join the Abyss queue" |
| Genshin Impact | Stygian Onslaught / (to confirm) / (to confirm) | ~6 weeks | optional | optional |
| Honkai: Star Rail | Memory of Chaos / Memoria del Caos / Memória do Caos; Pure Fiction / Ficción Pura / Ficção Pura; Apocalyptic Shadow / Sombra Apocalíptica / Sombra Apocalíptica | ~5-6 weeks | one queue per mode, off by default | one reward per queue |
| Zenless Zone Zero | Deadly Assault / (to confirm) / (to confirm); Shiyu Defense | 2 weeks | optional | optional |
| Wuthering Waves | Tower of Adversity / Torre de la Adversidad / Torre da Adversidade | ~28 days | optional | optional |

Rules: the preset only *proposes* names, order and cost; the streamer edits everything and confirms before any queue or reward is created (Twitch API call). Never create rewards silently. Default cost and cooldown come from the streamer's existing defaults, not from this note (no invention).

Genshin co-op caveat to confirm with the owner: Imaginarium Theater and Spiral Abyss are mostly single-player in the game; the queue is for "help/assist", spectating or co-op roles chosen by the streamer. Do not assert game mechanics in the UI copy.

## 5. Reset and retention (7 days)

- **At reset (cycle end):** the active queue is closed and archived atomically (one transaction): entries, positions, status, redemption ids, refund state. A new active queue starts for the new cycle with the same configuration (reward, group refund rules from OPS-31).
- **Interaction with OPS-31:** entries still *waiting* at reset follow the same rule as a cancel/skip decided by the streamer: the reset applies the **default policy**, because the streamer is not there to decide. Entries *in service* at reset are not touched (OPS-31: refund only when service ends).
- **Old queues tab (7 days):** read-only list with counts per status, pending count, and per-entry actions (refund, fulfill, keep). Countdown "N days left". Warning to the streamer at day 5-6 (panel banner and, if enabled, a chat or overlay notice); a second warning 24 h before.
- **Default policy in Settings for entries still pending at day 7 (recommended order):**
  1. **Refund** (default): cancel the redemption, points return to the viewer. Reversible for the viewer, harmless to the streamer's trust.
  2. **Keep**: leave `UNFULFILLED` in Twitch and drop the entry from the product. Risk: points held indefinitely; expiry is unknown (TEST).
  3. **Fulfill**: irreversible; consumes the points without service. Only as an explicit opt-in with a confirmation, because FULFILLED can never be refunded (row #27).
  The same policy applies when the reset happens with the streamer offline. Remote calls need only a valid token (no source says the stream must be live; **TEST**); if the token is invalid, the item stays in the outbox with a safe state and the panel shows it.
- **Batch at day 7:** `Update Redemption Status` accepts up to 50 ids per call and one `reward_id` per call; Helix uses a token bucket (default cost 1 point per request, 429 when the bucket runs out in a minute, `Ratelimit-Reset` header tells when to retry). A queue with thousands of entries is a few dozen calls, so the limit is not a practical blocker; still run in chunks with backoff on 429 and treat 404 on a second cancel as "already done" (row #27, section on double cancel).
- **Do not delete a reward with pending redemptions:** Twitch marks them FULFILLED without refund (row #27). The existing queue-deletion block must also cover archived queues that still have pending items.
- **Privacy (general observation, not legal advice):** Twitch user IDs are pseudonymous but still personal data under GDPR/LGPD. Keep them only for the retention window, purge or reduce to aggregate counts after day 7 plus the settlement of pending items, mention it in the privacy text, and keep logs free of UID, chat text and redemption bodies (project rule). Check the Twitch Developer Services Agreement data-retention clauses (page unreadable in the earlier round, row #27).

## 6. Risks and items that need a live test

| # | Item | Status |
|---|---|---|
| T1 | Does an `UNFULFILLED` redemption expire or get auto-refunded? Official reference only says "normal request queue process". A new search on 2026-11-05 (Twitch docs, forum, third-party docs) found nothing; the only "30 days" found is about Twitch discontinuing Channel Points, not redemptions | **TEST** |
| T2 | Does `Update Redemption Status` work while the broadcaster is offline? | **TEST** |
| T3 | Does cancel restore per-user and per-stream limits or cooldown for the new cycle? | **TEST** (same as row #27) |
| T4 | Whether pending redemptions from an archived queue are visible in the Twitch Reward Requests queue mixed with the new cycle's items (dashboard confusion) | **TEST** |
| R1 | Catalog gets old: mitigated by guardrails in section 3 | design |
| R2 | Wrong reset hour (ZZZ 04:00 vs 05:00; HSR hour not confirmed) | owner confirms by in-game countdown |
| R3 | Server DST confusion for display | display-only `Intl`; fixed offsets for logic |
| R4 | Points held up to 7 days plus warning time | owner/UX decision (section 7) |

## 7. What depends on the owner

1. Initial **game list** (suggestion: Genshin first, then HSR, ZZZ, WuWa) and which modes are in the catalog.
2. Confirm each cycle row against the in-game countdown before it enters the catalog (`@analyst` cannot read the games).
3. Default policy at day 7 (recommended: refund) and whether "fulfill" is offered at all.
4. Whether the product may reset while the streamer is offline (recommended: yes, applying the default policy).
5. Text for warnings and the privacy notice.
6. Preset names in pt-BR/es after checking the game clients.

## 8. Open questions for other agents

- `@architect`: scheduler placement (worker with PostgreSQL advisory lock vs in-process timer), idempotency key per `(queue, cycle)`, behavior on downtime, how the archived queue links to the outbox.
- `@data-engineer`: schema for archived queues and 7-day purge job (soft archive vs copy), index on `(queue_id, cycle_id)`, retention of Twitch user ids, migration for existing queues.
- `@ux-design-expert`: "Old queues" tab, expiry countdown and day 5-6 warning, game picker with preview of what will be created, "calendar expired" state, region picker wording, accessible time display in the streamer's zone.
- `@dev` (later): catalog schema test and CI alarm.

## 9. Rights and trademarks (general observations, not legal advice)

- Game and mode names belong to their publishers (HoYoverse for Genshin, HSR, ZZZ; Kuro Games for Wuthering Waves). Naming a game in a third-party tool to say what it is for is common practice (nominative use), but check: each publisher's fan-content or brand guidelines, whether names appear in marketing versus only in the streamer's panel, no logos or game art, and a clear "not affiliated" notice. I did not locate the publishers' current guideline pages in this round (UNVERIFIED).
- Use plain-text names only; let the streamer type any other game as "custom" without presets.

## 10. Limitations

- Official game pages were unreadable (JavaScript-rendered or HTTP 402); the cycle table depends on guide sites and search snippets of official pages.
- Several dates are "future" relative to older guides and were cross-checked only between secondary sources.
- Localized mode names are proposals.
- Nothing here was tested in PostgreSQL, Twitch or a browser.
- Self-assessment: sources 8.0 (official unreadable), evidence 8.5, case fit 9.5, risks 9.5, measurability 9.0 (confirmable by the in-game countdown and four TEST items); **overall 8.9**. Below the 9.0 target only because of the official-source gap; the design is built so that gap cannot cause a wrong automatic reset (guardrails and owner confirmation per row).

## Sources

- Twitch Helix rate limits: https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits
- Twitch Update Redemption Status (via row #27): https://dev.twitch.tv/docs/api/reference/#update-redemption-status
- HoYoLAB cycle page: https://www.hoyolab.com/article/46724671
- HoYoWiki Spiral Abyss: https://wiki.hoyolab.com/pc/genshin/entry/5669?lang=en-us
- Genshin 7.1 notes: https://genshin.hoyoverse.com/en/news/detail/166383
- Theater season dates: https://gamemarket.gg/news/genshin-impact/how-to-clear-imaginarium-theater-in-genshin-impact-7-2
- Genshin server times: https://www.rpgsite.net/feature/10336-genshin-impact-daily-reset-when-the-server-reset-time-is-in-your-region and https://progameguides.com/genshin-impact/did-the-server-reset-time-change-in-the-america-server-in-genshin-impact
- Stygian Onslaught timeline: https://genshin-builds.com/timeline
- HSR 4.6 endgame dates: https://allthings.how/honkai-star-rail-4-6-endgame-mode-release-dates/
- ZZZ: https://game8.co/games/Zenless-Zone-Zero/archives/460247 and https://allthings.how/zenless-zone-zero-deadly-assault-reset-explained/
- WuWa: https://www.topuplive.com/news/wuthering-waves-3-7-tower-of-adversity-guide.html and https://dexerto.com/wuthering-waves/wuthering-waves-daily-and-weekly-reset-time-2743101
- Previous note: `docs/research/2026-11-06-queue-group-refund/README.md`
