# FT-41 — `@po` validation (cutover wave 5: retire `POST /api/queues/:queueId/archive`)

[Português (pt-BR)](../../pt-BR/stories/OPS-15/po-validation-ft-41.md)

**Validator:** `@po` (Pax) — **Date:** 2026-11-05 — **Mode:** YOLO (`[AUTO-DECISION]` marks autonomous choices)
**Slice:** FT-41 (row in [backlog-inventory.md](../../process/backlog-inventory.md)) of [OPS-15](story.md) — **Issue:** [#69](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/69) (OPS-15 issue, exists; same pattern as the sibling waves).
**Sources:** [ft-41-data-engineer-confirmation.md](ft-41-data-engineer-confirmation.md), [cutover-plan.md](cutover-plan.md) (A-08, wave 5, DP-6 line 206), [queue-route-action-inventory.md](queue-route-action-inventory.md) (QRA-18), `.claude/rules/story-lifecycle.md` (10 points).

## Verdict

**GO — 9.3/10.** FT-41 moves **Draft/not started -> Ready**. Ready means "validated for planning"; the gates of the slice still apply (`@dev` test-first, `@qa` verdict and score before any commit).

## Owner decision on the loss of the reversible archive

**Already taken; the owner is not needed.** Basis: DP-6 (cutover-plan.md:206) — "RESOLVED (owner, 2026-10-27): yes, delete `archiveQueue` and `POST /api/queues/:queueId/archive`, keep the worker `archiveAfterConfirm` branch". The route was the only entry to the reversible archive of a healthy queue, so deleting it is, by construction, the acceptance of that loss. The route is API-only (QRA-18: no call in the Next panel, the vanilla panel or baseline `845a58f`), so no operator-visible capability disappears. `[AUTO-DECISION]` treat as decided because the consequence is implied by the decision text and nothing user-facing is removed (reason: no extra owner scope). The consequence is now explicit in FR-10 (below). If the owner wants to keep a reversible archive of healthy queues, that is a **new feature** for the backlog, not part of this wave.

## 10-point checklist

| # | Point | Score | Note |
|---|---|---|---|
| 1 | Title | 1.0 | Names route, method and wave. |
| 2 | Description | 1.0 | Cutover plan A-08 + `@data-engineer` confirmation. |
| 3 | Testable ACs | 0.8 | The inventory row had Red/Green items but no numbered ACs; the 5 conditions are now AC-41-1..8 below (Given/When/Then). |
| 4 | Scope IN/OUT | 0.9 | OUT made explicit below (AC-41-7). |
| 5 | Dependencies | 1.0 | FT-40 done; FT-23/ST-15/ST-16 gate OPS-15 closure, not this wave. |
| 6 | Complexity | 1.0 | M; 2-4 h `@dev`, 0.5-1 h `@data-engineer`, 1.5-2 h `@qa`. |
| 7 | Business value | 0.8 | Removes an unreachable public write surface; value is hygiene and a smaller attack surface. |
| 8 | Risks | 0.9 | Stranded `pending_close` queue if the worker branch is removed (covered by AC-41-2/3/4); unknown live rows (harmless with the branch). |
| 9 | Definition of Done | 0.9 | Gates listed; docs en/pt-BR; `@qa` verdict. |
| 10 | Alignment | 1.0 | Traces to cutover-plan wave 5, DP-6, QRA-18. No invention. |

Total 9.3/10 (average), none below 0.8.

## Acceptance criteria (binding for `@dev`/`@qa`)

Each of the `@data-engineer` conditions is mapped to an AC. Order: tests first.

- **AC-41-1 (Red, route).** Given a valid session, when `POST /api/queues/:id/archive` is called, then the response is the generic JSON 404 (never HTML, never a session bypass) and `repository.archiveQueue` is never invoked. Written and seen red **before** the removal. *(Condition 1; cutover-plan wave 5 Tests.)*
- **AC-41-2 (PostgreSQL, happy legacy row).** Given an isolated PostgreSQL with real migrations, a queue seeded by hand (`rewardId`, `isArchived: true`, `isOpen: false`, `remoteSyncStatus: 'pending_close'`) and a `reward.set_open` outbox row with `payload { isOpen:false, queueVersion, archiveAfterConfirm:true, requestMayHaveReachedTwitch:false }`, when `claimNextRewardOperation` and the worker run with a fake adapter, then the row ends `confirmed`, the queue ends `synced` / `isArchived=true` / `isOpen=false`, and `unarchiveQueue` then succeeds. *(Condition 2; the mocked `reward-outbox-worker.test.js:263` does not replace it.)*
- **AC-41-3 (PostgreSQL, retry/failure paths).** Same fixture: a 429 goes to `retry` keeping the flag and the queue state; an `unknown` row, after manual retry, returns to `pending` and still confirms; a tombstoned queue gets the row `cancelled`/`unknown` and Twitch is never called. *(Condition 3.)*
- **AC-41-4 (guard).** A `reward.set_open` row **without** `archiveAfterConfirm` for an archived queue still fails with `reward_open_operation_invalid` (the branch does not widen). *(Condition 4.)*
- **AC-41-5 (removal).** After the Red of AC-41-1, remove the route (`queue-routes.mjs:686-697`) and `archiveQueue` (`queue-repository.mjs:562-584`), and the archive cases of `tests/unit/queue-routes.test.js`, `tests/integration/qra-postgres-fixtures.test.js` and `tests/integration/queue-repository.test.js` (line numbers per the confirmation). `git grep` finds no caller of `archiveQueue`.
- **AC-41-6 (docs, en + pt-BR).** Remove `archive` from the INV-06 list in `endpoint-catalog-inventory.md`; mark QRA-18 retired in `queue-route-action-inventory.md`; OPS-21 response-shape publication does not list the route. FR-10 and `information-architecture.md` are already reworded by `@po` (below). *(Condition 5.)*
- **AC-41-7 (OUT, must not change).** `unarchiveQueue`, `isArchivePause` (`reward-worker.mjs`), the `localArchive*` code, any status/enum, and any migration stay untouched. No backfill or deletion of historical `reward.archive` keys or `queue.archive_requested`/`queue.archived` audit events. Rollback = revert the commit.
- **AC-41-8 (gates).** `@qa` runs the full suite on isolated PostgreSQL plus `lint`, `typecheck`, `validate:localization`, `validate:version`, `validate:port-denylist`, `review:static`, and issues PASS/CONCERNS/FAIL with a score before `@devops` commits.

## FR-10 — new wording

Applied in `docs/prd/functional-requirements.md` and `docs/pt-BR/prd/functional-requirements.md`. Text (en): "FR-10 — Provide list/position/leave/add/remove/next/start/complete/move/open/close/clear/account operations, notifications, and no-show timers per policy. Queue lifecycle (cutover wave 5, FT-41, DP-6): the reversible archive of a healthy queue is no longer offered as a public route (`POST /api/queues/:queueId/archive` is retired and answers the generic JSON 404); a queue leaves service only through deletion with explicit confirmation (`delete`, with reward cleanup) or, when the Twitch sync is uncertain or failed, local-only deletion (`archive-local`, which ends in a tombstone that `unarchive` cannot reverse). `unarchive` stays only for queues that are already archived: a queue archived before the upgrade, including one still `pending_close`, finishes pausing its reward through the existing outbox/worker flow and can then be unarchived. No data migration."

## Files touched by `@po`

`docs/prd/functional-requirements.md`, `docs/pt-BR/prd/functional-requirements.md`, `docs/front-end-spec/information-architecture.md`, `docs/pt-BR/front-end-spec/information-architecture.md`, `docs/process/backlog-inventory.md` (+ pt-BR), `docs/stories/OPS-15/story.md` (+ pt-BR; Change log), this file (+ pt-BR).

## What `@dev` still needs

Nothing blocking. Start with AC-41-1 and AC-41-2 (both red first). `endpoint-catalog-inventory.md` and `queue-route-action-inventory.md` (en + pt-BR) are updated by `@dev` with the code (AC-41-6), because they describe the code state. Optional: `@devops` may run the read-only query from the confirmation on the owner's installed database; it is not a gate.

## Addendum 2026-11-05 (FT-41 / AC-41-3, Orion decision, option B)

While writing the PostgreSQL test of AC-41-3, `@dev` observed that the AC-41-3 expectation "`unknown`, after manual retry, returns to `pending` and still confirms" does not hold. A legacy `archiveAfterConfirm` row that reached `unknown` or `failed` moves its queue to `close_unknown` / `close_failed`. `retryOutboxManually` returns the row to `pending` but re-arms the queue only for `reward.delete`, `reward.update` and `deleteAfterConfirm`; `claimNextRewardOperation` needs `pending_close`, so the row stays unclaimed and the queue stranded. Orion decided (2026-11-05) to accept this known limitation: it is existing behavior, the removal creates no new rows, the beta has no active users, and fixing it changes repository behavior outside AC-41-7. Manual exits: delete the queue or `archive-local`. The behavior is pinned by `tests/integration/queue-archive-legacy-row-postgres.test.js` (`unknown` and `failed`), and registered as non-blocking risk FT-41-L1 in the backlog inventory (no issue).
