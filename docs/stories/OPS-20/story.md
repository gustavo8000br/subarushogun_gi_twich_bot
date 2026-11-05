# OPS-20 — Let streamers choose who is eligible for point refunds

[Português brasileiro](../../pt-BR/stories/OPS-20/story.md)

**Status:** Draft refined — planning in progress; implementation still waits for the OPS-15 migration to finish and for @dev implementation with UX ≥ 9.0 before any panel/copy change. **Issue:** [#76](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/76), created by `$aiox-devops`.
**Source:** Owner interview with a streamer who will use the bot, 2026-10-21. Asked “Do you give the points back when a redemption ends?”, the streamer answered that points are returned **only to subscribers**, because subscribers already support the channel.
**Related:** FND-3 durable financial outbox; FND-9 queue/reward lifecycle; OPS-15 queue settings parity (`refundIfRemovedWhileCalled`, `refundOnNoShow`, `refundIfViewerLeavesCalled`). Research: [research.md](research.md).
**Coordination required:** `$aiox-data-engineer` (migration, snapshot and rollback plan), `$aiox-ux-design-expert` (score ≥ 9.0/10 before any panel/copy change), `$aiox-architect` (domain boundary), independent `$aiox-qa`.

## Problem

Refund behavior today is a set of independent on/off switches per queue. A streamer cannot say “refund, but only for some viewers”. Streamers differ: some refund everyone, some never, some only subscribers. Blanket switches force them to refund too much or too little, or to handle exceptions by hand in Twitch.

Research baseline (code read on 2026-10-21; no live Twitch evidence): `decideEntryTransition()` already requests a refund unconditionally when a waiting redemption is removed and when a queue is cleared or deleted, overriding policy. Policy-driven refunds (called, no-show, viewer leaves) come from three Boolean queue columns. Chat badges are not an audit-grade source, and redemption payloads carry no subscriber status.

## Story

As a streamer who gives points back only to some viewers (for example subscribers),
I want to choose which viewers are eligible for a refund when a redemption is removed, not served or abandoned,
so that the bot applies my channel's own rule instead of refunding everyone or nobody.

## Acceptance criteria (refined)

### Rule and audiences

1. Each queue has **one** refund-eligibility rule with the values **everyone** (current behavior; default, so nothing changes for existing queues), **subscribers only** and **nobody**. For “subscribers only”, subscribers are always eligible (default audience).
2. “Subscribers only” also exposes **independent, configurable** inclusion of: the streamer's own account, moderators and VIPs. The defaults are: streamer, moderators and VIPs **not eligible**; each can be turned on separately. The panel states plainly that, when someone helps with a sub (for example gifts), the streamer may still choose to return the points (see AC 8).
3. What counts as a subscriber is **configurable**: by default, any active subscription, including gifted ones and all tiers. Options: exclude gifted subscriptions and/or require a minimum tier. Subscriber status is read from the active subscriptions Twitch reports (tier and gift flag, per research §1). **Flag for `@po`/`@architect`:** decide whether “minimum tier” is MVP or a later increment; “exclude gifted” is MVP unless they decide otherwise.
4. The rule applies to **every** refund the bot would request: removed while called, no-show, viewer leaves, queue clear, queue delete and removal of waiting entries. Research found that clear, delete and waiting removal currently always refund; they must now go through the rule. The existing per-trigger switches keep deciding **when** a refund is attempted; the rule decides **whether** the viewer is eligible.

### Decision, audit and unknown status

5. Eligibility is decided once per redemption, at the moment the refund decision is taken, using the status Twitch reports at that time, and persisted before the outbox task is created so retries never re-query and flip the answer. Result states: `eligible`, `not_eligible`, `unknown`. `subscriber`/`not_subscriber` come only from a successful response with a valid shape.
6. The audit trail records, per redemption: rule snapshot (including audience and subscriber-definition options), decision, subscriber status, tier and gift flag (nullable), status source (for example Helix subscriptions, not required, streamer's own account), check timestamp, and a reason **code** only for unknown. It never stores gifter identity, tokens, UIDs in logs, chat or redemption text.
7. When status cannot be determined (Twitch unavailable, missing scope `channel:read:subscriptions`, 401/403/429/5xx, timeout, malformed body, lookup error), the bot does not guess: the refund stays **pending/unknown** (never mapped to grant or deny, never silently dropped), with a safe localized explanation. The panel asks the **streamer or moderators** (people with panel access) to confirm what to do.

### Manual override

8. An explicit **manual override** action lets the streamer (and moderators with panel access) refund **or** deny a specific redemption by hand, at any time, including for a viewer the rule marks non-eligible and for any reason the streamer chooses. Every override is audited with who, when and the reason (free-text reason bounded, kept out of logs). An override respects the durable outbox (one financial intent per redemption, idempotency) and does not duplicate a refund already requested.

### Scope and consent

9. `channel:read:subscriptions` is an **optional** scope, never required, so existing connections keep working. A queue set to “subscribers only” evaluates to `unknown` until the streamer re-authorizes. The panel shows clear guidance and a re-consent (reconnect Twitch) action. “Everyone” and “nobody” need no new scope. Non-affiliate/non-partner channels (which have no redemptions) hide the option, in the same way manual-only queues do. “Zero subscribers” is never read as “not a subscriber” without a successful response.
10. If the audience options include moderators or VIPs, the extra scopes they need (research §3) are also optional, with the same `unknown` plus re-consent behavior; the streamer's own account needs no API call.

### Queue clear and rate limits

11. Queue clear checks subscriber status in batches (research §5: one lookup covers up to 100 viewers, to be validated against the docs by `@architect`; the budget figures there are not verified) and backs off on 429, leaving affected items `unknown`/retryable. Refunds may be grouped per reward (up to 50 ids per call, per research) only if a per-redemption result is still recorded; a 404 (“not UNFULFILLED”) is never reported as a refund.
12. The clear confirmation and result copy (in the panel and in chat) no longer promise a single refund count up front. It reports counts by outcome: eligible, not eligible and pending check, always as “requested”/“pending”, not “confirmed”, until Twitch confirms.

### Truthfulness and non-eligible handling

13. A non-eligible viewer's redemption is handled explicitly, because an UNFULFILLED item otherwise stays in the Twitch queue (research §7). The choice between (a) marking it FULFILLED without refund and (b) leaving it UNFULFILLED is recorded in this story by `@architect` in the boundary gate and reviewed in the `@ux-design-expert` gate, before implementation starts. Tests then verify the chosen behavior for every trigger in AC 4. The panel and chat never imply a refund was requested or confirmed when it was not.
14. Durable-outbox rules hold: one financial intent per redemption, idempotency, lease/retry, no remote-confirmation claim until Twitch confirms; unknown never becomes `request_cancel` or `no_operation` without notice.

### UX, copy and data

15. The queue settings form exposes the rule, audiences and subscriber definition with accessible copy in en, es and pt-BR that explains the effect in plain language. Manual-only queues hide it. Bilingual (en and pt-BR, plus es) copy review is part of the UX review, with the 9.0/10 score recorded in the story before implementation; static review is distinguished from visual, browser and assistive-technology validation.
16. `@data-engineer` migration: an enum column (`everyone`/`subscribers`/`nobody`) NOT NULL DEFAULT `everyone` on the queue, plus configurable audience and subscriber-definition fields with defaults that preserve current behavior for existing rows (no data change on migrate). Snapshot first; rollback plan documented. Audit storage per AC 6 and AC 8.
17. Real isolated PostgreSQL with real migrations verifies persistence, default preservation for existing queues, eligibility decisions, audience and subscriber-definition variants, manual override and audit. Twitch-boundary tests use fakes. No live Twitch claim; evidence types stay separated.

## Decisions (owner, 2026-10-21)

1. **Audiences are configurable per streamer, not hard-coded.** Subscribers are the default for the “subscribers only” rule; the streamer's own account, moderators and VIPs are independently selectable. The panel must say plainly that if someone helps with a sub (gifts), the streamer may still choose to return points. The streamer friend who will use the bot refunds subscribers only. Moderators usually should not redeem at all (a moderator can use the add-to-queue command with their own nick) and are often served free, so moderators and VIPs default to **not eligible** but remain selectable.
2. **What counts as a subscriber is configurable.** Default: any active subscription, including gifted and all tiers. Options: exclude gifted and/or a minimum tier. Whether minimum tier is MVP or later is to be decided with `@po`/`@architect` (flagged in AC 3).
3. **One rule per queue applies to all refund triggers** (removed while called, no-show, viewer leaves, queue clear, queue delete, removing waiting entries). The existing per-trigger switches keep deciding **when** to refund. Clear, delete and waiting removal, which currently always refund, must go through the rule.
4. **Unknown subscriber status is never guessed.** The refund stays pending/unknown and the panel asks the streamer or moderators (people with panel access) to confirm. An explicit manual override lets the streamer always refund (or deny) a specific redemption by hand, audited with who, when and reason, including for a non-eligible viewer when the streamer decides so for any reason.
5. **Missing scope:** `channel:read:subscriptions` is optional, with a re-consent flow and clear panel guidance; the result is `unknown` until authorized. Non-affiliate channels hide the option.
6. **Handling of non-eligible redemptions is configurable per queue** (owner, 2026-10-21, after verified Twitch fact: “You may update a redemption only if its status is UNFULFILLED”, so a FULFILLED redemption can never be refunded through the API). Options: *keep UNFULFILLED until the streamer decides* (refund stays possible by manual override; the redemption stays pending in the Twitch list; the panel offers bulk “mark served” and per-redemption “return points”, both audited) or *mark FULFILLED automatically* (clean Twitch list; manual refund impossible afterwards, and the panel must say so before the streamer picks it). Whether pending UNFULFILLED redemptions expire or are limited by Twitch is **not verified**. This resolves CA 13 together with the `@architect` boundary gate (default value to be proposed there, `@ux-design-expert` to review the wording).
7. **A moderator or VIP who is also a subscriber is eligible** under “subscribers only” (owner, 2026-10-21, answering OD-1 of the architecture note): the audience options (streamer, moderators, VIPs) only ADD eligibility, so the default needs no moderator/VIP scopes and forces no extra re-consent.
8. **UX decisions (owner, 2026-10-21, OD-UX-1/2/3 of the UX plan, gate score 9.1/10 static only):** (a) the “subscribers only” and “nobody” options appear in the panel only when slice 3 (the “needs your decision” list and manual actions) ships, so no pending redemption can exist without a screen to resolve it; (b) a single term, “return the points” (“devolver os pontos”), replaces “refund” across existing and new panel copy and the four chat messages in pt-BR, es and en (the chat part goes through `@po` and issue #65); (c) a reason (max 280 characters) is mandatory for every manual return/deny action, one reason per batch.

## PO validation (2026-10-21)

**Validator:** `@po` (Pax), story-draft validation (10-point checklist). **Score:** 9.0/10 (re-scored 2026-10-21; first pass 8.5). **Decision:** GO for the planning gates; implementation still blocked by the gates below.

**Points recovered (8.5 → 9.0):** +0.5 because AC 13 is now testable: the open choice has an owner (`@architect`, boundary gate), a reviewer (`@ux-design-expert` gate), a deadline (before implementation) and a test obligation (every AC 4 trigger). No new requirement was added; the two options come from research §7.

**What still prevents 10 (closes only after later gates, so it is not scored now):** (1) the minimum-tier MVP call needs `@architect` confirmation (AC 3); (2) AC 11 depends on Twitch limits that research did not verify (100 `user_id`s, 50 ids, rate budget), to be checked in the `@architect` gate; (3) there is no complexity estimate yet; it belongs to the `@architect` complexity assessment. Status stays Draft until the planning gates pass, because implementation is gated.

| # | Check | Result |
|---|---|---|
| 1 | Clear title and goal | Pass |
| 2 | User story complete | Pass |
| 3 | ACs testable | Pass (AC 13 rewritten: decision recorded by `@architect` in the boundary gate, reviewed by UX, then tested) |
| 4 | Scope boundaries | Partial, fixed: "Out of scope" section added |
| 5 | Dependencies | Pass (OPS-15, FND-3, FND-9, optional scopes, re-consent) |
| 6 | Traceability, no invention (Art. IV) | Pass: every AC traces to owner decisions 1–5 or research §0–§7 |
| 7 | Risks | Pass |
| 8 | Story-driven, planning gates (Art. III) | Pass |
| 9 | Data and test safety | Pass |
| 10 | en/pt-BR equivalence | Pass (same 17 ACs, 5 decisions, gates and risks) |

**Fixes applied:** added "Out of scope"; recorded that owner decisions supersede research §3/§7 (research suggested broadcaster eligible by default and mods/VIPs out of MVP; the owner chose all three configurable and not eligible by default); recorded the minimum-tier recommendation.

**Minimum tier — PO recommendation: later increment, not MVP** (final call in the `@architect` gate). Reasons: the owner's real streamer needs only "any active sub"; the default counts all tiers; AC 6 already stores tier, so a later option needs no data backfill; it trims settings UX and test matrix; Prime is reported as tier 1000 and that is not verified (research §1). "Exclude gifted" stays MVP.

## Out of scope

- Minimum subscription tier (pending `@architect` confirmation of the recommendation above).
- Chat badges or an EventSub subscription cache as a status source (research §4).
- Per-trigger eligibility rules (research §7).
- Live Twitch validation claims; version bump, push or release.

## Planning gates before implementation

- [x] `@analyst` research: Twitch subscriber lookup, scopes, limits (see [`research.md`](research.md); official-reference numbers still unverified, to be re-checked by `@analyst`/`@architect` before the boundary gate and again before development).
- [x] `@po` validation: GO (≥ 7/10) on the refined story.
- [x] `@data-engineer` design: migration, defaults, audit storage, snapshot and rollback.
  - Data-engineer gate (2026-10-21): **GO** for design; see [data-model.md](data-model.md). Five NOT NULL queue columns with behavior-preserving defaults, new `refund_eligibility_decisions` table (one row per redemption, written before the unchanged `financial:{redemption_id}` outbox key; `unknown` creates no outbox row). Open questions Q1–Q6 go to `@architect`. No migration created.
- [x] `@architect` boundary: domain split between rule, status lookup and outbox; minimum-tier MVP decision; batching approach; treatment of non-eligible redemptions.
  - Architect gate (2026-10-21): **GO**; see [architecture.md](architecture.md). Pure evaluator + subscriber-status port (Twitch adapter, fakes) + asynchronous eligibility-check worker (no Twitch call inside DB transactions); minimum tier out of MVP; `keep_unfulfilled` default confirmed; lookups batched ≤ 100 (verified), redemption updates per task in MVP (grouping ≤ 50 configurable later); complexity COMPLEX (16/25), three slices; data-model deltas D1–D3. Owner decision OD-1 resolved on 2026-10-21 (decision 7: audience flags are additive; a moderator or VIP who is also a subscriber is eligible), so slice 2 is no longer blocked.
- [x] `@ux-design-expert` plan and review: score ≥ 9.0/10 for the reviewed scope, recorded in this story.
  - UX gate (2026-10-21): **9.1/10, PASS, static code/copy review only**; see [ux-plan.md](ux-plan.md). Not covered: visual, real browser, assistive technology, user research, Twitch dashboard labels. Owner decisions requested: OD-UX-1 (expose "subscribers only"/"nobody" in the panel only with slice 3), OD-UX-2 (unify "return the points" in existing strings and chat), OD-UX-3 (reason required for every manual action, including bulk).
- [x] `@qa` test plan: PostgreSQL isolated, fakes at the Twitch boundary, evidence separation.
  - QA gate (2026-10-21): **CONCERNS** (plan approved; plan quality 9.0/10, plan only, nothing run); see [test-plan.md](test-plan.md). Traceability for all 17 ACs, data-model tests 1–32 mapped, evaluator table + properties, adapter/worker/race tests with fakes and ≥ 2 real connections, per-slice Red-first entry/exit, regression guard for default `everyone`, manual AT checklist, real Twitch as documented blocker. Concerns: dependency decisions (fast-check, axe, HTTP fake), Twurple internal 429 retry vs `lookupTimeoutMs`, Prisma 6.19.3 `migrate diff` flags, streamer vs moderator actor (A2).
- [x] `@devops` rewrites the main body of issue #76 with the refined scope (no issue comments, owner rule). Done 2026-10-21: body rewritten, title and labels unchanged.

## Dependencies and risks

- **Depends on:** OPS-15 migration finished; FND-3 outbox and FND-9 lifecycle (stable behavior); the optional scope `channel:read:subscriptions` (and, if offered, the moderator/VIP scopes).
- **Re-consent gap:** already-connected streamers must re-authorize; until then “subscribers only” yields `unknown`, which needs clear UX.
- **Behavior change in forced paths:** clear, delete and waiting removal stop refunding unconditionally; copy that promised a refund count must change.
- **Rate limits and latency:** one extra Helix lookup before cancel; limits and latency figures are unverified (research) and must be validated against the docs and fakes.
- **Status is as of the decision moment**, not the redemption moment; badge-based hints (`founder` vs `subscriber`) are not audit-grade.
- **Affiliate loss:** existing UNFULFILLED redemptions cannot be updated; the outbox failure handling already covers this.
- **Privacy:** no gifter identity, tokens or UIDs stored in logs; reason text kept bounded and out of logs.
- **Unverified in research:** maximum `user_id` count of the subscriptions endpoint, absence of a Prime flag, the rate-limit budget figure and real latency.

## Test and data safety

Tests first (Red). Use disposable PostgreSQL only; preserve any active developer database. No version bump, push or release without explicit owner authorization.
