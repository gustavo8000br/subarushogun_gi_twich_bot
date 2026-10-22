# OPS-20 — Research: per-queue refund eligibility by subscriber status

[Português brasileiro](../../pt-BR/stories/OPS-20/research.md)

**Author:** `@analyst` (Atlas), 2026-10-21. **Story:** [story.md](story.md), issue [#76](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/76).
**Nature:** desk research plus a read-only reading of the current code. No code, test, Twitch call or database was executed. Nothing here is evidence of live Twitch behavior.

## 0. Current code baseline (read on 2026-10-21, branch `feat/ops-15-next-panel`)

| Area | Finding |
|---|---|
| Refund decision | `apps/api/src/domain/entry-transitions.mjs` `decideEntryTransition()` returns `financialDecision: 'request_cancel'` (refund) when: a redemption entry is removed from `waiting` (always); removed from `called`/`in_progress` and `refundIfRemovedWhileCalled` (or `refundIfViewerLeavesWhileCalled` when origin is the viewer); moves to `no_show` with `refundOnNoShow`; or is removed with reason `queue_cleared`/`queue_deleted` (always, overriding policy). External observations never request anything. |
| Policy source | `apps/api/src/domain/queue-service.mjs` builds a policy snapshot from three Boolean queue columns (`apps/api/prisma/schema.prisma` lines 26–28; defaults `true`, `false`, `false`). |
| Execution | The decision becomes a durable financial outbox task (`redemption.cancel` → `CANCELED`) in `apps/api/src/outbox/financial-worker.mjs`. |
| Clear | `apps/api/src/domain/clear-confirmation.mjs` counts `refundsRequested` as every redemption entry; chat copy (`chat.queue.clear_confirm`/`clear_done`) states that number. |
| OAuth scopes | `apps/api/src/twitch/oauth.mjs` and `auth-runtime.mjs`: required `channel:manage:redemptions`, `user:read:chat`, `user:write:chat`; optional `moderator:read:followers`. |
| Optional-scope pattern | `helix-adapter.mjs` `checkFollower()` already returns `'unknown'` when the optional scope is missing or the call fails — the right pattern to copy. |
| Chat badges | `apps/api/src/commands/authorization.mjs` derives `subscriber`/`vip`/`moderator` from chat badges (EventSub chat). It checks only the `subscriber` badge, not `founder`. |

Implication: there are two refund families — **policy-driven** (called/no-show/leave) and **forced** (waiting removal, queue clear/delete). OPS-20 must say which family the rule touches (question 3 below).

## 1. Which API says whether a viewer is a subscriber

| Endpoint | Token | Scope | Usable by the bot? |
|---|---|---|---|
| **Get Broadcaster Subscriptions** `GET /helix/subscriptions?broadcaster_id=…&user_id=…` | Broadcaster user token | `channel:read:subscriptions` | **Yes.** `user_id` filter is repeatable (Twitch documents up to 100 IDs; not reverified on this pass). Returns `tier` (`1000`/`2000`/`3000`), `is_gift`, `gifter_id`/`gifter_login`/`gifter_name` (empty when not a gift), `plan_name`. A non-subscriber is simply absent from `data`. |
| Check User Subscription `GET /helix/subscriptions/user` | **Viewer's** user token | `user:read:subscriptions` | **No.** It needs each viewer to authorize the app. |

Gaps in current scopes: `channel:read:subscriptions` is missing. Add it as an **optional** scope (like `moderator:read:followers`). Twitch tokens keep the scopes they were granted, so **already-connected streamers must re-authorize**. Until they do, a queue set to "subscribers only" must evaluate to `unknown` and the panel must show a "Reconnect Twitch to allow subscriber checks" action. "Everyone"/"nobody" need no new scope. Do not add the scope as required: that would break every existing connection.

Limits: the endpoint lists **active** subscriptions only. Community reports say gifter data covers only active gifts. Prime subs are reported as tier `1000`. I found no documented Prime flag on this endpoint (not verified).

## 2. Affiliate/Partner requirement

Both Channel Points and subscriptions require Affiliate or Partner. `Update Redemption Status` returns **403** when the broadcaster is not a partner or affiliate. The bot already detects this (`getChannelEligibility()` → `channel_ineligible`). So a non-affiliate channel has no redemptions, the rule never applies, and the option can stay hidden, as AC6 already does for manual-only queues. If a channel loses affiliate status, existing UNFULFILLED redemptions cannot be updated, and the current outbox failure handling already covers that. Do not read "zero subscribers" as "not subscriber" without a successful 200 response.

## 3. Broadcaster, moderators and VIPs (if the owner opts in)

- Broadcaster: compare `user_id === broadcaster_id`. No API call is needed.
- **Get Moderators** `GET /helix/moderation/moderators` needs `moderation:read` (or `channel:manage:moderators`). `user_id` can be repeated up to 100 times, and non-moderators are left out.
- **Get VIPs** `GET /helix/channels/vips` needs `channel:read:vips` (or `channel:manage:vips`). It takes up to 100 `user_id`s, and non-VIPs are ignored.
- Each one means another optional scope and another re-consent. The story says these audiences are out of scope, so leave them out of MVP.

## 4. Does the redemption carry subscriber info? Lookup vs cache

- The EventSub `channel.channel_points_custom_reward_redemption.add` payload, and the Update Redemption Status response, include `user_id`, `user_login`, `user_name`, `user_input`, `status`, `reward`, `redeemed_at`. They include **no badges or subscriber status**.
- Chat badges (EventSub `channel.chat.message` `badges`) exist only when the viewer sends a chat message. They show status at that moment, can be `founder` instead of `subscriber`, and don't give the gift flag reliably. Use them as an unreliable hint only. They are not an audit-grade source.
- EventSub `channel.subscribe`, `channel.subscription.end`, `channel.subscription.gift`, `channel.subscription.message` (all `channel:read:subscriptions`) could keep a local cache up to date. But delivery is at-least-once, events can be missed while the WebSocket is down, there is no snapshot at startup, and a cache adds a new table and privacy surface.

**Recommendation:** look up status **at refund-decision time** with Get Broadcaster Subscriptions (batched for clear). That matches AC2 ("decided once, at the moment … from the status Twitch reports"). Use a three-state result `subscriber | not_subscriber | unknown`:
- `subscriber`/`not_subscriber` come only from a 200 response that has a valid shape.
- `unknown` covers a missing scope, 401/403/429/5xx, a timeout, a malformed body, an invalid ID, or a non-affiliate channel. **It is never mapped to grant or deny.** The financial intent stays in a pending eligibility state with a localized reason, and the streamer can retry, refund manually, or keep the redemption.
- Decide the status once per redemption and persist it before the outbox task is created, so retries don't re-query and get a different answer (idempotency, AC5).

## 5. Rate limits and clear-queue batching

- Helix uses a token bucket per client and user. The commonly documented budget is about 800 points/minute, and each request costs 1 point. Read `Ratelimit-Remaining`/`Ratelimit-Reset`, and on 429 back off and keep the task `unknown`/retryable.
- One Get Broadcaster Subscriptions call can check up to 100 viewers. A clear of N entries takes ceil(N/100) lookups, not N.
- Update Redemption Status takes up to **50 `id`s per call**, but only for one `reward_id` and one status. A queue maps to one reward, so refunds can be grouped by reward in chunks of 50. Note that the current outbox is one intent per redemption. Batching is an optimization for `@architect`/`@data-engineer`, and it must still record a per-redemption result. A 404 means "not UNFULFILLED"; do not report it as a refund.
- Latency: one extra Helix call (≈100–300 ms typical, not measured here) before cancelling. For clear, the confirmation copy can no longer state the refund count up front. It must say "refunds per your rule; X eligible, Y not eligible, Z pending check".

## 6. Data model options (for `@data-engineer`)

| Option | Pros | Cons |
|---|---|---|
| **A. Queue enum column** `refund_eligibility` (`everyone`/`subscribers`/`nobody`), NOT NULL DEFAULT `everyone` | Fits the existing typed Boolean columns, CHECK/enum constraint, easy default preservation | Adding audiences later needs an enum migration |
| B. Settings JSON | Flexible | Weaker validation, harder queries, inconsistent with the current schema |

Recommend **A**. A PostgreSQL `ADD COLUMN … NOT NULL DEFAULT 'everyone'` keeps behavior for existing rows (fast default, PG ≥ 11). Rollback drops the column. Take a snapshot first.

Audit, on the financial intent or a sibling row per redemption: `eligibility_rule` (snapshot), `eligibility_decision` (`eligible`/`not_eligible`/`unknown`), `subscriber_status` (`subscriber`/`not_subscriber`/`unknown`), `subscriber_tier` (nullable), `subscriber_is_gift` (nullable), `status_source` (`helix_subscriptions`/`not_required`/`broadcaster_self`), `status_checked_at`, `unknown_reason` (code only). Do not store gifter identity or tokens. Logs must not hold UIDs (project rule). Add an outbox state for "awaiting eligibility", or a decision column, so `unknown` never becomes `request_cancel`/`no_operation` without notice.

## 7. Risks and recommended decisions on the open questions

| Open question | Recommendation | Risk if wrong |
|---|---|---|
| Broadcaster/mods/VIPs eligible by default? | **No by default for mods/VIPs** (out of scope, extra scopes and re-consent). Broadcaster self-redemptions: treat as eligible (free check, no scope). Only `@po` should confirm this. | Surprise refunds or non-refunds; scope creep |
| Gifted and all tiers count? | **Yes. Any active subscription, any tier including Prime and gifted**, matching what Twitch reports. Record tier and `is_gift` for audit so a later "exclude gifts" option needs no migration. | Arguments with viewers if the rule is narrower than the badge they see |
| Every trigger or per trigger? | **One rule per queue applied to every refund the bot would request**: removed while called, no-show, leave, waiting removal **and** queue clear/delete. Today clear/delete force refunds, so they must now go through the rule. Otherwise "subscribers only" streamers refund everyone on clear. Per-trigger choice can come later if users ask. | The current forced-refund paths quietly bypass the rule |

Other risks: a re-consent gap for existing streamers, which needs a clear `unknown` UX. Clear copy currently promises refund counts. A non-eligible redemption left UNFULFILLED sits in the streamer's Twitch queue, so decide explicitly whether to set it FULFILLED (no refund) or leave it. `founder` badge mismatch if badges are ever used. The status reflects the decision moment, not the redemption moment.

## Sources (accessed 2026-10-21)

- Twitch API reference — Update Redemption Status, Get Moderators, Get VIPs (verified on the page): https://dev.twitch.tv/docs/api/reference/
- Get Broadcaster Subscriptions / Check User Subscription (same reference; the page fetch was truncated before this section, so the fields were confirmed via search snippets and Twurple docs): https://dev.twitch.tv/docs/api/reference/#get-broadcaster-subscriptions, https://twurple.js.org/reference/api/classes/HelixSubscription.html
- Scopes: https://dev.twitch.tv/docs/authentication/scopes/
- EventSub subscription types and redemption payload: https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/
- Rate limits: https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits
- Community (supplementary, gifter data only for active gifts): https://discuss.dev.twitch.tv/t/help-for-gift-subscribe/24582, https://discuss.dev.twitch.tv/t/websocket-notification-know-who-gifted-sub/42189

**Not verified on this pass:** the exact `user_id` max for Get Broadcaster Subscriptions, Prime flag absence, the current 800-points figure, and real latency. Validate with `@architect` against docs and fakes. There is no live Twitch claim.


## Addendum — verification attempt, 2026-10-21 (Orion, WebSearch/WebFetch)

- **Verified (official guide, https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits):** Helix uses a token bucket; the default cost is 1 point per request; an exhausted bucket returns HTTP 429; app and user access requests have separate buckets and user-token limits apply per client ID per user per minute; response headers are `Ratelimit-Limit`, `Ratelimit-Remaining`, `Ratelimit-Reset` (use the latter to decide how long to wait). Some endpoints may return 429 for reasons unrelated to the general bucket, so the error message must be parsed.
- **Partly confirmed (Twurple reference, https://twurple.js.org/reference/api/classes/HelixSubscriptionApi.html):** `getSubscriptionsForUsers` is described as “the subset of the given user list that is subscribed to the given broadcaster”, `getSubscriptionForUser` checks with the broadcaster's authorization, and `checkUserSubscription` checks with the user's authorization — consistent with using the broadcaster token for batch lookups.
- **Community evidence (https://discuss.dev.twitch.tv/t/channel-points-api-update-redemption-status-endpoint-should-be-accessible-using-client-flow/30939):** Update Redemption Status needs a user token and only manages rewards created by the same client ID (older thread, re-test against real Twitch before relying on it).
- **Still NOT verified from official text** (the API reference page is ~517k characters and was truncated by the fetch tool): the 100 `user_id` limit per Get Broadcaster Subscriptions call, the `first` maximum, the exact scope wording, the `is_gift`/`tier` field descriptions, Prime representation and the 50-id limit of Update Redemption Status. **Design consequence for CA 11:** make batch sizes configuration constants, never assume the numbers, treat any 4xx batch error as `unknown`, honour `Ratelimit-Reset` on 429, and confirm the numbers against the live reference during the @architect gate.

## Verification round 2 — 2026-10-21 (@analyst Atlas)

Method: the full official reference (https://dev.twitch.tv/docs/api/reference/, page `dateModified` 2026-10-19) and guide (https://dev.twitch.tv/docs/api/guide/) were downloaded in full and searched as text, avoiding the WebFetch truncation. Quotes are verbatim. No live Twitch call was made.

1. **Get Broadcaster Subscriptions — VERIFIED (official), Prime part PARTIAL.** Source: https://dev.twitch.tv/docs/api/reference/#get-broadcaster-subscriptions
   - Token/scope: “Requires a user access token that includes the channel:read:subscriptions scope.” and `broadcaster_id`: “This ID must match the user ID in the access token.” (so: the broadcaster's own token).
   - `user_id`: “You may specify a maximum of 100 subscribers.” `first`: “the maximum is 100 items per page. The default is 20.” `after`/`before`: “Do not specify if you set the user_id query parameter.” `total`/`points`: “If the user_id query parameter is used, this field will be null.”
   - `tier`: “The type of subscription. Possible values are: 1000 — Tier 1 2000 — Tier 2 3000 — Tier 3”. `is_gift`: “Is true if the subscription was gifted.” `gifter_id`/`gifter_login`/`gifter_name`: “Is an empty string if is_gift is false.” (Check User Subscription instead says the gifter fields are present “only if is_gift is true”.)
   - Prime: the official text has no Prime value or flag. Community only (not staff, 2023-06-20): “the API alone doesn't give you this data as, as you found, it doesn't distinghish primes” — https://discuss.dev.twitch.com/t/distinguishing-prime-sub-from-recurring-sub-in-subscriptions-api/46189 . Treat Prime as `tier: "1000"`, indistinguishable.
   - Broadcaster in own list: **UNVERIFIED** — no official or community statement found. Do not rely on either behaviour; handle the broadcaster by an explicit rule.
2. **Update Redemption Status — VERIFIED (official).** Source: https://dev.twitch.tv/docs/api/reference/#update-redemption-status
   - “You may update a redemption only if its status is UNFULFILLED. The app used to create the reward is the only app that may update the redemption.”
   - `id`: “You may specify a maximum of 50 IDs.” `reward_id` is a single required parameter, so all ids in one call must belong to the same reward (inference from the parameter shape; not a separate sentence).
   - Body `status`: “Possible values are: CANCELED FULFILLED Setting the status to CANCELED refunds the user’s channel points.” 404: “The redemptions specified using the id query parameter were not found or their statuses weren't marked as UNFULFILLED.” 403 includes “The broadcaster is not a partner or affiliate.”
   - **Answer:** only UNFULFILLED → FULFILLED or UNFULFILLED → CANCELED. A FULFILLED redemption **cannot** be refunded later via the API. Marking a non-eligible redemption FULFILLED forecloses any later refund by the app; keep it UNFULFILLED if a later manual/automatic refund must remain possible.
   - Related official facts: Delete Custom Reward — “If the reward’s redemption status is UNFULFILLED at the time the reward is deleted, its redemption status is marked as FULFILLED.” Get Custom Reward Redemption — “Canceled and fulfilled redemptions are returned for only a few days after they’re canceled or fulfilled.” `should_redemptions_skip_request_queue` — if true, redemptions are “set to FULFILLED status immediately” (so such rewards can never be refunded by the API).
3. **UNFULFILLED redemptions in the queue — UNVERIFIED.** The reference only says that with the queue enabled the status “is set to UNFULFILLED and follows the normal request queue process”. No official text (reference or Help Center; https://help.twitch.tv/s/article/channel-points-guide did not render for the tool) and no forum post states an auto-expiry, auto-refund or cap on pending redemptions. Third-party docs (https://docs.streamer.bot/faq/fulfill-cancel-cpr) only describe manual fulfil/cancel. Design assumption: they stay UNFULFILLED until acted upon, but deleting the reward turns them FULFILLED (official, item 2) — so never delete a reward while refundable redemptions are pending.
4. **Moderators/VIPs — VERIFIED (official).** Get Moderators: “Requires a user access token that includes the moderation:read scope. If your app also adds and removes moderators, you can use the channel:manage:moderators scope instead.”; `user_id` “maximum of 100 IDs… The returned list includes only the users from the list who are moderators”; `first` max 100. Get VIPs: “Requires a user access token that includes the channel:read:vips scope. If your app also adds and removes VIP status, you can use the channel:manage:vips scope instead.”; “The maximum number of IDs that you may specify is 100. Ignores the ID of those users in the list that aren’t VIPs.” Both require `broadcaster_id` to “match the user ID in the access token”. Sources: https://dev.twitch.tv/docs/api/reference/#get-moderators, https://dev.twitch.tv/docs/api/reference/#get-vips
5. **429 handling — VERIFIED (official), already summarised in the Addendum.** Guide: “If your bucket runs out of points within 1 minute, the request returns status code 429.”; “For requests that specify a user access token, the limits are applied per client ID per user per minute.”; “Some API endpoints may return HTTP 429 response codes for reasons unrelated to the general rate limit bucket. In these cases, you must parse the error message returned to determine the reason for the response.” The same guide says code “should not take dependencies on message strings” — so classify 429 by status + `Ratelimit-Reset`, log the message only as diagnostic. Some endpoints have their own windows (e.g. Remove Channel Moderator: “exceeded the number of requests allowed within a 10-second window”); none of the five endpoints above documents a non-default cost.

Remaining limitations: Prime and broadcaster-in-list behaviour and queue expiry need confirmation against real Twitch (test channel) by `@architect`/`@qa`; no fixture here proves real behaviour.
