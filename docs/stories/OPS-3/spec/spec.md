# Spec: Local chat command catalog and role policies

[Português brasileiro](../../../pt-BR/stories/OPS-3/spec/spec.md)

> **Story ID:** OPS-3 (GitHub issue #17)
> **Complexity:** COMPLEX (18/25)
> **Generated:** 2026-10-06
> **Status:** Approved for implementation after critique; UX expert has not been invoked.

## 1. Overview

Add a protected **Commands** page to the local streamer panel, listing every chat command, syntax, purpose and effective role policy. Allow the streamer to edit an explicit allowlist for mutable commands. Add global `!queue comandos` to show every command the current sender can execute across the product; retain `!<queue> comandos` for one queue. Add global `!queue ping` for the streamer/moderator to verify chat response, version and cached Twitch API latency.

### Goals

- Make the complete command surface visible to the streamer.
- Keep chat help and backend authorization driven by one persisted policy.
- Preserve existing permissions by default, except the account label mutations `!conta <nome>` and `!conta reset`, which are streamer-only.
- Avoid side effects and protected-command disclosure on denied requests.

### Non-goals

- Follower-based role, extra Twitch scopes, an external role cache, or role synchronization.
- Redesign of panel visual language or UX research; `$aiox-ux-design-expert` remains gated until after this issue implementation and FND-7 planning.
- New queue/domain behavior beyond help discovery and a read-only status reply.

## 2. Requirements and acceptance

### Functional requirements

| ID | Contract |
| --- | --- |
| FR-1 | Catalog every implemented global and queue chat command with pt-BR syntax, description, roles, and mutability. |
| FR-2 | Persist per-command explicit role allowlists and use the same effective policy for panel display, help and authorization. |
| FR-3 | Initial behavior preserves current access; VIP remains gated by `allowVipManagement`. |
| FR-4 | `!conta <nome>` and `!conta reset` are fixed streamer-only actions, rejected if a panel/API payload tries to broaden them. |
| FR-5 | Global `!queue comandos` lists all commands currently available across the product to roles in the current trusted event; tell streamer to use the panel. Keep `!<queue> comandos` for queue-specific help. |
| FR-6 | Recognize streamer, moderator, VIP, subscriber and everyone. Explicit allowlists use OR matching and no hierarchy inheritance. |
| FR-7 | Denied actions do not claim/mutate commands, inspect queue entries, read account state, or call Twitch unnecessarily. |
| FR-8 | Chat help follows existing cooldown and 500-character response limit; copy is concise Brazilian Portuguese. |
| FR-9 | `!queue ping` is immutable for streamer and moderator and replies with `Pong 🏓`, running version and latest cached Twitch API latency. |
| FR-10 | Reserve `queue` namespace from queue slugs/aliases. |

### Acceptance criteria

1. The panel catalog is complete and all user-visible copy is in pt-BR; each row identifies locked streamer-only actions.
2. Panel API reads are local-session protected; writes use existing CSRF/session/idempotency/version protections and reject invalid roles/immutable changes.
3. Policy survives API process restart in PostgreSQL; catalog, chat help and authorization report the same effective configuration.
4. Default roles preserve old behavior; the two account mutations are streamer-only; `!queue ping` is fixed to streamer/moderator.
5. Twitch role checks use broadcaster identity and current target-channel `channel.chat.message` badges; no cached/historical badge or Shared Chat source privilege is trusted. VIP requires existing toggle.
6. Global `!queue comandos` lists permitted commands across the product; `!<queue> comandos` remains queue-specific. Output is bounded and streamer is directed to the panel.
7. `!queue ping` uses the latest cached Twitch health measurement and never makes a new Helix request from the chat handler.
8. Queue slug and alias `queue` are rejected.
9. Authorization denial has tests proving no unnecessary lookup or side effect.
10. Focused tests are written first, demonstrated failing, then made green and refactored. PostgreSQL persistence/audit uses real database and migrations.
11. English and Brazilian Portuguese docs/changelogs are synchronized. No FND-7 research or UX role work begins until this issue implementation is complete.

## 3. Architecture

- Keep a canonical command definition registry containing command ID, chat syntax, description, scope, defaults, and immutable role rule. Avoid a second unrelated catalog that can drift from parser/authorization.
- Add policy resolution as a pure domain function receiving the definition, persisted allowlist and the sender’s current verified role set.
- Persist policy in PostgreSQL and audit changes transactionally. A missing policy record resolves to a fixed default; malformed data fails closed. Do not use memory as the durable source.
- Add protected catalog/policy API using the existing local session, CSRF, operation key and optimistic version patterns.
- Add a local panel page/navigation entry that renders server-provided safe projection using `textContent` and submits allowlist edits.
- Parse global `!queue comandos` as discovery only and return permitted forms from the canonical catalog; retain queue-specific `!<queue> comandos`.
- Parse `!queue ping` as immutable streamer/moderator access and read only the latest health probe cache plus product identity; no chat-triggered Helix call.
- Reserve the global `queue` namespace so queue keys cannot shadow the two global actions.
- Identify sender roles from broadcaster ID and current event badges. `everyone` matches all senders; moderator/VIP/subscriber matches any corresponding trusted role. VIP is included only when global VIP management is enabled. The streamer has management access by identity, except locked commands remain streamer-only.

## 4. Twitch research

Official documentation checked 2026-10-06:

| Operation | Event/endpoint | Scope | Adaptation |
| --- | --- | --- | --- |
| Identify chat sender and current roles | EventSub `channel.chat.message` v1 | Existing `user:read:chat` auth | Twurple EventSub adapter already normalizes chat user, channel, source channel and badges; use current badges for the current decision only. |
| Verify follower role (excluded) | `GET /helix/channels/followers` | `moderator:read:followers` plus broadcaster/moderator token | Not included; no follower scope added. |

Sources: [EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), [Twitch chat](https://dev.twitch.tv/docs/chat/send-receive-messages/), [Helix API reference](https://dev.twitch.tv/docs/api/reference/).

## 5. Data/API/UI contract

- Catalog projection exposes only known command IDs, localized safe descriptions, syntax, current role allowlist, immutable status and policy version. Never serialize persistence entities wholesale.
- Policy mutation accepts only known mutable IDs, roles from `moderator`, `vip`, `subscriber`, `everyone`, and the expected policy version; streamer is hard-coded as an identity override, not an editable grant.
- Queue help receives sender role set plus queue policy and returns a compact safe text. Queue lookups required to locate the named queue are allowed; viewer entry/account/Twitch-user lookups are not.
- The help command itself follows existing viewer cooldown. Mutations and all existing commands use existing deduplication/cooldown behavior.

## 6. Test strategy

1. Parser unit tests: `comandos`, case/spacing/accents, arity and malformed syntax.
2. Pure domain tests: role set extraction, explicit OR semantics, everyone, VIP toggle, streamer override, immutable account commands, policy defaults and malformed fail-closed behavior.
3. Chat handler tests: global/per-queue role-filtered help, streamer panel direction, bounded output, no effects after denial, ping role gate/cache/no network calls, and Shared Chat rejection.
4. Route tests: session/CSRF, schema validation, immutable command rejection, idempotency and stale policy version.
5. Real PostgreSQL migration integration: default policy, transactionally persisted changes/audit, restart/reload, constraint/concurrent version behavior.
6. Panel contract/browser-DOM tests: complete definitions displayed from the API's `allowedRoles`/`configurable` projection, role labels, locked actions not editable, submit and safe text rendering.
7. Run focused suite first; after increments run affected suite; before story closure run `npm run lint`, `npm run typecheck`, `npm test`, `npm run review:static`, version validation, Compose config, and docs/language parity checks.

## 7. Risks

- A default mismatch can widen or revoke access: preserve the tested current baseline and hard-lock account writes.
- Policy display/runtime drift: both consume the same command registry and policy resolver.
- Subscriber/VIP/moderator badges can overlap: explicit OR matching, and VIP toggle remains a hard gate.
- Shared Chat source badges may not grant target-channel privileges: use only the event identity/current target-channel badges and retain source-channel rejection.
- Long catalog output can flood chat: enforce 500-character cap and single compact response.

## 8. Open questions

None. Role set, explicit-list semantics, default behavior, immutable commands, follower exclusion, and order of subsequent FND-7/UX work were clarified by the product owner.
