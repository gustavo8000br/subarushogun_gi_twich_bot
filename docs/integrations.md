# Integration decisions

[Português brasileiro](pt-BR/integrations.md)

**Documentation checked:** 2026-10-03 (UTC). SDK API shapes were also checked against the versions installed in this repository. OAuth, token validation/refresh, eligibility, Helix redemption/chat adapters, EventSub WebSocket normalization and reconciliation scaffolding are implemented and covered by fakes. No authorized credentials are available for a live Twitch test. Reward lifecycle is not implemented yet: reward creation/edit/archive/delete and recovery are pending, and a locally created queue does not have a managed Twitch reward.

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
| Connect the broadcaster | Authorization Code flow; callback `/callback`; token validation via `GET https://id.twitch.tv/oauth2/validate` | `channel:manage:redemptions`, `user:read:chat`, `user:write:chat` | `createOAuthStateStore` plus `RefreshingAuthProvider`; startup/hourly token validation and refresh persistence. OAuth `state` is one-time, short-lived, and bound to the initiating local session. |
| Read broadcaster eligibility | `GET /helix/users` | User token for the connected broadcaster | Implemented through `ApiClient.users.getUserById`; inspect `broadcasterType` before enabling channel points. |
| Create and inspect managed rewards | `POST` / `GET /helix/channel_points/custom_rewards` | `channel:manage:redemptions`; broadcaster must match authorized user | Reward lifecycle implementation pending. Twurple uses `ApiClient.channelPoints.createCustomReward` and related methods, not `ApiClient.channels`; `autoFulfill=false`, and the adapter normalizes/verification requires `should_redemptions_skip_request_queue=false`. Twitch currently limits a channel to 50 rewards (including disabled rewards); title max 45 and prompt max 200 characters. |
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
| Shutdown and data | SIGTERM/SIGINT closes HTTP/database work; Compose named volumes preserve the database and generated secret. Normal stop instructions never delete volumes. |
| ORM / transactions | Prisma 6.19.3 uses `PrismaPg({ connectionString })` with `PrismaClient({ adapter })`. Interactive transactions are short; a PostgreSQL transaction-level advisory lock serializes queue mutations, and database unique indexes remain the final concurrency guard. No network I/O occurs inside a transaction. |
| ORM migrations and tests | Prisma migrations are versioned and run by `prisma migrate deploy`; test contracts use real PostgreSQL and those migrations, not SQLite or a mocked Prisma client. |

## Official references

- [Twitch: Register an application](https://dev.twitch.tv/docs/authentication/register-app/) — confidential app registration, verified email, 2FA, and callback URL.
- [Twitch: Getting tokens with OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/) — Client Credentials and Authorization Code grants.
- [Twitch: Validating requests](https://dev.twitch.tv/docs/authentication/validate-tokens/) — token validation, startup/hourly validation, and revoked token behavior.
- [Twitch Helix API reference](https://dev.twitch.tv/docs/api/reference/) — users, channel point rewards/redemptions, and Send Chat Message operations.
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

The installed Twurple declarations were checked for `createCustomReward`, `getRedemptionsForBroadcasterPaginated`, `updateRedemptionStatusByIds`, `sendChatMessage`, the three EventSub listener methods, and refresh callbacks. No authorized streamer credentials were available for a live Twitch test. SDK fakes can verify adapter behavior; they cannot prove a real Twitch refund or reward operation.
