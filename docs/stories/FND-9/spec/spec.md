# Spec: Manual queue operation for channels without Channel Points eligibility

> **Story ID:** FND-9<br>
> **Generated:** 2026-10-06 UTC<br>
> **Complexity:** COMPLEX (18/25)<br>
> **Pipeline:** Gather → Assess → Research → Write → Critique → Revise → Critique → Plan<br>
> **Status:** Planning draft complete; implementation remains outside the current authorized sequence.

[Português brasileiro](../../../pt-BR/stories/FND-9/spec/spec.md)

## 1. Overview

Viewers normally earn Twitch Channel Points by watching a live stream and redeem a custom reward selected by the streamer, such as “drink water.” FND-9 concerns the separate queue-admission capability for a channel Twitch does not allow to create/use Channel Points custom rewards because it is not Affiliate or Partner. In this mode, the chatbot should still accept an authorized manual add command from the streamer or a moderator.

For each queue on an eligible channel, the bot creates a dedicated Twitch Custom Reward through the Twitch API and manages that reward's redemptions. Existing rewards already in the streamer's Twitch list (including “drink water”) are not selected as queue triggers and remain untouched. For an ineligible channel, authorized manual chat additions are used; the app must never claim that a manual command was a points redemption or create a points refund/consumption operation for it.

### Goals

- Keep Twitch chat command operation available when Channel Points rewards are unavailable.
- Reuse existing trusted command authorization, queue domain transition, duplicate, UID and persistence rules.
- Clearly distinguish chat connectivity from Channel Points eligibility in the operator panel and health/connectivity projection.
- Create and manage one dedicated app-created Twitch Custom Reward per queue on eligible channels.

### Non-goals

- Viewer self-enrollment, payment processing, Bits/subscription verification, external provider webhooks, automatic queue priority, a second bot account, or selecting/adopting a pre-existing reward not created by this app.
- Changing the Twitch-earned points balance or how viewers earn points by watching streams.
- Altering unrelated custom rewards such as a drink-water reward.

## 2. Requirements summary

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Keep authorized broadcaster chat/EventSub operation when Channel Points rewards are unavailable. | P0 |
| FR-2 | Streamer and moderators manually add a resolved Twitch user to a selected queue using the existing authorized command. | P0 |
| FR-3 | Manual entries have source `manual`, no `redemption_id`, no financial outbox task, and safe audit history. | P0 |
| FR-4 | Explain manual-only/ineligible state in pt-BR while reporting chat status separately from Channel Points availability. | P1 |
| FR-5 | For each eligible queue, create and manage a dedicated Twitch Custom Reward through this app; leave pre-existing rewards untouched. | P1 |
| FR-6 | Keep the existing localized global `ping` command available to streamer/moderator while Channel Points are unavailable. | P0 |

## 3. Proposed architecture

1. Separate the Twitch connection lifecycle into chat capability and Channel Points capability. A failed/ineligible Channel Points eligibility check must disable only points-specific subscriptions, workers, reward mutations, and reconciliation. It must not stop an otherwise valid broadcaster chat authorization and `channel.chat.message` subscription.
2. Continue using the broadcaster's installed-chatbot user token and the existing EventSub WebSocket transport. Keep current chat scopes (`user:read:chat`, `user:write:chat`) for read and reply behavior. Make `channel:manage:redemptions` conditional on the points-reward capability only if official behavior and installed OAuth tests confirm this is safe. Add no new scopes.
3. Reuse the current `!<queue> add <user> [UID]` command. Streamer/mod authorization comes from the current trusted broadcaster identity and message badges, never body fields or typed role claims. Chat `add` always creates a standard-lane manual entry.
4. Continue to use the existing queue repository/service and PostgreSQL integrity constraints. Do not create a new queue or financial subsystem for this mode.
5. Show separate status fields such as chat `connected` and points `unavailable_ineligible`. The existing `/health` summary and panel must not report Twitch wholly unavailable when chat is operating; no API entity or raw Twitch error is exposed.
6. Keep the existing localized global `ping` command available to streamer/moderator in both eligible and ineligible channels. For the ineligible channel, it still returns the existing Pong response, product version, and cached Twitch latency; it must not require reward eligibility or trigger an extra Helix request per chat message.
7. On eligible channels, create one dedicated Twitch Custom Reward per queue through this app. Only that reward ID may be opened, paused, reconciled, fulfilled/canceled, or deleted. Generic custom rewards already in the channel (for example, “drink water”) are not queue inputs and remain outside this app's control.
8. Keep one-to-one queue/reward association by immutable Twitch reward ID; never adopt a pre-existing reward by title or similarity.

These are a recommended implementation direction, not approved technical details. Token-scope behavior and Twurple's actual subscription sequence must be validated before code changes.

### Operator validation input (2026-10-07)

The operator reports that the connected but ineligible channel does not answer `!fila ping`. This matches the current integration's early exit before EventSub starts. FND-9 must keep the existing localized streamer/moderator-only global ping behavior alive with chat even when points rewards are unavailable; retain its Pong, product version, and cached-latency response, without adding a per-message Helix probe. No successful live chat response is claimed yet.

### Official API clarification (2026-10-06)

Twitch documents `channel.chat.message` with `user:read:chat`; redemption EventSub and Custom Reward mutation use redemption scopes. Helix explicitly limits Custom Reward management to eligible channels, while the chat subscription contract does not state an Affiliate/Partner requirement. This supports keeping chat and Channel Points as independent runtime capabilities, but it is not proof that this app's ineligible OAuth path works. Before implementation, test OAuth/token validation with only chat scopes and verify Twurple WebSocket subscription behavior; do not silently weaken the eligible-channel flow. See the [capability gap audit](../../TWITCH-CAPABILITY-GAP-ANALYSIS.md) and [integration reference](../../../integrations.md).

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
6. A channel with a pre-existing “drink water” reward connects. The bot leaves it unchanged; eligible queue creation creates a separate paused Custom Reward through the bot and associates only that new reward ID with the queue.
7. An eligible channel retains current redemption admission, outbox, reconciliation, and reward behavior.
8. Twitch chat loss/revocation is shown separately from Channel Points ineligibility; restarting the bot preserves the manual queue entry.
9. A streamer/moderator sends the localized global ping command in an ineligible channel and receives the existing Pong, product version, and cached Twitch latency response; a viewer receives no ping response, and no reward API or per-message Helix probe is triggered.

## 6. TDD plan

- Unit Red/Green: integration starts EventSub chat on ineligible channels but never starts redemption subscriptions/reconciliation; authorized streamer/mod `ping` remains available and returns the cached status/version response; viewers receive no ping response; no per-message probe is added. Authorization remains streamer/mod only; health/panel projection separates statuses.
- PostgreSQL integration: real migrations verify manual admission source, ID relations, uniqueness, audit and absence of financial intent; no Prisma mock may prove these contracts.
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

## 8. Open product decision

- [x] **Q-1:** Manual chat add is available to streamer and moderators. Confirmed by the product owner on 2026-10-06.
- [x] **Q-2:** Eligible channels retain Channel Points redemption admission; ineligible channels use manual admission. Confirmed by the product owner on 2026-10-06.
- [x] **Q-3:** Manual additions remain allowed in a closed queue, as specified by the original product rules.

## 9. Pipeline critique

**Critique 1:** NEEDS_REVISION. The original informal request did not distinguish viewer-earned Channel Points from a queue's dedicated Twitch Custom Reward, nor account for the current integration's early return before EventSub. Product clarification resolved the reward distinction, selected streamer/mod roles, confirmed eligible-channel redemption admission, and chose a dedicated Custom Reward created by the bot for each eligible queue.

**Revision:** Create one app-managed Custom Reward per eligible queue; leave pre-existing rewards outside queue admission; separate chat and Channel Points capabilities; scope manual addition to authorized chat actors; document no-fabricated-redemption and no-financial-side-effects contracts.

**Critique 2:** APPROVED AS A PLANNING DRAFT. Requirements, decisions, constraints, risks, acceptance scenarios and test strategy are traceable to the original product specification, user clarifications, repository evidence, and official Twitch documentation. Live Twitch behavior remains unverified. This does not authorize implementation; the product owner will decide when FND-9 enters the active sequence.

## 10. Planning outcome

The recommended solution is to keep the bot connected to Twitch chat, reuse the existing streamer/mod `add` command for ineligible channels, and disable only Channel Points reward features when Twitch says the channel is ineligible. Channel Points are Twitch platform points viewers earn by watching and spend on Custom Rewards. For eligible channels, each queue gets a dedicated Twitch Custom Reward created by the bot through the API; this allows the creating app to query and update that reward's redemptions. Pre-existing rewards such as “drink water” remain untouched and are not queue triggers.

No new service or provider integration is proposed. The implementation should follow as its own story after FND-7 and at the product owner's chosen point relative to FND-8. This draft does not authorize implementation or stage/version promotion.
