# OPS-20 — Architecture and boundary note (refund eligibility)

[Português brasileiro](../../pt-BR/stories/OPS-20/architecture.md)

**Author:** `@architect` (Aria), 2026-10-21. **Story:** [story.md](story.md), issue [#76](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/76). **Inputs:** [research.md](research.md) (incl. Verification round 2), [data-model.md](data-model.md) (data-engineer GO).
**Nature:** planning gate only. No code, migration, Docker or Twitch call was run. Code statements come from a read-only reading on branch `feat/ops-15-next-panel` of `apps/api/src/domain/entry-transitions.mjs`, `persistence/queue-repository.mjs`, `outbox/financial-worker.mjs`, `twitch/helix-adapter.mjs`, `twitch/oauth.mjs`, `twitch/integration.mjs`, `runtime.mjs` and `node_modules/@twurple/api` 8.2.0.

Fact labels: **VERIFIED** (official Twitch text or code read here), **PARTIAL** (official text plus inference, or community only), **UNVERIFIED** (no source found; design assumption).

## Gate result

**GO** for UX and QA planning, with three data-model deltas (D1–D3, section 8) for `@data-engineer` and one owner decision (OD-1, section 1.2). Complexity: **COMPLEX** (16/25). Recommended delivery in three slices (section 6).

## 0. Facts this design relies on

| # | Fact | Label |
|---|---|---|
| F1 | Get Broadcaster Subscriptions: broadcaster user token with `channel:read:subscriptions`; `user_id` max 100; non-subscribers absent from `data`; `tier` 1000/2000/3000; `is_gift`. | VERIFIED (research round 2 §1) |
| F2 | Prime is not distinguishable; appears as tier 1000. | PARTIAL (absence in official text + community) |
| F3 | Update Redemption Status: up to 50 ids, one `reward_id`, only while UNFULFILLED; 404 = not found or not UNFULFILLED; CANCELED refunds. | VERIFIED (round 2 §2) |
| F4 | Deleting a reward marks pending UNFULFILLED redemptions FULFILLED. | VERIFIED (round 2 §2) |
| F5 | Get Moderators (`moderation:read`) and Get VIPs (`channel:read:vips`), up to 100 `user_id`, broadcaster token. | VERIFIED (round 2 §4) |
| F6 | 429 when the bucket empties; `Ratelimit-Reset` tells when it refills; user-token limits per client ID per user; do not depend on message strings. | VERIFIED (round 2 §5, guide) |
| F7 | The 800 points/minute figure. | UNVERIFIED (not in the verified quotes) |
| F8 | Expiry or cap of pending UNFULFILLED redemptions. | UNVERIFIED (round 2 §3) |
| F9 | A refresh keeps the scopes originally granted; a new scope needs a new authorization (refresh response returns `scope`). | PARTIAL ([refresh tokens](https://dev.twitch.tv/docs/authentication/refresh-tokens/), accessed 2026-10-21; no sentence saying "same scopes" was found, but refresh needs no new consent, so it cannot add scopes) |
| F10 | Twurple 8.2.0 `getSubscriptionsForUsers(broadcaster, users)` issues **one** request with all ids and does **not** chunk; it declares `scopes: ['channel:read:subscriptions']`. `updateRedemptionStatusByIds` also sends one request. | VERIFIED (code read in `node_modules/@twurple/api/lib/...`) |
| F11 | Twurple's own rate limiter may queue or retry 429 internally before the error reaches the adapter. | UNVERIFIED (to check in `@twurple/api-call`/rate-limiter source during dev; tests must use fakes either way) |
| F12 | `decideEntryTransition()` forces `request_cancel` for waiting removal and for `queue_cleared`/`queue_deleted`; the repository calls it inside a Prisma transaction and then `createCancellationIntent()` (key `financial:{redemption_id}`). | VERIFIED (code) |
| F13 | `checkFollower()` returns `'unknown'` when the optional scope is missing or the call fails; OAuth has an `optionalScopes` allow-list (`moderator:read:followers`) and a scope-only re-consent path (`integration.mjs` line 282). | VERIFIED (code) |
| F14 | The financial worker reads remote status, then updates one redemption per task; 429 uses `retryAfterSeconds`; 401 → `unknown`/`authorization_required`. | VERIFIED (code) |

## 1. Domain split

```
            HTTP routes / chat commands / timeout loop
                           │ (unchanged entry points)
                           ▼
                 queue-service (domain) ──► decideEntryTransition()  [WHEN: per-trigger switches]
                           │                         │ financialDecision = request_cancel | request_fulfill | no_operation
                           ▼                         ▼
              RefundEligibilityPolicy.evaluate()  [WHETHER: pure]
                           │  → resolved now (everyone / nobody / broadcaster self)
                           │  → needs_lookup (subscribers rule)
                           ▼
              EligibilityDecisionRecorder (repository, same transaction)
                ├─ resolved eligible        → createCancellationIntent()   (redemption.cancel, financial:{id})
                ├─ resolved not eligible    → keep_unfulfilled: no intent / auto_fulfill: redemption.fulfill
                └─ needs_lookup             → decision row pending_check + eligibility check task
                                                          │
                                                          ▼
              EligibilityCheckWorker (new, outbox loop) ── SubscriberStatusProvider port
                                                          │      ├─ TwitchSubscriberStatusAdapter (Helix)
                                                          │      └─ fakes (tests)
                                                          ▼
                       RefundEligibilityPolicy.evaluate(rule, statuses) → recorder.complete()
                                                          │ (same rules as above, one financial intent max)
              RefundOverrideService (panel: refund / mark served, single)   ─┐
              BulkMarkServedService (panel: batch, idempotent)              ─┴─► recorder guarded write → financial intent
```

### 1.1 Components

| Component | Kind | Responsibility | Must not |
|---|---|---|---|
| `RefundEligibilityPolicy` (`apps/api/src/domain/refund-eligibility.mjs`) | **Pure** function, no I/O | `evaluate({rule, viewer:{userId, isBroadcaster}, statuses?}) → {decision, statusSource, audienceMatch, subscriberStatus, tier, isGift, unknownReason, lookups[]}`. Without `statuses` it returns either a final decision or `needs_lookup` with the list of lookups required (`subscription`, `moderator`, `vip`). | call Twitch, read the clock, know about outbox |
| `SubscriberStatusProvider` port | Interface | `lookupSubscriptions(userIds[]) / lookupModerators(userIds[]) / lookupVips(userIds[])`, each returning `{status:'ok', byUserId}` or `{status:'unknown', reason}` for the **whole batch**. Enforces `≤ batchMax` ids per call. | throw for expected failures; return partial "ok" on a malformed body |
| `TwitchSubscriberStatusAdapter` (in `helix-adapter.mjs`) | Adapter | Pre-checks granted scopes via `authProvider.getCurrentScopesForUser(broadcasterId)` (same pattern as `checkFollower`, F13); validates ids (`^\d{1,32}$`) and response shape; maps 401/403/429/5xx/timeout/shape errors to reason codes; exposes `Ratelimit-Reset` as `retryAt`. | log UIDs, gifter fields, tokens; cache across decisions |
| Fakes (`tests/fakes/subscriber-status-provider.mjs`) | Test double | Scriptable answers per user and per call (ok, 429 with reset, 5xx, malformed, scope missing). | — |
| `EligibilityDecisionRecorder` (repository functions) | Persistence | Insert decision row `ON CONFLICT (redemption_id) DO NOTHING`, complete a pending row, create at most one financial intent, write `audit_logs` with codes only. | open a network call inside the transaction |
| `EligibilityCheckWorker` (`apps/api/src/outbox/eligibility-worker.mjs`) | Worker | Claims pending checks grouped by queue (≤ batch size), calls the provider **outside** any DB transaction, then completes rows in one short transaction. | create financial intents for `unknown` |
| `RefundOverrideService` | Domain + repository | Single redemption refund / mark served, guarded write (data-model 2.4), audit who/when/reason. | reverse an existing financial intent (Q2) |
| `BulkMarkServedService` | Domain + repository | Batch "mark served" with `resolution_batch_id` and `processed_operations` idempotency. | partially re-write resolved rows |

**Key boundary decision — no Twitch call inside a database transaction.** Today the refund decision is taken inside a Prisma transaction (F12). Putting a Helix lookup there would hold row locks for network time, and 429 waits would block the API. So the subscriber lookup is **asynchronous**: the transaction records `pending_check` and a check task; the worker resolves it seconds later.

- Option A, synchronous lookup before the transaction: better chat copy ("refund requested") but adds latency and a second code path for clear, plus a race between lookup and commit. Rejected for MVP.
- Option B, asynchronous check task (**chosen**): one path for all triggers, natural batching for clear, 429 handled by the existing lease/retry model. Cost: the chat cannot say "refund requested" at removal time under "subscribers only" (section 7).
- Option C, EventSub subscription cache: rejected by the story (out of scope, research §4).

"Decided at the moment the refund decision is taken" (AC 5) is met as "status Twitch reports when the check runs, normally seconds after the trigger"; `status_checked_at` stores the exact moment. **PARTIAL** fit to AC 5 wording, flagged for `@po`/UX awareness, no AC change needed.

### 1.2 Evaluation rules (pure evaluator)

1. `everyone` → `eligible`, `not_required`. `nobody` → `not_eligible`, `not_required`. No lookup, no scope.
2. `subscribers`:
   1. viewer is the broadcaster → `includeBroadcaster ? eligible : not_eligible`, source `broadcaster_self`, no API call (broadcaster-in-own-subscription-list is UNVERIFIED, research round 2 §1, so it is never asked).
   2. otherwise eligible if **any** of: subscription matches the definition (active; gifted only if `countGiftedSubs`); `includeModerators` and moderator; `includeVips` and VIP.
   3. Short-circuit: once one known source makes the viewer eligible, other unknown lookups do not matter. `not_eligible` needs **every** required lookup to be known; any required lookup unknown → `unknown` with that reason.
3. Audience flags are **additive** (they add eligibility, they do not remove it). A moderator who is a subscriber is eligible under the default (mods off).

**OD-1 (owner decision needed):** owner decision 1 says moderators/VIPs default to "not eligible". Additive reading (recommended): a mod/VIP who also subscribes is still refunded as a subscriber; no extra scope is needed by default. Exclusive reading: mods/VIPs are refused even when subscribed; that makes `moderation:read`/`channel:read:vips` **required** for the default configuration and adds a lookup to every decision. Recommendation: additive. Until the owner answers, development of slice 2 must not start.

## 2. Sequence diagrams (text)

Notation: `TX{…}` = one database transaction; `→W` = picked up later by the eligibility worker.

### 2.1 Policy-driven triggers (removed while called, viewer leaves while called, no-show)

```
Panel/chat/timeout ─► queue-service.transition(entry, to)
  decideEntryTransition()  ── switch off ─► no_operation (rule not consulted, no decision row)
                           ── switch on  ─► request_cancel
  TX{ entry update; audit entry.transitioned;
      evaluate(rule, viewer):
        resolved eligible      → decision row (system, refund_requested) + redemption.cancel
        resolved not_eligible  → keep_unfulfilled: decision row awaiting_streamer
                                 auto_fulfill:     decision row fulfill_requested + redemption.fulfill
        needs_lookup           → decision row pending_check (reason check_pending, D1) + eligibility check task }
  →W worker (2.5) completes the row
```

### 2.2 Remove waiting entry (panel remove, viewer `!leave` from waiting) — currently always refunds

Same as 2.1, but there is no per-trigger switch: `shouldRequestCancellation()` keeps returning true for `waiting → removed` ("when" = always), and the rule now decides "whether". Trigger code `removed_waiting`.

### 2.3 Queue clear — currently always refunds (`queue_cleared`)

```
Chat !fila limpar / panel clear ─► clear-confirmation.prepare()
  preview counts: total entries, redemption entries;
     rule everyone → "N will be refunded (requested)"; nobody → "no refunds";
     subscribers → "refunds follow the rule; N will be checked"   (no promised count, AC 12)
  confirm ─► TX{ for each active entry: transition removed(queue_cleared); evaluate();
                 everyone/nobody/broadcaster rows resolved now; others pending_check;
                 all rows share check_batch_id; audit queue.cleared {counts by outcome} }
  →W worker claims pending rows of check_batch_id in chunks of ≤ 100 distinct user ids
     ─► provider.lookupSubscriptions(chunk)  [+ moderators/vips chunks if flags on]
     ok      → TX{ complete rows; create intents per eligible / auto_fulfill row }
     429     → whole chunk retry at Ratelimit-Reset (+ jitter); rows stay pending_check
     other   → rows unknown with reason; retryable or awaiting streamer (section 3)
  Panel shows batch counts: eligible (requested), not eligible, pending check.
```

### 2.4 Queue delete — currently always refunds (`queue_deleted`)

```
Panel delete ─► requestQueueDeletion()
  TX{ entries removed(queue_deleted); evaluate(); decision rows as in 2.3 (shared check_batch_id) }
  Deletion gating (existing) additionally waits while the queue has rows in
     pending_check or awaiting_streamer, or any unresolved financial intent.
  Only then reward.delete (channel_points) — because deleting the reward turns every
     UNFULFILLED redemption FULFILLED (F4) and would silently destroy a possible refund.
  Converted manual_only path (local deletion, reward preserved): same gating, same rule.
```

The panel must offer the streamer a way out of a blocked delete: resolve with bulk "mark served" or per-item "return points" (section 2.6).

### 2.5 Eligibility check worker

```
loop: claim ≤ batchMax pending checks of ONE queue (lease)       (one broadcaster token, one rule snapshot per row)
  skip rows already resolved (version check)
  provider.lookup*(ids)          ← outside any transaction, timeout configurable
  evaluate(rule_snapshot of each row, statuses)   ← snapshot from the row, never the live queue rule
  TX{ guarded UPDATE … WHERE resolution='pending_check' AND version=$v;
      check_attempts+1; status_checked_at=answer time;
      eligible → createCancellationIntent (financial:{id}, ON CONFLICT no-op)
      not_eligible → awaiting_streamer | fulfill intent
      unknown → pending_check with reason; next_attempt_at or stop }
```

### 2.6 Manual override and bulk "mark served"

```
Panel (streamer or moderator) ─► POST override {redemptionId, action: refund|mark_served, reason, version}
  TX{ SELECT redemption FOR UPDATE; guarded UPDATE (data-model 2.4: resolution in
      (pending_check, awaiting_streamer), remote_status UNFULFILLED, expected_status NULL,
      no financial:{id} row, version match);
      1 row → intent (cancel or fulfill) + audit refund.override_applied
      0 rows → audit refund.override_rejected {code} ; return localized reason }
Bulk ─► POST mark-served {resolutionBatchId, redemptionIds[≤ bulkMax] | queueId filter, reason}
  processed_operations key refund.mark_served:{batchId} → replay returns stored result
  per row: same guarded UPDATE; resolved rows skipped and counted
```

An override on a `pending_check` row also cancels its pending check task (the worker's guarded update then finds 0 rows and drops its answer).

## 3. Unknown handling, retries, token/scope and non-affiliate

| Reason code | Source | Retry | Panel meaning |
|---|---|---|---|
| `check_pending` (D1) | queued, not yet run | worker runs it | "Checking subscriber status…" (no action asked) |
| `rate_limited` | 429 | automatic at `Ratelimit-Reset` + jitter, not counted against `maxAttempts` more than once per reset | still "checking" |
| `server_error`, `timeout`, `lookup_error` | 5xx, network, timeout | exponential backoff with jitter, up to `maxAttempts` (default 5) and `maxAgeMinutes` (default 60) | after exhaustion: "Could not check — decide" |
| `scope_missing` | adapter pre-check of granted scopes | **no** automatic retry; re-armed automatically when a re-consent grants the scope | "Reconnect Twitch to allow subscriber checks" + decide now |
| `unauthorized` | 401 after Twurple refresh | no retry; existing `authorization_required` health signal | "Reconnect Twitch" |
| `forbidden` | 403 | no retry | "Twitch refused the check — decide" |
| `channel_ineligible` | eligibility says not affiliate/partner | no retry | decide (should be rare, see below) |
| `malformed_response` | shape validation failed | one retry, then stop | "Could not check — decide" |

- Unknown never becomes `request_cancel` or `no_operation` (AC 7/14): there is simply no financial row until a known result or a human action.
- **Re-consent flow.** Add `channel:read:subscriptions`, `moderation:read`, `channel:read:vips` to `optionalScopes` in `oauth.mjs` (VERIFIED allow-list exists, F13) and generalize the scope-only re-consent in `integration.mjs` from the single follower scope to a requested set. The panel requests only the scopes needed by the configured rules (subscriptions for any `subscribers` queue; moderators/VIPs only if a queue enables those flags), keeping consent minimal. After callback, `missingScopes` is recomputed; if newly granted, the recorder re-arms `scope_missing` rows (new check round). Token refresh never adds scopes (F9, PARTIAL), so the only path is re-authorization.
- Saving a queue with `subscribers` while the scope is missing is **allowed** (the story keeps the option usable) but the form shows the warning and the reconnect action (UX gate).
- **Non-affiliate/non-partner:** no custom-reward redemptions exist, so the option is hidden in the same place manual-only queues hide it, using the existing `getChannelEligibility()` result. If a channel loses affiliate status later, updates fail with 403 (F3) and the existing outbox failure handling applies; the lookup maps to `channel_ineligible`.
- Logs: reason codes, counts and batch ids only. No user ids, logins, gifter fields, tier lists per user, override text or tokens.

## 4. Batching constants and 429

Configuration (runtime config with validated bounds; never trust a value above the verified maximum):

| Constant | Default | Allowed | Basis |
|---|---|---|---|
| `refundEligibility.subscriptionLookupBatchMax` | 100 | 1–100 | F1 VERIFIED |
| `refundEligibility.moderatorLookupBatchMax` | 100 | 1–100 | F5 VERIFIED |
| `refundEligibility.vipLookupBatchMax` | 100 | 1–100 | F5 VERIFIED |
| `refundEligibility.lookupTimeoutMs` | 5000 | 1000–15000 | design |
| `refundEligibility.maxAttempts` / `maxAgeMinutes` | 5 / 60 | 1–20 / 5–1440 | design |
| `financial.redemptionUpdateBatchMax` | **1** in MVP | 1–50 | F3 VERIFIED max 50 |
| `refundOverride.bulkMax` | 100 | 1–500 | UX/DB load, design |

- Twurple does not chunk (F10), so chunking is our responsibility and must be unit-tested at 99/100/101/230 ids.
- **429:** classify by HTTP status only (F6), compute `retryAt` from `Ratelimit-Reset` (epoch seconds), set the whole chunk's `next_attempt_at`, and pause the eligibility worker until then (one shared bucket per client+user, so other workers will also hit it). Message text is logged only as a bounded diagnostic code. Verify F11 during dev and make sure Twurple's internal retry does not double-wait.
- **Grouped Update Redemption Status (≤ 50 ids, one reward):** kept as a configurable option defaulting to 1 in MVP. Reason: FND-3 worker semantics (read status, then update, per task) are tested and stable; grouping changes failure attribution (a 404 for the group says "not found or not UNFULFILLED" without naming which id, F3) and therefore needs per-id re-read. Trade-off: a 230-entry clear costs ≈ 460 requests (read + update) instead of ≈ 240; with an UNVERIFIED budget (F7) this may spread over minutes, which the retry model already tolerates. Grouping is a follow-up increment if real channels show it matters.

## 5. Minimum tier and non-eligible default

- **Minimum tier: OUT of MVP (confirmed, Q6).** Tier is stored on every decision, so a later `refund_min_subscriber_tier` needs no backfill. Prime is indistinguishable from tier 1 (F2), so a "Tier 2+" option would surprise Prime viewers anyway. "Exclude gifted" stays MVP (`refund_count_gifted_subs`).
- **`refund_non_eligible_handling` default: `keep_unfulfilled` (confirmed).** It is the only reversible choice: F3 makes FULFILLED final, and owner decision 4 requires a manual refund to stay possible "at any time". With the default rule `everyone` the value is inert, so existing queues do not change. Costs accepted: pending items stay in the streamer's Twitch request list (cap/expiry UNVERIFIED, F8) and block queue deletion until resolved (section 2.4); mitigated by bulk "mark served". `auto_fulfill` stays an explicit opt-in with a warning that refunds become impossible.
- Converted `manual_only` queues use the same stored rule and handling value (Q3 confirmed); the panel shows them read-only.

## 6. Complexity (spec-pipeline, 1–5 each)

| Dimension | Score | Why |
|---|---|---|
| Scope | 4 | domain, repository (6 refund paths), new worker, adapter, OAuth, routes, panel form, panel lists, chat copy, migration |
| Integration | 3 | three new Helix endpoints, optional scopes and re-consent, rate-limit behavior |
| Infrastructure | 2 | one migration, one new worker in the existing loop, config keys |
| Knowledge | 3 | team knows FND-3/FND-9; new async-decision state and Twitch status semantics |
| Risk | 4 | money-like effect (channel points), irreversible FULFILLED, behavior change in forced refund paths |
| **Total** | **16** | **COMPLEX** (≥ 16): six phases plus a revision cycle |

Recommended slices (same story, separate commits/PR checkpoints; or child stories if `@po` prefers):
1. **Slice 1:** migration, pure evaluator, recorder, `everyone`/`nobody`, forced paths routed through the rule, golden tests proving `everyone` output is unchanged.
2. **Slice 2:** provider port, Twitch adapter, eligibility worker, batching, 429, optional scopes and re-consent, `subscribers` rule with audiences.
3. **Slice 3:** override and bulk "mark served", panel lists/counts, clear/delete gating, chat and panel copy (after UX ≥ 9.0).

## 7. Interactions

- **OPS-14 chat wording (#65):** `chat.queue.clear_confirm` and `clear_done` (VERIFIED they print `{refunds}`) and `exit_pending`/`remove_pending` (VERIFIED they say "A refund was requested") become rule-aware: `everyone` keeps today's text; `nobody` says no refund; `subscribers` says the refund follows the channel rule and is being checked. **Privacy:** chat must never announce that a named viewer is or is not a subscriber; per-viewer results are panel-only. Final strings belong to the OPS-14/UX review, in en, es and pt-BR, keeping catalog keys consistent.
- **OPS-15 settings form:** `queue-settings-form.jsx`/`queue-settings.mjs` gain the rule, audience toggles, gifted toggle and non-eligible handling, hidden for manual-only and non-affiliate, read-only for converted queues; scope warning plus reconnect action. Implementation waits for OPS-15 migration end (story dependency).
- **Per-trigger switches:** unchanged and still the "when". Precedence: switch off → no decision row at all; switch on (or forced trigger) → rule decides. `external` observations still request nothing. `request_fulfill` (served) never consults the rule.

## 8. Answers to data-engineer questions and data-model deltas

- **Q1 — confirmed:** the pending marker lives in `refund_eligibility_decisions`, not in a financial outbox status. Nuance: the *lookup work* uses a separate, non-financial check task (Q4), so no financial row exists while unknown.
- **Q2 — never in MVP.** An override cannot reverse an existing `refund_requested`/`fulfill_requested`; cancelling an outbox task races its lease and may already be in flight at Twitch. Reject with `already_has_financial_intent` and audit.
- **Q3 — confirmed:** default `keep_unfulfilled`; converted `manual_only` queues use the same setting.
- **Q4 — worker, not panel-only:** an outbox operation `refund.eligibility_check`, key `eligibility:{redemption_id}:{round}` (round increments only on re-arm after re-consent or a manual "check again"), processed by the eligibility worker with lease/retry; the panel only re-arms. It is excluded from financial counts and from the financial worker's `claimNext`.
- **Q5 — application plus tests**, consistent with the project's no-trigger style; add the immutability test for `decision`/`rule_snapshot` (except `unknown` → known).
- **Q6 — confirmed:** minimum tier out of MVP.

Deltas for `@data-engineer` (small, no new table):
- **D1:** add `check_pending` to `unknown_reason` (initial queued state, keeps `decision_unknown_reason_check` true); `check_attempts` increments per executed attempt.
- **D2:** add `next_check_at TIMESTAMPTZ(3) NULL` (or rely on the check task's `next_attempt_at`; data-engineer chooses) for panel "checking until" display.
- **D3:** register the operation type `refund.eligibility_check` in the outbox domain check (if one exists) and keep it out of `unresolvedFinancialStatuses` counters; deletion gating counts decision rows instead.

## 9. Risks and assumptions

| # | Risk / assumption | Label | Mitigation |
|---|---|---|---|
| R1 | Async check means the chat cannot confirm a refund under `subscribers`. | design | rule-aware copy; panel counts |
| R2 | Pending UNFULFILLED items accumulate; possible Twitch cap/expiry. | UNVERIFIED (F8) | age index, panel list, bulk mark served; test channel check by `@qa` |
| R3 | Queue delete blocked by pending items surprises the streamer. | design | explicit panel message and resolution actions |
| R4 | Twurple internal 429 handling interferes with our backoff. | UNVERIFIED (F11) | read source in dev; fakes at the port |
| R5 | OD-1 misread (additive vs exclusive). | owner decision | block slice 2 until answered |
| R6 | Re-consent gap for connected streamers. | VERIFIED behavior (F9 partial) | `scope_missing` + automatic re-arm |
| R7 | Rule changed between trigger and check. | design | evaluator uses the row's `rule_snapshot`, never the live rule |
| R8 | Lookup reveals a viewer's sub status in logs. | security | codes only; log tests (data-model test 16) |
| A1 | One reward per queue, one broadcaster token. | VERIFIED (schema) | — |
| A2 | Panel can tell streamer vs moderator actor. | UNVERIFIED | if not, `resolved_by` uses `streamer` only until roles exist |

Security: no new inbound surface except two panel endpoints (override, bulk) behind the existing panel session and CSRF/same-origin protections; bounded reason text; optimistic locking against double clicks; no gifter identity stored.

## 10. Files likely touched (estimate)

- `apps/api/src/domain/entry-transitions.mjs` (remove `queueRemovalOverridesRefundPolicy` forcing; expose trigger code)
- `apps/api/src/domain/refund-eligibility.mjs` (new, pure)
- `apps/api/src/domain/queue-service.mjs`, `apps/api/src/domain/clear-confirmation.mjs`
- `apps/api/src/persistence/queue-repository.mjs` (all refund paths, recorder, guarded writes, deletion gating)
- `apps/api/src/outbox/eligibility-worker.mjs` (new), `apps/api/src/outbox/loop.mjs`, `apps/api/src/runtime.mjs`, `apps/api/src/runtime-config.mjs`
- `apps/api/src/twitch/helix-adapter.mjs`, `oauth.mjs`, `integration.mjs`, `auth-runtime.mjs`
- `apps/api/src/http/queue-routes.mjs` (settings DTO, override, bulk, counts)
- `apps/api/prisma/schema.prisma` + new migration (owned by `@data-engineer`)
- `apps/frontend/features/queues/queue-settings-form.jsx`, `queue-settings.mjs`, `queue-clear.mjs`, `queue-entry-actions.mjs`, `queue-list.jsx`, new pending-refunds view
- `apps/web/localization/catalogs/{chat,panel}/{en,es,pt-BR}.tsv`
- tests: unit (evaluator matrix, chunking, adapter mapping), PostgreSQL integration (data-model §7 plus worker), fakes

## Sources (accessed 2026-10-21)

- Twitch API reference (Get Broadcaster Subscriptions, Update Redemption Status, Delete Custom Reward, Get Moderators, Get VIPs): https://dev.twitch.tv/docs/api/reference/ — quotes in research round 2.
- Rate limits: https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits
- Refresh tokens: https://dev.twitch.tv/docs/authentication/refresh-tokens/
- Twurple `HelixSubscriptionApi`: https://twurple.js.org/reference/api/classes/HelixSubscriptionApi.html (page does not state limits or chunking; confirmed in installed source 8.2.0).
- Community (supplementary, not verified): https://discuss.dev.twitch.com/t/pub-sub-with-fully-server-side-authentification/24808 (refresh tokens without published expiry).

Limitations: no live Twitch test; Prime, broadcaster-in-list, pending-queue expiry and Twurple 429 internals remain to be confirmed by `@qa`/`@dev` on a test channel and in source.
