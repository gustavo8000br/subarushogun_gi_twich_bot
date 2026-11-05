# FT-41 — `@data-engineer` written confirmation: outbox safety of retiring `POST /api/queues/:queueId/archive` (wave 5)

- **Date:** 2026-11-05
- **Agent:** `@data-engineer` (Dara)
- **Scope:** the gate of wave 5 in the [cutover plan](cutover-plan.md) ("`@data-engineer` confirms that keeping the worker branch is enough for `reward.set_open` rows with `archiveAfterConfirm: true` already present in installed databases") and the FT-41 row of `docs/process/backlog-inventory.md`.
- **Method:** static reading of the schema, the migrations and the code (HEAD `ea1b1c4`) **plus** one observed run: `vitest run tests/integration/queue-repository.test.js -t archive` against the isolated disposable PostgreSQL started by the test helpers (12 passed, 158 skipped; the `qra-postgres-fixtures` file was skipped by the filter in that run, so its archive case is **not** observed). No Docker container existed before or after (`docker ps -a` empty); no volume was touched; nothing was implemented.

## Verdict

**SAFE WITH CONDITIONS. No migration.** The removal is safe for data **if and only if** the `archiveAfterConfirm` branch of the reward worker is kept (DP-6 already says so) and is covered by a PostgreSQL test written first. Removing that branch would turn every legacy in-flight row into a `failed` row and strand its queue in `pending_close`.

## Answers

### 1. Which outbox rows does `archiveQueue` produce or consume?

- **Produces exactly one row type, and only in the reward-sync path** (`queue-repository.mjs:722-743`; the manual-only branch writes no outbox row, only an audit):

| Column | Value |
|---|---|
| `operation_type` | `reward.set_open` |
| `entity_type` / `entity_id` | `queue` / queue id |
| `idempotency_key` | `queue:<queueId>:reward.archive:<version>` (the only producer of the `reward.archive` key) |
| `payload` | `{ isOpen: false, queueVersion, archiveAfterConfirm: true, requestMayHaveReachedTwitch: false }` |
| initial `status` | `pending` (default) |

  Side effects in the same transaction: `queue.isArchived = true`, `isOpen = false`, `remote_sync_status = 'pending_close'`, `version + 1`; audit `queue.archive_requested`.
- **Consumes nothing from the outbox.** It reads only the `queue` row. Its only caller is the route (`queue-routes.mjs:707`).
- **Can such a row still be live after the removal? Yes, for any database that archived a reward queue before the upgrade.** The row can be in `pending`, `retry`, `processing` (lease expiry), `unknown` (inferred reachable through the worker's `unknownRewardOperation` paths), `failed` or `conflict` (inferred), until the worker resolves it. `confirmed`, `cancelled` and `resolved_manual` are terminal and harmless. The status CHECK allows `pending, processing, retry, confirmed, conflict, unknown, failed, cancelled, resolved_manual, cancel_verification` (`20261014230000_outbox_deletion_cancel_verification/migration.sql`); nothing in the removal touches it.

### 2. Does the removal orphan an operation type in a worker?

- **No type is orphaned.** `reward.set_open` stays produced by `setQueueOpen` (`:669`), manual-mode transition (`:692`) and queue deletion (`:986`); `archiveAfterConfirm` is not a type, it is a flag inside the `reward.set_open` payload. `financial-worker.mjs` only handles `redemption.cancel` / `redemption.fulfill` and is unaffected.
- **The flag has exactly one reader:** `reward-worker.mjs:176` (`isArchivePause`), which only relaxes the guard at `:178-179` (`queue.isArchived` would otherwise make the task invalid). `confirmRewardOpen` (`queue-repository.mjs:1864-1884`) has **no archive-specific logic**: it moves `pending_close -> synced`, marks the row `confirmed` and writes `queue.open_state_confirmed`.
- **What happens to a legacy row:**
  - *With the branch kept (planned):* claimed only while the queue is `pending_open`/`pending_close` (`claimNextRewardOperation`, `:1808-1811`); the worker pauses the reward, confirms, the queue ends `isArchived=true, isOpen=false, synced`, and `unarchive` (kept) can reopen it. Tombstoned queues are cancelled/`unknown` by the claim (`:1795-1805`), independent of the flag. Rate-limit/auth errors go to `retry`; ambiguous ones to `unknown` (manual resolution), as today.
  - *With the branch removed (rejected):* the guard fails, the row becomes `failed` / `reward_open_operation_invalid`, and the queue stays `isArchived=true` + `pending_close`. `setQueueOpen` and `unarchiveQueue` both refuse that state (`QUEUE_NOT_AVAILABLE` / `QUEUE_REWARD_NOT_READY`), so the queue is stuck until the operator deletes it or archives it locally.
  - A manual retry of an `unknown`/`failed` legacy row re-enters `pending`, so the branch must also survive retries.

### 3. Is a migration needed? Does OPS-22 cover every use case?

- **No migration.** No column, enum, index or constraint exists for archive: `is_archived` is a plain boolean still written by deletion, local archive and `unarchive`; `outbox.payload` is free JSONB; the status CHECK is unchanged. Historical rows (`reward.archive` keys, `queue.archive_requested` / `queue.archived` audit events) stay as immutable history; do **not** backfill or delete them. Rollback = revert the commit.
- **OPS-22 does not cover the same use case; this is a behavior decision, not a data risk.** `archive-local` (`beginLocalQueueArchive` / `confirmLocalQueueArchive`) ends in `lifecycle_status = 'deleted'` (a tombstone, not reversible by `unarchive`) and is limited to uncertain/failed sync states (`localArchiveRemoteStatuses`). The retired route was the only entry point for the **reversible** "archive an active, healthy queue and keep it for later" cycle. After the removal, `isArchived` is reached only through deletion (`deleting`), local archive (`deleted`) and legacy rows; the Next panel never called the route (`queue-lifecycle.mjs:4` lists `unarchive`, `archive-local-*`, no `archive`). DP-6 (owner, 2026-10-27) already accepted this; `@po` must state it in FR-10 so the loss of the reversible archive is explicit, not silent.

### 4. Does any dev/production data depend on the route?

- **Observed:** no container, volume or database was running; I did not query any installed database, so **I cannot confirm or deny that rows with `archiveAfterConfirm: true` exist anywhere**. The dev database is disposable (owner rule) and was not touched.
- **Inferred:** no first-party consumer exists (route has no caller in `apps/frontend`; the vanilla panel is already retired from serving), and the project is in beta with no active users (owner memory), so live rows are unlikely but possible on the owner's own installs. The plan's safeguard (keep the worker branch) makes the unknown harmless, so no pre-removal query is a hard gate. Optional read-only check for an installed database: `SELECT status, count(*) FROM outbox WHERE operation_type='reward.set_open' AND payload->>'archiveAfterConfirm'='true' GROUP BY status;` (not run by me).

## Conditions for the `@dev` (tests first, in this order)

1. **Red, route:** `POST /api/queues/:id/archive` with a valid session returns the generic JSON 404 (never HTML, never a session bypass) and `repository.archiveQueue` is never invoked. Remove the archive cases of `tests/unit/queue-routes.test.js` (`:902-924`, `:1386`), `qra-postgres-fixtures.test.js:778-792` and `queue-repository.test.js:1527-1544` only after this is red.
2. **New PostgreSQL test (isolated, real migrations) — the one that carries the safety:** seed a queue by hand (`rewardId`, `isArchived: true`, `isOpen: false`, `remoteSyncStatus: 'pending_close'`) and an outbox row `reward.set_open` with `payload { isOpen:false, queueVersion, archiveAfterConfirm:true, requestMayHaveReachedTwitch:false }`. Drive `claimNextRewardOperation` + the worker with a fake adapter; assert the row ends `confirmed`, the queue ends `synced`/`isArchived=true`/`isOpen=false`, and `unarchiveQueue` then succeeds. The existing `reward-outbox-worker.test.js:263` is mocked and cannot replace this.
3. **Same fixture, retry and failure paths:** `retry` (429) keeps the flag and the queue state; `unknown` then manual retry returns to `pending` and still confirms; a tombstoned queue gets the row `cancelled`/`unknown` and never calls Twitch.
4. **Guard test:** a `reward.set_open` row **without** `archiveAfterConfirm` for an archived queue still fails with `reward_open_operation_invalid` (the branch must not widen).
5. Do **not** remove `unarchiveQueue`, `isArchivePause`, the `localArchive*` code or any status/enum. Do not add a migration. Update FR-10 / `information-architecture.md` / endpoint inventory (en + pt-BR) by `@po`/`@pm`; OPS-21 must not list the route.

## Observed versus inferred

| Item | Status |
|---|---|
| Row shape produced by `archiveQueue`; single caller; single reader of `archiveAfterConfirm`; absence of schema objects for archive | **Observed** by reading the code at HEAD `ea1b1c4` |
| The 12 archive-related repository tests pass on disposable PostgreSQL | **Observed** (this run) |
| `qra-postgres-fixtures` archive case, worker behavior of a legacy row end to end, `failed`-state consequence of removing the branch | **Inferred** from code (no test exists yet; condition 2 creates it) |
| Existence of live rows in any installed database | **Not verified** (no database queried) |

## Addendum 2026-11-05 (FT-41 / AC-41-3, Orion decision, option B)

While writing the PostgreSQL test of condition 3, `@dev` observed that the "`unknown` then manual retry still confirms" expectation does not hold. A legacy `archiveAfterConfirm` row that reached `unknown` or `failed` moves its queue to `close_unknown` / `close_failed`. `retryOutboxManually` returns the row to `pending` but re-arms the queue only for `reward.delete`, `reward.update` and `deleteAfterConfirm`; `claimNextRewardOperation` needs `pending_close`, so the row stays unclaimed and the queue stranded. Orion decided (2026-11-05) to accept this known limitation: it is existing behavior, the removal creates no new rows, the beta has no active users, and fixing it changes repository behavior outside AC-41-7. Manual exits: delete the queue or `archive-local`. The behavior is pinned by `tests/integration/queue-archive-legacy-row-postgres.test.js` (`unknown` and `failed`), and registered as non-blocking risk FT-41-L1 in the backlog inventory (no issue).
