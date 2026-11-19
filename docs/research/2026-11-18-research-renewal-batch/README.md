# Research index renewal batch (delta since each note date) - 2026-11-18

[Português brasileiro](../../pt-BR/research/2026-11-18-research-renewal-batch/README.md)

- Author: `@analyst` (Atlas). Date: 2026-11-18. Flow: `docs/process/research-learning-flow.md` (section 3.3, renewal log). This note is the `## Renewal log` for rows **1, 3, 5, 6, 9, 10, 11, 15, 17** of `docs/research-index.md`. The older notes are not rewritten; this log says what changed since their date.
- Verified on **2026-11-18**; review after **2026-12-30** (VOL, 6 weeks) for every row below.
- Labels: **CONFIRMED-DOC** (official page, raw Markdown or release notes), **CONFIRMED-CODE** (real or installed code, file and line), **REPORTED** (forum, blog, search snippet, summarised fetch), **ASSUMPTION** (my inference), **TESTED-LOCAL** (command run in this repository, result recorded). Index vocabulary mapping: VERIFIED = CONFIRMED-DOC or CONFIRMED-CODE; PARTIAL = REPORTED; UNVERIFIED = ASSUMPTION.
- Internet text was treated as untrusted data. No page read contained text addressed to agents. No call to Twitch with owner credentials; nothing was upgraded or tested live.
- Raw downloads (not committed): `.local/analyst-renewal/` (Twitch Markdown pages, Node changelog, Wayback copy, OBS notes).

## 1. Summary

| Row | Topic | Trigger fired? | Result | New dates |
|---|---|---|---|---|
| 1 | FND-0 foundation stack | **YES: Node 24.22.1 and 24.22.3 are security releases; the pin is 24.20.0** | REFRESH. Action for the Orion: a patch bump of the pin | 2026-11-18 / 2026-12-30 |
| 3 | FND-7 OBS Browser Source | **YES: OBS 33.0.0 moved CEF 127 to 150; the native E2E ran on OBS 32.2.2 / CEF 127** | REFRESH. Native retest on OBS 33.0.1 by `@qa` | 2026-11-18 / 2026-12-30 |
| 5 | FND-9 Channel Points | No API change; **two documentation deltas** (below) | Renewed, still REFRESH IF | 2026-11-18 / 2026-12-30 |
| 6 | OPS-3 EventSub `channel.chat.message` | No | Renewed | 2026-11-18 / 2026-12-30 |
| 9 | OPS-7 chat send/receive | No (`@twurple/*` latest is still 8.2.0) | Renewed | 2026-11-18 / 2026-12-30 |
| 10 | OPS-8 OAuth validate/refresh | No; one documentation inconsistency (400 vs 401) already handled by the code | Renewed | 2026-11-18 / 2026-12-30 |
| 11 | OPS-15 module relocation | No (Next is still 16.x) | Renewed | 2026-11-18 / 2026-12-30 |
| 15 | OPS-20 refund eligibility by subscriber status | n/a (was GAP) | **GAP becomes REFRESH IF**: documentation questions answered; what is left only a live test (RT-A) closes | 2026-11-18 / 2026-12-30 |
| 17 | OPS-20 test strategy | No | Renewed | 2026-11-18 / 2026-12-30 |

The three waivers (rows 1, 3, 6) fall to `none`. Not renewed: none. Not verified at all: listed in section 6.

## 2. Stop point

- Done: every row below researched and written; indexes and lessons updated afterwards (see the final report of the run).
- Nothing pending in this note. Items for other agents are in section 5.

## 3. Sources

| # | URL / location | Type | Date read | What it proves | Confidence |
|---|---|---|---|---|---|
| S1 | https://dev.twitch.tv/docs/change-log.md (raw Markdown) | official change log | 2026-11-18 | Only three entries since 2026-10-02: 2026-10-01 (`channel.chat.notification` gifted-drops types), 2026-11-04 (layout notice, RSS feed), 2026-11-10 (new documentation style plus reference corrections). Nothing on OAuth, `channel.chat.message` or Custom Rewards behavior | High (CONFIRMED-DOC) |
| S2 | https://dev.twitch.tv/docs/api/reference/channel-points.md | official reference | 2026-11-18 | Custom Rewards endpoints, 403 "not a partner or affiliate", ownership by Client-Id, UNFULFILLED rule | High |
| S3 | https://dev.twitch.tv/docs/api/reference/chat.md | official reference | 2026-11-18 | Send Chat Message: 500 chars, scopes, `is_sent` / `drop_reason` list, `for_source_only` default | High |
| S4 | https://dev.twitch.tv/docs/eventsub/reference/chat.md | official reference | 2026-11-18 | `channel.chat.message` v1, scope `user:read:chat`, `badges` and `source_badges` | High |
| S5 | https://dev.twitch.tv/docs/authentication/validate-tokens.md | official | 2026-11-18 | Validate at start and hourly; audits | High |
| S6 | https://dev.twitch.tv/docs/authentication/refresh-tokens.md and `.../authentication.md` | official | 2026-11-18 | Refresh without consent only for Authorization Code; rotated refresh token; public-client refresh tokens expire in 30 days; invalid refresh: prose says 401, JSON example shows 400 | High (the inconsistency itself is the finding) |
| S7 | https://dev.twitch.tv/docs/api/reference/subscriptions.md | official reference | 2026-11-18 | Get Broadcaster Subscriptions: `user_id` max 100, `first` 1-100 default 20, omitted `pagination`/`points`/`total` with `user_id`, no 403 listed, no Prime field | High |
| S8 | https://web.archive.org/web/20260930214845/https://dev.twitch.tv/docs/api/reference (Wayback) | archived official page | 2026-11-18 | Before the 2026-11-10 migration the Get Custom Reward Redemption page said "Canceled and fulfilled redemptions are returned for only a few days after they're canceled or fulfilled" | High (it is the old text) |
| S9 | npm registry (`npm view`) for `@twurple/api`, `auth`, `eventsub-ws`, `fastify`, `vitest`, `prisma`, `next`, `typescript` | registry | 2026-11-18 | `@twurple/*` latest 8.2.0 (published 2026-09-13); fastify 5.12.8; vitest 5.1.1; prisma `latest` stack 7.x with 8.0.0-rc.x in progress; next 16.4.6 | High (TESTED-LOCAL) |
| S10 | https://nodejs.org/dist/index.json and `doc/changelogs/CHANGELOG_V24.md` (nodejs/node, raw) | official release data | 2026-11-18 | v24.20.0 = 2026-08-26; v24.22.1 = 2026-10-20 security; v24.22.3 = 2026-11-10 security (CHANGELOG dates 2026-10-21 and 2026-11-11); CVE list; schedule: v24 maintenance from 2026-10-20, v26 LTS from 2026-10-28 | High |
| S10b | https://nodejs.org/en/blog/vulnerability/november-2026-security-releases | official advisory post | 2026-11-19 | Preconditions of `CVE-2026-126051` (needs `SNICallback`/`OCSPRequest`/`newSession`/`resumeSession`/`addContext()`) and `CVE-2026-123864` (needs `res.flushHeaders()` before the body ends, then `res.end()` with a chunk; cleartext `node:http` not affected) | High (CONFIRMED-DOC, only those two advisories read in detail) |
| S11 | https://hub.docker.com/v2/repositories/library/node/tags/ | registry API | 2026-11-18 | `24.22.3-alpine3.24` exists (updated 2026-11-11); `26.13.1-alpine3.24` exists | High |
| S12 | https://github.com/fastify/fastify/security/advisories (+ GHSA-3qgw-9275-xf8w page, `api.github.com/advisories/GHSA-389g-gv7q-r4x8`) | official advisories | 2026-11-18 | GHSA-389g (low, >=5.12.2 <5.12.6); GHSA-3qgw (moderate, >=5.8.0 <5.12.8, needs `handlerTimeout` != 0 and a streaming route) | High (advisory page read through a summarising fetch: PARTIAL for GHSA-3qgw text; ranges also in the API JSON for GHSA-389g) |
| S13 | `npm audit --json` in this worktree | local run | 2026-11-18 | 7 findings: fastify (low, 5.12.5), eslint/minimatch/fast-uri/undici/vite (tooling or transitive) | High (TESTED-LOCAL) |
| S14 | https://github.com/obsproject/obs-studio/releases (33.0.0, 33.0.1 via `gh api`) | official release notes | 2026-11-18 | 33.0.0 (2026-10-23): "Updated CEF from 127/6533 to 150/7871"; 33.0.1 (2026-10-29): browser-panel race fix | High |
| S15 | https://obsproject.com/kb/browser-source | official KB | 2026-11-18 | Browser Source is CEF based; defaults (transparent CSS, shutdown when not visible, refresh when active) unchanged | High (summarised read: PARTIAL for completeness) |
| S16 | https://blog.twitch.tv/en/2026/05/13/monetization-for-all/ (through a web search snippet; earlier notes cite it) | blog | 2026-11-18 | Channel Points open to all monetizing streamers, not only Affiliate/Partner | Medium (REPORTED here; the blog itself was not re-fetched) |
| S17 | https://discuss.dev.twitch.com/t/bug-update-custom-reward-redemption-gives-403/61230 and `.../63689` | forum | 2026-11-18 | Community responder: a client ID manages only rewards it created; dashboard rewards cannot be managed by another client (2024, 2025). Not Twitch staff as far as the page shows | Medium-Low (REPORTED) |
| S18 | `gh api repos/twitchdev/issues/issues?since=2026-10-02` and `repos/twurple/twurple/issues?since=2026-09-10` | issue trackers | 2026-11-18 | No new issue on Channel Points, `channel.chat.message`, Send Chat Message or OAuth; #1224 (`channel.follow` v2 duplicates) is outside the project; Twurple: nothing new | Medium (absence of reports) |
| S19 | https://github.com/twurple/twurple/releases (summarised fetch) | release page | 2026-11-18 | 8.1.0 to 8.2.0 content (Device Code Flow, Custom PowerUps, fixes); the page dates are unreliable (npm says 8.1.0 on 2026-04-01 and 8.2.0 on 2026-09-13) | Low for dates, Medium for content |
| S20 | Installed `node_modules/@twurple/auth/lib/helpers.js:132`, `providers/RefreshingAuthProvider.js:95-108` | installed code | 2026-11-18 | Twurple maps only HTTP 401 on token info to `InvalidTokenError` | High (CONFIRMED-CODE) |
| S21 | Repository: `apps/api/src/twitch/auth-runtime.mjs:23`, `helix-adapter.mjs:202`, `chat-notice-worker.mjs:2`, `apps/api/src/server.mjs:36-38`, `apps/frontend/scripts/start-production.mjs:2`, `compose.yaml:70`, `Dockerfile:1,12`, `docs/stories/FND-7/story.md:81,120` | project code and docs | 2026-11-18 | How the project already reacts to each finding | High |
| S22 | https://github.com/vitest-dev/vitest/releases (v5.1.0, v5.1.1) | official release notes | 2026-11-18 | Minor features (`--last-failed`, fake timers for `node:timers`, `--since-last-run`), no breaking change listed for 5.x | High |
| S23 | https://github.com/prisma/prisma/releases, PR #127 text, search on the Prisma 7 upgrade guide | release notes, Dependabot, docs index | 2026-11-18 | Prisma 7.10.1 is stable (2026-10-19); 8.0.0-rc.x ongoing; 7 requires a driver adapter and a new generator provider (guide read only as search summaries) | Medium (REPORTED for the guide) |
| S24 | https://github.com/moby/moby/releases, https://github.com/docker/compose/releases, local `docker --version` | release lists | 2026-11-18 | Docker 29.10.0 (2026-11-16) and Compose 5.8.0 (2026-11-17) are out; local machine has 29.9.3 and 5.7.1 | High |
| S25 | Dependabot PRs #124, #125, #127, #128, #138 (`gh pr view`, read only) | PR metadata | 2026-11-18 | #124 Node 24.20.0 to 26.13.1 (CI check "Vitest unit, PostgreSQL, and Compose integration" failed); #125 actions checkout 6.0.3 to 7.0.1, setup-node, upload-artifact 7.0.2, cosign-installer 4.1.3; #127/#128 Prisma 6.19.3 to 7.10.1; #138 fastify 5.12.5 to 5.12.8, vitest 5.0.3 to 5.1.0, eslint, js-yaml, playwright-core | High |
| S26 | https://github.com/vercel/next.js/releases (v16.4.5, v16.4.6) | official release notes | 2026-11-18 | Still the 16.x line; v16.4.5 fixes cache-related advisories (row 37 covers them) | High |

## 4. Renewal log per row

### Row 1: FND-0 foundation stack (Node, Docker, base dependencies)

- **Checked:** Node release data and changelog (S10), Docker Hub tags (S11), Fastify advisories (S12), `npm audit` (S13), npm versions (S9), Docker/Compose releases (S24), Dependabot PRs (S25), repository pins (S21).
- **What changed since 2026-10-02:**
  1. **Trigger fired.** The pin is Node 24.20.0 (`Dockerfile:1,12`, `package.json` engines). Node **24.22.1** (security, 8 CVEs: http agent guard, dns null bytes, tls IP normalization, permission model, brotli) and **24.22.3** (security, 16 CVEs, 7 rated High; http2 stream/buffer handling, tls resumption/SNI, a TLS server crash `CVE-2026-126051`, a TLS/HTTP parser re-entrancy `CVE-2026-123864`) are out (CONFIRMED-DOC, S10). `node:24.22.3-alpine3.24` exists (S11).
  2. **Applicability to the project (CONFIRMED-CODE, advisory text read from the official post, S10b).** The API and the production frontend start Node **TLS servers** (`server.mjs:36-38`, `start-production.mjs:2`) published only on `127.0.0.1` (`compose.yaml:70`). HTTP/2 server paths are not used (no `http2` import in `apps/`). Per CVE:
     - `CVE-2026-126051` (TLS server crash): **NOT APPLICABLE.** The advisory requires a TLS server using `SNICallback`, `OCSPRequest`, `newSession`, `resumeSession` or `server.addContext()`; `grep` over `apps/`, `packages/` and `scripts/` finds none of them (the only matches would be in generated `.next` output, which was excluded).
     - `CVE-2026-123864` (HTTPS parser re-entrancy, High): the advisory needs a handler that calls `res.flushHeaders()` before the request body ends and then `res.end()` with a non-empty chunk. `grep flushHeaders|writeHead` in `apps/` and `packages/` finds nothing in project code. Whether Fastify or Next internals call it was **not checked** (ASSUMPTION: low exposure). Kept as "possibly applicable".
     - The other http2 CVEs do not apply (no HTTP/2 server). The TLS renegotiation/resumption/SNI CVEs (`CVE-2026-123872`, `123867`, `123877`) were not mapped one by one; they matter for servers with client certificates or SNI contexts, which the project does not configure as far as the grep shows (ASSUMPTION).
     - The Twitch connections are TLS clients, covered by the 24.22.1 TLS/IP fixes in general terms (not mapped CVE by CVE).
  3. Node 24 entered **maintenance** on 2026-10-20 and Node 26 (Lithium) became LTS on 2026-10-28 (S10). Dependabot #124 proposes 26.13.1 and its integration check failed in CI (S25). That is input only; a Node 26 move is a separate decision.
  4. **Fastify:** pin 5.12.5 is inside GHSA-389g (low, fixed in 5.12.6) and below 5.12.8 (GHSA-3qgw, moderate). GHSA-3qgw needs `handlerTimeout` set; `grep handlerTimeout apps/api/src` found nothing, so it does not apply (CONFIRMED-CODE). #138 would move to 5.12.8.
  5. `npm audit` has 7 findings, mostly tooling (eslint, vite, undici, fast-uri); not production path as far as the dependency names show (ASSUMPTION for the full path). Prisma 6.19.3 is the `prev` tag; Prisma 7.10.1 is stable (#127/#128 are breaking: driver adapter and generator changes, REPORTED). Vitest 5.1.1 is out (minor). Docker 29.10.0 and Compose 5.8.0 are out; nothing indicates a break for the project's Compose file (ASSUMPTION).
- **Impact for the project:** exposure is **low and local-only** (loopback binding, no HTTP/2, the TLS-crash CVE does not apply). The patch bump to 24.22.3 is still justified: it is a same-line LTS patch, it closes the remaining TLS/HTTP fixes that may touch the stack and 24.22.1's fixes (tls IP normalization, dns, permission model, root certificates, OpenSSL 3.5.9), and the pin should not drift. Recommend the Orion schedule it as its own package with `@qa` (files in section 5), and take Fastify to 5.12.8 and Vitest within the same planned dependency window (#138). Do not mix this with the Node 26 or Prisma 7 decisions.
- **Confidence:** High for the Node and Fastify facts (official sources); Medium for the transitive audit reading. **Not verified:** whether any tool in the repository pins Node elsewhere (CI workflows were not re-read).
- **Result:** REFRESH (trigger fired). Verified on 2026-11-18; review after 2026-12-30. Waiver falls to `none`.
- **Execution (2026-11-19, no new research):** the patch bump landed in PR #152 (pin 24.20.0 to 24.22.3) and the dependency group in #138 (Fastify 5.12.8, Vitest 5.1.0, eslint 10.15.0, js-yaml 5.5.0, playwright-core ^1.65.1). The "Node security patch" trigger is met. SSE does not exist in the code yet, so the bump QA proved Node only with a synthetic probe; repeat it through the Next proxy when SSE lands.

### Row 3: FND-7 OBS Browser Source / overlay

- **Checked:** OBS release notes 33.0.0 and 33.0.1 (S14), OBS Browser Source KB (S15), the project's recorded E2E environment (S21).
- **What changed:**
  1. **Trigger fired.** OBS **33.0.0** (2026-10-23) "Updated CEF from 127/6533 to 150/7871", "a massive update ... from the July 2024 release to September 2026"; the notes say it should be invisible but ask users to report browser source problems (CONFIRMED-DOC). 33.0.1 (2026-10-29) fixes browser-panel sizing and Twitch/YouTube integration crashes. Latest stable GitHub release is 33.0.1.
  2. The recorded native E2E (FND-7 story) ran on **OBS Studio 32.2.2 / CEF 127.0.6533.120** on Ubuntu 24.04, with certificate validation enabled and Page Permissions None (CONFIRMED-CODE: `docs/stories/FND-7/story.md:81,120`). The tested environment is therefore two OBS releases behind.
  3. The KB page still documents the same defaults (transparent default CSS, shutdown when not visible, refresh on active); CEF-based (CONFIRMED-DOC, summarised read).
- **Impact:** the overlay is an HTTPS localhost origin with a local certificate; a Chromium jump of about 23 majors can change certificate handling, local-network permission prompts, CSS and Server-Sent Events behavior (ASSUMPTION; no report found either way). Not a reason to change code; a reason to **repeat the native OBS check on 33.0.1** (the existing authenticated E2E plus the checks in LA-09 of `docs/process/open-acceptance-criteria-2026-11-10.md`). Windows/macOS remain unverified as before.
- **Confidence:** High for the version facts; Low-Medium for the impact (not tested).
- **Result:** REFRESH (trigger fired). Verified on 2026-11-18; review after 2026-12-30. Waiver falls to `none`.

### Row 5: FND-9 Channel Points / custom rewards

- **Checked:** change log (S1), Channel Points reference (S2), Wayback copy of 2026-09-30 (S8), forum threads (S17), Monetization for All (S16), issue trackers (S18).
- **What changed:**
  1. **No functional change** to Custom Rewards. The 2026-11-10 corrections: `prompt` no longer lists a 200-character cap; `cost` lists a 1,000,000,000 maximum; `status` is no longer required in Get Custom Reward Redemption when `id` is given (CONFIRMED-DOC, S1).
  2. **Documentation delta A (new):** the sentence "Canceled and fulfilled redemptions are returned for only a few days after they're canceled or fulfilled" was on the page on 2026-09-30 (S8) and is **absent** from the migrated page (grep of S2). The change log does not mention the removal. Our notes relied on it (`redemption-sync-research.md:36`, `OPS-20/research.md:117`). Treat the retention as **unknown, not as removed**: keep the reconciliation code tolerant of a missing CANCELED/FULFILLED record (ASSUMPTION about the intent).
  3. **Documentation delta B (conflict):** the reference still says 403 when "the broadcaster is not a partner or affiliate" on every Custom Rewards endpoint (CONFIRMED-DOC, S2) while Twitch's 2026-05-13 announcement opened Channel Points to all monetizing streamers (REPORTED, S16). The API text may simply lag. The project detects 403 and maps it to `channel_ineligible`, so the failure is safe; whether a non-affiliate monetizing channel can use the API is a **live test** item.
  4. Ownership rule unchanged: only the creating Client ID manages a reward and its redemptions (CONFIRMED-DOC S2; REPORTED S17 for dashboard rewards).
- **Trigger status:** "Twitch changes the Custom Rewards API": not fired (documentation corrections only).
- **Confidence:** Medium.
- **Result:** renewed, still REFRESH IF. Verified on 2026-11-18; review after 2026-12-30.

### Row 6: OPS-3 EventSub `channel.chat.message`

- **Checked:** EventSub chat reference (S4), change log (S1), Twurple versions (S9), issue trackers (S18).
- **What changed:** nothing relevant. `channel.chat.message` is still version `1`, requires `user:read:chat` (plus `user:bot`/`channel:bot` for the app-token path), carries `badges` and optional `source_badges` (CONFIRMED-DOC). The `gif` fragment type was added on 2026-07-16/17, **before** the note date, and does not touch the role logic. `channel.chat.notification` gained `gifted_drops_summary` on 2026-10-01 (not used). `@twurple/*` is still 8.2.0 (S9). A search for `source_badges` or Shared Chat problems found one older forum thread (shared chat messages not shown, REPORTED) and nothing new.
- **Trigger status:** not fired. **Confidence:** High.
- **Result:** renewed. Verified on 2026-11-18; review after 2026-12-30. Waiver falls to `none`.

### Row 9: OPS-7 chat send/receive with Twurple

- **Checked:** Send Chat Message reference (S3), change log (S1), Twurple versions (S9, S19), repository handling (S21).
- **What changed:** the 2026-11-10 corrections list **every `drop_reason` code** (18 codes, for example `msg_duplicate`, `slow_mode`, `automod_held`) and state that `for_source_only` defaults to true only with an app access token. A new optional `pin` parameter also exists (added earlier in 2026, before the note date, so outside the delta). The project sends with a **user** token, so `for_source_only` does not apply, and its adapter already returns `isSent` and `dropReasonCode` and treats `is_sent != true` as not delivered (CONFIRMED-CODE: `helix-adapter.mjs:202`, `chat-notice-worker.mjs:2`). The 500-character limit and scopes (`user:write:chat`) are unchanged.
- **Trigger status:** "`@twurple/*` leaves 8.2.0": not fired (npm latest 8.2.0 on 2026-11-18; the 8.2.0 release is dated 2026-09-13).
- **Confidence:** High.
- **Result:** renewed. Verified on 2026-11-18; review after 2026-12-30.

### Row 10: OPS-8 OAuth token validation/refresh

- **Checked:** validate, refresh and authentication pages (S5, S6), change log (S1), installed Twurple (S20), project code (S21).
- **What changed:** no change in substance: validate on start and hourly; Twitch audits compliance; refresh without consent only for the Authorization Code flow; refresh tokens may rotate and must be stored; the 50-access-token-per-refresh-token cap for concurrent refreshes (CONFIRMED-DOC). Two things worth recording:
  1. **Documentation inconsistency:** prose says an invalid refresh token gives HTTP **401**, the JSON example shows status **400** `Invalid refresh token` (S6). The project already treats both 400 and 401 from `https://id.twitch.tv/oauth2/token` as a definitive refresh failure (CONFIRMED-CODE: `auth-runtime.mjs:23`). Twurple itself maps only 401 on token **info** to `InvalidTokenError` (S20), so a 400 from the refresh endpoint reaches the project as a plain HTTP error, which the project handles.
  2. **Public client note:** refresh tokens from a **Public** client type expire after 30 days; Confidential clients do not (CONFIRMED-DOC). The project uses a confidential app (project requirement text, `docs/stories/OPS-8/spec/requirements.json:44`; not re-checked against the Twitch console); keep it that way.
- **Trigger status:** Twitch auth docs unchanged in behavior, Twurple auth still 8.2.0: not fired. **Confidence:** High.
- **Result:** renewed. Verified on 2026-11-18; review after 2026-12-30.

### Row 11: OPS-15 S-03 module relocation, S-12 cleanup

- **Checked:** Next releases (S26), npm versions (S9), Dockerfile (S21).
- **What changed:** Next is still the 16.x line; the installed 16.4.6 is the npm `latest`. The 16.4.5/16.4.6 releases are security fixes for cache features the project does not use (row 37 covers them). Nothing found that touches Turbopack root, re-export shims or the Docker `COPY` order. The 3 UNVERIFIED inferences in the note are test items, unchanged. Node pin: see row 1 (the Dockerfile base image is where the relocation meets the stack; a pin bump does not alter the layout).
- **Trigger status:** "Next.js major changes": not fired. **Confidence:** Medium (release notes read, no re-test).
- **Result:** renewed. Verified on 2026-11-18; review after 2026-12-30.

### Row 15: OPS-20 refund eligibility by subscriber status (was GAP)

- **Checked:** the new Helix note `docs/research/2026-11-18-twitch-helix-group-lookup/README.md` (not repeated here), Subscriptions reference (S7), Channel Points reference (S2), Wayback comparison (S8), forum (S17), Monetization for All (S16).
- **Answered by documentation (now CONFIRMED-DOC):**
  - Get Broadcaster Subscriptions: scope `channel:read:subscriptions`, `broadcaster_id` must match the token user, `user_id` filter up to **100**, `first` 1-100 (default 20), `pagination`, `points` and `total` omitted when `user_id` is used, no 403 listed (S7). The old note listed the 100-id limit and the scope wording as unverified: closed.
  - Gift subscriptions carry `is_gift` and `gifter_*` (empty strings otherwise). New 2026-11-10 wording: some subscriptions (for example from deleted accounts) are not included, so a page may have fewer items than `first` (S7).
  - Update Redemption Status: only UNFULFILLED can change; only the creating app; CANCELED refunds the points; FULFILLED cannot be refunded later (S2, unchanged).
  - Re-consent for existing streamers: unchanged (scopes are fixed at grant time).
- **Still open, and what closes each (not closable by web research):**
  1. Prime representation: forum says tier `1000`, indistinguishable (REPORTED); no flag in S7. Live test RT-A step A7.
  2. Broadcaster in their own subscription list: 2020 Twitch-staff statement says included (from the Helix note, REPORTED); no current doc. Keep the explicit rule. RT-A.
  3. Whether Twitch expires or caps UNFULFILLED redemptions in the queue: **no statement found, and the "returned for only a few days" retention sentence disappeared from the reference** (row 5, delta A). Live test with an old UNFULFILLED redemption.
  4. Non-affiliate channel response on Get Broadcaster Subscriptions (400 vs empty 200): conflicting reports; reference silent. Live test.
- **Verdict change:** GAP to **REFRESH IF**. The documentation part is answered and the remaining items are test tasks (`@qa`/`@dev`, RT-A script in the Helix note), not research. The owner rules already chosen for OPS-31 (Prime counts as tier 1000; explicit broadcaster rule) do not depend on web research. The Orion may revert to GAP if the owner wants the label to stay until RT-A runs.
- **Confidence:** Medium (was Low). Verified on 2026-11-18; review after 2026-12-30.

### Row 17: OPS-20 test strategy

- **Checked:** Twurple versions and installed limiter (unchanged version), Vitest releases (S22), Docker (S24), Dependabot #138 (S25).
- **What changed:** `@twurple/api` is still 8.2.0, so the rate-limiter source reading in the note (re-queue on 429, wait for `Ratelimit-Reset`) is still the installed behavior (CONFIRMED-CODE, reconfirmed by the Helix note on the same day). Vitest moved 5.0.3 to **5.1.1**: new `--last-failed`, `--since-last-run`, fake timers for `node:timers`, no breaking change listed (CONFIRMED-DOC); #138 proposes 5.1.0. The disposable-PostgreSQL approach is unaffected. `fast-check` is not in the root `package.json` (no version claim made).
- **Trigger status:** "`@twurple/api` leaves 8.2.0": not fired. **Confidence:** Medium.
- **Result:** renewed. Verified on 2026-11-18; review after 2026-12-30.

## 5. Handoffs for other agents

- **Orion / `@devops` / `@dev`:** plan a Node pin patch bump 24.20.0 to 24.22.3 as its own package. Files that carry the pin: `Dockerfile` (1 file, 2 `FROM` lines), `package.json` and `package-lock.json`, `.nvmrc`, the workflows `quality-gates`, `main-cd`, `release`, `browser-only` and `branch-cleanup` (`.github/workflows/`), the docs in en and pt-BR (`AGENTS.md`, `CLAUDE.md`, `docs/INSTALLATION.md`, `docs/DEVELOPMENT.md`, `docs/CONTRIBUTING.md`, `docs/integrations.md` and others that quote 24.20.0) and the pin rule in `AGENTS.md`/`CLAUDE.md`, plus the contract tests that fix 24.20.0: `tests/unit/ci-workflow-contract.test.js`, `tests/unit/dev-preflight.test.js`, `tests/unit/windows-native-contract.test.js`, `tests/integration/codespaces-contract.test.js`. Also plan a Fastify 5.12.8 / Vitest 5.1 window (PR #138). Node 26 (#124) and Prisma 7 (#127, #128) are separate decisions; #124 failed its integration check in CI.
- **`@qa`:** (a) native OBS retest on 33.0.1 / CEF 150 (row 3); (b) RT-A script A1-A9 of the Helix note on an affiliate test channel (rows 15, 38); (c) if possible, one test with a non-affiliate monetizing channel to see whether Custom Rewards work through the API (row 5, delta B); (d) check how reconciliation behaves when a CANCELED/FULFILLED redemption is no longer returned (row 5, delta A).
- **Process:** the Twitch change log offers an RSS feed (`https://dev.twitch.tv/docs/rss/change-log.xml`, per S1). Reading it is the cheapest trigger check for all Twitch rows.

## 6. Not found / not verified

- Prisma 6 support window or end-of-life date: searched ("Prisma 6 support policy end of life"), not found.
- Official Twitch statement on UNFULFILLED redemption expiry: not found (rows 5, 15).
- Whether API Custom Rewards now work for non-affiliate monetizing channels: no official API text; only the blog and third-party guides.
- Reports of OBS 33 / CEF 150 problems with local HTTPS overlays: not searched in depth; none appeared in the OBS notes.
- Twurple GitHub issues page: not readable through search; the issue API showed no recent items.
- Prisma 7 upgrade guide itself: only search summaries read (module format statements conflict between summaries).
- Node CVE detail: the official post `nodejs.org/en/blog/vulnerability/november-2026-security-releases` (downloaded as `.local/analyst-renewal/node-vuln.html`, 21,771 characters of text after stripping the HTML) was read **only for the two CVEs used above**, `CVE-2026-126051` (preconditions) and `CVE-2026-123864` (preconditions) and for the severity list. The other advisories in the post were **not** read in detail. The release facts come from the official changelog. Secondary sites that also reported the release were not used.
- `docs/research/...` notes of other rows (20, 21, 23, 27, 36, 37, 38) were not renewed here; they are inside their term.

## 7. Review triggers for this batch

Renew all nine rows by 2026-12-30, earlier if: Node 24.x or 26.x publishes another security release before the pin is bumped; OBS publishes 33.1 or a CEF update; the Twitch change log (RSS) reports a Custom Rewards, EventSub chat, Send Chat Message or OAuth change; `@twurple/*` leaves 8.2.0; RT-A or the OBS retest contradicts a statement above.
