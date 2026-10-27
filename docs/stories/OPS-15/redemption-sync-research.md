# OPS-15 Research: Channel Points redemption sync (`redemption.fulfill` stuck in `unknown`, queue deletion blocked, `degraded` integration)

[Português brasileiro](../../pt-BR/stories/OPS-15/redemption-sync-research.md)

- Date: 2026-10-26 (incident reported from the 2026-10-27 live session). Author: @analyst (Atlas). Read-only: code, installed `node_modules` and the official Twitch API reference. No Twitch, GitHub, database or container operation was run.
- Prior notes checked first (golden rule): #5 FND-9, #10 OPS-8, #13/#14 API contract, #15/#17 OPS-20. None covered the Helix redemption *read* shape or Delete Custom Reward with pending redemptions, so this is a GAP note.
- Labels: **VERIFIED** (official doc or source code read today), **PARTIAL** (partly confirmed or inferred from verified pieces), **UNVERIFIED** (needs a live test or logs).

## TL;DR: most likely root cause (confidence: high, ~90%)

`helix-adapter.mjs` reads the redemption status with `redemptionStatus(value)`, which checks `value.isFulfilled`, then `value.isCanceled`, then falls back to `value.status`. In `@twurple/api` 8.2.0 the class `HelixCustomRewardRedemption` has **no `status` getter** (only `isFulfilled` and `isCanceled`; raw data is behind a private symbol). For an `UNFULFILLED` redemption both booleans are `false` and `value.status` is `undefined`, so the adapter returns `UNKNOWN`. The worker's `classifyRemoteState` maps `UNKNOWN` to `unknown` and records `remote_state_unavailable` (the path at line ~86, not the 404 path). It is deterministic, which matches "attempts=2, same failure". **VERIFIED in source** (`node_modules/@twurple/api/lib/endpoints/channelPoints/HelixCustomRewardRedemption.js`, getters at lines 17-113; `apps/api/src/twitch/helix-adapter.mjs:15-19`; `apps/api/src/outbox/financial-worker.mjs:27-32, 84-87`).

Why tests did not catch it: the unit fakes return plain objects (`{ isFulfilled: false, isCanceled: true }` in `tests/unit/twitch-adapter.test.js:202`) or strings (`'UNFULFILLED'` in `tests/unit/twitch-reconciliation.test.js:20`). No test exercises an `UNFULFILLED` instance of the real Twurple class. The EventSub path works because `EventSubChannelRedemptionAddEvent` **does** have a `status` getter (VERIFIED, `@twurple/eventsub-base`, line 85). That asymmetry explains why the event arrives and the entry is created, while the Helix check fails.

Why the 404 path is unlikely: Twurple throws `HttpStatusCodeError`, which exposes `statusCode` (VERIFIED, `@twurple/api-call/.../HttpStatusCodeError.js:21`), not `status`. The worker checks `error.status === 404`, so a real Helix 404 would not reach that branch: it would fall into the retry branch (`remote_lookup_failed`). The adapter's own `{status: 404}` is only thrown when Twurple returns `null` (200 with empty `data`), which Helix documents as a 404 instead. So `remote_state_unavailable` with these attempts points to the "unrecognized state" path. (PARTIAL: confirmed by reading code, not by a log line.)

Collateral effects of the same bug (VERIFIED in code, impact PARTIAL):
- `listUnfulfilledRedemptions` also maps each item with `redemptionStatus(item)`, so the reconciler passes `status: 'UNKNOWN'` to `processor.onRedemptionAdd`, which returns `unknown_remote_state` without importing (`redemption-processor.mjs:17`) and **without** adding a reconciliation issue. Missed redemptions are never imported by reconciliation, and nothing logs it.
- Reconciliation checks of unresolved/active entries silently ignore `UNKNOWN` (they only act on FULFILLED/CANCELED), so this part is harmless but blind.
- A second latent bug: every `error.status` check (worker and reconciler 404/401 branches) misses Twurple errors, which use `statusCode`. Real 401/403/404 responses are retried as transient errors, and real 404s never become `remote_history_unavailable`.

## Q1. Get Custom Reward Redemption / Update Redemption Status

Source: [Twitch API reference](https://dev.twitch.tv/docs/api/reference/) (sections "Get Custom Reward Redemption" and "Update Redemption Status"), read 2026-10-26. **VERIFIED.**

| Item | Get Custom Reward Redemption (`GET /helix/channel_points/custom_rewards/redemptions`) | Update Redemption Status (`PATCH` same path) |
|---|---|---|
| Required query | `broadcaster_id` (must match the token user), `reward_id`; `status` required **unless** `id` is given | `id` (up to 50), `broadcaster_id`, `reward_id` |
| Optional | `id` (up to 50), `sort` OLDEST/NEWEST, `after`, `first` 1-50 | body `status`: `CANCELED` or `FULFILLED` only (CANCELED refunds points) |
| Scope | `channel:read:redemptions` **or** `channel:manage:redemptions` | `channel:manage:redemptions` |
| Same Client ID | "The app used to create the reward is the only app that may get the redemptions" | Same rule for updates; only `UNFULFILLED` redemptions can be updated |
| 400 | missing `broadcaster_id`/`reward_id`; `status` missing when no `id`; invalid `status`/`sort` | missing parameter; invalid `status` |
| 401 | no/invalid user token, missing scope, Client-Id mismatch with token | same |
| 403 | Client-Id is not the one that created the reward; broadcaster not partner/affiliate | same |
| 404 | all redemptions in `id` not found | reward not found, or redemptions not found **or not UNFULFILLED** |
| Status values | `CANCELED`, `FULFILLED`, `UNFULFILLED` (case-sensitive); CANCELED/FULFILLED are returned only for a few days after the change | response may show any of the three |

- Query by `id` for an `UNFULFILLED` redemption right after EventSub: the doc does not limit this and does not mention a delay. **PARTIAL** (no official statement on consistency delay; no community report found in this pass).
- Twurple 8.2.0 (VERIFIED, `HelixChannelPointsApi.js:134-157`): `getRedemptionById` calls `getRedemptionsByIds`, which hits the correct endpoint with `broadcaster_id`, `reward_id` and `id` (so `status` is not needed) and returns `null` when `data` is empty. It does **not** catch the 404: `callApi` throws `HttpStatusCodeError` (`statusCode` 404). The endpoint is correct; the bug is the status mapping in our adapter plus the `status` vs `statusCode` mismatch.
- Note for `setRedemptionStatus`: an update on a redemption that is already FULFILLED/CANCELED returns **404**, not 409. The worker's "read, then update, then read again" design is right for that, once the reads work.

## Q2. EventSub ID vs Helix ID

- The `channel.channel_points_custom_reward_redemption.add` event payload has `id` (the redemption ID), `reward.id`, `status` and `redeemed_at`. Twurple maps `event.id` to `rawData.id` and `event.rewardId` to `rawData.reward.id` (VERIFIED in `@twurple/eventsub-base`, lines 17-19 and 91-93). That is the same `id` accepted by Helix `id` (VERIFIED by the [EventSub subscription types reference](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/) field list; the projection in our processor uses `event.id`).
- Gotchas: (a) do not confuse it with the WebSocket `metadata.message_id` (message dedup ID), which Twurple does not expose as `event.id` (VERIFIED by source); (b) `reward_id` must be the reward of the redemption, otherwise Helix returns 404 for that `id` (PARTIAL: inferred from the 404 text); (c) consistency delay: no official statement found (UNVERIFIED). Note that (b) would show as `remote_lookup_failed` (retry) in our worker, not as `remote_state_unavailable`.

## Q3. Delete Custom Reward with pending redemptions

- Official reference (VERIFIED, read 2026-10-26): scope `channel:manage:redemptions`; only the app that created the reward can delete it (403 otherwise); 404 if the reward is not found; **"If a redemption is still UNFULFILLED when the reward is deleted, its status changes to FULFILLED"**. So the API documents that deletion is allowed and pending redemptions are **fulfilled, not refunded**.
- The owner saw the **Twitch dashboard** refuse deletion while requests were pending. That is the creator dashboard UI, not the API; the two behaviors may differ (PARTIAL: dashboard behavior observed by the owner, API behavior per doc; not tested together).
- Order for queue deletion (recommendation): (1) disable/pause the reward (`is_enabled=false` or `is_paused=true`) so no new redemptions arrive; (2) list `UNFULFILLED` (`status=UNFULFILLED`, paginate) and explicitly **CANCEL** (refund) or **FULFILL** each according to the product rule, in batches of up to 50 IDs; (3) re-list to confirm zero `UNFULFILLED`; (4) delete the reward; (5) treat 404 on delete as "already gone". Relying on the implicit FULFILLED on delete would charge viewers without serving them, which contradicts a refund-on-delete expectation. The current blocker (`queue_deletion_financial_conflict`) disappears once the `fulfill` task leaves `unknown`.

## Q4. Why `twitch_integration: degraded`

How the code computes it (VERIFIED, `apps/api/src/twitch/integration.mjs`): `degraded` is published when (a) a reconciliation finishes with `status !== 'complete'` (any issue makes it `partial`), (b) reconciliation throws (`reconciliation_failed`), (c) the EventSub WebSocket disconnects, or (d) a subscription is revoked. `/health` reports this value directly. In case (a) the `issues` array is published only in the status object, not logged as a line, which matches "degraded without an explanatory log line". The bug above does not by itself push an issue, so the exact trigger is **UNVERIFIED**: the candidate codes are `reward_verification_failed`, `reward_configuration_mismatch`, `reconciliation_failed`, `redemption_import_failed`, `redemption_verification_failed`, or `active_entries_query_failed`. The real 401/403/404 misread as transient (the `status`/`statusCode` mismatch) can produce `redemption_verification_failed`.

EventSub side (VERIFIED, [Get EventSub Subscriptions](https://dev.twitch.tv/docs/api/reference/#get-eventsub-subscriptions) and [Handling WebSocket events](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)): WebSocket subscriptions are `enabled` once created (no `webhook_callback_verification_pending`, which is webhook-only); revocation statuses include `authorization_revoked`, `user_removed`, `version_removed`; WebSocket subscriptions are removed when the session ends (`websocket_disconnected`, `websocket_failed_ping_pong`, and so on); limits are `max_total_cost` and 300 subscriptions per WebSocket transport/3 connections per user. Stream going online does not change subscription status (PARTIAL: no doc ties them; the event arrived, so the subscription was working). Diagnosis: `GET /helix/eventsub/subscriptions?type=channel.channel_points_custom_reward_redemption.add` with the same user token and Client ID, checking `status`, `transport.session_id`, `total_cost`/`max_total_cost`.

## Q5. Idempotency and self-healing

- Treat `UNKNOWN` from a read as a **transient** classification with bounded backoff (the worker already has `retryDelay` with jitter and a 1-hour cap), not as a terminal `unknown`. Keep terminal `unknown` only after N attempts or after a real, explicit "not found" whose meaning is "history expired" (CANCELED/FULFILLED are only kept "a few days", per doc).
- Read before write (already done) is the right idempotency key: Update Redemption Status is safe only on `UNFULFILLED` and answers 404 otherwise; re-reading converts 404 into "confirmed" or "conflict".
- Map Twurple errors through one function: `status = error.statusCode ?? error.status`, and pass `Retry-After` for 429 (see note #17).
- Let periodic reconciliation (`reconciliation.mjs`, every 5 minutes) re-enqueue `unknown` financial tasks whose redemptions are still `UNFULFILLED`, and import redemptions from `listUnfulfilledRedemptions` (which needs the mapping fix).
- Log reconciliation issues as structured lines (codes and counts only, no user data) so `degraded` is explainable.
- Contract test: run the adapter against **real Twurple class instances** built from raw Helix JSON (`{status: 'UNFULFILLED', ...}`), not plain objects. Twurple exposes `getRawData(obj)` for the reverse direction; constructing the class is enough for this test (PARTIAL: constructor signature `(data, client)` seen in source).

## What only a live test confirms

1. **Root cause (confirms the TL;DR):** on the test channel, redeem a reward created by this app, start serving it, and capture in the worker: the raw Helix JSON `data[0].status` (or `getRawData(redemption).status`), the adapter return value, the `classifyRemoteState` result, and the HTTP status code (`error.statusCode`) when it throws. Expected: HTTP 200, raw `status: "UNFULFILLED"`, adapter `UNKNOWN`. A one-off read-only Node script with the same token can do the same: `getRedemptionById(broadcasterId, rewardId, redemptionId)` and print `getRawData(result)`.
2. **`degraded` trigger:** log `issues[].code` from each reconciliation result and the `reason` field of every `degraded` publish, and run Get EventSub Subscriptions once during the live.
3. **Delete with pending via API:** with one UNFULFILLED redemption, call Delete Custom Reward and then Get Custom Reward Redemption with `status=FULFILLED` to confirm the doc (status changes to FULFILLED, no refund).
4. **Consistency delay:** immediately after the EventSub add event, call Get Custom Reward Redemption by `id` and record whether it is 200 or 404.

## Sources (accessed 2026-10-26)

- Twitch API reference, Get/Update Redemption, Delete Custom Reward, Get EventSub Subscriptions: https://dev.twitch.tv/docs/api/reference/
- EventSub subscription types (redemption add/update payload): https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/
- EventSub WebSocket handling and revocation: https://dev.twitch.tv/docs/eventsub/handling-websocket-events/
- Installed source, `@twurple/api` 8.2.0: `node_modules/@twurple/api/lib/endpoints/channelPoints/HelixChannelPointsApi.js`, `HelixCustomRewardRedemption.js`; `@twurple/api-call` `HttpStatusCodeError.js`; `@twurple/eventsub-base` `EventSubChannelRedemptionAddEvent.js`.
- Project code: `apps/api/src/twitch/helix-adapter.mjs`, `apps/api/src/outbox/financial-worker.mjs`, `apps/api/src/twitch/reconciliation.mjs`, `apps/api/src/twitch/redemption-processor.mjs`, `apps/api/src/twitch/integration.mjs`, `apps/api/src/health-route.mjs`.

## Verdict

**SUFFICIENT** for the fix decision (root cause found in code with high confidence). The live checks above confirm it; they are not more research. **REFRESH IF** `@twurple/api` leaves 8.2.0 or Twitch changes the Custom Rewards API.
