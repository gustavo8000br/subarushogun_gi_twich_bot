# OPS-22 — Architect review of FT-36, open items and the single-cycle package (`@architect`)

[Português (pt-BR)](../../pt-BR/stories/OPS-22/architect-review-ft36.md)

**Author:** `@architect` (Aria), 2026-10-30. **Status:** COMPLETE for the `@architect` part of the 2026-10-30 `@po` re-validation ([po-validation.md](po-validation.md), addendum 2026-10-30, corrections 2 and 6).
**Evidence class:** I only read code on the branch `feat/ops-15-next-panel` and the documents listed below. I did not run any test, server, container, database, GitHub call or Twitch call. Statements about live Twitch stay UNVERIFIED until AC 19 (OW-16).
**Inputs:** [story.md](story.md), [po-validation.md](po-validation.md), [architecture-decisions.md](architecture-decisions.md) (cited as "ARCH §n", findings F1-F14), [data-review.md](data-review.md) ("DATA §n", C1-C8), [panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md) (slice S-D, FT-23), the FT-23, FT-28 and FT-36 rows of the [backlog inventory](../../process/backlog-inventory.md), and these code files: `apps/api/src/persistence/queue-repository.mjs`, `apps/api/src/domain/queue-service.mjs`, `apps/api/src/outbox/reward-worker.mjs`, `apps/api/src/outbox/financial-worker.mjs`, `apps/api/src/twitch/reconciliation.mjs`, `apps/api/src/twitch/integration.mjs`, `apps/api/src/twitch/redemption-processor.mjs`, `apps/api/src/http/queue-routes.mjs`, `apps/shared/panel/queue-action-state.mjs`, `apps/frontend/features/queues/*`, `apps/frontend/features/panel-shell/*`, `apps/frontend/app/(panel)/*`, and the migration `apps/api/prisma/migrations/20261014230000_outbox_deletion_cancel_verification`.
**Research:** none new. The golden rule was followed: research note #20 (redemption sync) is SUFFICIENT and covers the Twitch behavior used here. Section 4 avoids the one Next.js API question that has no note (see "Research gap").
**Not decided here:** DDL and the audit catalogue (`@data-engineer`), visible text (FT-23 + FT-36 UX plan, `@ux-design-expert`), AC wording (`@po`).

## 0. Findings that change the FT-36 picture (VERIFIED by reading)

"Cancel deletion" **already exists end to end**. ARCH §2 listed it as "untouched". FT-36 therefore **hardens and completes an existing mechanism**. It does not build a new reverse transition.

| # | Finding | Where | Effect on FT-36 |
|---|---|---|---|
| F15 | A three-step cancellation already exists. (1) `beginQueueDeletionCancellation` takes the queue advisory lock and `FOR UPDATE` on the queue's `reward.*` outbox rows, refuses any `processing` reward task, and moves `reward.delete` from `pending/retry/unknown/failed/conflict` to `cancel_verification`. (2) The domain service reads the reward on Twitch (`getReward`). (3) `confirmQueueDeletionCancellation` re-checks under the same locks plus the queue version, requires `matchesManagedRewardState(reward) && reward.isPaused === true`, sets `reward.delete` to `cancelled` (`queue_deletion_cancelled_by_operator`) and the queue to `active`, `isArchived: true`, `isOpen: false`, `remoteSyncStatus: 'synced'`. Otherwise `failQueueDeletionCancellation` sets `reward.delete` to `unknown` with a code. | `queue-repository.mjs:843-919`; `queue-service.mjs:62-98`; route `POST /api/queues/:queueId/delete/cancel` `queue-routes.mjs:774-790` | Mechanism, locks and CAS already exist. |
| F16 | `cancel_verification` is already an allowed outbox status (CHECK constraint, with a rollback script). Neither worker claims it: the reward claim takes only `pending/retry` or an expired `processing`, and the financial claim takes only financial types. | migration `20261014230000_outbox_deletion_cancel_verification`; `queue-repository.mjs:1574-1578, 2136-2145` | The "lease" against an in-flight delete already exists: `cancel_verification` is a status that cannot be claimed. **No DDL.** |
| F17 | The Next panel already offers "cancel deletion" (dialog, codes mapped to catalog keys). Its visibility comes from a **client-side heuristic** on `remoteSyncStatus` (`delete_pending/delete_unknown/delete_failed/diverged`), not from the server rule. | `queue-action-state.mjs:33-36`; `queue-lifecycle.mjs:4-26, 64-85`; `queue-lifecycle-actions.jsx:50-60, 92` | The button can disagree with the server. The visible text must go into the FT-23 + FT-36 UX plan. |
| F18 | **Latent defect (re-deletion after a cancel):** when deletion starts on an *open* queue, `confirmRewardOpen` calls `tx.outbox.create` for `reward.delete` with the fixed key `queue:<id>:reward.delete`. After a cancel that row exists as `cancelled`, so the create violates the UNIQUE key and the pause confirmation rolls back. Only `enqueueRewardDeleteIntent` (closed-queue path) reuses the cancelled row. | `queue-repository.mjs:1683-1687` vs `:110-137` | Must be fixed in FT-36 (Red test first). |
| F19 | Pause stage: while the queue is `deleting/pending_close` (pause task `reward.set_open` with `deleteAfterConfirm`) no `reward.delete` exists yet. Cancel answers `QUEUE_DELETION_NOT_PENDING`, and that includes a **blocked** pause (`close_unknown`/`close_failed`). | `queue-repository.mjs:829-834, 855-856`; `:1833-1838, 1854-1859` | Gap against AC 21 ("pending or blocked"). |
| F20 | A failed verification always sets `reward.delete` to `unknown`, even when the read failure was transient (5xx, network, 401). A healthy `pending` deletion becomes `unknown` because one read failed. | `queue-service.mjs:73-79`; `queue-repository.mjs:880` | Restore the previous status on a non-conclusive read (section 1.4). |
| F21 | Cancel is allowed even when a DELETE **may already have reached Twitch** (`payload.requestMayHaveReachedTwitch === true`, set by `prepareRewardDelete` just before `deleteReward`). | `queue-repository.mjs:861, 1767`; `reward-worker.mjs:304-319` | Must be refused (section 1.3). |
| F22 | The confirm and fail audit rows carry no `actorId`; only the begin row does. | `queue-repository.mjs:866, 886, 914` | AC 21 asks for the actor on every audited step. |
| F23 | `queueMode !== 'channel_points'` is refused. Converted-manual and local deletions finish locally once refunds settle (`requestQueueDeletion`, `:698-755`). | `queue-repository.mjs:848` | Scope decision in section 1.6. |
| F24 | The `PanelProvider` is mounted per page (`page.jsx → PanelRoot → PanelShell → PanelProvider`). Navigation uses `<a>`, and the app uses no `next/navigation` or `next/link` anywhere. The delete notice is card-local state, lost when the card unmounts. | `app/(panel)/queues/page.jsx`; `panel-root.jsx`; `panel-shell.jsx:60-69`; `panel-provider.jsx:20-67`; `queue-lifecycle-actions.jsx:13, 50` | Basis for the FT-23/FT-28 decision (section 4). |

## 1. FT-36 — design of the reverse transition

### 1.1 What "reopened" means (and the paused reward)

**Decision D-36-1: the reward stays paused after a cancel.** A successful cancel returns the queue to `lifecycleStatus='active'`, `isArchived=true`, `isOpen=false`, `remoteSyncStatus='synced'`, with the reward **proven paused by a positive read**. This is the state the existing code already writes. Viewers regain access only through the existing actions "show to viewers" (unarchive, `queue-repository.mjs:674-690`) and "open". "Open" enqueues `reward.set_open(isOpen=true)`, which the worker confirms only from the Twitch response and the read-back (`reward-worker.mjs:218-227`). That open is the **verified write that reverts the pause**, and the operator triggers it explicitly.

| Option | Trade-off | Verdict |
|---|---|---|
| A. Cancel restores the queue as archived and closed, with the reward still paused (verified); reopening uses the existing verified actions | Single atomic step. No new outbox chain. No state where the queue is open and the reward unverified. The operator decides when viewers can spend points again, since the entries were removed and the queue starts empty. | **Chosen** |
| B. Cancel also enqueues `reward.set_open(true)` and unarchives | One click for the operator. But it adds a second remote write to the cancel. It needs a new intermediate state ("cancelled, reopening"). It starts charging viewers on a queue the operator has just emptied, before any decision to reopen. | Rejected |
| C. Cancel restores the pre-deletion snapshot (open or closed) | Needs a stored snapshot and also writes to Twitch. Same objections as B. | Rejected |

**AC 21 wording (`@po`):** "its reward is reopened safely (the reward pause is reverted by a verified write)" must read: "the queue returns to active, archived and closed with the reward verified as paused; the pause is reverted only by the existing open action, whose write is verified". This refines the mechanism within the room AC 21 gives `@architect`. The rule "no assumption without a positive remote read" holds.

### 1.2 Reverse state machine

States are `queue.lifecycleStatus/remoteSyncStatus` plus the deletion task that decides the outcome. Only existing status values are used.

```text
REQUEST CANCEL (operator, idempotency key, confirm:true)
│
├─ queue deleted ─────────────────────────────────────────► 409 QUEUE_DELETION_ALREADY_COMPLETED (no change)
├─ queue not deleting / not channel_points / no reward ───► 409 QUEUE_DELETION_NOT_PENDING (no change)
├─ any reward.* task `processing` (any lease) ────────────► 409 QUEUE_REWARD_OPERATION_PROCESSING (no change)
├─ reward.delete payload.requestMayHaveReachedTwitch ─────► 409 QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED (no change)
├─ pause stage, pause task pending|retry ─────────────────► 409 QUEUE_DELETION_PAUSE_IN_PROGRESS (no change)
│
├─ target = reward.delete ∈ {pending, retry, unknown, failed, conflict}      ┐  "deletion pending" or
├─ target = pause task ∈ {unknown, failed} (pause blocked, no reward.delete) ┘  "deletion blocked"
│        │  BEGIN (one tx: queue lock + FOR UPDATE reward.* rows)
│        ▼
│   target → cancel_verification ; payload.cancelVerification = { previousStatus, previousLastError, requestedAt }
│   audit queue.deletion_cancel_verification_requested (actorId, previousState)
│        │  READ getReward(rewardId) outside the tx (no write to Twitch)
│        ├─ exists, matches managed config, isPaused === true ─► CONFIRM (one tx, same locks, version CAS,
│        │        no reward.* processing): target → cancelled ; other non-final reward.* deletion tasks → cancelled ;
│        │        queue deleting → active/archived/closed/synced ; audit queue.deletion_cancelled  ─► 200 {status:'cancelled'}
│        ├─ 404 / null (reward absent) ────────────────► target → unknown('queue_delete_reward_absent')      ─► 200 not_cancelled
│        ├─ exists but diverged or NOT paused ─────────► target → unknown('queue_delete_reward_diverged')
│        │                                                (pause task: back to its previousStatus with
│        │                                                 'queue_delete_cancel_reward_not_paused')           ─► 200 not_cancelled
│        └─ non-conclusive (5xx, network, timeout, 401) ► target → previousStatus (restored, F20)
│                                                         lastError 'queue_deletion_cancel_verification_unavailable'
│                                                         (401: 'authorization_required')                      ─► 200 not_cancelled
│
└─ target already cancel_verification (crash or concurrent click) ─► resume at READ (idempotent)
```

The confirm also runs in these two situations:
- **Stale during confirm** (the queue version changed, for example reconciliation marked it): the target goes back to `previousStatus` with `queue_deletion_cancel_verification_stale`, then 409 `QUEUE_DELETION_CANCELLATION_STALE`. This replaces today's move to `unknown`.
- **Re-delete after a cancel:** both paths reuse the `cancelled` `reward.delete` row through `enqueueRewardDeleteIntent` (fixes F18). The previous attempt stays in `payload.previousCancelledAttempt` (existing).

### 1.3 Race with an in-flight `reward.delete` (CAS, lock, lease that already exist)

No new primitive is needed. The guarantee is the composition below. Each part already exists unless marked "new".

1. **Mutual exclusion with the worker:** the begin, the confirm and `claimNextRewardOperation` all run in `withQueueTransaction` (the per-queue advisory lock) and take `FOR UPDATE` on the reward rows (`:845, :896, :1588`). Begin and claim are therefore serialized per queue.
2. **No claim after the CAS:** `cancel_verification` is not in the claim predicate (F16). Once begin commits, the worker cannot start a DELETE.
3. **No cancel during a claim:** begin refuses **any** `processing` reward task, **with or without a valid lease** (`:852`). A crashed worker leaves `processing` with an expired lease. The worker reclaims it and finishes or retries, and only then can a cancel run. Accepted: about 30 s of lease.
4. **No cancel after the irreversible step (new, F21):** `prepareRewardDelete` writes `requestMayHaveReachedTwitch: true` in the lease-guarded tx just before `deleteReward`. A DELETE that errored may still be applied by Twitch. A later `getReward` may lag (consistency UNVERIFIED). Reopening would then let new redemptions be auto-fulfilled when the late delete lands (research Q3). So begin refuses with `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` and the deletion is allowed to finish. This is cheap: at that point every redemption was already settled (`prepareRewardDelete` requires it), so cancelling saves nothing for the operator.
5. **Status CAS on the outcome:** confirm and fail use `updateMany ... WHERE status='cancel_verification'` with `count === 1`, plus the queue `version` CAS (`:904-911`).
6. **Manual "retry now" and FT-26 auto-resume:** `retryOutboxManually` matches only `unknown/conflict/failed` and updates with `WHERE status = <read status>`, so it loses against `cancel_verification` (0 rows). **FT-26 rule (new, invariant I7):** the auto-resume after a financial confirmation sets `nextAttemptAt = now` **only** on a `reward.delete` in `retry` of a queue still in `deleting`. It never touches `cancelled` or `cancel_verification`.
7. **Local archive** refuses while `cancel_verification` exists (`:640-642`). This is unchanged.

### 1.4 Financial invariants

| # | Invariant | How it holds |
|---|---|---|
| I1 | No redemption or financial task becomes `confirmed` without a positive remote read | FT-36 **never writes** `redemptions` or `redemption.*` outbox rows. Only FT-25's worker and the F11 positive-observation path confirm. |
| I2 | Cancel tasks of the deletion are **not** cancelled by the cancel | A `redemption.cancel` in `pending/retry/processing` **keeps running** and refunds the viewer. Its entry was already removed when deletion started, so stopping the refund would charge a viewer who will not be served. `confirmed` stays final (the AC 21 refund is final). `unknown/conflict/failed/resolved_manual` stay in Operations for the normal FT-25 review. A `redemption.fulfill` keeps running (served viewer). Reconciliation of the reopened queue sees them as `already_recorded` (`importRedemption`, `queue-repository.mjs:2388-2389`). |
| I3 | No loss of entries or history | No row is deleted. Removed entries stay `removed` with `terminalReason='queue_deleted'` and their audit rows. The reopened queue starts with no active entries (AC 21). `[AUTO-DECISION]` Removed entries are **not** restored → no `removed → waiting` transition (reason: it does not exist in the domain, it would reorder positions, and for refunded viewers it would serve someone already refunded). The UX plan must say so in the delete and cancel confirmations. |
| I4 | The queue is reopened only after the reward's existence and paused state are proven | Positive `getReward` read: the reward matches the managed config and `isPaused === true`, under locks, with the version CAS, no `processing` reward task, and no possibly-sent DELETE. |
| I5 | A late redemption cannot be lost | The reward is paused through the whole window. A redemption that arrives anyway (Twitch would have to violate the pause, UNVERIFIED) is imported as rejected `queue_unavailable` and cancelled (refunded), because the queue is archived (`importRedemption`, `:2394`). |
| I6 | Every state change is audited with the actor | See section 1.5. |
| I7 | Auto-resume and retry never revive a cancelled deletion | Section 1.3, item 6. |

### 1.5 Idempotency, `code` values and audit

**Idempotency:**
- **HTTP:** the existing global `Idempotency-Key` hook replays any stored 2xx or 4xx (`queue-routes.mjs:115-153`). Under OPS-21 the route starts as `terminal_unknown`.
- **Domain:** begin is re-entrant. A second click while in `cancel_verification` resumes the read. After `cancelled`, a new request answers 409 `QUEUE_DELETION_NOT_PENDING`, because the queue is no longer `deleting`.
- **Promotion to `reexecutable`:** only with PostgreSQL test T36-7 (section 5, OPS-21 AC 29).

**Response contract.** Non-2xx responses always carry `code`. The 2xx `not_cancelled` result carries an enumerated `reason`, because a state change happened and must be replayable.

| HTTP | `code` / `reason` | Meaning | New? |
|---|---|---|---|
| 400 | `QUEUE_DELETE_CANCEL_CONFIRMATION_REQUIRED` | `confirm !== true` | existing |
| 404 | `QUEUE_NOT_FOUND` | — | existing |
| 409 | `QUEUE_DELETION_ALREADY_COMPLETED` | queue `deleted`; replaces the dead `200 already_deleted` branch (`:857`) | **new** |
| 409 | `QUEUE_DELETION_NOT_PENDING` | not deleting, not Channel Points, no reward, or no deletion task | existing |
| 409 | `QUEUE_REWARD_OPERATION_PROCESSING` | a reward task is claimed or in flight | existing |
| 409 | `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` | the DELETE may have reached Twitch | **new** |
| 409 | `QUEUE_DELETION_PAUSE_IN_PROGRESS` | the pause is still being applied; retry in seconds | **new** |
| 409 | `QUEUE_DELETION_CANCELLATION_STALE` | the queue changed during verification | existing |
| 409 | `QUEUE_DELETION_CANCELLATION_UNVERIFIED` | the reward does not match at confirm | existing |
| 200 | `status: cancelled` | done | existing |
| 200 | `status: not_cancelled`, `reason ∈ {queue_delete_reward_absent, queue_delete_reward_diverged, queue_delete_cancel_reward_not_paused, queue_deletion_cancel_verification_unavailable, authorization_required}` | verification did not prove a paused reward | `queue_delete_cancel_reward_not_paused` and `..._unavailable` are **new** |
| 503 | generic message + `referenceId` (diagnosed) | unexpected | existing |

The `error` sentences in the route are free text in Portuguese. The panel must map **only by `code`/`reason`** (it already does, `queue-lifecycle.mjs:13-16`). New keys go to the UX plan.

**Audit.** The names extend the existing catalogue. `@data-engineer` owns the final catalogue.

| Event | `actorId` | prev → next | `reason` | `safeDetail` |
|---|---|---|---|---|
| `queue.deletion_cancel_verification_requested` (existing) | operator | `<target status> → cancel_verification` | `operator_requested_queue_deletion_cancellation` | `{ rewardId, operationId, operationType, deletionState: 'pending'\|'blocked', blockReason }` (add `operationType`, `deletionState`, `blockReason`) |
| `queue.deletion_cancelled` (existing) | **operator (new, F22)** | `deleting → active_closed_archived` | `operator_cancelled_queue_deletion_after_reward_verification` | `{ rewardId, operationId, isPaused: true, cancelledTasks: n, financialTasksLeftRunning: n }` |
| `queue.deletion_cancellation_not_confirmed` (existing) | **operator (new)** | `cancel_verification → <restored or unknown>` | the `reason` code | `{ rewardId, operationId, restored: boolean }` |

Refusals (409) write **no** audit row: nothing changed. They are visible in the structured request log. All `safeDetail` keys are enumerated or numeric. No viewer data, no Helix message, no free text.

### 1.6 Scope boundaries

- `[AUTO-DECISION]` Should FT-36 also cancel a **converted-manual or local** deletion? → **No.** Those keep `QUEUE_DELETION_NOT_PENDING` (reason: there is no pending remote deletion. They complete locally as soon as refunds settle, and the operator's way out is to wait or to use Operations. Including them would widen the scope without an owner request). `@po` writes this into AC 21 ("pending or blocked **Channel Points** deletion").
- **Single source of truth for the button (F17):** the API exposes a server-derived `canCancelDeletion` (same predicate as begin, without the remote read) next to the FT-26 projection `deletionState`/`blockReason`/`blockingOperations`. While a target is `cancel_verification` it also exposes `cancellationInProgress: true`. The client stops deriving the button from `remoteSyncStatus`. No fourth `deletionState` value is added (AC 15 keeps three).
- **Recovery from a stale `cancel_verification`** (crash between begin and confirm): repeating "cancel deletion" resumes the read, and a non-conclusive read restores the previous status (F20). No new operator action is needed, and Operations already lists the row (`unresolvedDeletionStatuses`).

## 2. Open items 1, 2, 4 and 5 of the `@po` validation

| Item | Decision | Reason |
|---|---|---|
| **1. Terminal reason code** | **`attempts_exhausted`** (DATA §1). ARCH §1's `retry_exhausted` is withdrawn. AC 8 replaces its provisional value (`@po`/`@sm`). | It matches the audit event `financial.operation_attempts_exhausted` and the column it counts (`attempts`). `@data-engineer` owns the audit catalogue. One name across `lastError`, audit and projection avoids a mapping table. |
| **2. Manual retry: mechanism** | **`payload.cycleStartAttempts` with `attempts` monotonic (DATA C3)**. Budget of the current cycle = `attempts - (payload.cycleStartAttempts ?? 0)`, cap 6. "Retry now" sets `cycleStartAttempts = attempts` in the same tx (a **fresh cycle of 6**, AC 20; the 1-attempt default of DATA C3 is **superseded**). Audit event **`financial.operation_retry_requested`** with `{ operationType, previousAttempts, cycleStartAttempts }`. ARCH §1's "reset to 0 + `financial.operation_retried_manually`" is withdrawn. A **401 does not consume budget**: the lease-guarded transition to `unknown('authorization_required')` also does `cycleStartAttempts += 1`, refunding the attempt that the claim counted. | Contradicts my earlier preference, on purpose. A monotonic `attempts` keeps the full history on the row for forensics. The relative budget expresses both the manual retry and the 401 refund without rewriting history. Legacy rows default to 0 (DATA test 11). The claim query does not change. `@dev` must add `payload` to the `RETURNING` of `claimNext` (`queue-repository.mjs:2153-2154`) or read it under the lease. |
| **4. `resolved_manual` in `blockingOperations`** | **Agree with `@po`: not counted.** `resolved_manual` + `operator_resolved` count as **locally settled**, and the deletion projection is `pending` while the post-resolution guard runs. If the re-list taken **after** the resolution still shows the redemption `UNFULFILLED`, the cancel task is re-armed to `pending` with a fresh cycle (`financial.manual_resolution_contradicted`). It then counts in `openOperations`, and in `blockingOperations` only if it exhausts again. DATA C6 is amended accordingly. | Counting it would show "N operations need review" for something the operator just reviewed, and that number would never go down. The real guard is the remote re-list (ARCH §5.2, DATA C5), which keeps the invariant. The guard compares the re-list time with the resolution audit time. Absence from the `UNFULFILLED` list is **not** written back as a `remoteStatus` (no inferred status). |
| **5. Reconciliation log line** | **Keep the delivered line `twitch_reconciliation_degraded`** (`integration.mjs:96-113`: `trigger`, `reason`, `issueCount`, `issueCounts`, optional `httpStatusCounts` and `statusCode`). ARCH §4.3's `twitch.reconciliation` shape is withdrawn. | AC 5 asks for "issue codes and counts and the `reason`". The line has them, has no identifiers or user data, and its exact key set is QA-verified (FT-24). Emitting only on degraded avoids noise. `queues`/`imported` add no diagnostic value for D-6. Renaming would churn a verified contract for no gap. |

## 3. Complexity and order inside the single cycle

**Re-score (4 slices + FT-23):** scope **5** (API, two workers, repository, routes, shared projection, Next panel), integration **4** (Twitch read/write semantics, Twurple), infrastructure **3** (no DDL, no Compose or proxy change), knowledge **3**, risk **5** (financial) = **20 → COMPLEX (GG)**, up from 19. The rise comes from scope (FT-23 and FT-36 UI), **not** from the reverse transition. Per-slice difficulty: FT-25 **G**, FT-26 **G**, **FT-36 M** (down from G: the mechanism, migration, route, UI and tests exist, see F15-F17; the work is F18-F23 plus tests), FT-23 **M**.

**Order and checkpoints** (one `@dev` at a time; same files, so never in parallel):

| Step | Slice | Starts when | `@dev` checkpoint (evidence recorded in the story; not a commit) |
|---|---|---|---|
| CP-0 | — | open items 1, 2, 4, 5 settled (this note) + `@data-engineer` written confirmation (section 6) + `@qa` test plan | — |
| CP-1 | **FT-25** | CP-0 | Red then Green: policy module, worker `retry`/`unknown(attempts_exhausted)`, `markRedemptionUnknown` stops touching outbox rows, fresh cycle and 401 refund; DATA tests 1-8 and 11-12 on isolated PostgreSQL |
| CP-2 | **FT-26** | CP-1 green | blocked → `retry`, auto-resume (I7), `resolved_manual` settlement + contradicted guard, AC 22 (`reward-worker.mjs:316`), deletion projection + `canCancelDeletion`; DATA tests 9-10; AC 17 matrix |
| CP-3 | **FT-36** | CP-2 green (it needs the FT-26 projection and the `retry` blocked state) | F18-F23 and section 1; tests T36-1..T36-13 |
| CP-4 | **FT-23** | CP-3 green **and** the shared UX plan ≥ 9.0 recorded **and** the FT-23 issue exists | section 4; browser E2E with fixtures, including the FT-25/26/36 texts |
| Gate | — | CP-4 | **one** `@qa` gate for the bundle (owner, 2026-10-30). `@qa` lists the ready groups in this order: G1 FT-25, G2 FT-26, G3 FT-36, G4 FT-23 + catalogs. `@devops` makes **four atomic commits in that order**, so each can be reverted alone. |

**Fallback:** if the UX plan is late, CP-1..CP-3 (API and worker, no new visible text) may take the same gate without G4. FT-23 then follows in the next `@qa` window. That is a gate split, not a scope change, and it needs the orchestrator's decision. Any UI text of FT-25/26/36 waits with G4.

## 4. FT-23 vs FT-28: decoupled

**Decision D-23-1: FT-23 is DECOUPLED from FT-28.** It travels in this cycle with **no** shared provider in the layout. The inventory dependency "FT-23 → FT-28" becomes **soft**: FT-28 later swaps one navigation seam. Reasons from the code (F24):

1. **Same-page outcomes do not need FT-28.** Delete (`deleted` / `pending` / `blocked`) and cancel-delete happen on `/queues`, inside one mounted `PanelProvider`. The defect D-3 is that the notice lives in the card's `useState` and dies when the card unmounts (`queue-lifecycle-actions.jsx:13, 50`). Lifting it to a **page-level `panelOutcome`** in the existing provider, rendered once by `PanelShell` in a persistent `role="status"` region (`role="alert"` for errors), fixes D-3 without moving the provider.
2. **Cross-page outcomes travel in the URL, not in shared memory.** Create (`/new-queue` → `/queues`) and "deleted the last queue" (`/queues` → `/new-queue`) navigate with `?outcome=<code>&queue=<uuid>`. On mount the destination provider reads `window.location.search` in an effect, validates `outcome` against an **allowlist** of enumerated codes and `queue` against a UUID pattern, sets `panelOutcome`, moves focus (`queue-title-<id>` or the page `h1`) and removes the parameters with `history.replaceState`, so a reload does not replay the message. This works with today's per-page provider **and** after FT-28.
3. **One navigation seam:** `navigateTo(href)` = `window.location.assign(href)` today, the same full-document load the panel already does with `<a>`. FT-28 replaces the body with `router.push`/`router.replace`. `resolvePostActionRoute(outcome, projection) → { href, focusId, outcome } | null` stays a pure, unit-tested function (S-D item 5).
4. **No dependency on an unresearched Next API:** reading `window.location` in an effect avoids `useSearchParams` and its Suspense/prerender rules in Next 16.4.1 (see "Research gap").

**What stays conditioned on FT-28/FT-29 (OPS-23):** a "deletion pending" message that turns into "deleted" or "blocked" **without** a manual refresh or reload (live update), and navigation without a document reload. The FT-23 ACs must say that the pending state updates on the next projection load (page load or the existing refresh), not live.

**Security:** the URL carries only an enumerated code and a UUID, never free text, a name or a login. An unknown value is ignored, not reflected, so there is no injection or XSS through the message. Neither the API nor the logs see the parameter.

**Write set and order:** FT-23 touches `panel-provider.jsx`, `panel-shell.jsx`, `new-queue-form.jsx`, `queue-lifecycle-actions.jsx`, `queue-list.jsx`, a new `post-action-route.mjs`, and the en/pt-BR/es catalogs. FT-28 later moves the provider into `app/(panel)/layout.jsx`. **Serialize: FT-23 (this cycle) before FT-28.** FT-28 rebases and swaps the seam. The `panelOutcome` contract and the URL contract carry over unchanged. `@sm` adds the FT-23 ACs to OPS-15 with this text, and `@devops` creates the FT-23 issue.

## 5. Minimal architectural test plan

All tests are Red-first. Evidence classes stay separate.

| Class | What it proves |
|---|---|
| **Unit (Vitest)** | FT-25: retry policy, jitter bounds, non-decreasing up to the cap, `attempts_exhausted`, 401 refund, log key sets. FT-36: the begin refusal matrix (every row of 1.2), the domain service against a fake Twitch built with the real-instance helper (`tests/helpers/twurple-real-instances.mjs`: paused, not paused, `null`, real `HttpStatusCodeError` 404/401/500, timeout), restore on non-conclusive reads. FT-23: `resolvePostActionRoute` (all create/delete/cancel outcomes, last queue → `/new-queue`), the URL outcome parser (allowlist, UUID, unknown value ignored). |
| **Integration, isolated PostgreSQL with real migrations** (`isolated-postgres-image.mjs`, never SQLite, Prisma mocks or the active volume) | DATA §4 tests 1-12 (FT-25/26) and **T36-1** cancel of a `pending` delete; **T36-2** cancel of a delete blocked by review (`retry`/`queue_deletion_blocked_by_review`), with the financial `unknown` task untouched and still listed; **T36-3** `processing` → 409, nothing changed; **T36-4** race, two clients, barrier, N rounds: `claimNextRewardOperation` vs `beginQueueDeletionCancellation`, exactly one wins (claimed and refused, or `cancel_verification` and claim `null`), never both; **T36-5** `requestMayHaveReachedTwitch` → 409; **T36-6** `deleted` → 409 `ALREADY_COMPLETED`; **T36-7** a crash after begin (the row left in `cancel_verification`) and a duplicate request with the same key → resumes, executes once, no double audit; **T36-8** a `redemption.cancel` `pending` at cancel time still reaches `confirmed`/`CANCELED` after the reopen (worker with a positive fake read), its entry stays `removed`, and no row is deleted; **T36-9** delete an open queue → cancel → unarchive and open → delete again: the pause confirmation reuses `reward.delete` (F18, Red today); **T36-10** blocked pause (`close_unknown`): paused read → both tasks `cancelled`; not paused → pause task restored with `queue_delete_cancel_reward_not_paused`; **T36-11** FT-26 auto-resume ignores a `cancelled`/`cancel_verification` delete; **T36-12** version change during verification → `STALE`, previous status restored; **T36-13** `safeDetail` allowlist and `actorId` on all three audit events. |
| **Compose** | No new case: no infrastructure, proxy or route-prefix change. `@qa` runs the existing `compose-runtime` suite in the bundle gate as the regression class. |
| **Browser-only E2E (Chromium, fixtures, no Twitch)** | Only with approved text: create → `/queues` with focus and a status that does not promise Twitch success; delete → persistent status; delete the last queue → `/new-queue` with the message; deletion pending/blocked with the Operations link; cancel deletion with its confirmation, each refusal message, and the archived and closed result; a reload after arriving does not replay the message. |
| **Live Twitch** | AC 19 only (OW-16), as a separate class. FT-36 adds one item to that run: cancel a deletion that is in the blocked state and read the reward (paused, present). |

**Mutation proofs that `@qa` must record** (apply the mutation, show the named test failing, revert):

| Mutation | Must fail |
|---|---|
| Remove the `processing` refusal in begin | T36-3, T36-4 |
| Drop `reward.isPaused !== true` in confirm or the domain service | unit 1.2 "not paused", T36-10 |
| Make the cancel set `redemption.*` tasks to `cancelled` | T36-8 |
| Remove the `requestMayHaveReachedTwitch` refusal | T36-5 |
| Remove the queue `version` CAS in confirm | T36-12 |
| Let auto-resume touch any non-`retry` delete | T36-11 |
| FT-25: confirm on `UNKNOWN`/error without a positive read | AC 9 PostgreSQL test (DATA test 4) |
| FT-26: skip the post-resolution re-list guard | DATA test 9 (contradicted resolution) |
| FT-26: put back `lookupError?.status === 404` at `reward-worker.mjs:316` | AC 22 test with a real `HttpStatusCodeError` |
| FT-23: render the raw `outcome` parameter | URL parser unit test |

**Residual risks:**
- **Eventual consistency of Helix after a DELETE that errored** (UNVERIFIED). Mitigated by refusing a cancel when the DELETE may have been sent (1.3, item 4). It remains possible only if Twitch applies a DELETE that our code never sent.
- **A redemption on a paused reward** (Twitch doc behavior, UNVERIFIED live): it would be refunded as `queue_unavailable` (I5). It is checked in AC 19.
- **`getReward` without a bounded timeout on the server.** A hanging read keeps the panel operation in progress (409 `in_progress` on retry) and the row in `cancel_verification` until the request ends. Recovery is "repeat cancel". Server-side Twurple timeout behavior is UNVERIFIED and noted for FT-44/OPS-21.
- **Entries are not restored after a cancel** (I3): this is a product consequence that the UX copy must state.
- **FT-23 reloads the document until FT-28.** The pending → deleted update is not live until OPS-23.
- **OPS-21 is not delivered yet:** the route-class table (`terminal_unknown`) is not enforced in code. Today a 5xx is not stored, so a retry re-executes, which is safe here because begin is re-entrant and confirm uses CAS (T36-7).

## 6. Dependencies — what `@data-engineer` must confirm in writing

1. **No DDL for FT-36:** `cancel_verification` already passes `outbox_status_check` (migration `20261014230000`, with a rollback). The new keys live in `outbox.payload`: `cancelVerification: { previousStatus, previousLastError, requestedAt }` (ISO-8601 UTC). No index is needed: the lookups are by `entity_id` and `idempotency_key`.
2. **Audit catalogue:** `actorId` on `queue.deletion_cancelled` and `queue.deletion_cancellation_not_confirmed`; the new `safeDetail` keys of 1.5 inside the allowlist (DATA test 12); the new `reason` codes `queue_delete_cancel_reward_not_paused`, `queue_deletion_cancel_verification_unavailable`, `queue_deletion_cancel_verification_stale`.
3. **Transitions of 1.2** as single lease- or CAS-guarded transactions: restore of `previousStatus`; cancellation of a blocked pause task together with `reward.delete`; reuse of the cancelled `reward.delete` by `confirmRewardOpen` (F18) through `enqueueRewardDeleteIntent`; no write to `redemptions` or `redemption.*` rows (I2).
4. **Update DATA C3:** a fresh cycle of 6 on "retry now" (the 1-attempt `[AUTO-DECISION]` is superseded); `cycleStartAttempts` also used for the 401 refund; `claimNext` returns or reads `payload` under the lease.
5. **Update DATA C6:** `resolved_manual` is locally settled and not counted in `blockingOperations` (item 4); the contradicted path re-arms it.
6. **Settle names:** `attempts_exhausted` (item 1) and `financial.operation_retry_requested` (item 2) as the catalogue names; the wording of DATA test 3 ("non-decreasing up to the cap", already resolved in the story).
7. **Add tests T36-1..T36-13** (section 5) to the PostgreSQL plan, expected to need no DDL. If any of them needs DDL, it goes back to `@data-engineer` under C8.

## Research gap

**LACUNA (narrow, does not block):** there is no research note on Next.js 16 App Router `useSearchParams`/`useRouter` (Suspense requirement for prerendered pages, behavior across route groups). This design **avoids** it (section 4, items 2-4), so no research is requested now. It becomes a real gap only when FT-28 swaps the navigation seam to `next/navigation`. Then `@analyst` checks the official Next 16 docs for `useRouter`, `useSearchParams` and `<Link>` with a layout-level client provider, before the FT-28 planning gate.

## Decisions (short list)

1. **D-36-1:** a cancel restores the queue as active, archived and closed with the reward **verified paused**. The pause is reverted only by the existing verified open action. `@po` adjusts AC 21.
2. **D-36-2:** the guarantee against an in-flight delete is the existing queue lock + `FOR UPDATE` + the unclaimable `cancel_verification` status + the version CAS, plus **new** refusals for `processing` (kept), possibly-sent DELETE, and a pause in progress.
3. **D-36-3:** the cancel never touches `redemption.*` tasks; pending refunds keep running; entries are not restored; nothing is deleted.
4. **D-36-4:** a non-conclusive verification restores the previous task status; only a conclusive negative read sets `unknown`.
5. **D-36-5:** blocked pause stage (`close_unknown`/`close_failed`) becomes cancellable; a pause in progress is refused (409).
6. **D-36-6:** new codes `QUEUE_DELETION_ALREADY_COMPLETED`, `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED`, `QUEUE_DELETION_PAUSE_IN_PROGRESS`; new reasons `queue_delete_cancel_reward_not_paused`, `queue_deletion_cancel_verification_unavailable`; `actorId` on every audit row; server-derived `canCancelDeletion` and `cancellationInProgress`.
7. **D-36-7:** fix F18 (re-delete after a cancel) in FT-36.
8. **D-36-8:** FT-36 covers Channel Points deletions only; manual and converted deletions stay as they are.
9. **Open items:** 1 → `attempts_exhausted`; 2 → `cycleStartAttempts` (monotonic `attempts`, fresh cycle of 6, 401 refund) + `financial.operation_retry_requested`; 4 → `resolved_manual` not in `blockingOperations`; 5 → keep `twitch_reconciliation_degraded`.
10. **Complexity 20 → COMPLEX (GG);** FT-36 M. **Order:** FT-25 → FT-26 → FT-36 → FT-23, one `@qa` gate, four atomic commits in that order.
11. **D-23-1:** FT-23 decoupled from FT-28 (page-level outcome + enumerated URL outcome + one navigation seam); live pending → deleted stays with OPS-23.

## Pending items by agent

| Agent | Pending |
|---|---|
| `@po` | Amend AC 21 (D-36-1, D-36-8, the `ALREADY_COMPLETED` code instead of 200); AC 8 → `attempts_exhausted`; AC 20 audit name; record the FT-23 decoupling; final score of the widened scope once items 1-4 of the 2026-10-30 corrections are closed. |
| `@sm` | Complexity 20 GG and FT-36 M in the story and inventory; the FT-23 → FT-28 dependency becomes "soft" in the inventory; FT-23 ACs in OPS-15 (section 4 text, no live update); risks: entries not restored, possibly-sent DELETE. |
| `@data-engineer` | Written confirmation of section 6 (items 1-7). |
| `@ux-design-expert` | The shared FT-23 + FT-36 plan (≥ 9.0) includes: the outcome codes of section 4; the cancel confirmation that says entries are not restored and the queue returns archived and closed with the reward paused; one message per new `code`/`reason`; "cancellation in progress / repeat to resume". |
| `@qa` | Test plan with T36-1..T36-13, DATA §4, the mutation table, and the G1..G4 group order. |
| `@devops` | FT-23 issue (sub-issue of #69, body only); bodies of #98/#99/#100 cite this note. |
| `@dev` | Starts only after the gates above, in the order of section 3. |
| `@analyst` | Nothing now (gap deferred to FT-28 planning). |

## Change Log

- 2026-10-30 — `@architect` (Aria): FT-36 re-review (findings F15-F24), decisions D-36-1..D-36-8, open items 1, 2, 4 and 5 settled, complexity re-scored to 20 COMPLEX, order FT-25 → FT-26 → FT-36 → FT-23 with checkpoints, FT-23 decoupled from FT-28 (D-23-1), test plan with mutation proofs, `@data-engineer` dependencies. Read-only analysis; no code, test or issue was touched.

## Addendum — Orion decision supersedes F21/D-36-6 (2026-10-30)

This addendum does not rewrite the body above. On cancel with `requestMayHaveReachedTwitch` true, the body proposed refusing (`QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED`). The Orion decided (2026-10-30, see [po-validation.md](po-validation.md) and AC 21): the cancel stays allowed when a read-only `cancel_verification` read proves the exact reward exists and is paused; the refusal applies only when the read is inconclusive or negative after a DELETE attempt. The current fixtures stay valid.

Consequences:

- `@dev`: restore `previousStatus` on a non-conclusive read (as in the body); do NOT refuse when the read is positive (exists and paused); refuse with `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` only when the read is inconclusive/negative after a DELETE attempt; keep `qra-postgres-fixtures.test.js` ~:457-488 and ~:497-528 unchanged (the "rewrite the fixtures" condition no longer applies).
- `@qa`: new T36 "late DELETE after a verified cancel": the open action fails safely and the queue is not reopened without its reward; prove by mutation (remove the re-read in the open action, or reopen without a positive read, and the test must fail). Keep the refusal test for the inconclusive/negative case.
