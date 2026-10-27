# OPS-22 — Architecture decisions (`@architect`)

[Português (pt-BR)](../../pt-BR/stories/OPS-22/architecture-decisions.md)

**Author:** `@architect` (Aria), 2026-10-27. **Status:** COMPLETE (closes the `@architect` planning gate of the story: wait values, state names, cancel-at-deletion rule, interplay with OPS-21/OPS-20).
**Evidence class:** read-only code reading of the branch `feat/ops-15-next-panel` and of installed `node_modules` (`@twurple/*` 8.2.0). No test, server, container, database, GitHub or Twitch call was run. Everything below about live Twitch is labeled as such and stays UNVERIFIED until AC 19 (OW-16).
**Inputs:** [story.md](story.md), [redemption-sync-research.md](../OPS-15/redemption-sync-research.md) (SUFFICIENT, golden rule respected: no new research), [panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md) section 5, [typescript-migration-research.md](../OPS-15/typescript-migration-research.md).
**Not decided here:** DDL/persistence (owned by `@data-engineer`, see `data-review.md`), visible text (owner/`@po` UX decision), refund eligibility (OPS-20).

## 0. Findings in code that shape the decisions (VERIFIED by reading)

| # | Finding | Where | Effect |
|---|---|---|---|
| F1 | `redemptionStatus()` reads `isFulfilled`, `isCanceled`, then `value.status`; the Twurple class has no `status` getter, so `UNFULFILLED` → `UNKNOWN` | `apps/api/src/twitch/helix-adapter.mjs:15-19, 138-142, 147, 163` | D-5 root cause (research TL;DR) |
| F2 | Financial worker checks only `error.status`; Twurple `HttpStatusCodeError` exposes `statusCode` | `financial-worker.mjs:12, 24, 55-62, 100-113, 139-145`; `node_modules/@twurple/api-call/lib/errors/HttpStatusCodeError.js:21` | real 401/403/404 are treated as transient |
| F3 | Three different status readers exist: worker (`status` only), reward worker (`status ?? statusCode`, `reward-worker.mjs:5-8`, and `.status` only at `:316`), eligibility (`statusCode ?? status`, `helix-adapter.mjs:123`) | as listed | must become one function |
| F4 | `claimNext` claims only `pending`/`retry` or an expired lease; `unknown` is terminal | `queue-repository.mjs:2123-2144` | no retry today |
| F5 | Existing backoff: `1000·2^min(attempts,12)`, jitter ×(0.5..1.5), cap 1 h; `attempts` is incremented at claim | `financial-worker.mjs:3, 11-17`; `queue-repository.mjs:2136` | 6 attempts would end in ~1 min; too short |
| F6 | `retryAfterSeconds` is read on 429, but Twurple's `HttpStatusCodeError` has no such field; Twurple already waits internally on `Ratelimit-Reset` (not `Retry-After`) and only surfaces a 429 when it gives up | `financial-worker.mjs:12`; `node_modules/@twurple/api/lib/utils/HelixRateLimiter.js:8-13` | 429 policy must not depend on a field that never exists |
| F7 | Reconciliation's 404 branch calls `markRedemptionUnknown`, which moves `pending`/`retry`/`processing` outbox tasks to `unknown` without a lease guard | `reconciliation.mjs:137, 172`; `queue-repository.mjs:1407-1408` | races with the worker and would kill the retry budget |
| F8 | `getQueueDeletionBlockers` counts anything not `pending/retry/processing` as `blocked`, and the reward worker turns that into `unknown('queue_deletion_financial_conflict')` (terminal) | `queue-repository.mjs:1728-1739`; `reward-worker.mjs:288-301` | D-6-side freeze: deletion never resumes |
| F9 | `prepareRewardDelete`/`completeQueueDeletion` require every financial task `confirmed` and no local `UNFULFILLED`; `resolve-unknown` sets `resolved_manual`/`operator_resolved` and keeps `remoteStatus` | `queue-repository.mjs:1741-1780, 2247-2276` | a manual resolution can never unblock deletion today (AC 14 impossible as is) |
| F10 | `retryOutboxManually` sets `pending` but keeps `attempts` | `queue-repository.mjs:2224-2231` | after a cap is added, a manual retry would exhaust after one try |
| F11 | Positive external observation (EventSub update or reconciliation read FULFILLED/CANCELED) already confirms or conflicts the task from `pending/retry/processing/unknown/resolved_manual` | `queue-repository.mjs:2319-2347` | a passive positive read path already exists and is reused |
| F12 | `degraded` is published with `issues` in the status object only; no log line | `integration.mjs:93-110` (`:102`, `:106`) | D-6 not diagnosable |
| F13 | The deletion order pause → list → cancel per redemption → wait → re-list → prepare → delete already exists | `queue-repository.mjs:824-834`; `reward-worker.mjs:254-320`; `:1679-1726` | slice 3 is a repair of blocking/resume semantics, not a rewrite |
| F14 | `getRawData` (`@twurple/common`) and `HttpStatusCodeError` (`@twurple/api-call`) are not re-exported by `@twurple/api`; both packages are only transitive (8.2.0) | `node_modules/@twurple/api/lib/index.d.ts:149-150`; `package.json:59-61` | a direct pinned dependency is required |

## 1. Retry policy (FT-25)

**Decision.** One shared, pure policy module (constants exported for tests; no environment variable, these are owner-decided values):

| Parameter | Value |
|---|---|
| `MAX_ATTEMPTS` | **6 in total**, the first try included (story open question 2: yes) |
| Wait after attempt *n* (n = 1..5) | `min(cap, base · factor^(n-1))` |
| `base` / `factor` / `cap` | **60 s / 4 / 60 min** (cap kept equal to the existing 1 h, `financial-worker.mjs:3`) |
| Jitter | multiplicative **×(0.8..1.2)** (±20 %), from the injected `random` |
| Counter | the existing `outbox.attempts`, incremented atomically at claim (`queue-repository.mjs:2136`); a lease-expiry reclaim also counts (a crash consumes one attempt, accepted and documented) |

Nominal schedule: attempt 1 at t=0; waits 1, 4, 16, 60, 60 min; attempt 6 at about **2 h 21 min** (range ~1 h 53 min – 2 h 49 min with jitter). This covers a typical live session and a multi-minute Helix incident while ending with a human decision on the same day.

**Classification (one function, `classifyTwitchFailure(error)`, see section 4):**

| Outcome of an attempt | Class | Consumes budget | Next state |
|---|---|---|---|
| Read returns `expected` | conclusive | — | `confirmed` |
| Read returns the opposite terminal status | conclusive | — | `conflict` (unchanged path) |
| Read returns `UNFULFILLED` | conclusive | — | write (`setRedemptionStatus`), then the post-write read below |
| Read returns `UNKNOWN` (unrecognized status) | non-conclusive | yes | `retry` (`remote_status_unrecognized`) |
| 5xx, network error, timeout | transient | yes | `retry` (`remote_lookup_failed` / `remote_operation_failed`) |
| 429 that escapes Twurple | transient | yes | `retry`, wait = `max(schedule, retryAfterMs)` only if the adapter supplies `retryAfterMs`; never assume the field exists (F6) |
| 404 on the **read** | non-conclusive | yes | `retry` (`remote_redemption_not_found`): the cause is ambiguous (consistency delay UNVERIFIED, expired history, wrong `reward_id`); reading is harmless, so it gets the same bounded budget instead of the immediate terminal `unknown` of today (`financial-worker.mjs:59-61`) |
| 404 on the **write** | expected | — | re-read (Update Redemption Status answers 404 when not `UNFULFILLED`; research Q1) |
| 401 | auth | **no** | `unknown` + `authorization_required` (existing code), re-armed to `retry` automatically after a successful re-authorization (AC 16); never counted |
| 403 | permanent | — | `failed` (`remote_lookup_forbidden`): Client-ID mismatch or ineligible channel will not heal by waiting |
| 400 / other 4xx | permanent | — | `failed` (existing `isPermanentHttpFailure` semantics, read through `statusCode ?? status`) |

**On the 6th non-conclusive attempt** the worker does not call `retry`; it calls `unknown(task, 'retry_exhausted')`. There is **no new outbox status value**: `unknown` already is terminal, already reviewable (`queue-repository.mjs:12`), already accepted by `resolve-unknown` and already rendered by Operations. The difference between "still trying" and "needs review" is carried by the status pair:

- `retry` + reason class `remote_unconfirmed` → health **`degraded`**;
- `unknown` (any reason) / `conflict` / `failed` → health **`needs_review`** (architect review 5.5; AC 8).

Every `retry` and `unknown` call keeps the lease guard (`status='processing' AND leaseToken`), so a late worker can never overwrite a newer decision.

**Manual "retry now" grants a fresh budget of 6.** Because `attempts` is cumulative (F10), the budget must be relative: the persistence choice (reset `attempts` to 0 with the previous value in the audit `safeDetail`, or store a budget base in `payload`) is `@data-engineer`'s (AC 12). Architect preference: reset to 0 plus audit event `financial.operation_retried_manually { previousAttempts }`, because it needs no migration and keeps the claim query unchanged.

**Discarded alternatives.**
- Reuse the existing formula unchanged (2, 4, 8, 16, 32 s): six attempts end in about one minute; one Helix incident would exhaust the budget. Rejected.
- 8 attempts / 24 h (previous architect proposal): overruled by the owner (6, then manual).
- Open-ended periodic re-check (every 15 min): explicitly out of scope by the owner.
- A new status `needs_review` in the outbox: touches every status list (`queue-repository.mjs:10, 12, 322, 433, 1293, 2226, 2250, 2341`), the Operations projection and possibly a constraint, for no added safety. Rejected; kept only as a health/projection value.
- Counting 401 against the budget: a revoked token would burn the six attempts while nothing about the redemption is learned. Rejected.

## 2. State names and transitions (FT-25, FT-26)

### 2.1 Financial operation (`outbox`, `operationType ∈ {redemption.cancel, redemption.fulfill}`)

Existing values only; new values appear only in `lastError` (enumerated, ≤ 64 chars) and in projections.

```text
            claim (attempts+1)
pending ───────────────► processing ──read=expected──────────────────► confirmed
   ▲                      │  │  │  └─read=UNFULFILLED → write → read ─┘ (or conflict)
   │                      │  │  └─read=opposite────────────────────► conflict      (needs_review)
   │                      │  └─403/400──────────────────────────────► failed        (needs_review)
   │                      ├─non-conclusive, attempts<6─► retry ──(nextAttemptAt)──► processing
   │                      ├─non-conclusive, attempts=6─► unknown[retry_exhausted]  (needs_review)
   │                      └─401───────────────────────► unknown[authorization_required]
   │                                                         │ re-authorization succeeds → retry (no budget used)
   │  operator "retry now" (fresh budget)                    │
   └──────────────── unknown | conflict | failed ◄───────────┘
unknown ─operator "I verified on Twitch" (audited, remoteConfirmed:false)─► resolved_manual
unknown | resolved_manual ─positive external read (EventSub/reconciliation, F11)─► confirmed | conflict
```

`unknownSince`: the timestamp of the first transition into `unknown` for this budget. Projection field; where it is stored is `@data-engineer`'s decision (AC 12). The audit event `financial.operation_needs_review` (safeDetail: `operationType`, `attempts`, `reasonClass`) is written on that transition and is a valid source.

Redemption `syncStatus` is unchanged in meaning: `pending` → `confirmed` | `conflict` | `unknown` | `operator_resolved`. **Rule:** `remoteStatus` is only ever written from a remote read (event or Helix); manual resolution never writes it.

### 2.2 Queue deletion (`queue.lifecycleStatus` + `remoteSyncStatus`, existing columns)

```text
active ─delete requested─► deleting/pending_close ─pause confirmed─► deleting/delete_pending
deleting/delete_pending ─reward.delete settles financials, re-list = 0, DELETE ok or 404─► deleted/deleted
deleting/* ─stays─ while blockers exist (no terminal state for the queue itself)
```

No new queue column or value. The API derives a **deletion projection** for the panel and FT-23:

| `deletionState` | Rule (all derived) | Extra fields |
|---|---|---|
| `deleted` | `lifecycleStatus='deleted'` | — |
| `pending` | `deleting` and no blocker in review; work is progressing (pause, cancels in `pending/retry/processing`, `reward.delete` in `pending/retry/processing`) | `openOperations` (count) |
| `blocked` | `deleting` and at least one of: a financial task of the queue in `unknown/conflict/failed`; `reward.delete` or the pause task in `unknown/failed`; auth required | `blockingOperations` (count), `blockReason ∈ {financial_review_required, authorization_required, reward_state_unverified, remote_delete_rejected}` |

`reward.delete` itself is **no longer moved to `unknown` because of financial blockers** (F8): nothing was sent to Twitch, so its outcome is not unknown. It goes to `retry` with `lastError='queue_deletion_blocked_by_review'` (see 5.2). Its own `unknown` is reserved for a real uncertain remote outcome (`queue_delete_result_unknown`, `queue_delete_reward_diverged*`).

**What the UI may expose without new unreviewed text:** the enumerated codes above, the counts, and the existing Operations list with its existing state labels and the two existing actions (`retry`, `resolve-unknown`). Any new sentence (for example "deletion blocked: N operations need review") or new status chip label is visible text and waits for the owner/`@po` UX decision recorded in the story (UX note). The API contract is designed so that the panel needs no free-text from the server.

**Discarded:** a `delete_blocked` value in `remoteSyncStatus` (would need every writer of `remoteSyncStatus` to keep it consistent; derivation is cheaper and cannot drift); "cancel deletion" as a third operator action (left out by `@po`, story open question 1; the existing `beginQueueDeletionCancellation` at `queue-repository.mjs:838-865` is untouched).

## 3. Read-only re-verification (FT-25)

**Decision: the re-verification lives in the financial worker's own retry cycle, not in a new loop and not in the reconciler.** Every attempt already starts with a read (`financial-worker.mjs:52-53`); with section 1, a non-conclusive read schedules the next attempt instead of ending the task. That *is* the bounded, read-only re-verification the owner asked for (6 reads with growing waits).

- **Write only after a positive `UNFULFILLED` read in the same attempt** (existing read-before-write, `financial-worker.mjs:76-92`). Re-verification never writes on `UNKNOWN`/error.
- **Within the budget the task is in `retry`, never `unknown`**, so there is nothing to "re-enqueue": `claimNext` picks it at `nextAttemptAt`. When the read shows `UNFULFILLED`, the normal flow writes (AC 6).
- **Terminal `unknown` is not re-enqueued automatically.** Only (a) the operator's "retry now" (fresh budget), (b) a successful re-authorization for `authorization_required`, or (c) a positive external read (F11) move it. (c) is passive: the reconciler (every 5 min, `integration.mjs:168`, single-flight at `:93-95`) and EventSub can *confirm* or *conflict* it, never re-arm it. This respects "no open-ended loop" while still letting a real positive read close the case.
- **Race avoidance.**
  1. The worker owns the outbox status of financial tasks; all its writes are lease-guarded (`queue-repository.mjs:2165-2191`).
  2. **`markRedemptionUnknown` must stop touching outbox rows** (F7): it may mark `redemption.syncStatus='unknown'` (diagnostic) but must not move `pending/retry/processing` tasks; with the shared classifier, a real 404 in reconciliation is just a diagnostic issue `redemption_history_unavailable`.
  3. The external confirmation path (F11) updates a `processing` row without the lease token; that is safe because it only writes a *positive* outcome and the worker's later `confirm/retry/unknown` fails its guard (returns 0 rows) — the worker must treat a 0-row update as `lease_lost`, not as an error. `@qa` proves this on PostgreSQL.
- **Health:** the projection counts `retry` with reason class `remote_unconfirmed` → `degraded`; terminal ones → `needs_review` (section 1).

**Discarded:** re-arming `unknown` tasks from the reconciler every 5 min (that is the open-ended loop the owner removed, and two writers of one row); a dedicated re-verification loop (a second scheduler with the same lease problem, no gain over `nextAttemptAt`).

## 4. Adapter redemption mapping (D-5 fix, FT-24)

### 4.1 Contract

```text
getRedemptionStatus(redemptionId, rewardId): Promise<'UNFULFILLED'|'FULFILLED'|'CANCELED'|'UNKNOWN'>
  throws a Twurple HttpStatusCodeError (statusCode) or an adapter error { status, code }
```

`redemptionStatus(value)` order:
1. If `value` is a Twurple data object (`value instanceof HelixCustomRewardRedemption`): `normalizeRedemptionStatus(getRawData(value).status)` — the raw Helix `status` is authoritative.
2. Consistency guard: if the raw status disagrees with the booleans (`FULFILLED` but `isFulfilled===false`, or `CANCELED` but `isCanceled===false`), return `UNKNOWN` (never a confirmation on contradictory data, AC 3).
3. Otherwise (plain objects from older fakes or EventSub-shaped input): keep the current booleans → `status` fallback so existing tests stay green.

Same function for `setRedemptionStatus` result (`helix-adapter.mjs:147`) and `listUnfulfilledRedemptions` (`:163`), which fixes the reconciliation import (AC 2).

**Dependency:** `getRawData` comes from `@twurple/common`, which today is only transitive (F14). Add `@twurple/common` as a direct runtime dependency and `@twurple/api-call` as a devDependency (tests build real `HttpStatusCodeError`), both pinned to **8.2.0** in lockstep with `@twurple/api`. Lockfile change goes through the normal `@dev` → `@qa` → `@devops` path.

**Discarded:** inferring `UNFULFILLED` from "both booleans false" (any future/unknown raw value would also become `UNFULFILLED` and trigger a write — weaker than AC 3); reading `value[rawDataSymbol]` directly (same dependency, less explicit); calling Helix via raw `fetch` to get JSON (loses Twurple auth/rate limiting).

### 4.2 Error normalization (AC 4)

One module (proposed `apps/api/src/twitch/twitch-errors.mjs`), used by the financial worker, the reward worker, the reconciler and `getChannelEligibility`:

```text
httpStatusOf(error)    = integer error.statusCode ?? integer error.status ?? undefined
classifyTwitchFailure(error) → { kind: 'auth'|'forbidden'|'not_found'|'rate_limited'|'transient'|'rejected',
                                 httpStatus, retryAfterMs? }
  401→auth, 403→forbidden, 404→not_found, 429→rate_limited, 5xx/no status→transient, other 4xx→rejected
```

The adapter's own synthetic error (`{ status: 404, code: 'REDEMPTION_NOT_FOUND' }`, `helix-adapter.mjs:140`) keeps working because `status` is the fallback. Existing tests that use `{ status }` keep passing. `reward-worker.mjs:316` (`lookupError?.status === 404`) is replaced by the shared function (a real Twurple 404 there currently becomes `unknown('queue_delete_result_unknown')` instead of "already gone").

### 4.3 Logs (AC 5, AC 10)

- Per financial attempt, through the existing JSON logger / `reportDiagnostic` path: `{ event: 'financial.attempt', operationType, outboxId, attempt, httpStatus, twitchErrorCode, nextAttemptAt, outcome }`. `twitchErrorCode` is **our** enumerated code (`error.code`, ≤ 64), never the Helix response body or message (Twurple puts URL and body in `error.message`, `HttpStatusCodeError.js:12`) — so `error.message` is never logged.
- Per reconciliation, in `integration.mjs` where `degraded` is published (`:102`, `:106`): `{ event: 'twitch.reconciliation', trigger, status, reason, queues, imported, issueCounts: { <code>: n } }`. Codes and counts only: no `queueId`, `redemptionId`, user id/login, input, token, header or URL.
- `@dev` adds a unit test asserting the exact key set of both lines (extra keys fail), plus the OpenGrep credential-logging rule via `npm run review:static`.

### 4.4 Contract test with real Twurple instances (AC 1-2, risk "test blindness")

- **One helper** (proposed `tests/helpers/twurple-real.js`) is the only place that calls Twurple constructors:
  - `realRedemption(raw)` → `new HelixCustomRewardRedemption(raw, stubClient)`; raw = Helix JSON (`id`, `broadcaster_id`, `reward: {id,…}`, `status`, `redeemed_at`, `user_*`, `user_input`).
  - `realHttpError(statusCode)` → `new HttpStatusCodeError(statusCode, text, url, method, body, true)`.
  - Both constructors are `@private` in Twurple (runtime `(data, client)`; the `.d.ts` only inherits `DataObject(data)`), so under OPS-24 the helper is the single cast point. A version bump of `@twurple/*` that breaks it fails one file, not the suite (also the research REFRESH trigger).
- Tests: the adapter maps `UNFULFILLED`/`FULFILLED`/`CANCELED` instances correctly (fails today for `UNFULFILLED`); a contradictory raw/boolean instance maps to `UNKNOWN`; `listUnfulfilledRedemptions` over a fake paginator yielding real instances; the classifier on real `HttpStatusCodeError` 401/403/404/429/500.
- Evidence class: unit with real library classes, no network. It does **not** prove live Helix (AC 19).

## 5. Deletion order and idempotency (FT-26)

### 5.1 Order and what each step writes (keeps F13, fixes F8/F9)

| Step | Action | Writes | Idempotency |
|---|---|---|---|
| 0 | Operator deletes | queue `deleting`, `isOpen=false`; entries `removed`; cancel intents for active entries; pause task or `reward.delete` task; audit `queue.deletion_requested` (`queue-repository.mjs:756-834`) | queue version + `withQueueTransaction`; OPS-21 idempotency key on the route (AC 18) |
| a | Pause the reward (`reward.set_open`, `deleteAfterConfirm`) and **verify by read** (`helix-adapter.mjs:75-95`) | `remoteSyncStatus: pending_close → delete_pending`; enqueue `reward.delete` (`:1662-1669`) | key `queue:{id}:reward.delete.pause:{version}` |
| b | `reward.delete` lists `UNFULFILLED` (paginated, now correctly mapped) and records **one `redemption.cancel` per open redemption** (`:1679-1726`) | redemption `expectedStatus=CANCELED`, outbox cancel task | key `financial:{redemptionId}` (unique); an existing `redemption.fulfill` is respected (served viewer stays fulfilled) |
| b' | Each cancel runs the financial worker (sections 1 and 3) and is **confirmed by a remote read** | outbox `confirmed`, redemption `CANCELED/confirmed` | lease + read-before-write |
| — | While any financial task of the queue is `pending/retry/processing` | `reward.delete` → `retry` (`queue_deletion_waiting_for_refunds`, 30 s, existing) | — |
| — | While any is `unknown/conflict/failed` | `reward.delete` → **`retry`** (`queue_deletion_blocked_by_review`, recheck every 5 min) instead of `unknown` | no budget for `reward.delete` |
| c | Re-list: zero `UNFULFILLED` on Twitch for the reward | nothing, or new cancel intents and back to waiting | — |
| d | `prepareRewardDelete` (`safeToDelete`, `requestMayHaveReachedTwitch`) then `deleteReward` | payload flags, then queue `deleted`, slug tombstone, keys removed, audit `queue.deletion_confirmed` | payload flags make a re-run after a crash safe |
| e | 404 on DELETE or on the read after an error (`statusCode`) | same as d ("already gone") | — |

**Automatic resume (AC 14):** in the same transaction where a financial task of a `deleting` queue becomes `confirmed`, `conflict→resolved` or `resolved_manual`, set that queue's `reward.delete` task (if `retry`) to `nextAttemptAt = now`. The 5-min recheck is only the safety net. A re-authorization re-arms both the financial `authorization_required` tasks and the queue's deletion tasks (AC 16).

### 5.2 Manual resolution and the final guard (fixes F9)

- `resolve-unknown` stays the only manual path (`queue-routes.mjs:274-279` → `queue-repository.mjs:2247-2276`): only from `unknown`; audit `financial.operation_resolved_manually` with `actorId`, timestamp, `remoteConfirmed:false`, enumerated `reason` (no free text: avoids personal data in the audit). It never writes `remoteStatus` and never `confirmed`.
- For deletion purposes, `resolved_manual` (task) + `operator_resolved` (redemption) count as **locally settled** in `getQueueDeletionBlockers`, `prepareRewardDelete` and `completeQueueDeletion` (today they block forever).
- **The Twitch re-list (step c) remains the final guard and overrides the manual decision:** if a manually resolved redemption is still listed `UNFULFILLED`, the reward is not deleted (Delete Custom Reward would turn it into `FULFILLED` and keep the points, research Q3); the cancel task is re-armed to `pending` with a fresh budget and audit `financial.manual_resolution_contradicted`. This is safe: a positive `UNFULFILLED` read is exactly the condition that allows a write.
- `@data-engineer` decides whether "locally settled" is expressed by status lists only (expected, no DDL).

### 5.3 Twitch refusing the reward deletion (PARTIAL)

Documented API: deletion is allowed and pending redemptions become `FULFILLED` (VERIFIED doc; research Q3). The owner saw the **dashboard** refuse (UI, not API; PARTIAL). Design for both:
- Normal case: step c guarantees zero `UNFULFILLED` before DELETE, so the documented auto-fulfill never applies. Residual window between re-list and DELETE is closed by the verified pause (`reward-worker.mjs:282`); a redemption cannot be created on a paused reward (Twitch doc behavior, accepted residual risk, recorded for AC 19).
- If DELETE returns a 4xx other than 401/404/429: re-read the reward and re-list; if `UNFULFILLED` reappeared → record cancels and go back to waiting; if none and the reward still exists → `reward.delete` `failed` with `queue_delete_rejected_by_twitch` → projection `blocked` / `remote_delete_rejected`; operator uses "retry now". No infinite loop.
- 401 → `blocked` / `authorization_required`, re-armed after re-authorization.

### 5.4 Cancel at deletion, OPS-21, OPS-20

- **Cancel (refund), not fulfill**, confirmed (AC 13, `@po` validated): matches the panel dialog promise and avoids charging viewers without service. An already existing `redemption.fulfill` (viewer was served) is kept (`queue-repository.mjs:1704-1708`).
- OPS-21: the delete route and the two Operations actions (`retry`, `resolve-unknown`) return enumerated `code` on non-2xx (today they return a sentence only, `queue-routes.mjs:271, 277`), start as `terminal_unknown` in the idempotency contract and are promoted only with PostgreSQL proof (AC 18).
- OPS-20: when refund eligibility ships, step b must ask the eligibility rule instead of always cancelling; the seam is `decideTransition(...).financialDecision` (`queue-repository.mjs:774-779`) and `recordQueueDeletionRedemptions`. No change now.

## 6. Slicing, dependencies, owners

Complexity confirmed: scope 4, integration 4, infrastructure 3, knowledge 3, risk 5 = **19 → COMPLEX**.

| Slice | Content | Write set | Depends on | DB |
|---|---|---|---|---|
| **FT-24** (#82) — first, P0-small | 4.1 mapping with `getRawData`; 4.2 shared classifier in worker, reward worker, reconciler, eligibility; 4.3 reconciliation log line; 4.4 helper and contract tests; direct `@twurple/common`/`@twurple/api-call` 8.2.0 | `helix-adapter.mjs`, new `twitch-errors.mjs`, `financial-worker.mjs` (status reads only), `reward-worker.mjs:5-8, 316`, `reconciliation.mjs`, `integration.mjs`, `package.json`/lockfile, tests | none | none |
| **FT-25** — P1 | Section 1 policy module; worker `retry` vs `unknown(retry_exhausted)`; per-attempt log; health `degraded`/`needs_review`; F7 fix; manual retry fresh budget; re-arm on re-auth | `financial-worker.mjs`, `queue-repository.mjs` (financial part), health projection, `integration.mjs` (re-auth hook) | FT-24; `@data-engineer` AC 12 | `@data-engineer` decides; expected none |
| **FT-26** — P1 | Section 5: blocked→`retry`, auto-resume, `resolved_manual` settlement + contradicted guard, 403/4xx refusal handling, deletion projection, OPS-21 codes | `reward-worker.mjs` (`processDeleteTask`), `queue-repository.mjs` (deletion part), `queue-routes.mjs`, API DTO | FT-25 (classification, `needs_review`, budget); OPS-21 contract; serialize with OPS-21 slices 4-5 (same repository file) | expected none |

- No two `@dev` agents on `queue-repository.mjs` / the workers in parallel (story write-set clash). FT-24 can start now (`@po` condition).
- FT-23 (navigation) consumes `deletionState` from FT-26; OPS-23 is independent.
- OPS-24 (TypeScript) starts after OPS-22; do not convert these files to `.ts` inside OPS-22 (no conversion mixed with behavior change).

**`@data-engineer` decides (AC 12):** storage of the budget base / manual-retry reset; `unknownSince` (payload vs audit-derived); reason class (`lastError` prefix vs payload); whether any status `CHECK` exists on `outbox.status`; whether the derived deletion projection needs an index (`outbox(entity_id, operation_type, status)` is a candidate); the `markRedemptionUnknown` change.

**`@qa` needs:**
- Unit (Vitest, fake timers, injected `random`): schedule values incl. jitter bounds; 6th attempt → `unknown(retry_exhausted)`; 401 not counted; 404 read retryable; log key sets.
- Contract: the real-instance helper (4.4), never plain objects, for adapter and classifier.
- Disposable PostgreSQL with real migrations (never SQLite/Prisma mocks, never the active volume): attempts persisted across lease expiry; no `confirmed` and no local `FULFILLED/CANCELED` without a positive read after any failure sequence (AC 9); lease-lost on concurrent external confirmation (3); manual resolution audit and `resolved_manual` unblocking; contradicted manual resolution; deletion matrix open/unknown/already canceled/already fulfilled (AC 17); no `reward.delete` while an unaccounted `UNFULFILLED` remains.
- Browser E2E with fixtures only (Operations blocking item, deletion projection, resume after resolution) — only for already approved text.
- Live Twitch: AC 19 only, owner-gated, separate evidence class.

## 7. Proposed AGENTS.md text on TypeScript (OPS-24) — proposal only

Replace the stack bullet at `AGENTS.md:111` with (pt-BR, as AGENTS.md is written in Portuguese):

> - **Ambiente e stack:** Node `24.20.0` (fixado em `package.json`), PostgreSQL com Prisma; stories em `docs/stories/<ID>/story.md` e `docs/pt-BR/stories/<ID>/story.md`. O backend (`apps/api`) está em migração incremental para **TypeScript** (OPS-24): arquivo novo ou convertido do backend é TypeScript ESM executado por *type stripping* do Node (sem `enum`, `namespace` com código, *parameter properties* nem decorators; `import type` para tipos; extensão explícita nos imports), verificado por `npm run typecheck` com `strict`. Use os tipos reais das bibliotecas (Twurple, Prisma) em vez de reproduzir formas à mão; nas bordas (HTTP, Twitch, JSON) receba `unknown` e estreite. Contratos com bibliotecas externas são testados com instâncias reais das classes, nunca com objetos literais. Arquivos `.mjs` com JSDoc ainda não convertidos continuam válidos até a fatia correspondente da OPS-24; não misture conversão de arquivo e mudança de comportamento na mesma story ou commit. Exemplos genéricos do framework (Node 18+, Supabase, `{epic}.{story}.story.md`) não se aplicam.

Preconditions for the text to be true (OPS-24, not OPS-22): `tsconfig` includes `.ts` with `strict`; Vitest include, ESLint (`typescript-eslint` compatibility with TS 7.0 is an open item in the research) and OpenGrep rules cover `.ts`. Until then, the owner should keep the current text.

## Risks

- **Root cause ~90 %** (UNVERIFIED live): if another cause exists (wrong `reward_id`, consistency delay, Client-ID), the bounded budget plus 404-as-retryable still converges to `needs_review` instead of freezing; AC 19 confirms.
- **Manual resolution vs remote truth:** an operator may resolve while Twitch still shows `UNFULFILLED`; the step-c guard prevents deletion and re-arms the refund (5.2).
- **Residual race between re-list and DELETE:** mitigated by the verified pause; documented, checked live in AC 19.
- **External confirmation without lease token** (F11): safe only if the worker treats a 0-row guarded update as `lease_lost`; must be proven on PostgreSQL.
- **New direct dependencies** (`@twurple/common`, `@twurple/api-call`) must stay in lockstep with `@twurple/api`; a Twurple bump triggers the research REFRESH and breaks one helper on purpose.
- **Visible text:** the deletion projection is code-only; any sentence depends on the pending UX decision.
- **Security:** no new secret path; logs exclude `error.message` (contains URL/body); audit reasons are enumerated, no free text.

## Change Log

- 2026-10-27 — `@architect` (Aria): decisions 1-7 recorded from read-only code analysis; closes the architect planning gate of OPS-22.
