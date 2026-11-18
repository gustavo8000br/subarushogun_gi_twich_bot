# EventSub `stream.online` / `stream.offline` for a "per live" refund cap (research note, OPS-31 Q-2)

[Português brasileiro](../../pt-BR/research/2026-11-15-eventsub-stream-online/README.md)

- Author: `@analyst` (Atlas). Date: 2026-11-15. Scope: research only; no code, no Twitch call, no test run. Nothing here proves live Twitch behavior.
- Labels: **VERIFIED** (official page read in this session, installed Twurple 8.2.0 source, or repository code), **PARTIAL** (community forum report), **UNVERIFIED** (inference).
- Reused, not repeated: `docs/research-index.md` rows #6 (EventSub chat, WebSocket) and #20/#27 (EventSub types, Twurple 8.2.0 source). Row #6 does not cover stream events, so this is a **GAP** that this note closes.
- Context: `docs/stories/OPS-31/architect-design-v2.md` section 3.11 (no `stream.online` handling found under `apps/`; window currently rolling hours) and owner decision Q-2 (2026-11-15: count the cap "per live").

## Verdict

**SUFFICIENT** for design. **REFRESH IF** Twitch changes `stream.online`/`stream.offline` (version 1), the WebSocket limits, or `@twurple/*` leaves 8.2.0. The behavior on a real stream (delays, restarts) is **UNVERIFIED** and should be closed by one live test.

## Answers

### 1. The two subscription types
- Both are **version 1**, condition `broadcaster_user_id` only, **no scope and no authorization required**. Transports: `webhook`, `websocket`, `conduit`. VERIFIED ([EventSub reference, Stream](https://dev.twitch.tv/docs/eventsub/reference/stream)).
- `stream.online` event: `id` (stream id), `broadcaster_user_id/login/name`, `type` (`live`, `playlist`, `watch_party`, `premiere`, `rerun`), `started_at`. VERIFIED (same page).
- `stream.offline` event: `id`, `broadcaster_user_id/login/name`. **No timestamp** (use the receive time). VERIFIED; the missing timestamp is also a [forum request](https://discuss.dev.twitch.com/t/stream-ended-event-should-have-timestamp-field/62490) (PARTIAL).
- Delivery: at least once, so duplicates are possible; webhook docs identify messages by `Twitch-Eventsub-Message-Id` ([handling webhook events](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/)). The docs state nothing about ordering. A forum report says a quick stop/start can deliver `offline` last ([thread](https://discuss.dev.twitch.com/t/stream-ended-event-should-have-timestamp-field/62490), PARTIAL).
- Delay: the docs give no figure. A Twitch reply in a [forum thread](https://discuss.dev.twitch.com/t/stream-offline-event-is-dealyed/49743) says delays should be minutes, that days are unexpected, and that Twitch keeps no log of delivered or missed events (PARTIAL).

### 2. Limits and what the project already uses
- WebSocket: user access token only; at most **3** connections with enabled subscriptions, **300** enabled subscriptions per connection, `max_total_cost` **10** per user token; subscribe within **10 s** of the welcome message ([WebSocket events](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [manage subscriptions](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/)). VERIFIED.
- Cost: subscriptions that need the user's authorization cost 0; types that need a specified user but no authorization (the page cites `stream.online`) cost 1 unless the user authorized the app. The page is ambiguous for scope-less types, so assume the worst case: +2 cost. VERIFIED text, effect on this app UNVERIFIED.
- The project **already uses EventSub over WebSocket**: `apps/api/src/twitch/eventsub-runtime.mjs:1` imports `EventSubWsListener` (`@twurple/eventsub-ws`); it subscribes `onChannelRedemptionAdd` (`:40`), `onChannelRedemptionUpdate` (`:54`) and `onChannelChatMessage` (`:67`) for one `broadcasterId`, plus `onUserSocketDisconnect/Ready` (`:77-96`) and `onRevoke` (`:100`). `apps/api/src/twitch/integration.mjs:210` builds the runtime and maps disconnects to the `degraded` status. Total with the two new types: 5 subscriptions on one connection, at most cost 5 of 10 even if the existing ones cost 1 each. VERIFIED (code); real cost values UNVERIFIED.

### 3. Current state at start and after a gap
- Losing a WebSocket connection disables its subscriptions and **events in the gap are not replayed**; `session_reconnect` (about 30 s notice) keeps subscriptions and drops nothing ([WebSocket events](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)). VERIFIED.
- Reconciliation: call [Get Streams](https://dev.twitch.tv/docs/api/reference/streams) with `user_id` (user or app token, no scope; returns `id`, `type`, `started_at` only for streams currently live; the page does not describe the empty result or caching). Twurple: `apiClient.streams.getStreamByUserId(id)` returns `HelixStream | null` (`@twurple/api` 8.2.0 `HelixStreamApi.d.ts:69`). Twurple's own doc warns Helix "might be behind due to caching", so a `null` just after `stream.online` can be stale (`EventSubStreamOnlineEvent.d.ts`, VERIFIED).
- Procedure (recommendation): on service start and on every `onReconnected` (already wired in `eventsub-runtime.mjs:96-99`), compare Get Streams with the stored open session: live and no open session means open one with the Helix `id`/`started_at`; not live and an open session means close it at the check time (marked as "inferred"); live with a different `id` means close the old one and open the new. Treat a single `null` right after a start as unreliable (re-check once after a short delay).

### 4. Twurple 8.2.0
- `EventSubBase.d.ts:246,253`: `listener.onStreamOnline(user, handler)` and `listener.onStreamOffline(user, handler)`, same listener and transport as today. Event getters: `id`, `type`, `startDate`, `broadcasterId` (online); offline has the broadcaster fields. VERIFIED (installed source).
- Reconnect (`EventSubWsSocket.js`): `session_reconnect` opens a new connection with overlap and does not re-subscribe; on a real disconnect Twurple marks subscriptions dropped and **re-subscribes automatically on the next `session_welcome`** (`:34-66`). Missed events are still lost, hence the reconciliation above. The handler does not expose the message id, so dedupe by stream `id` (idempotent), not by message id. VERIFIED (source), runtime behavior UNVERIFIED.

### 5. Risks
- **Restarts:** a forum report says that if the stream is down long enough for `stream.offline` to fire, the restart gets a **new stream id**, even though the streamer's dashboard shows one broadcast ([thread](https://discuss.dev.twitch.com/t/stream-online-and-stream-offline-events-are-creating-new-stream-id-when-the-stream-is-temporary-down/37049), PARTIAL). I found no official reconnect tolerance (no documented "N-minute grace"), so the merge threshold is a **product decision**, not a Twitch constant.
- **Time:** `started_at` is UTC RFC3339; use Twitch times and server UTC, never local time. Offline has no timestamp, so ordering `online`/`offline` by arrival can be wrong on quick restarts; order by `started_at` and the stream `id`.
- **Types:** `type` may be `rerun`, `premiere`, `playlist`, `watch_party`; only `live` should open a session (recommendation).
- **Duplicates and out-of-order:** at-least-once delivery plus forum reports of two `online` events; make the open/close idempotent per stream `id`.
- **Multiple channels:** the condition is per `broadcaster_user_id`; the app uses one `broadcasterId` per runtime (code `:40-67`). Multi-channel was not read or verified; each channel would add 2 subscriptions and cost, and the 10-cost cap is per user token (so channels with their own tokens do not share it).
- **Revocation:** `authorization_revoked`/`user_removed` stop events silently for that type; the existing `onRevoke` hook should degrade the cap to the rolling-hours fallback.

### 6. Recommendation for the design
- Define a "live" as a **session** keyed by the Twitch stream `id`, plus a merge rule: a new `stream.online` whose previous session ended less than N minutes ago (suggested default 10, owner-configurable, **UNVERIFIED value**) continues the same session (keeps its `streamSessionId`). Without the merge rule, a short connection drop would silently reset every viewer's cap.
- Store per channel only: `stream_session_id` (internal id), `twitch_stream_id`, `started_at`, `ended_at` nullable, `source` (`event` or `reconciled`). No viewer data, no titles. The cap counter in 3.11 then counts `redemptions.refunded_at` (or a session id column) within the open session instead of a rolling window.
- Keep the rolling-hours window as the **fallback** when no session is known (no `stream.online` seen, revoked, offline, or Helix unavailable); this avoids an unlimited cap during gaps. If the stream is offline, a refund outside a live belongs to the last session (design choice for `@architect`).
- Guard against wrong closes: do not close on a single `null` from Get Streams; close on `stream.offline` or on two consecutive negative checks.

## Limitations
- Official pages read in this session: EventSub reference (Stream), handling WebSocket events, handling webhook events, manage subscriptions, Get Streams. The old subscription-types URL now redirects to the reference. Webhook-page rules were applied to WebSocket only where noted. Delivery order, real delay, the reconnect tolerance of the Twitch backend, and the exact subscription cost for this app are **not verified**; nothing was tested on a real Twitch stream. Forum items are PARTIAL and may be outdated.
