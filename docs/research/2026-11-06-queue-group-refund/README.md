# Refunding Channel Points by group (subscribers, moderators, VIPs, own list) and queue notices (research note)

[Português brasileiro](../../pt-BR/research/2026-11-06-queue-group-refund/README.md)

- Author: `@analyst` (Atlas). Date: 2026-11-05 (folder dated 2026-11-06 at the coordinator's request). Branch: `main` (`3225c8f`).
- Labels: **VERIFIED** (official page read in this session, installed Twurple 8.2.0 source, or repository code), **PARTIAL** (secondary or incomplete source), **UNVERIFIED** (inference or no source found; only a live Twitch test or a decision closes it).
- Scope: research and recommendation only. No code, test, Twitch call, database or Git operation was run. Nothing here proves live Twitch behavior.
- Reused, not repeated: `docs/research-index.md` rows #15 (OPS-20 refund by subscriber status, **GAP**), #17, #20 (redemption sync, **SUFFICIENT**) and #9 (OPS-7 chat, **REFRESH IF** Twurple leaves 8.2.0). Their findings are cited by id, not re-researched. This note adds only what they did not cover.
- Owner decisions (2026-11-06) taken as given: `redemption.fulfill` at the start of service (`in_progress`) stays the default flow; new scope for 0.4.0-beta+ is (1) chat notice on joining, (2) no-show/skip/reorder messages, (3) end-of-service message and "next" in the widget, (4) pause/close with notice, (5) refund by group at the streamer's choice, with the **moment** (on join or on start) also chosen per queue.

## 1. Executive summary

1. **Everything asked is technically feasible with the Twitch API the project already uses.** Refund is just `Update Redemption Status` with `CANCELED`; the group lookups are three Helix endpoints that accept up to 100 `user_id` per call. Item 1 SIM, item 2 SIM with a re-consent cost, item 3 SIM with restrictions, item 4 SIM, item 5 SIM with restrictions (section 8).
2. **A FULFILLED redemption can never be refunded through the API.** The official text allows changes only from `UNFULFILLED`, and only for the app that created the reward. So the refund-or-fulfill choice is **irreversible and must be made once, from a decision persisted before the Twitch call**.
3. **The redemption event carries no role.** Subscriber, moderator and VIP must be looked up (Helix, with the broadcaster's own token) at decision time. Chat badges are valid only for chat commands, never for the redemption path.
4. **Three new optional scopes** are needed, one per group: `channel:read:subscriptions` (subs), `moderation:read` (mods), `channel:read:vips` (VIPs). The "own list" needs no scope. Ask for each scope **only when the streamer enables that group** (Twitch requires apps to request only the scopes their calls need). Already-connected channels must go through the OAuth flow again; the project already has the optional-scope mechanism (`optionalScopes` in `apps/api/src/twitch/oauth.mjs`) and the `unknown` fail-closed pattern (`checkFollower`).
5. **Recommended design in one line:** a per-queue `settlement` setting (`fulfill_on_start` default, `refund_on_start`, `refund_on_join`) plus a per-queue set of refunded groups; decision = `eligible | not_eligible | unknown`, persisted once per redemption; `unknown` never becomes cancel or fulfill by itself.
6. **Build `refund_on_start` first.** It only swaps the terminal operation (cancel instead of fulfill) on the existing path. `refund_on_join` creates a new state (entry kept with no pending redemption) and touches duplicate-redemption, clear and removal rules, so it is a second slice.
7. **Chat notices are cheap and safe** on the current sender: the bot posts as the broadcaster, so the limit is 100 messages per 30 s. Real risks are message bursts (clear, mass reorder) and `is_sent=false` drops. Aggregate messages; keep treating `is_sent != true` as not delivered (the call-notification worker already does).
8. **Still open (needs a live test or the owner):** whether Twitch ever expires an UNFULFILLED redemption (no source found, again), whether a canceled redemption frees the reward's per-user/per-stream limit, whether `...redemption.update` fires for API changes, Prime representation, and whether the broadcaster appears in their own lists.

## 2. Feasibility by item

| # | Item | Verdict | Key evidence |
|---|---|---|---|
| 1 | Cancel = refund; no refund after FULFILLED | **SIM** | Update Redemption Status, official: "Setting the status to CANCELED refunds the user's channel points"; "You may update a redemption only if its status is UNFULFILLED. The app used to create the reward is the only app that may update the redemption." (row #15 verification round 2, re-confirmed below) |
| 2a | Subscriber check | **SIM, COM RESTRIÇÕES** | Get Broadcaster Subscriptions, `channel:read:subscriptions`; Prime not distinguishable; broadcaster-in-list UNVERIFIED |
| 2b | Moderator check | **SIM** | Get Moderators, `moderation:read` or `channel:manage:moderators`; `user_id` up to 100 |
| 2c | VIP check | **SIM** | Get VIPs, `channel:read:vips` or `channel:manage:vips`; up to 100 IDs |
| 2d | Own list | **SIM** | No Twitch call; store numeric user ID; privacy section 7 |
| 3a | Refund on join | **SIM, COM RESTRIÇÕES** | Cancel right after the entry is created; new "entry without pending redemption" state |
| 3b | Refund on start | **SIM** | Cancel in place of fulfill; same outbox, same read-verify |
| 4 | Chat notices, reorder messages | **SIM** | Helix Send Chat Message; project already sends and checks `is_sent` |
| 5 | Privacy of an own list | **SIM, COM RESTRIÇÕES** | Store ID only; logs without UID; OAuth-consent basis for retention (PARTIAL) |

## 3. Item 1: cancel = refund (VERIFIED unless noted)

Sources (read 2026-11-05): [Update Redemption Status](https://dev.twitch.tv/docs/api/reference/#update-redemption-status) as quoted in row #15 and row #20; the project adapter calls Twurple `updateRedemptionStatusByIds(broadcasterId, rewardId, [redemptionId], status)` (`apps/api/src/twitch/helix-adapter.mjs:162`).

- Transitions: `UNFULFILLED -> CANCELED` (refunds) and `UNFULFILLED -> FULFILLED`. Nothing else. **A FULFILLED redemption cannot be refunded via API** (confirmed, as the owner assumed).
- Only the Client ID that created the reward may update. The project creates and manages its own reward, so this holds; rewards created in the Twitch dashboard or by another tool are **out of reach** and must not be offered as refundable queues.
- Errors: 404 = ids not found **or** not UNFULFILLED (so a second cancel, or a cancel after fulfill, returns 404 and is indistinguishable from "never existed" without a read); 403 includes "broadcaster is not a partner or affiliate"; 401 = token/scope. Up to 50 ids per call, one `reward_id` and one status per call.
- `should_redemptions_skip_request_queue = true` makes redemptions FULFILLED at once, so such a reward can **never** be refunded. The project already forces `false`; keep this as a hard precondition for any refund mode.
- Deleting a reward with UNFULFILLED redemptions marks them FULFILLED (no refund) (row #20). Any refund mode must block reward deletion while refundable redemptions are pending (the project already blocks queue deletion).
- Old UNFULFILLED redemptions: the official reference only says the status "follows the normal request queue process". **No official or community source states an expiry, cap or automatic refund.** A new search on 2026-11-05 again found none (only third-party tool docs about manual fulfil/cancel). Status: **UNVERIFIED**, same as GAP #1 in the index. Design consequence: do not rely on expiry in either direction; `refund_on_start` can hold points for a long time, which is a UX/owner matter (section 9).
- Unverified side effect: whether a CANCELED redemption restores the reward's `max_per_user_per_stream` / global cooldown / max-per-stream counters. No source found. It decides whether `refund_on_join` lets group members re-enter for free repeatedly. Treat as **UNVERIFIED**; test live.

## 4. Item 2: identifying the group (VERIFIED unless noted)

### 4.1 Where the role is not

The `channel.channel_points_custom_reward_redemption.add` payload has `user_id`, `user_login`, `user_name`, `user_input`, `status`, `reward`, `redeemed_at` and **no badges or roles** (row #15). `channel.chat.message` has `badges`, and Twitch says: read them on each message, do not store them, "a user may change their chat badges at any time" ([Send and receive chat messages](https://dev.twitch.tv/docs/chat/send-receive-messages/), read 2026-11-05; row #9 RF-1/RF-2). Use badges **only** for chat commands (`apps/api/src/commands/authorization.mjs` already does). A viewer can redeem without ever chatting, so badges cannot decide a refund.

### 4.2 Endpoints, scopes and limits

All three require a user token of the **broadcaster** ("`broadcaster_id` must match the user ID in the access token"), and all accept `user_id` filters with a 100 limit, returning only matching users (row #15 verification round 2, from the official reference; scope wording re-confirmed on [Scopes](https://dev.twitch.tv/docs/authentication/scopes/) on 2026-11-05).

| Group | Endpoint | Scope (either) | Twurple 8.2.0 method (installed source) | Scope wording (official) |
|---|---|---|---|---|
| Subscriber | `GET /helix/subscriptions?broadcaster_id&user_id` | `channel:read:subscriptions` | `api.subscriptions.getSubscriptionsForUsers(broadcaster, users)` / `getSubscriptionForUser` | "View a list of all subscribers to a channel and check if a user is subscribed to a channel." |
| Moderator | `GET /helix/moderation/moderators` | `moderation:read` or `channel:manage:moderators` | `api.moderation.getModerators(channel, {userId})` / `checkUserMod` | "View a channel's moderation data including Moderators, Bans, Timeouts, and Automod settings." |
| VIP | `GET /helix/channels/vips` | `channel:read:vips` or `channel:manage:vips` | `api.channels.checkVipForUsers(broadcaster, users)` / `checkVipForUser` | "Read the list of VIPs in your channel." |

Notes:
- Prefer the **read** scopes (`channel:read:subscriptions`, `moderation:read`, `channel:read:vips`); the `manage` variants let the app change roles and violate least privilege. `moderation:read` is broad (bans, timeouts, AutoMod settings): the consent screen is heavier than the group's purpose. Tell the streamer why. **PARTIAL**: how Twitch words the consent screen for each scope was not checked.
- Subscribers: `tier` `1000/2000/3000`, `is_gift`. Prime is reported as tier 1000 and cannot be told apart (community answer, PARTIAL); the broadcaster in their own list is **UNVERIFIED**. Decide the broadcaster by the explicit rule `user_id == broadcaster_id` (no call). Decide moderator/VIP broadcaster the same way.
- A viewer in several groups: eligibility is the **union** of the enabled groups; record which group matched (`matched_group`) for audit, using a fixed order (own list, moderator, VIP, subscriber) so the stored value is deterministic.
- Twurple `callApi` is given the `scopes` it needs and the adapter can read `getCurrentScopesForUser`, as `checkFollower` does today; missing scope -> `unknown`, never "not a member".

### 4.3 Rate limits, cache, freshness

- Helix token bucket, 1 point per request by default, 429 when exhausted, headers `Ratelimit-Limit/Remaining/Reset`; user-token limits are per Client ID per user per minute ([guide](https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits), rows #15, #17). Do not assume the 800-point figure; read the headers.
- Cost per redemption: at most one call per enabled group (1 to 3 calls). Even a clear of 100 entries is at most 3 calls per 100 users. This is negligible against any documented bucket.
- **Cache recommendation:** no persistent cache. Query at decision time, keep an in-memory result for a few seconds only to coalesce bursts (same viewer, same decision moment), and **persist the decision** per redemption. A longer cache brings stale roles and a roster table (privacy surface).
- Event-driven roster (optional, later): EventSub `channel.subscribe`/`channel.subscription.end` ("Must have `channel:read:subscriptions` scope"), `channel.moderator.add/remove` ("Must have `moderation:read` scope"), `channel.vip.add/remove` ("Must have `channel:read:vips` or `channel:manage:vips` scope"), all version 1, exist ([EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), read 2026-11-05). They are at-least-once, miss events while disconnected and give no startup snapshot (row #15), so they could only **refresh** a cache, never replace the lookup. Not worth it for this scale. Re-open if lookups ever hit 429.
- Freshness: status is true "as of the decision moment", not the redemption moment. For `refund_on_start` that can be minutes later; a sub who lapsed in between loses the refund. State this in the panel copy.

### 4.4 Cost of re-authorizing the channel

- Tokens keep the scopes granted. Adding scopes needs a new authorization; Twitch's authentication page does not describe this, and a community answer says the same scopes do not re-prompt unless `force_verify=true`, and the dialog lists all scopes ([forum thread](https://discuss.dev.twitch.com/t/incremental-authorization-practices/19550), PARTIAL; no official statement). So request **required plus all desired optional scopes** in the new flow and verify with `/validate` that the granted list contains them (the project already does this in `oauth.mjs` lines ~96-98).
- Repo impact (VERIFIED, code read): `requiredScopes` is checked on every token, so the new scopes **must stay optional** or every existing connection breaks. `optionalScopes = ['moderator:read:followers']` and `issue({scopes})` reject unknown optional scopes, so adding three strings plus UX for "Reconnect Twitch to enable this group" is the whole change. A group enabled without its scope must show `reconnect_required` and evaluate to `unknown`.
- One extra reconnect per streamer, once per scope set. Requesting all three at once costs a single reconnect but over-asks for streamers who enable one group. Recommendation: **ask only for the scope of the group being enabled**, accumulate (new request = granted set plus the new one) so a second group costs a second, small reconnect. This is an owner decision (section 9, D-1).
- The Twitch rule: "An application must request only the scopes required by the APIs that their app calls", with a suspension warning ([Scopes](https://dev.twitch.tv/docs/authentication/scopes/)). Requesting unused scopes up front is the risky choice.

## 5. Item 3: moment of the refund

### 5.1 Behavior of each moment

| | `refund_on_start` | `refund_on_join` |
|---|---|---|
| Terminal Twitch operation | `CANCELED` replaces `FULFILLED` when the entry becomes `in_progress` | `CANCELED` right after the entry is created `waiting` |
| Points while waiting | Held (spent) until start | Returned within seconds (viewer sees spend then refund) |
| State at start | Redemption UNFULFILLED, as today | **No pending redemption**; `redemption.fulfill` must be skipped |
| Changes to existing code | Operation type chosen at start (`redemption.cancel` instead of `redemption.fulfill`) | New settlement state; rules that "refund on waiting removal / clear / duplicate" must treat an already-refunded redemption as done |
| Abuse by non-members | Not possible: non-members get FULFILLED as today | Same; but members can re-enter for free, so rely on `duplicate_active_entry`, per-user caps, and the unverified counter behavior (3) |
| Long wait | Points stay held for a long time; expiry UNVERIFIED | Not an issue |
| Fit with "never confirm without remote read" | Direct | Direct, but entry exists with `settlement=refunded` that must be confirmed by read |

### 5.2 Outbox and OPS-22 recovery

- The outbox has `redemption.fulfill` and `redemption.cancel`, each verified by reading the remote state before and after (`apps/api/src/outbox/financial-worker.mjs`, `classifyRemoteState`; row #20). The recovery policy (6 attempts, read to verify, manual resolution) applies unchanged to a cancel issued for a refund.
- **Race fulfill vs cancel:** two intents for the same redemption can both be pending (e.g. the entry is started while a `refund_on_join` cancel is retrying, or the entry is removed while start fulfills). Twitch will accept only the first and answer 404 to the other, which the read-verify turns into "mismatch". Required invariant: **one terminal intent per redemption** (unique constraint on redemption plus terminal-kind), written in the same transaction that decides eligibility; a later request that wants the opposite terminal result must become a manual-resolution case, never a silent switch. This matches the project rule that a missing or contradictory answer is never a confirmation.
- **Double cancel:** the second call returns 404 (not UNFULFILLED); the read shows `CANCELED` = expected, so it must resolve as already done, not as failure. The current `classifyRemoteState` and its `statusCode` vs `status` bug fix (row #20) already cover this path; add a test with a real Twurple instance, not a plain object.
- **Decision before call:** persist `eligibility_decision`, `matched_group`, `settlement_mode`, `checked_at` and an `unknown_reason` code before enqueuing, as row #15 recommended for OPS-20 (retries must not re-query and flip the answer).
- **Unknown:** with `refund_on_join`, unknown means the redemption stays UNFULFILLED, the entry stays `waiting`, and the outbox holds an "awaiting eligibility" item with retries (429/5xx) and a panel action (refund / fulfill / keep). With `refund_on_start`, unknown **blocks the automatic fulfill**; start must not silently choose, because FULFILLED is irreversible.
- **Traceability:** after a join-time cancel, the entry has no pending redemption to correlate with. Keep `redemption_id` and the terminal status on the entry, plus an audit line (no UID in logs). The existing `Entry.redemptionId` and `Redemption` rows (Prisma) already allow this; the status values are what changes.
- Lost-event risk: an EventSub `...redemption.update` event exists ("Must have `channel:read:redemptions` or `channel:manage:redemptions`"; its payload status comment reads "Either fulfilled or cancelled"), but the text does not say it fires for API changes made by the app itself. **UNVERIFIED**. Never use it as confirmation; the read stays the source of truth.

### 5.3 Recommendation on the moment

Implement `refund_on_start` first (low risk, same path, no new entry state). Add `refund_on_join` as a second slice, only after the live test answers the counters question (3). Keep `fulfill_on_start` as the default for existing queues so nothing changes silently.

## 6. Item 4: chat notices and reordering (VERIFIED unless noted)

Sources read 2026-11-05: [Send and receive chat messages](https://dev.twitch.tv/docs/chat/send-receive-messages/), [Chat guide: rate limits](https://dev.twitch.tv/docs/chat/), [Send Chat Message reference](https://dev.twitch.tv/docs/api/reference/#send-chat-message).

- Sender: the project calls Twurple `api.chat.sendChatMessage(broadcasterId, message)` with the broadcaster's `user:write:chat` token, so the **sender is the broadcaster**. No new scope.
- Limits: non-broadcaster/mod/VIP bot: 20 messages per 30 s and 1 per second per channel; broadcaster, moderator or VIP: 100 per 30 s; verified bots 7,500 per 30 s ("rarely granted"). Exceeding makes Twitch ignore bot messages for one hour except where the bot is broadcaster/mod/VIP. Because the sender is the broadcaster, the 1-per-second rule does not apply and the ceiling is 100 per 30 s. The Send Chat Message bucket is separate from the regular Helix bucket.
- Message max 500 characters; 422 "The message is too large"; 403 sender cannot chat there; 429 rate limit. Delivery result: `is_sent` and `drop_reason {code, message}` (example `automod_held`). The project already treats `is_sent !== true` as `chat_delivery_not_confirmed` and retries (`chat-worker.mjs`).
- Duplicate messages: the Send Chat Message section has no duplicate rule; community knowledge of a duplicate-message window is **UNVERIFIED** here. Vary the text per recipient (name and position), which also reads better.
- Bursts: a mass event (clear, close, reorder, "no-show chain") can exceed 100 per 30 s. Recommended policy: one summary message per event type, rate-limited send queue (for example at most N per 30 s with headroom), priority to the "your turn" call over informational notices, drop-or-merge informational notices on overflow, never retry informational notices indefinitely.
- Announcements: `Send Chat Announcement` is a separate API (not the message API; banner color; cannot be a reply). Its scope was not verified in this pass (**UNVERIFIED**; likely a moderator scope). Not needed: plain messages are enough and add no scope.
- Reply messages: `reply_parent_message_id` threads a reply to a viewer's command. Useful for `!posição`; optional.
- Presence command (`!aqui`/`!here`) after a call: handled in chat with badges for permission, the existing command pipeline; the only added need is an identity check on the entry owner (`user_id`), not roles.
- Other queue bots (PARTIAL, complementary only, repository READMEs): [Firebot queue](https://github.com/giff-h/FirebotQueue) moves a skipped viewer to a skipped list, re-queues them at the front when they return, and announces the new position; [Jambo](https://github.com/Nertsal/jambo) has broadcaster-only `!skip`, `!skip next`, `!unskip` and an auto-skip when the owner does not reply within a set time; [twitch-queue-bot](https://github.com/sirskaro/twitch-queue-bot) has `!wait` and `!drop`; StreamElements' [Viewer Queue](https://blog.streamelements.com/level-up-your-engagement-with-viewer-queue-2cdcdcd40f6a) lists pick/remove/position only. None documents "no-show" as such. Take the ideas (skipped list, timeout-then-skip, position echo), not the behavior, as requirements.
- Twurple `ChatClient` (IRC) is not used and not needed; keep Helix. Reading chat stays on EventSub `channel.chat.message` (row #6).

## 7. Item 5: privacy and compliance

- **Own list:** store only the numeric Twitch `user_id` (stable; logins can change) plus, optionally, the display name as a label for the panel, refreshed from Get Users when shown. Resolve the login the streamer typed to an ID once at add time (Get Users needs no special scope). Mark entries with `added_at`; support remove and clear-all; delete them with the queue and with the channel's data. **Ownership:** the list is the broadcaster's data about their own audience, which keeps retention within the OAuth-consented purpose.
- **Logs:** no UID, login, token, header or chat text in logs (project rule, `AGENTS.md`); use counts and reason codes (`matched_group`, `unknown_reason`). Panel/API responses may show logins to the authenticated owner only.
- **Developer terms (PARTIAL):** the [Developer Services Agreement](https://legal.twitch.com/en/legal/developer-agreement/) page is rendered by script and its body could not be read by the fetch tool in this session. Through the developer forum: a user quotes the clause allowing apps to "cache such information for only a twenty-four hour time period without further sharing it with third parties"; a reply on 2025-07-14 by a Twitch-side account (`jbulava`, "we"; badge not shown) says that with an OAuth flow "you are compliant with our Developer Services Agreement to store and present this information" beyond 24 hours and that other agreement terms still apply ([thread](https://discuss.dev.twitch.com/t/storage-of-data-from-twitch-api/63884)). So storing the broadcaster's own roster choices obtained through OAuth is fine; what is **not** established is a general right to keep a roster of every subscriber/mod/VIP. That supports the "no persistent roster, store only the decision" recommendation. Treat the wording as unconfirmed until `@po` or the owner reads the current agreement.
- **Minimization:** the decision record keeps `matched_group`, tier (optional), `checked_at`; do not store gifter identity (row #15). The "own list" is the only store of viewer IDs beyond entries already kept.
- **Deletion requests:** a viewer asking to be removed from an own list: the streamer removes the row (panel action); document it. No automatic deletion path is required.

## 8. Recommended high-level design

1. **Queue settings:** `settlement` enum (`fulfill_on_start` default, `refund_on_start`, `refund_on_join`); `refund_groups` set of (`subscriber`, `moderator`, `vip`, `own_list`), empty means nobody; broadcaster handled by explicit rule (decision D-3). Extends OPS-20 data model option A (enum per queue) from "everyone/subscribers/nobody" to a set; recommend `@architect` and `@data-engineer` treat this as one design, not two stories.
2. **Decision service:** `decide(userId, queue)` -> `{decision: eligible|not_eligible|unknown, matched_group, reason}`; unknown on missing scope, 401/403/429/5xx, timeout, malformed body, non-affiliate; lookups limited to enabled groups; own list consulted first (no call).
3. **Persist before act:** decision row plus a single terminal intent per redemption in one transaction; the outbox performs the Twitch call with the existing read-verify and recovery.
4. **Terminal mapping:** eligible -> cancel; not eligible -> fulfill (at the queue's moment); unknown -> awaiting-eligibility with panel actions (retry now / refund / fulfill / keep UNFULFILLED).
5. **Preconditions enforced (otherwise the refund modes are disabled):** reward created by this Client ID; skip-request-queue off; channel affiliate/partner; scope granted for each enabled group.
6. **Reward deletion / queue deletion guard** while refundable redemptions remain pending (already exists for queues; keep for rewards).
7. **Notices:** a typed notice catalog with per-queue toggles and templates, a bounded send queue with priority, aggregated bursts, `is_sent` confirmation, and no UID in text unless the queue already shows it.
8. **Panel:** per-group switches with a "Reconnect Twitch to enable" action when a scope is missing, moment selector, copy that says the status is checked at the decision moment and that "unknown" waits for the streamer. UX plan and 9.0 review belong to `@ux-design-expert`.

## 9. What depends on the owner

- **D-1 Re-authorization:** accept a reconnect when a group is first enabled (recommended: one scope per enabled group, accumulating), or a single reconnect for all three up front. Also whether `moderation:read` (broad consent text) is acceptable for the moderator group.
- **D-2 Unknown handling:** confirm that "could not check" never auto-refunds nor auto-fulfills and waits for the streamer (recommended), or choose a default fallback (fulfill = safe for the streamer, loses the refund forever).
- **D-3 Broadcaster, Prime, gifted subs:** broadcaster eligible by rule? Prime and gifted count as subscribers (recommended yes)? Tier restriction needed?
- **D-4 Held points:** is it acceptable that `refund_on_start` holds viewers' points for a long wait, given that expiry is unverified?
- **D-5 Own list scope:** per queue or one list for the channel; max size.
- **D-6 Live test:** authorization for the Twitch test channel to close the UNVERIFIED items (list in section 11).

## 10. Open questions for the specialists

- `@architect`: terminal-intent uniqueness and how a contradictory late intent becomes manual resolution; where the decision service lives; interaction with OPS-20 (merge or supersede); batching cancels (up to 50 ids per call, same reward) without losing per-redemption results; send-queue design for notices.
- `@data-engineer`: schema for `settlement`, `refund_groups`, own-list rows (ID only), decision/audit columns; migration with defaults that preserve `fulfill_on_start`; whether the entry can keep a canceled redemption without breaking `Entry.redemptionId` uniqueness and the `Restrict` relation.
- `@ux-design-expert`: enabling a group needs a reconnect; copy for "checked at decision time", "waiting for your decision", held points; how to show the matched group without exposing viewer data; notice templates and the burst policy visible to the streamer.
- `@qa`: tests with the real `HelixCustomRewardRedemption` class (row #20), 404-after-cancel read-verify, fulfill/cancel race, 429 in the lookup, missing scope = unknown, PostgreSQL integration with real migrations.

## 11. Limitations and what only a live test closes

- No live Twitch call was made. Rate headers, latency and consent-screen text were not observed.
- **UNVERIFIED, test on an affiliate test channel:** (a) expiry of UNFULFILLED redemptions; (b) whether CANCELED restores per-user/per-stream limits and cooldown; (c) whether `...redemption.update` fires for app-made changes; (d) Prime representation; (e) broadcaster in their own subscriber/mod/VIP list; (f) scope behavior of a second authorization (does the new token carry only the newly requested set).
- The Developer Services Agreement body was not read directly (script-rendered page); the 24-hour clause and the OAuth exemption come from a developer forum thread (PARTIAL).
- The Send Chat Announcement scope and the duplicate-message window were not verified. Competitor bot behavior comes from repository READMEs, not from tests.
- Twitch docs change; the references reflect pages read on 2026-11-05. **REFRESH IF** Twitch changes Update Redemption Status, the three role endpoints or their scopes, the chat limits, or `@twurple/api` leaves 8.2.0.

## 12. Self-assessment (rubric, target at least 9.0)

| Criterion | Score | Basis |
|---|---|---|
| Official sources | 9.0 | Reference, EventSub types, scopes, chat limits read from dev.twitch.tv; Twurple 8.2.0 source read; agreement body not readable (PARTIAL) |
| Evidence and honesty about gaps | 9.3 | Each item labeled; six UNVERIFIED items named with a closing method; expiry GAP re-searched, still no source |
| Fit to the case | 9.2 | Tied to the real outbox, adapter, OAuth and OPS-20 data; design maps to existing code paths |
| Risks | 9.0 | Race, double cancel, irreversible fulfill, held points, burst limits, stale roles, scope reconsent covered |
| Measurability | 8.8 | Test list and live-test checklist given; no live numbers available |
| **Overall** | **9.1** | Meets the 9.0 target; the gaps are live-test items, not research items |

## Sources (accessed 2026-11-05)

- Twitch API reference: [Update Redemption Status](https://dev.twitch.tv/docs/api/reference/#update-redemption-status), [Send Chat Message](https://dev.twitch.tv/docs/api/reference/#send-chat-message), [Get Broadcaster Subscriptions](https://dev.twitch.tv/docs/api/reference/#get-broadcaster-subscriptions), [Get Moderators](https://dev.twitch.tv/docs/api/reference/#get-moderators), [Get VIPs](https://dev.twitch.tv/docs/api/reference/#get-vips)
- [EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
- [Scopes](https://dev.twitch.tv/docs/authentication/scopes/), [Rate limits](https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits)
- [Send and receive chat messages](https://dev.twitch.tv/docs/chat/send-receive-messages/), [Chat guide](https://dev.twitch.tv/docs/chat/)
- Community (complementary): [incremental authorization](https://discuss.dev.twitch.com/t/incremental-authorization-practices/19550), [data storage](https://discuss.dev.twitch.com/t/storage-of-data-from-twitch-api/63884), [Prime subs](https://discuss.dev.twitch.com/t/distinguishing-prime-sub-from-recurring-sub-in-subscriptions-api/46189)
- Queue bots (complementary): [FirebotQueue](https://github.com/giff-h/FirebotQueue), [Jambo](https://github.com/Nertsal/jambo), [twitch-queue-bot](https://github.com/sirskaro/twitch-queue-bot)
- Repository: `docs/stories/OPS-20/research.md`, `docs/stories/OPS-15/redemption-sync-research.md`, `docs/stories/OPS-7/spec/research.json`, `apps/api/src/twitch/{oauth,auth-runtime,helix-adapter}.mjs`, `apps/api/src/outbox/{financial-worker,chat-worker}.mjs`, `node_modules/@twurple/api` 8.2.0
