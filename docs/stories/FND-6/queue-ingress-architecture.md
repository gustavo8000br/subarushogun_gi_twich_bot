# Queue ingress and priority lanes — architecture proposal

[Português brasileiro](../../pt-BR/stories/FND-6/queue-ingress-architecture.md)

**Status:** Accepted product decisions; implementation is in progress as part of FND-6.

## Constraints

- A queue redemption that consumes Twitch Channel Points must be created and owned by this application. Twitch documents that only the creating app may read, update, or delete that reward's redemptions, and only the creating app may update/delete the reward itself. EventSub can deliver redemption notifications, but that does not grant Helix ownership or refund authority.
- This product promises durable cancellation/fulfillment tracking. Importing an unmanaged reward would allow an entry to appear in the queue while making the required point outcome impossible to guarantee.
- Viewers do not join through a chat command or the panel. Existing queue commands from another bot must not be treated as this product's source of truth.
- The current installation is local-only. It does not receive public payment-provider webhooks, collect PIX, validate Bits/subscription events, or store payment credentials/receipts.

## Safe onboarding for an existing channel

1. During setup, explain that an existing reward created by Twitch or another app cannot be adopted as a managed queue reward.
2. Require the streamer to pause/retire the old reward using its creator app or Twitch Creator Dashboard and disable the old bot's queue-admission command before opening the replacement queue.
3. Ask the streamer to settle outstanding redemptions in the old system. Do not import them or claim they can be refunded by this app. The operator may add a person manually only after resolving the old redemption outside this product; manual admission creates no points operation.
4. Create a new app-owned, initially paused reward through this product. Open it only after the streamer reviews its title, cost, UID policy and queue behavior.
5. Show the managed reward identity and remote synchronization status in the panel so the streamer can tell which reward actually feeds this queue.

This cutover avoids double admission and prevents viewers from spending points on an old reward that the bot cannot service. A future read-only legacy observer could be considered separately, but it must never imply cancellation, refund, completion, or safe deletion of an unmanaged reward.

## External priority sources

### Operator verified external benefit

The streamer/mod verifies an external benefit in its original platform, then adds the viewer in the panel or authorized chat command. The operator may mark the panel admission as priority and choose a bounded category: subscription, Bits, external payment (including PIX), or another operator-verified benefit. The app records the local operator and category in its audit log; it does not claim provider verification.

Manual chat admissions remain standard. No receipt, PIX key, transaction ID, chat body, payment credential, subscriber credential, or external payment record is stored. Manual entries have no Twitch redemption ID and never create a Twitch points refund/fulfillment operation. Existing active-entry-per-user-per-queue and queue lifecycle rules still apply.

### Priority ordering (approved)

- Keep two FIFO lanes per queue: `priority` and `standard`; priority is served first. FIFO applies within each lane. Manually moving a waiting entry is limited to its current lane; promoting/demoting appends it to the selected lane's end. Called/in-progress service is never interrupted.
- An authenticated panel operator can assign/remove priority for a waiting entry. The panel's manual-add flow can also create an operator-verified priority entry. The bounded reason codes are `subscription`, `bits`, `external_payment`, and `operator_override`.
- Entries remain manual and have no `redemption_id`; terminal actions create no Twitch points outbox operation. The panel must label the basis as operator-verified, not Twitch/payment-provider confirmed.
- Admission remains subject to one active entry per Twitch user per queue. Repeated benefits do not create duplicate active entries unless a separately approved policy explicitly allows it.
- Do not let viewers self-assign priority by command, mention, display name, badge text, reward title similarity, or request body.

The operator, not a webhook or viewer, asserts the benefit was checked. Because this app currently has one local streamer panel session and authorized queue-management roles in chat, only panel priority controls are offered; chat `add` remains standard to avoid implying a verification step that the command does not perform.

## Integration boundary for automatic verification

- Twitch subscription events, Bits events, and payment-provider events are distinct integrations with distinct permissions and failure behavior. They require a separate scope and security review before adding permissions or credentials.
- PIX automation would require a supported provider contract and a reachable, authenticated callback or provider API flow; opening this local Compose service to the public internet conflicts with this product's default local-only architecture.
- Until a later story defines those contracts, manual verification is the only supported way to create non-redemption entries. Do not silently request `bits:read`, subscription scopes, payment credentials, or public network exposure.

## Sources checked

- Twitch [Helix API reference — Get/Update/Delete Custom Reward and Get/Update Redemption](https://dev.twitch.tv/docs/api/reference/), consulted 2026-10-06. The reference says the creating app alone may manage the reward and its redemptions.
- Twitch [EventSub subscription types — Channel Points custom reward redemption](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), consulted 2026-10-06. Redemption add/update events can be scoped by broadcaster and optional reward ID; event delivery does not change the Helix ownership restriction.

The decision does not imply automatic integration or successful verification of old rewards, Bits, subscriptions, or PIX. Only the selected local ordering and operator audit behavior are in scope.
