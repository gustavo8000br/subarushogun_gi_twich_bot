# Twitch Helix group lookup (moderators, VIPs, subscribers) for OPS-31 P6/P7

[Português brasileiro](../../pt-BR/research/2026-11-18-twitch-helix-group-lookup/README.md)

- Author: `@analyst` (Atlas). Date: 2026-11-18. Feeds: `apps/api/src/twitch/group-lookup.mjs`, `helix-adapter.mjs` (P6, on `main`) and P7 (first consumer).
- Method: official reference read as raw Markdown (`dev.twitch.tv/docs/...md`, fetched 2026-11-18) and compared with the Wayback copy of 2025-09-30; installed Twurple 8.2.0 source (`node_modules/@twurple/api`, `api-call`, `@d-fischer/rate-limiter` 1.1.0); developer forum threads and `twitchdev/issues` read in full; open-source code read on GitHub (Twitchat, pyTwitchAPI, twitch-cli mock, twitch_api for Rust). Wire format of Twurple queries checked locally with `qsStringify` (no network).
- **No call was made to Twitch** (no owner credentials were used). Everything below is desk research plus local source reading. Internet content was treated as untrusted data.
- Labels: **DOC** (official Twitch page), **CODE** (real source code), **FORUM** (reported by users, usually not Twitch staff), **STAFF** (Twitch employee on GitHub), **INFERENCE** (my reasoning, not stated by a source). Confidence: High / Medium / Low.
- Previous notes reused (not repeated): `docs/research/2026-11-06-queue-group-refund/README.md` (index row 27, SUFFICIENT for design) and `docs/stories/OPS-20/research.md` (row 15).

## 1. Executive summary

1. **`first` with `user_id`.** The official reference (revised on 2026-11-10) now says `first` and `after` are **ignored** when `user_id` is present for **Get Moderators** and **Get VIPs**, and the response `pagination` object is empty. The 2025-09-30 version did not say this, so the rule is documented but young. **Get Broadcaster Subscriptions does not say it for `first`**: it only says `after`/`before` must not be used with `user_id` and that `pagination`, `points`, `total` are omitted. Maximum 100 `user_id` per call on all three. No source was found that proves or disproves truncation at the default page of 20 for subscriptions. Confidence: moderators/VIPs Medium-High (DOC, not live-tested); subscribers Low-Medium.
2. **429.** The bucket is 800 points per minute, 1 point per request by default, **per client ID and per user** for user tokens; refill is continuous (about 1 point per 75 ms, FORUM). Headers: `Ratelimit-Limit`, `Ratelimit-Remaining`, `Ratelimit-Reset` (Unix epoch seconds). **`Retry-After` is not documented anywhere** in the pages read. **Twurple 8.2.0 never shows the ordinary 429 to the caller**: its limiter re-queues the request and waits until `Ratelimit-Reset`, with no cap. So the P6 wait-and-retry path (`retryAfterSeconds`) is dead code for the normal case, and a rate-limited call surfaces as `timeout`, not `rate_limited`. Confidence: High (source code).
3. **Non-affiliate channel and scopes.** The three endpoint pages list **no 403/404**. 401 covers missing scope, invalid token and wrong `broadcaster_id`; they cannot be told apart by status, and Twitch says not to depend on message strings. For subscriptions on a non-affiliate channel the reports **conflict**: HTTP 400 `channel_id must be a partner or affiliate` (FORUM, 2021) versus an empty result (FORUM, 2024). An empty 200 would read as "not a member", so the channel type check must stay and must fail closed. Confidence: Low for the non-affiliate behavior; High for scopes and 401.
4. **Prime and gift.** Prime subscriptions appear (FORUM, 2020) as ordinary tier `1000` and cannot be told apart (FORUM, 2023). Gift subscriptions appear with `is_gift: true` for the recipient; `gifter_*` are empty strings otherwise (DOC). In 2020 gift packs were missing from the list, fixed by Twitch on 2020-09-09 (STAFF). Expired subscriptions: no official statement. Propagation delay of a new subscription: no official figure (FORUM reports of minutes to an hour, from 2018 on the old Kraken API). Confidence: Medium for Prime/gift presence; Low for expiry and latency.
5. **Recommended constants** (details in section 9): moderators 100 (as is); VIPs 100 once RT-A step A2 passes, otherwise keep 20; subscribers keep 20 **or** send an explicit `first=100` through `api.callApi` (removes the dependence on the open question); tighten the id regex to `^[1-9][0-9]{0,18}$`; treat the Twurple-hidden 429 as `timeout`; map errors without status (`CachedRefreshFailureError`) to `unauthorized`.

## 2. Q1: `first`, `user_id`, limits, unknown ids

| Point | Get Moderators | Get VIPs | Get Broadcaster Subscriptions |
|---|---|---|---|
| Max `user_id` per call | 100 (DOC) | 100 (DOC) | 100 (DOC) |
| Repeat the parameter | yes, `user_id=1&user_id=2` (DOC) | yes (DOC) | yes (DOC) |
| `first` with `user_id` | **Ignored** (DOC 2026-11-10; not in the 2025-09-30 text) | **Ignored** (DOC; same) | **Not stated.** `after`/`before` "do not specify" with `user_id` |
| `after` with `user_id` | Ignored; `pagination` empty (DOC) | Ignored; `pagination` empty (DOC) | Must not be used; `pagination` omitted (DOC) |
| Default / max page without `user_id` | 20 / 100 (DOC) | 20 / 100 (DOC) | 20 / 100 (DOC) |
| More than 100 ids | Not documented | **400** "number of `user_id` exceeds the maximum" (DOC) | Not documented |
| Invalid id | 400 "ids must be positive integers" (DOC) | 400 "`user_id` is not valid" (DOC) | Not documented |
| Id that is not a member / not of this channel | Only moderators of the list are returned; duplicates ignored (DOC) | Non-VIPs are ignored (DOC) | Filter only; empty `data` if none (DOC) |
| Nonexistent but numeric id | Not documented | Not documented | Not documented |

Evidence and contradictions:

- The current raw reference pages are in the source table (S1-S3). The Wayback copy of 2025-09-30 (S4) lists the same 100-id limit but **no** "ignored" sentence, and Get Moderators then said "returned in the same order as you specified"; the new text says "no particular order". The changelog entry of 2026-11-10 (S5) says the migration to the new documentation style also corrected "status codes, error reasons, and authorization details", and that `points`/`total` are omitted (not null) with `user_id`. So the new text is a deliberate correction, which supports (does not prove) that it describes real behavior.
- For subscriptions, the response omits `pagination` when `user_id` is used. **INFERENCE (Medium-Low):** a design that gives no cursor is built to return every match (up to 100) in one page, otherwise results beyond 20 could never be fetched. Nothing official says it.
- Real clients: pyTwitchAPI sends `first=20` (default) together with up to 100 `user_ids` for moderators and subscriptions and raises `ValueError` above 100 (S14, `twitch.py` lines 1525-1565, 1701-1735, 3620-3655); no issue about truncation was found. Twitchat never uses the `user_id` filter; it lists everything with `first=100` and follows the cursor (S13). The twitch-cli mock (S15) models `user_id` for VIPs but is a mock, not evidence of production behavior. Twurple 8.2.0 sends **no `first`** for `checkVipForUsers` and `getSubscriptionsForUsers`, and `getModerators` passes `limit` as `first` (S10).
- No forum thread or issue about `first` combined with `user_id` was found (several searches). Not found is not proof.
- A VIP and a moderator cannot be the same person: Twitch answers 422 when adding a VIP who is a moderator (Twitchat `TwitchUtils.ts` around lines 2179-2260, S13; twitch-cli mock line 158, S15). Useful only as a consistency fact.

**Verdict Q1.** Moderators: 100 ids per call is safe by DOC (Medium-High). VIPs: same by DOC (Medium-High; the rule is 8 days old at the time of writing). Subscribers: unproven; 20 is safe whatever the rule is (High), 100 needs RT-A A1 or an explicit `first=100`.

## 3. Q2: 429, headers, Twurple behavior

Twitch side (DOC, S6 guide):
- Token bucket; each endpoint costs 1 point by default; "if your bucket runs out of points within 1 minute, the request returns 429". One bucket for app tokens and one for user tokens; user-token limits are "per client ID per user per minute". The three read endpoints state no special cost.
- Headers on every response: `Ratelimit-Limit` (example 800), `Ratelimit-Remaining`, `Ratelimit-Reset` ("Unix epoch timestamp that identifies when your bucket is reset to full"). On 429, "use the `Ratelimit-Reset` header to learn how long you must wait".
- "Some endpoints may return 429 for reasons unrelated to the general rate limit bucket... you must parse the error message" (DOC). Example in the changelog: ban/unban endpoints (S5).
- 503: "retry once" (DOC).
- `Retry-After`: the string appears in none of the pages read (guide, moderation, subscriptions, change log; `grep` count 0). Not found.
- FORUM: refill is continuous, "1 every 0.075 s (800 per min)" (Dist, 2020-08-21, S16); a bucket drained to 0 allows about one request per 75 ms; with a bearer token 800/min per user, 30/min with only a Client-ID (BarryCarlyon, 2020-01-14, S17). A 2023 thread reports 429 with `Ratelimit-Remaining` still near 799 and `Ratelimit-Reset` equal to the current time, unresolved (S18). Treat `Ratelimit-Reset` as a hint that can be wrong.

Twurple 8.2.0 (CODE, read in `node_modules`):
- Node build: one `HelixRateLimiter` per user (`PartitionedRateLimiter`, key = user id) (S10, `ApiClient.js` lines 28-38). `needsToRetryAfter`: when status is 429 **and** `ratelimit-remaining` is absent or 0, it returns `reset*1000 - now`; the request is put back at the head of the queue and re-sent after that delay, **with no attempt cap** (`ResponseBasedRateLimiter._runRequestBatch`). The caller's promise stays pending. A missing `Ratelimit-Reset` is read as 0 and breaks the queue (maintainer-confirmed class of bug, Twurple issue 285, S19).
- A 429 whose `Ratelimit-Remaining` is above 0 (the "other reason" case) is **not** retried; it becomes `HttpStatusCodeError` with `statusCode` 429, **no headers** (`api-call/lib/errors/HttpStatusCodeError.js`). So `retryAfterSeconds` is always null (as the dev recorded).
- 5xx and thrown network errors are retried inside Twurple: `retries: 3, minTimeout: 500, factor: 2` (delays 0.5 s, 1 s, 2 s) (`BaseApiClient._callApiInternal`). With the 3 s per-call cap in P6, a 5xx shows as `timeout`, not `twitch_unavailable`, unless the first retry already answers.
- 401: Twurple refreshes the token once and retries (`_callApiUsingInitialToken`). A user already known to have a dead refresh token throws `CachedRefreshFailureError` (no `statusCode`) before any request (`RefreshingAuthProvider.js` lines 325-326); a token without the scope throws a plain `Error` ("does not have any of the requested scopes") (`auth/lib/helpers.js` line 249). Both map to `lookup_error` in P6 (the scope case is caught first by the local check).
- The maintainer confirms the waiting design: "The client will wait until the rate limit resets for you to be able to make requests again" (Twurple issue 358, 2022-05-12, S20).
- Consequence for P6: because the limiter is per user and the lookup uses the broadcaster token, a call that timed out on our side **stays queued in the limiter** (Twurple has no per-call abort) and still fires later, and while the bucket is empty every other call with that token (rewards, redemptions) waits behind it. At 3 reads per refund decision and 800 points/min the exposure is small, but a burst of decisions can exhaust it.

Good practice seen in real code: Twitchat waits until `ratelimit-reset` plus 1 s plus up to 5 s of jitter, then retries (S13, `TwitchUtils.ts` lines 3987-3991); pyTwitchAPI sleeps until `Ratelimit-Reset` plus 0.1 s when status is 429 or remaining is 0 (S14, lines 444-449). Neither uses `Retry-After`.

**Verdict Q2.** High on Twitch's documented model and on Twurple's behavior. Low on what a live 429 contains (headers, body text), which needs RT-A A5.

## 4. Q3: non-affiliate channel, `broadcaster_type`, scopes, 401/403

- **Status codes (DOC, current):** Get Moderators and Get VIPs list 200, 400, 401; Get Broadcaster Subscriptions lists 200, 400, 401. **No 403 and no 404 are documented for any of the three.** (Only Check User Subscription lists 403 "access is blocked, some products are not available through the API" and 404 "not subscribed".)
- **401 reasons (DOC):** missing header or not a user token; token lacks the scope; token invalid; `broadcaster_id` does not match the token user; Client-Id does not match the token. Twitch gives the same status for all of them. The API guide says "your code should not take dependencies on error message strings" (S6). Therefore use status plus local state, never the message. FORUM examples of message texts: `Missing channel:read:subscriptions scope` (2019, S21), `Insufficient authorization in token` (2021, S22). Treat as illustrative only.
- **Scopes (DOC):** moderators `moderation:read` or `channel:manage:moderators`; VIPs `channel:read:vips` or `channel:manage:vips`; subscriptions `channel:read:subscriptions`. `broadcaster_id` must equal the token's user: only the broadcaster's own token works. The newer `moderator:read:vips` scope in the scopes page lists only EventSub Channel Moderate, not Get VIPs (S7). Moderators and VIPs endpoints being broadcaster-only is a known complaint (FORUM, 2023 and 2026, S23).
- **Non-affiliate channel, subscriptions (conflict):**
  - FORUM 2021-08-25 (S24): `GET /helix/subscriptions?broadcaster_id=...` returned **400** `{"error":"Bad Request","status":400,"message":"channel_id must be a partner or affiliate"}`; the poster said it previously returned 200 with no results. BarryCarlyon: a non-partner/non-affiliate "can't have subscribers".
  - FORUM 2024-11-25 (S25): a channel with blank `broadcaster_type` got "empty" results; reply: "they can't have subscribers... or is not enrolled in the subscribers program". The thread does not show the HTTP status.
  - DOC: no 400 of this kind is listed. **Winner:** none can be declared. The 2021 report is precise (full body) but old and from one user; the 2024 report is recent but vague. Plan for both: 400, and 200 with empty `data`.
- **Moderators / VIPs on a non-affiliate channel:** nothing found. No source says they error. Any channel can have moderators; VIP availability for new channels was not verified.
- **`broadcaster_type`:** returned by **Get Users** (`GET /helix/users`) as `affiliate`, `partner` or empty string (DOC, S8). Get Users accepts any token (FORUM, S25). Dist confirmed in 2019 that it "indicates if they are a partner, affiliate, or neither" (S26). Staleness after gaining or losing affiliate status: not found. Custom Channel Points rewards themselves require affiliate or partner (index rows 5 and 27), so a queue that needs a refund decision normally runs on such a channel.
- **Important for P6:** an empty 200 for subscribers is indistinguishable from "not a member". The type check in `getBroadcasterType` is therefore what protects against a false negative. QA noted that a `null` type (read failure) does not block the lookup; for the **subscriber** group that leaves the gap (see section 9).

**Verdict Q3.** Scopes and 401: High (DOC). Distinguishing 401 causes: impossible by status (High). Non-affiliate response: Low (conflicting forum reports, nothing official).

## 5. Q4: Prime, gift, expired, latency

- **Fields (DOC):** `is_gift` boolean; `gifter_id/login/name` are empty strings when `is_gift` is false; an anonymous gifter has id `274598607` (account `ananonymousgifter`); `tier` is `1000`, `2000` or `3000`; `plan_name` is "the name of the subscription". `points`/`total` omitted with `user_id`. Subscriptions of deleted accounts are omitted, so a page can have fewer than `first` items (DOC).
- **Prime:** "All valid subscriptions show regardless of payment method" for Amazon free subscriptions (BarryCarlyon, 2020-05-06, S27, FORUM). The endpoint "does not appear to have any data that can be leveraged to distinguish between prime and tier 1" (daftpenguin, 2023-06-20, S28) and BarryCarlyon agreed the API alone cannot; an "is recurring" flag was only a UserVoice request (S29, 2023-11). No official statement. **Conclusion:** Prime counts as a normal tier `1000` subscriber; do not try to tell it apart.
- **Gift:** the recipient appears with `is_gift: true`. History: in August 2020 subscribers from gifted packs (largest packs most affected, one pack of 50) were missing from Get Broadcaster Subscriptions versus the dashboard export (twitchdev/issues 187 and 184, S30, S31). A Twitch employee (lleadbet) announced a fix on 2020-09-09. Same message (STAFF): the dashboard count and the API `total` differ by exactly one because the API **includes the broadcaster's own subscription** and the dashboard hides it. This partly answers the open item "broadcaster in their own list" from the earlier note: in 2020 the broadcaster's own sub was in the API list (Medium; applies only if the broadcaster is subscribed to their own channel).
- **Expired / cancelled:** no official statement. A forum snippet (not opened in full) says the list includes people who cancelled but are still active until the period ends, and that an absent user "has either expired or wasn't created". Low. UNVERIFIED.
- **Latency:** no Helix figure. FORUM 2018 (Kraken v3/v5, S32): a new sub sometimes missing for minutes, once more than an hour; Dist: the endpoint "is not intended to be a list of subscription events, just a list of all subscribers". 2019 report of four subs appearing next morning on v5 (S33). Nothing recent. UNVERIFIED for today's Helix; RT-A A8.
- **Verdict Q4.** Presence of Prime and gift: Medium. Expiry and latency: Low.

## 6. Q5: other risks

1. **Docs migrated on 2026-11-10.** New documentation system with corrections; the rules in section 2 are 8 days old. Re-read before P7 starts if more than a few weeks pass (trigger below).
2. **Hung calls are not abortable** (Twurple 8.2.0): see section 3. `AbortSignal` can only be set globally through the client's `fetchOptions`, not per call (CODE: `callTwitchApiRaw` spreads `fetchOptions`).
3. **Timeouts:** Twurple's own retry for 5xx can use up to about 3.5 s before the final error; the P6 cap of 3 s turns it into `timeout`. Both hold the decision, so safe, but the closed reason code is less precise.
4. **Ids as strings:** all response ids are strings (DOC examples). P6 compares strings; good. Numeric ids above 2^53 would break a number cast; do not cast.
5. **Repeated ids:** Get Moderators ignores duplicates (DOC); the code dedups anyway.
6. **Eventual consistency:** a moderator or VIP added seconds ago may not appear; not measured. The decision is a point-in-time snapshot; P7 stores `group_checked_at` (already designed).
7. **Not found:** an announced deprecation of these three endpoints. The change log from 2025-01 to 2026-11 has no entry for them except the 2026-11-10 corrections.

## 7. Source table

Fetched 2026-11-18 unless stated. Confidence = how far the source supports the claim it is cited for.

| # | URL | Type | Date | Proves | Conf. |
|---|---|---|---|---|---|
| S1 | https://dev.twitch.tv/docs/api/reference/moderation.md (Get Moderators, Get VIPs) | DOC | revised 2026-11-10 | 100 ids, `first`/`after` ignored with `user_id`, codes, scopes | High |
| S2 | https://dev.twitch.tv/docs/api/reference/subscriptions.md (Get Broadcaster Subscriptions, Check User Subscription) | DOC | 2026-11-10 | 100 ids, no `first` rule, fields, codes | High |
| S3 | https://dev.twitch.tv/docs/api/reference/users.md (Get Users) | DOC | 2026-11-10 | `broadcaster_type` values | High |
| S4 | https://web.archive.org/web/20250930192946/https://dev.twitch.tv/docs/api/reference | DOC (archive) | 2025-09-30 | older text without "ignored" sentences | High |
| S5 | https://dev.twitch.tv/docs/change-log.md | DOC | to 2026-11-10 | corrections list; no deprecation of these endpoints | High |
| S6 | https://dev.twitch.tv/docs/api/guide.md | DOC | 2026-11 | bucket, headers, 429, 503, message-string rule | High |
| S7 | https://dev.twitch.tv/docs/authentication/scopes.md | DOC | 2026-11 | scope to endpoint mapping | High |
| S8 | Same as S3 | DOC | | `affiliate`, `partner`, empty | High |
| S9 | `docs/research/2026-11-06-queue-group-refund/README.md` | project note | 2026-11-05 | earlier role-lookup design | Medium |
| S10 | `node_modules/@twurple/api` 8.2.0 (`HelixModerationApi.js` 88-100, `HelixChannelApi.js` 164-173, `HelixSubscriptionApi.js` 65-74, `ApiClient.js` 28-38, `BaseApiClient.js` 305-360, `utils/HelixRateLimiter.js`) and `@d-fischer/rate-limiter` 1.1.0 (`ResponseBasedRateLimiter.js`) | CODE | installed | request shape, limiter, retry, 429 swallowing | High |
| S11 | `node_modules/@twurple/auth` (`RefreshingAuthProvider.js` 319-330, `helpers.js` 244-255) | CODE | installed | errors without status | High |
| S12 | `node_modules/@twurple/api-call` (`HttpStatusCodeError.js`, `helpers/transform.js`) | CODE | installed | 429 error has no headers | High |
| S13 | https://github.com/Durss/Twitchat `src_front/utils/twitch/TwitchUtils.ts` (lines 1005-1060, 1310-1346, 2179-2260, 3987-3991; master snapshot 2026-11-18) | CODE | 2026-11-18 | list-all pattern, 429 wait on `ratelimit-reset`, mod/VIP exclusion | Medium |
| S14 | https://github.com/Teekeks/pyTwitchAPI `twitchAPI/twitch.py` (lines 444-449, 1525-1565, 1701-1735, 3620-3655) | CODE | 2026-11-18 | 100-id guard, default `first=20` sent, 429 wait | Medium |
| S15 | https://github.com/twitchdev/twitch-cli `internal/mock_api/endpoints/channels/vips.go` (lines 66-110, 158) and `moderation/moderators.go`, `subscriptions/subscriptions.go` | CODE (mock) | 2026-11-18 | official CLI models `user_id` filter; not production behavior | Low |
| S16 | https://discuss.dev.twitch.com/t/are-buckets-really-fully-refilling-every-60-seconds/27829 | FORUM | 2020-08-21 | continuous refill 1 per 75 ms | Medium |
| S17 | https://discuss.dev.twitch.com/t/ratelimit-limit-has-decreased-out-of-blue/23740 | FORUM | 2020-01-14 | 800 with bearer, 30 without; 1 point per request | Medium |
| S18 | https://discuss.dev.twitch.com/t/are-rate-limit-headers-broken/45841 | FORUM | 2023-05-22 | headers can mislead; unresolved | Low |
| S19 | https://github.com/twurple/twurple/issues/285 | FORUM (maintainer) | 2021-08 to 2022-05 | missing `Ratelimit-Reset` read as 0 clogs the queue | Medium |
| S20 | https://github.com/twurple/twurple/issues/358 | FORUM (maintainer) | 2022-05-12 | client waits for reset | Medium |
| S21 | https://discuss.dev.twitch.com/t/i-met-message-missing-channelsubscriptions-scope/21452 | FORUM | 2019-06-11 | 401 body example | Medium |
| S22 | https://discuss.dev.twitch.com/t/issue-with-get-moderators-endpoint/31230 | FORUM | 2021-04-11 | 401 on app token | Medium |
| S23 | https://discuss.dev.twitch.com/t/why-does-getting-a-list-of-moderators-vips-require-broadcaster-permissions/45114 | FORUM | 2023-04-13 | broadcaster-only token | Medium |
| S24 | https://discuss.dev.twitch.com/t/broadcaster-subscription-400-error/33242 | FORUM | 2021-08-25 | 400 `channel_id must be a partner or affiliate` | Medium |
| S25 | https://discuss.dev.twitch.com/t/get-active-subscription-information/61814 | FORUM | 2024-11-25 | empty result for blank `broadcaster_type`; status not shown | Low |
| S26 | https://discuss.dev.twitch.com/t/check-if-user-is-a-affilate-partner-to-twitch/20808 | FORUM | 2019-04-08 | Get Users shows type | Medium |
| S27 | https://discuss.dev.twitch.com/t/how-can-i-see-a-users-subscriptions-with-the-new-api/25372 | FORUM | 2020-05-06 | all valid subs show regardless of payment | Low-Medium |
| S28 | https://discuss.dev.twitch.com/t/distinguishing-prime-sub-from-recurring-sub-in-subscriptions-api/46189 | FORUM | 2023-06-20 | Prime not distinguishable | Medium |
| S29 | https://discuss.dev.twitch.com/t/get-only-recurring-sub-with-the-api/50341 | FORUM | 2023-11-07 | no recurring flag; UserVoice only | Medium |
| S30 | https://github.com/twitchdev/issues/issues/187 | STAFF issue | 2020-08-05 to 2020-09-16 | gift-pack subs missing vs dashboard | Medium |
| S31 | https://github.com/twitchdev/issues/issues/184 | STAFF issue | 2020-08-04 to 2020-09-09 | fix; API includes broadcaster's own sub | Medium |
| S32 | https://discuss.dev.twitch.com/t/how-fresh-can-i-expect-the-subscribers-endpoint-data-to-be/16318 | FORUM | 2018-06-23 | delays of minutes to over an hour (old API) | Low |
| S33 | https://discuss.dev.twitch.com/t/subscribers-broken-delayed-on-v5/20359 | FORUM | 2019-03-04 | delayed subs on v5 | Low |
| S34 | https://discuss.dev.twitch.com/t/helix-get-broadcaster-subscriptions-only-returning-20/22833 | FORUM | 2019-10-14 | default page is 20, `first` changes it (no `user_id`) | Medium |

## 8. Not found / not verified

- Whether `first` is ignored when `user_id` is used on **subscriptions** (no source). Closed by RT-A A1.
- Behavior of Get Moderators and Get Broadcaster Subscriptions with more than 100 ids (only VIPs documents a 400). RT-A A3.
- What Twitch returns for a nonexistent numeric id, `0`, leading zeros or a 40-digit id. RT-A A4.
- Live content of a 429: headers present, body text, any `Retry-After`. RT-A A5.
- Current status code and body of the three endpoints on a non-affiliate channel (2021 vs 2024 conflict). RT-A A6.
- Whether Prime appears with a distinguishing `plan_name`. RT-A A7.
- Expired or cancelled-but-active subscriptions in the list; propagation delay of a new subscription, new moderator or new VIP on current Helix. RT-A A8.
- Whether `broadcaster_type` is stale after gaining or losing affiliate status.
- Whether the broadcaster appears in their own moderator and VIP lists (only subscriptions has a 2020 STAFF statement).
- Twurple GitHub or Discord reports about `getSubscriptionsForUsers`, `checkVipForUsers`, `getModerators` with `userId` (searched; none found). No Twurple tests for these were read.
- The twitch-cli mock and the pyTwitchAPI defaults do not prove production behavior.
- Third-party summarizing fetch was used for some forum pages; quotes were checked against the page text returned, not against screenshots.

## 9. Recommendations

### To `@dev` (P7 start or a test-only commit before it; do not change P6 behavior silently)

| Item | Recommendation | Why |
|---|---|---|
| `GROUP_LOOKUP_CHUNK_SIZE.moderator` | keep 100 | DOC: `first` ignored; max 100 ids |
| `.vip` | 20 now; 100 after RT-A A2 (or immediately, accepting DOC only) | DOC says ignored (young rule); 20 is strictly safe |
| `.subscriber` | 20 now; to reach 100 safely call `api.callApi({type:'helix', url:'subscriptions', scopes:['channel:read:subscriptions'], userId: broadcasterId, query:{broadcaster_id, user_id: ids, first: '100'}})` instead of `getSubscriptionsForUsers` (`callApi` is public; query arrays become repeated `user_id`, verified locally) | removes the dependence on the open `first` question; response keeps `user_id` |
| Id validation | change `NUMERIC_ID` to `^[1-9][0-9]{0,18}$` | Get Moderators returns 400 for non-positive integers; one bad id would fail the whole chunk of 19 others |
| 429 | do not rely on `retryAfterSeconds`; keep the fail-fast path; expect `timeout` for ordinary rate limiting; both hold | Twurple swallows the normal 429 (S10, S12) |
| Hung calls | accept the leak, but cap concurrent lookups per decision burst (3 reads per decision) and log a counter of `timeout` | late call stays queued in the per-user limiter |
| Error mapping | treat `error.name === 'CachedRefreshFailureError'` as `unauthorized`; keep status mapping | no `statusCode` on that error |
| 400 | add a closed code (for example `bad_request`) and treat it as failure, never "not a member"; a 400 on subscriptions with a non-affiliate type is the 2021 behavior | DOC lists 400 for all three |
| Empty 200 on subscribers | decisive "not a member" only when `getBroadcasterType` returned `affiliate` or `partner`; if the type is `null` or `none`, return `channel_not_eligible` or `unknown` for the subscriber group | an empty 200 may be the non-affiliate answer (S25) |
| Prime / gift | count every returned record as a subscriber, ignore `tier`, `is_gift`, `plan_name` | Prime is tier 1000 and cannot be separated |
| Do not depend on message strings | classify by status plus local state | DOC (S6) |

Tests needed (no new fakes of the wire are required, only these cases): a 400 chunk fails only its ids; `CachedRefreshFailureError` gives `unauthorized`; id `0`, `007`, 20 digits give `lookup_error` without a call; empty subscriber list with type `null` is not "not a member"; the missing 429 test already requested by the QA (L1).

### To `@ux-design-expert`

- Reason codes the person may see: `timeout` now also means "Twitch is slow or rate limiting"; keep one calm message ("could not check, held for review"), do not promise a retry time (Twitch gives none).
- Show "Reconnect Twitch to restore group access" for `scope_missing` and `unauthorized` alike, since Twitch merges missing scope, expired and revoked token under one 401 (QA L75-01).
- Copy must say that subscriber checks work only on affiliate or partner channels, and that Prime and gifted subscriptions count as subscribers.
- Do not display "not subscribed" for a brand-new subscriber as definitive; latency is unmeasured.

### Experiment script for the owner (RT-A, not executed)

Use a test channel and a disposable token; never paste tokens in tickets. Record status, headers and body shape only.

| Step | Action | Closes |
|---|---|---|
| A1 | Subscriptions with `first=1` and two `user_id` that are both subscribers (the broadcaster's own sub counts if present) | `first` ignored? |
| A2 | Same for VIPs and moderators with `first=1` and two members | confirms DOC |
| A3 | 101 ids on each endpoint (valid and invalid mix) | overflow behavior |
| A4 | ids `0`, `abc`, `007`, a 40-digit number, a numeric id of no account | validation |
| A5 | Burst of reads on a disposable client until 429; log all headers and body | 429 content, `Retry-After` |
| A6 | The three calls on a non-affiliate test channel | non-affiliate response |
| A7 | Prime and gifted subscription on a test account | `plan_name`, `is_gift` |
| A8 | Subscribe, add moderator, add VIP with a test account; poll every 5 s | propagation delay |
| A9 | Revoke the scope in Twitch connections and expire the token | 401 body and Twurple error |

## 10. Review triggers

- Twitch changes the pages of Get Moderators, Get VIPs, Get Broadcaster Subscriptions or the rate-limit guide (watch the change log RSS).
- `@twurple/api` leaves 8.2.0 (limiter and retry behavior are version-specific).
- RT-A produces any result that contradicts section 2, 3 or 4.
- P7 shows lookups timing out in the field, or a 400/403/404 not covered here.
- The project starts supporting non-affiliate channels or Twitch changes who may own custom rewards.
- A gift-pack or sub-list consistency report like twitchdev/issues 184/187 reappears.
