# Integration decisions

[Português brasileiro](pt-BR/integrations.md)

**Documentation checked:** 2026-10-05 (UTC). SDK API shapes were also checked against the versions installed in this repository. OAuth, token validation/refresh, Affiliate/Partner and Channel Points API eligibility probing, managed reward creation/recovery, Helix redemption/chat adapters, EventSub WebSocket normalization and reconciliation scaffolding are implemented and covered by fakes. No authorized credentials are available for a live Twitch test. Reward editing/open-close/archive/delete and their recovery workflows remain pending. Queue creation durably requests a paused Twitch reward; ambiguous creation can be resolved through an audited, revalidated panel action.

## Runtime versions

| Component | Version | Decision |
| --- | --- | --- |
| Node.js | 24.20.0 | Pinned runtime and development version. |
| `@twurple/auth`, `@twurple/api`, `@twurple/eventsub-ws` | 8.2.0 | Same release line; use `RefreshingAuthProvider`, Helix API clients, and EventSub WebSocket. |
| Prisma CLI, `@prisma/client`, `@prisma/adapter-pg` | 6.19.3 | Keep CLI and client aligned; `prisma-client-js` generates JavaScript-compatible client output. Prisma 7's `prisma-client` generator outputs TypeScript and does not satisfy this JavaScript-only application. |
| PostgreSQL | 18.6 | Local Compose service; integration tests use an isolated PostgreSQL database and actual migrations. |
| Docker Compose | v2 | `depends_on` health/completion conditions establish startup order; named volumes preserve local database and secret state. |

## Twitch operation map

| Operation | Endpoint or EventSub event | Required scope/auth | SDK adaptation |
| --- | --- | --- | --- |
| Validate Client ID/Secret | `POST https://id.twitch.tv/oauth2/token` with `grant_type=client_credentials` | Client ID + Secret; app token | Implemented with a sanitized backend `fetch`; temporary app token is discarded. Do not use a user-token Helix call to validate the secret. |
| Connect the broadcaster | Authorization Code flow; callback `https://localhost:${APP_PORT:-3000}/callback`; token validation via `GET https://id.twitch.tv/oauth2/validate` | `channel:manage:redemptions`, `user:read:chat`, `user:write:chat` | `createOAuthStateStore` plus `RefreshingAuthProvider`; startup/hourly token validation and refresh persistence. OAuth `state` is one-time, short-lived, and bound to the initiating local session. |
| Read broadcaster eligibility | `GET /helix/users` | User token for the connected broadcaster | Implemented through `ApiClient.users.getUserById`; inspect `broadcasterType` before enabling channel points. |
| Verify Channel Points availability and reward capacity | `GET /helix/channel_points/custom_rewards` | User token with `channel:manage:redemptions`; broadcaster ID must match the token | Probe through `ApiClient.channelPoints.getCustomRewards(broadcasterId, false)` only after Affiliate/Partner eligibility. Count all rewards, including those created by other apps and disabled rewards; warn at 45 and prevent create when the observed count is 50. An API failure keeps the integration unavailable without exposing SDK details. |
| Create and inspect managed rewards | `POST` / `GET /helix/channel_points/custom_rewards` | `channel:manage:redemptions`; broadcaster must match authorized user | `ApiClient.channelPoints.createCustomReward` and related methods, not `ApiClient.channels`. A durable worker creates paused rewards with `autoFulfill=false`; the adapter normalizes and verifies `should_redemptions_skip_request_queue=false`. A lost response is reconciled against the pre-create managed-reward baseline; ambiguous ownership requires an audited panel resolution. Twitch currently limits a channel to 50 rewards (including disabled rewards); title max 45 and prompt max 200 characters. Editing/open-close/archive/delete remain pending. |
| Observe reward redemptions | `channel.channel_points_custom_reward_redemption.add` and `.update` | `channel:manage:redemptions` for the connected broadcaster | `EventSubWsListener.onChannelRedemptionAdd` / `onChannelRedemptionUpdate`; normalize SDK values to internal states and deduplicate by redemption ID. WebSocket reconnect does not replay an abrupt gap; reconcile with Helix. |
| Reconcile pending rewards | `GET /helix/channel_points/custom_rewards/redemptions` (paginate `UNFULFILLED`) | `channel:manage:redemptions`; reward must belong to this app | `ApiClient.channelPoints.getRedemptionsForBroadcasterPaginated`; consume all pages and treat partial failures as incomplete reconciliation. |
| Cancel or fulfill a redemption | `PATCH /helix/channel_points/custom_rewards/redemptions` | `channel:manage:redemptions`; only the creating application may manage it | `ApiClient.channelPoints.updateRedemptionStatusByIds`; map `CANCELED` to refund and `FULFILLED` to point consumption only after a confirmed result. Query remote state after uncertain responses. |
| Receive chat commands | `channel.chat.message` | `user:read:chat` for the streamer's authorized user | `EventSubWsListener.onChannelChatMessage`; use trusted event identity and badges, ignore commands from other channels in Shared Chat. |
| Send chat response | `POST /helix/chat/messages` | `user:write:chat` | `ApiClient.chat.sendChatMessage`; inspect the response's `is_sent` and drop reason. HTTP success alone is not delivery confirmation. Twitch caps a message at 500 characters. |

The reward requests must use `should_redemptions_skip_request_queue=false`, and incoming API/EventSub/SDK fields must be normalized at the adapter boundary. Twitch is authoritative for point status. Only the application that created a reward can manage its redemptions. Deleting a reward while redemptions are pending may fulfill them, so deletion must wait until cancellation is remotely confirmed.

This product uses EventSub WebSocket and Helix Send Chat Message with the streamer's account. It does not use IRC or a second bot account. Shared Chat may propagate user-token messages; the product must not promise otherwise.

## Local infrastructure contracts

| Concern | Contract |
| --- | --- |
| Database connection | PostgreSQL is reached by Compose service name `db`, never container `localhost`; runtime connection string is assembled from the mounted secret and is never logged. |
| Migration startup | `migrate` waits for healthy `db`; `bot` waits for successful migration completion. |
| Health | `/health` probes the local database; missing Twitch credentials report `not_configured`, not connected and not an endless restart condition. |
| Panel and OAuth transport | HTTPS on `https://localhost:${APP_PORT:-3000}`. Bootstrap persists a local CA and localhost leaf certificate in the secret volume, exports only the CA certificate under `.local/`, and mounts the server key read-only into `bot`. The operator imports the CA into the current-user trust store; no public host or proxy is required. |
| Shutdown and data | SIGTERM/SIGINT closes HTTP/database work; Compose named volumes preserve the database and generated secret. Normal stop instructions never delete volumes. |
| ORM / transactions | Prisma 6.19.3 uses `PrismaPg({ connectionString })` with `PrismaClient({ adapter })`. Interactive transactions are short; a PostgreSQL transaction-level advisory lock serializes queue mutations, and database unique indexes remain the final concurrency guard. No network I/O occurs inside a transaction. |
| ORM migrations and tests | Prisma migrations are versioned and run by `prisma migrate deploy`; test contracts use real PostgreSQL and those migrations, not SQLite or a mocked Prisma client. |

The Twitch OAuth docs currently show `http://localhost:3000` in their examples ([OAuth guide](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/), [Get Started](https://dev.twitch.tv/docs/api/get-started/)). During this installation, the developer console rejected the configured `http://localhost:3000/callback` and required HTTPS. The product therefore uses `https://localhost:3000/callback` by default and documents the local CA trust step. The OAuth `redirect_uri` is kept byte-for-byte aligned across the Twitch app registration, authorization request, token exchange, and panel callback display.

## Official references

- [Twitch: Register an application](https://dev.twitch.tv/docs/authentication/register-app/) — confidential app registration, verified email, 2FA, and callback URL.
- [Twitch: Getting tokens with OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/) — Client Credentials and Authorization Code grants.
- [Twitch: Validating requests](https://dev.twitch.tv/docs/authentication/validate-tokens/) — token validation, startup/hourly validation, and revoked token behavior.
- [Twitch Helix API reference](https://dev.twitch.tv/docs/api/reference/) — users, channel point rewards/redemptions, and Send Chat Message operations. The current reference sets a maximum of 50 custom rewards per channel, including disabled rewards; creation requires `channel:manage:redemptions`.
- [Twitch: EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/) — scopes and payload contracts for redemption and chat events.
- [Twitch: Handling WebSocket events](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/) — welcome, subscribe, reconnect, and recovery behavior.
- [Twitch: Send and receive chat messages](https://dev.twitch.tv/docs/chat/send-receive-messages/) — supported chat transport and message limits.
- [Twurple `RefreshingAuthProvider`](https://twurple.js.org/reference/auth/classes/RefreshingAuthProvider.html) — refresh token callbacks and failure handling.
- [Twurple `EventSubWsListener`](https://twurple.js.org/reference/eventsub-ws/classes/EventSubWsListener.html) — WebSocket listener methods.
- [Prisma ORM 6 documentation](https://www.prisma.io/docs/orm/v6) — selected generator/runtime compatibility.
- [Prisma ORM 6 PostgreSQL connector](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql) — `@prisma/adapter-pg@6.19.3`, `PrismaPg` connection-string configuration, and adapter-backed `PrismaClient`.
- [Prisma ORM 6 transactions](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions) — interactive transaction API and guidance to avoid slow work/network calls in transactions.
- [PostgreSQL 18 partial indexes](https://www.postgresql.org/docs/18/indexes-partial.html) — active-entry uniqueness contract.
- [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/) and [Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/) — dependency health and mounted secret handling.

## Verification boundary

The installed Twurple declarations were checked for `getCustomRewards`, `createCustomReward`, `getRedemptionsForBroadcasterPaginated`, `updateRedemptionStatusByIds`, `sendChatMessage`, the three EventSub listener methods, and refresh callbacks. The eligibility probe uses `getCustomRewards(broadcasterId, false)` so it counts every channel reward, not only rewards manageable by this application. No authorized streamer credentials were available for a live Twitch test. SDK fakes can verify adapter behavior; they cannot prove a real Twitch refund or reward operation.
