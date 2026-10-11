# Spec: Manual and reward-backed queue modes with Twitch capability fallback

> **Story ID:** FND-9<br>
> **Updated:** 2026-10-07 UTC<br>
> **Complexity:** COMPLEX (23/25)<br>
> **Pipeline:** Gather → Assess → Research → Write → Critique → Revise → Critique → Plan<br>
> **Status:** Spec Pipeline complete; implementation authorized and in progress on 2026-10-07.

[Português brasileiro](../../../pt-BR/stories/FND-9/spec/spec.md)

## 1. Overview

Viewers normally earn Twitch Channel Points by watching a live stream and redeem a custom reward selected by the streamer, such as “drink water.” FND-9 concerns queue admission when the bot cannot use the required Twitch reward APIs. Affiliate/Partner status alone must not be treated as a definitive eligibility signal: Twitch's May 2026 Monetization for All update says Channel Points are available to monetized streamers after creator onboarding, while the current Helix reference still documents Affiliate/Partner restrictions for reward API operations. In manual mode, the chatbot should still accept an authorized manual add command from the streamer or a moderator.

A queue may be reward-backed (`channel_points`) or local/manual (`manual_only`). For a reward-backed queue, a bot-created dedicated Twitch Custom Reward is the default; a Creator Dashboard reward is allowed only after this Client ID proves the complete required lifecycle. Existing rewards already in the streamer's Twitch list (including “drink water”) are not assumed manageable by this app merely because they appear in the Creator Dashboard. A queue may be created locally without a reward, and a reward-backed queue may be converted to local/manual mode. Streamer/moderator can add a viewer for free after receiving a request in chat, regardless of queue source; the bot does not infer enrollment from free-form chat messages. A manual command is never represented as a points redemption and never creates a refund/consumption operation.

### Goals

- Keep Twitch chat command operation available when Channel Points rewards are unavailable.
- Reuse existing trusted command authorization, queue domain transition, duplicate, UID and persistence rules.
- Clearly distinguish chat connectivity from Channel Points eligibility in the operator panel and health/connectivity projection.
- Use a bot-created Twitch Custom Reward by default; permit a Creator Dashboard reward only after the bot proves the complete required API lifecycle.
- Permit streamer/moderator free manual adds to any active queue, without requiring the viewer to type a command or redeem points.
- Support a safe one-way conversion from reward-backed to local/manual mode after Twitch confirms the pause; preserve the reward ID as historical metadata and drain existing redemptions through the current finance workflow.

### Non-goals

- Viewer self-enrollment, payment processing, Bits/subscription verification, external provider webhooks, automatic queue priority, or a second bot account.
- Changing the Twitch-earned points balance or how viewers earn points by watching streams.
- Altering unrelated custom rewards such as a drink-water reward.

## 2. Requirements summary

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Keep authorized broadcaster chat/EventSub operation when Channel Points rewards are unavailable. | P0 |
| FR-2 | Streamer and moderators manually add a resolved Twitch user to a selected queue using the existing authorized command. | P0 |
| FR-3 | Manual entries have source `manual`, no `redemption_id`, no financial outbox task, and safe audit history. | P0 |
| FR-4 | Explain manual-only/reward API status in the product language while reporting chat status separately from reward capability. | P1 |
| FR-5 | Support local manual-only queues without a Twitch reward; use bot-created rewards by default and permit an existing reward only after full API lifecycle capability is proven. | P1 |
| FR-6 | Keep the existing localized global `ping` command available to streamer/moderator while Channel Points are unavailable. | P0 |
| FR-7 | Allow streamer/moderator to add a viewer manually to any non-archived, non-deleting queue, even when that queue is reward-backed. | P0 |
| FR-8 | Allow conversion from reward-backed to local/manual mode only after remote pause is confirmed; retain and resolve existing redemptions. | P0 |
| FR-9 | Keep viewers' free-form chat requests informational; only an explicit authorized `add` action creates an entry. | P1 |

## 3. Proposed architecture

1. Separate the Twitch connection lifecycle into chat capability and Channel Points capability. A failed/ineligible Channel Points eligibility check must disable only points-specific subscriptions, workers, reward mutations, and reconciliation. It must not stop an otherwise valid broadcaster chat authorization and `channel.chat.message` subscription.
2. Continue using the broadcaster's installed-chatbot user token and the existing EventSub WebSocket transport. Keep current chat scopes (`user:read:chat`, `user:write:chat`) for read and reply behavior. Make `channel:manage:redemptions` conditional on the points-reward capability only if official behavior and installed OAuth tests confirm this is safe. Add no new scopes.
3. Reuse the current `!<queue> add <user> [UID]` command. Streamer/mod authorization comes from the current trusted broadcaster identity and message badges, never body fields or typed role claims. Chat `add` always creates a standard-lane manual entry.
4. Continue to use the existing queue repository/service and PostgreSQL integrity constraints. Do not create a new queue or financial subsystem for this mode.
5. Persist explicit queue mode and transition state. A newly created manual-only queue has no `reward_id`; a queue converted from Channel Points retains the immutable former reward ID/origin as historical association. A confirmed manual-only queue has no active redemption intake or new reward management. Its entries are manual and create no financial operation. Keep queue lifecycle/history intact.
6. For `channel_points` mode, record reward origin (`bot_created` or `dashboard_existing`) and immutable reward ID. Bot-created is the default. Dashboard selection is enabled only when the app proves the complete required lifecycle for that selected ID: open/pause, enumerate pending redemptions, query individual state after ambiguity, reconcile missed events, cancel/fulfill, and safely delete after pending redemptions are resolved.
7. If reward capability is definitively unavailable, let the streamer create a local/manual queue without a reward. Do not silently downgrade an existing reward-backed queue after a temporary network, server, OAuth, or scope error; keep chat running and expose a recoverable capability state.
8. A streamer may request conversion of a reward-backed queue to manual-only mode. Persist a transition intent, block new calls/reward admission for that queue, request remote pause, and expose `conversion_pending` until pause is confirmed. If the result is unknown or fails, retain reward-backed mode and provide retry/reconciliation. Once pause is confirmed, make local mode effective, retain reward ID/origin for history, cancel any redemption racing with the transition through a durable intent, and continue normal financial processing for previously admitted redemptions. Never delete the reward as part of conversion.
9. Manual add remains available to authorized streamer/moderators in reward-backed, local/manual, and `conversion_pending` queues (including closed queues under existing rules), subject to active-user uniqueness and archive/deletion guards. The operator may hear a viewer's request in chat and explicitly add them; free-form viewer text alone never creates an entry.
10. Determine reward capability from actual API outcomes, not `broadcasterType` alone. Monetization for All says Channel Points are available to monetized streamers after onboarding, while Helix still documents Affiliate/Partner restrictions. Distinguish `available`, `unsupported`, and `unknown`/transient.
11. Show chat connectivity separately from reward capability in `/health` and the panel. Manual-only queues do not show “reward open/closed”; hide or disable remote open/close controls and explain that streamer/mod additions are manual. Archive/delete still block further adds.
12. Keep localized streamer/mod global `ping` working whenever chat is authorized, regardless of reward capability. Return cached API latency; do not probe Helix on each chat message.
13. Keep base chat scopes independent from reward scopes. Validate the supported OAuth scope set with the real Twitch flow before deciding whether `channel:manage:redemptions` is optional for manual-only mode; if reward use later needs additional consent, request it through the existing session-bound OAuth path without losing chat operation.

These decisions reflect the product choices recorded in section 8. OAuth scope behavior, selected dashboard reward ownership, and Twurple's actual subscription sequence remain evidence gates before the corresponding behavior can be enabled.

### Operator validation input (2026-10-07)

The operator reports that the connected but ineligible channel does not answer `!fila ping`. This matches the current integration's early exit before EventSub starts. FND-9 must keep the existing localized streamer/moderator-only global ping behavior alive with chat even when points rewards are unavailable; retain its Pong, product version, and cached-latency response, without adding a per-message Helix probe. No successful live chat response is claimed yet.

### Official API clarification (2026-10-06)

Twitch documents `channel.chat.message` with `user:read:chat`; redemption EventSub and Custom Reward mutation use redemption scopes. Helix explicitly limits Custom Reward management to eligible channels, while the chat subscription contract does not state an Affiliate/Partner requirement. This supports keeping chat and Channel Points as independent runtime capabilities, but it is not proof that this app's ineligible OAuth path works. Before implementation, test OAuth/token validation with only chat scopes and verify Twurple WebSocket subscription behavior; do not silently weaken the eligible-channel flow. See the [capability gap audit](../../TWITCH-CAPABILITY-GAP-ANALYSIS.md) and [integration reference](../../../integrations.md).

### Monetization/API capability discrepancy (2026-10-07)

Twitch's current creator Help Center says Channel Points are enabled for all monetized streamers after creator onboarding; the May 2026 Monetization for All announcement broadened access beyond the old Affiliate/Partner-only product assumption. The Helix reference still documents `403 broadcaster is not a partner or affiliate` for Custom Reward API operations. These statements conflict for this product's capability decision and must not be resolved by assuming either dashboard or API behavior. The broadcaster reports successfully creating a reward in the Creator Dashboard while not being Affiliate; that is operator-provided evidence of dashboard access, not proof that this app's Client ID can create/manage that reward through Helix.

The Helix API reference distinguishes visibility from ownership: `GET /helix/channel_points/custom_rewards` can list rewards with `only_manageable_rewards=false`, while `only_manageable_rewards=true` filters to rewards manageable by this Client ID. The reference states that only the app that created a reward may retrieve its redemption records, update its reward, update a redemption, or delete it. Redemption EventSub delivery requires `channel:read:redemptions` or `channel:manage:redemptions` but does not establish that the app can recover missed redemptions or change their status. Thus selecting a dashboard-created reward as a queue source is not supported by documentation as a complete financial lifecycle.

Planning consequence: use bot-created rewards as the default and treat dashboard-created rewards as unsupported unless a Twitch-authorized acceptance test proves the full API lifecycle and the product owner explicitly approves that support. Replace the Affiliate/Partner-only eligibility heuristic with an explicit capability outcome from the supported API path. Distinguish confirmed unavailability from transient network/auth failures; a transient error must not silently switch an existing reward-backed queue to manual mode. Keep chat connection independent. Sources: [Monetization for All](https://blog.twitch.tv/en/2026/05/13/monetization-for-all/), [Channel Points FAQ](https://help.twitch.tv/s/article/channel-points-faq), [Creator Channel Points Guide](https://help.twitch.tv/s/article/channel-points-guide?language=en_US), [Helix API Reference](https://dev.twitch.tv/docs/api/reference/), and [EventSub Subscription Types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/).

## 4. Security and privacy

- Only the streamer or moderator badges on the current event can add another person. VIP support is not included unless separately approved.
- A viewer cannot self-add or name a role/actor in the command body.
- Resolve Twitch login to `twitch_user_id`; preserve one-active-entry-per-user-per-queue.
- Keep hidden UID behavior and nine ASCII digits for visible mode; do not echo invalid input.
- Do not persist raw chat, rejected arguments, payment receipts, or fabricated redemption IDs.
- Manual entry transitions must not produce `redemption.cancel` or `redemption.fulfill` intents.

## 5. Acceptance scenarios

1. An authorized non-Affiliate/Partner broadcaster connects chat and can execute manager commands; the panel says Channel Points rewards are unavailable but chat is connected.
2. A streamer/mod executes `!abismo add viewer`; one manual waiting entry is persisted with a Twitch user ID, continuous standard FIFO position, audit actor/origin, null redemption ID, and no financial outbox row.
3. A normal viewer executes the same mutation or supplies forged badges/role text; the system performs no lookup, insert, points action, or success announcement.
4. A duplicate active user, archived/deleting queue, nonexistent Twitch login, hidden UID, and invalid visible UID each follow the current rules and produce no unintended side effect.
5. A manual entry is removed/completed according to existing domain behavior without making a Twitch points API call.
6. A channel with a pre-existing “drink water” reward connects. The bot leaves it unchanged. Dashboard visibility or EventSub delivery alone does not cause the bot to adopt it; adoption remains disabled unless the full API lifecycle is proven and explicitly approved.
7. A channel with Creator Dashboard Channel Points but incomplete bot API capability receives a truthful capability result; chat is independent and temporary errors do not silently convert operations to manual mode.
8. A channel with a proven complete reward API path retains redemption admission, outbox, reconciliation, and reward behavior.
9. Twitch chat loss/revocation is shown separately from reward API capability; restarting the bot preserves the manual queue entry.
10. A streamer/moderator sends the localized global ping command when reward APIs are unavailable and receives the existing Pong, product version, and cached Twitch latency response; a viewer receives no ping response, and no reward API or per-message Helix probe is triggered.
11. Streamer/mod explicitly adds a viewer to an active reward-backed queue for free; the entry has source `manual`, no redemption ID, and no financial outbox intent.
12. Conversion remains pending until Twitch confirms pause; then manual-only mode activates while prior reward ID/origin remain historical and the reward is not deleted.
13. Pause timeout, 5xx, OAuth failure, or unknown result does not activate manual mode; retry/reconciliation resolves actual Twitch state without duplicate effects.
14. A redemption arriving during conversion gets a durable cancellation request; already-admitted redemptions and their financial intents continue normal confirmation/recovery.
15. Free-form viewer chat that asks to join causes no lookup or insertion; only explicit authorized `add` creates an entry.
16. Closing, archiving, and converting a managed reward queue confirms `is_paused=true`; reopening confirms `is_paused=false`. Helix GET returns `is_in_stock`, but the current Update Custom Reward request does not accept it. Do not send or require that field, persist a stock snapshot, or claim the app can mark a reward out of stock. Reconcile the documented writable pause/configuration fields.

## 6. TDD plan

- Unit Red/Green: integration starts EventSub chat on ineligible channels but never starts redemption subscriptions/reconciliation; authorized streamer/mod `ping` remains available and returns the cached status/version response; viewers receive no ping response; no per-message probe is added. Authorization remains streamer/mod only; health/panel projection separates statuses.
- PostgreSQL integration: real migrations verify manual admission source, historical reward relation, uniqueness, audit, transition state, locking/serialization and absence of financial intent for manual entries; no Prisma mock may prove these contracts.
- Conversion TDD: prove Red for pause-confirmation state, failure/unknown recovery, event race cancellation, preservation of existing finance tasks, idempotent retry, and no reward DELETE. Use a real isolated PostgreSQL instance plus a Twitch adapter fake only at the external boundary.
- Chat/manual TDD: prove authorized free add in both queue modes and no auto-enrollment from free-form viewer messages.
- Worker/adaptor fakes: assert no reward create/update/delete/reconciliation call for an ineligible channel, and no financial Twitch call for manual entries.
- Security regression tests: forged actor/badge/body, Shared Chat origin, duplicate command ID, invalid login/UID and malicious display strings produce no unintended side effects or disclosure.
- Existing eligible-channel OAuth, reward, EventSub, redemption reconciliation, chat, queue, and outbox suites remain green.
- Operator acceptance: one authorized non-Affiliate/Partner Twitch account verifies real EventSub chat and a manual `add`; no live reward or points action is required. If such account credentials are unavailable, record the blocker and do not claim live validation.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Treating points ineligibility as total Twitch disconnection continues to block chat | Split capability state and test the integration branch with a fake plus a controlled live acceptance later. |
| Requesting a scope that the channel cannot use blocks OAuth before manual mode | Keep chat scopes independently valid; verify whether `channel:manage:redemptions` can be omitted in manual-only flow before changing scopes. |
| Accidental management of a generic existing reward creates duplicate queue/payout expectations | Create a dedicated Custom Reward through the bot and use its immutable ID as the sole queue source; test that unrelated rewards are never adopted or mutated. |
| Operator mistakes a manual entry for a points redemption | Label source and pending actions explicitly; no points API call exists for manual entries. |
| Queue is switched locally while Twitch pause is unknown or a redemption races with the request | Persist transition state; activate only after pause confirmation; use idempotent durable cancellation and preserve/drain existing finance work. |

## 8. Product decisions

- [x] **Q-1:** Manual chat add is available to streamer and moderators. Confirmed by the product owner on 2026-10-06.
- [x] **Q-2:** Eligible channels default to Channel Points admission; manual mode remains available by operator choice. Ineligible channels use local/manual admission when reward capability is unavailable. Confirmed by the product owner on 2026-10-06, expanded 2026-10-07.
- [x] **Q-3:** Manual additions remain allowed in a closed queue, as specified by the original product rules.
- [x] **Q-4:** A queue may exist locally in manual-only mode without a Twitch reward and receives authorized streamer/mod `add` commands. Confirmed by the product owner on 2026-10-07.
- [x] **Q-5:** Support bot-created rewards, and allow selecting a Creator Dashboard reward only when this bot proves access to the complete required API lifecycle. Dashboard visibility or EventSub delivery alone is insufficient. Confirmed by the product owner on 2026-10-07.
- [x] **Q-6:** Determine capability from actual supported API operations rather than `broadcasterType`; keep transient failures distinct from definitive unsupported results. Confirmed as the required consequence of Q-5 on 2026-10-07.
- [x] **Q-7:** Streamer/moderator may add a viewer for free to any active queue after receiving a request; the viewer need not type a command or redeem a reward, but free-form chat is never auto-enrollment. Confirmed by the product owner on 2026-10-07.
- [x] **Q-8:** A reward-backed queue may be switched to local/manual mode. Preserve/drain current redemptions; activate local mode only after confirmed remote pause; cancel a redemption racing with the transition; retain historical reward identity. Confirmed by the product owner on 2026-10-07.
- [x] **Q-9:** The owner asked to mark a managed reward out of stock when pausing/archiving, if Twitch permits it. The current Helix Update Custom Reward contract does not accept `is_in_stock`; a live PATCH probe returned HTTP 200 while both response and subsequent GET retained `is_in_stock=true`. Use the confirmed `is_paused` state, preserve Twitch-owned stock, and never claim an out-of-stock transition.

## 9. Pipeline critique

**Critique 1:** NEEDS_REVISION. The original informal request did not distinguish viewer-earned Channel Points from a queue's dedicated Twitch Custom Reward, nor account for the current integration's early return before EventSub. Product clarification resolved the reward distinction, selected streamer/mod roles, confirmed eligible-channel redemption admission, and chose a dedicated Custom Reward created by the bot for each eligible queue.

**Revision:** Keep chat independent; add a persisted local/manual-only queue mode; use bot-created rewards by default; permit Dashboard rewards only after proving full lifecycle access; preserve finance invariants and separate transient failures from unsupported capability.

**Critique 2 (2026-10-07):** APPROVED FOR PLANNING. Official documentation conflicts are recorded without overstating support; the operator's Dashboard observation is labeled as operator evidence. Product decisions cover local queues, conditional Dashboard reward support, free manager-initiated adds in either queue mode, and confirmed-pause conversion that preserves/drains existing redemptions. The out-of-stock request is conditional on API support; current Helix docs and a live probe show that this integration cannot control `is_in_stock`. OAuth scope behavior, Twitch live acceptance, migration design, API ownership proof, transition race handling, and retry recovery remain implementation evidence gates. Implementation was authorized on 2026-10-07 and is in progress.

## 10. Planning outcome

The plan separates queue mode from entry source: queues are reward-backed (`channel_points`) or local/manual (`manual_only`); reward-backed mode uses a bot-created reward by default or a proven Dashboard reward, while explicit manual entries are allowed in either queue mode. New local queues have no reward ID; converted queues retain the prior reward ID/origin as history. Chat runs independently from reward capability. A temporary Twitch failure never silently changes a queue's source. A one-way conversion request becomes effective only after confirmed remote pause; it retains the reward and drains existing redemptions, including durable cancellation of any racing redemption. Pause/reopen state follows the writable `is_paused` field; `is_in_stock` remains Twitch-owned and is not a condition for success. Streamer/moderator may explicitly add a viewer for free in either queue mode. Free-form chat is never parsed as an enrollment request. Manual entries never create financial outbox work. Existing dashboard rewards are listed only as candidates and are rejected for reward-backed use unless the selected reward passes the app-ownership/API lifecycle gate.

No new service or provider integration is proposed. Implementation is underway in FND-9 following explicit authorization. Passing mocked/API adapter tests does not prove live reward behavior or the exact viewer-facing Twitch label; report those as pending until tested with an authorized channel. This plan does not authorize stage/version promotion.
