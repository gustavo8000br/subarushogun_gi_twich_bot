# OPS-21 — Data model and migration plan (panel idempotency state machine, slice 4)

[Português brasileiro](../../pt-BR/stories/OPS-21/data-model.md)

**Author:** `@data-engineer` (Dara), 2026-10-22. **Story:** [story.md](story.md) (AC 17–30). **Decision:** [api-contract-decision.md](../OPS-15/api-contract-decision.md) (D4.1–D4.9, §7 Q1–Q6, §9 slice 4, §11). **Research:** [api-contract-research.md](../OPS-15/api-contract-research.md); index row 13/14 of [research-index.md](../../research-index.md) (SUFFICIENT, no new research done).
**Nature:** planning gate only. No migration file, code, database or Docker command was created or executed. Current behavior below comes from a read-only reading of `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/202610020001_foundation/migration.sql`, `apps/api/src/persistence/queue-repository.mjs` and `apps/api/src/http/queue-routes.mjs` on `feat/ops-15-next-panel`. Target engine: `postgres:18.6-bookworm`, Prisma 6.19 (same as [OPS-20 data model](../OPS-20/data-model.md)).

## 0. Baseline facts

| Fact | Source |
|---|---|
| `processed_operations(operation_key TEXT PK, result JSONB NOT NULL, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`. No other column, no index besides the PK, no `updated_at`. | foundation migration; `schema.prisma` `ProcessedOperation` |
| Panel rows: `beginPanelOperation` does `create` with `result = { kind: 'panel_mutation', fingerprint, state: 'processing' }`; on unique violation it does `findUnique` and classifies (conflict / replay / in_progress). `completePanelOperation` is **read-then-write** (`findUnique` then `update`), not conditional. | `queue-repository.mjs` 285–305 |
| Key: `panel:${localSession.id ?? 'unknown'}:${key}`; regex `^[A-Za-z0-9._:-]{8,128}$`. Fingerprint = SHA-256 hex of `{ method, url, body }` (url includes the query string). | `queue-routes.mjs` 13–16, 119–127 |
| Completion runs in `onSend`, outside any domain transaction, and is skipped for `statusCode >= 500` (stuck `processing`). | `queue-routes.mjs` 139–152 (N3, N7) |
| Non-panel writers on the same table: `chat-message:<id>` (`{ status }`, no `kind`), `chat-viewer-cooldown:<channel>:<user>` (`{ lastAcceptedAt }`, upsert), both under `pg_advisory_xact_lock`; `queue.local_archive.challenge:<sha256>` with `result.kind = 'queue_local_archive_challenge'` and **its own JSON `state` (`issued` / `completed`)**. | `queue-repository.mjs` 398–425, 592–665 |
| No RLS anywhere in the migrations; the only DB client is the API/worker via Prisma with one role. | grep of `apps/api/prisma/migrations` |
| Convention: `TEXT` + named `CHECK`, never PG `ENUM`. | OPS-20 data model §1; `20261007190000_queue_admission_modes` |

Consequence of the archive challenge fact: a new column named `state` must be **scoped to panel rows by CHECK**, or it would look like a second source of truth for the challenge's JSON `state`. The design below keeps every new column `NULL`/default for non-panel rows.

## 1. Answers to decision §7

**Q1 — Columns vs JSON.** Columns. A JSON-path conditional `UPDATE ... WHERE result->>'state' = 'processing' AND (result->>'leaseUntil')::timestamptz < now()` is also atomic under READ COMMITTED (the single `UPDATE` takes the row lock and PostgreSQL re-evaluates the `WHERE` on the newest row version after waiting — EvalPlanQual), so atomicity is not the deciding factor. Columns win because: (a) the lease and state get `CHECK` constraints (a typo cannot create a fourth state); (b) the reaper and takeover predicates become indexable partial-index predicates without expression indexes on casts; (c) the archive challenge already uses `result.state` with other values, so JSON state would need `kind` filtering in every predicate anyway. The atomic primitive is **one conditional `UPDATE ... RETURNING`** (§3), never `findUnique` + `update`.

**Q2 — Backfill of legacy rows.** Existing `panel_mutation` rows have `panel:<session>:<key>` keys; after D4.6 they can never match (the new prefix is `panel:v2:`). Deletion is safe, but the migration is **expand-only** and does not delete: it backfills them to `kind = 'panel_mutation'`, `state = 'completed'`, `lease_until = NULL`, `updated_at = created_at`, `attempt_count = 0`. Because `updated_at` is their old creation time, the first reaper run after deploy (API startup) deletes every legacy row older than 24 h, and the rest within 24 h. Legacy `processing` rows are also backfilled as `completed` (not `failed_retryable`): they are unmatchable, so the state only decides which reaper branch removes them, and `completed` + no lease is the simplest row that satisfies the CHECK.
**Retention consequence:** the raw session id disappears from `processed_operations` at most 24 h after the first API start on the new version. It **stays** in `audit_logs.actor_id` (append-only, never reaped by this story). That keeps option A blocked (AC 16, D5.3); cleaning it needs a separate story (HMAC or non-secret operator id, plus a decision on rewriting historical audit rows). Before restarting the API on the new version, the sessions those ids belong to are already dead (in-memory store), so the residual is a stale value, not a live credential.

**Q3 — Non-panel rows.** Same table, no split. All new columns are nullable or have a constant default, so the chat and archive challenge writers (`create`/`upsert` with only `operationKey` and `result`) keep working without change; a scoped `CHECK` forces non-panel rows to keep every panel column `NULL`/`0`. A separate table would be cleaner but would add a migration with data move and a second idempotency surface for no gain at this volume. [AUTO-DECISION] Split panel rows into `panel_operations`? → No (reason: AC 17 asks for additive change on `processed_operations`; scoping by CHECK gives the same isolation).

**Q4 — Indexes.** Two small partial indexes are worth it even at low volume, because the table is **not** low volume: every chat message writes a `chat-message:*` row that is never deleted today, so the reaper must not seq-scan a growing table on each interval. The takeover uses the PK only. See §4.

**Q5 — Completion inside the domain transaction.** Recommendation: **outside for slice 4, inside as a per-route option in slice 5.**
- Slice 4 keeps completion in `onSend` (outside), but makes it a conditional, **fenced** `UPDATE` (§3.3, `attempt_count` as fencing token). This is the smallest change that fixes S-04 and is safe because every route starts `terminal_unknown`: a crash between domain commit and completion leaves `processing`; after the lease, takeover stores `OPERATION_OUTCOME_UNKNOWN` and never re-executes.
- Inside the transaction closes N7 only for the **database** part: domain change and `completed` row commit or roll back together. It does **not** close N7 for Twitch calls made before or after the transaction (the external side effect is outside PostgreSQL). Feasibility: the repository already exposes `*InTransaction(tx, ...)` methods and `withQueueTransaction`; the route would pass a `completeInTx(tx, { statusCode, responseBody })` callback, and the stored body becomes the domain result serialized by the route, not the final HTTP payload from `onSend`. Cost: per-route plumbing, the processed row stays locked for the domain transaction's duration (fine, one operator), and the `onSend` path must then skip rows already completed (the fenced `UPDATE` returns 0 rows — harmless). So it is a **valid domain guard for promotion to `reexecutable`** only for routes with no external call after the commit; slice 5 records it per route.
- **N7 flag:** until slice 5 proves a route, a lease takeover must never re-execute it. That is enforced in code by route class, not by the schema; the schema only guarantees one winner.

**Q6 — Migration safety.** Confirmed additive: `ADD COLUMN` nullable or with constant default (metadata-only since PG 11, no table rewrite on PG 18), constraints added `NOT VALID` then validated, small plain `CREATE INDEX`, one bounded backfill `UPDATE` of panel rows. The QRA PostgreSQL fixtures touch only the archive challenge row through `findUnique`/`update` with `result`; they keep working, and `postgres-foundation.test.js` lists tables, not columns. Reversal is a forward migration (§6).

## 2. Columns

| Column (DB) | Prisma field | Type | Null / default | Panel rows | Non-panel rows |
|---|---|---|---|---|---|
| `kind` | `kind` | `TEXT` | `NULL` | `'panel_mutation'` | `NULL` |
| `state` | `state` | `TEXT` | `NULL` | `processing` \| `completed` \| `failed_retryable` | `NULL` |
| `fingerprint` | `fingerprint` | `TEXT` | `NULL` | SHA-256 hex (copied from `result.fingerprint` on backfill) | `NULL` |
| `lease_until` | `leaseUntil` | `TIMESTAMPTZ(3)` | `NULL` | set only while `processing` | `NULL` |
| `attempt_count` | `attemptCount` | `INTEGER` | `NOT NULL DEFAULT 0` | `1` on insert, `+1` per takeover/retry; fencing token | `0` |
| `updated_at` | `updatedAt` | `TIMESTAMPTZ(3)` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | set explicitly on every transition | default at insert; never relied on |

- `result` stays `JSONB NOT NULL`. Panel rows keep `result.kind`/`result.fingerprint` (immutable, written once, useful for old-code rollback, §6) plus `statusCode`/`responseBody` when `completed`. `result.state` is **no longer written**; the column is the single source of truth.
- `updated_at` is **not** `@updatedAt` in Prisma (that only works through Prisma writes and would silently change chat cooldown rows' meaning); the SQL sets it.
- Time source: **database clock** (`statement_timestamp()`), not the Node clock, so lease comparisons and reaper cut-offs use one clock across API restarts. Tests move time by writing `lease_until`/`updated_at` directly.

### 2.1 Constraints (named, same style as `queues_*_check`)

```sql
CONSTRAINT "processed_operations_kind_check"
  CHECK ("kind" IS NULL OR "kind" = 'panel_mutation'),
CONSTRAINT "processed_operations_panel_columns_check" CHECK (
  ("kind" IS NULL
     AND "state" IS NULL AND "fingerprint" IS NULL AND "lease_until" IS NULL AND "attempt_count" = 0)
  OR
  ("kind" = 'panel_mutation'
     AND "state" IN ('processing', 'completed', 'failed_retryable')
     AND "fingerprint" IS NOT NULL
     AND "attempt_count" >= 0
     AND ("state" = 'processing') = ("lease_until" IS NOT NULL)
     AND "operation_key" LIKE 'panel:%')
)
```

- Non-panel writers cannot accidentally become panel rows, and panel rows cannot lose their lease while `processing` or keep one after.
- `operation_key LIKE 'panel:%'` accepts legacy `panel:<session>:` and new `panel:v2:` keys. The ≥ 32-character rule (owner decision 3) is enforced in the route (it validates the client key, not the stored key), not by CHECK.

## 3. Atomic SQL (all via `$queryRaw`, single statements, autocommit or inside the caller's transaction)

`$1` = `panel:v2:<key>`, `$2` = fingerprint, `$3` = fencing `attempt_count`, lease = `interval '60 seconds'`.

### 3.1 Begin

```sql
INSERT INTO processed_operations (operation_key, result, kind, state, fingerprint, lease_until, attempt_count, updated_at)
VALUES ($1, jsonb_build_object('kind','panel_mutation','fingerprint',$2), 'panel_mutation', 'processing', $2,
        statement_timestamp() + interval '60 seconds', 1, statement_timestamp())
ON CONFLICT (operation_key) DO NOTHING
RETURNING attempt_count;
```

One row → `started` (owner holds `attempt_count = 1`). Zero rows → step 3.2. `ON CONFLICT DO NOTHING` replaces today's catch of the unique violation (no aborted statement inside a caller transaction).

### 3.2 Takeover (route class decides which statement; never both)

`reexecutable` route — takes an expired lease or a `failed_retryable` row and runs again:

```sql
UPDATE processed_operations
   SET state = 'processing', lease_until = statement_timestamp() + interval '60 seconds',
       attempt_count = attempt_count + 1, updated_at = statement_timestamp()
 WHERE operation_key = $1 AND kind = 'panel_mutation' AND fingerprint = $2
   AND ((state = 'processing' AND lease_until < statement_timestamp()) OR state = 'failed_retryable')
RETURNING attempt_count;
```

`terminal_unknown` route — an expired lease is resolved without re-execution:

```sql
UPDATE processed_operations
   SET state = 'completed', lease_until = NULL, updated_at = statement_timestamp(),
       result = result || jsonb_build_object('statusCode', 503,
                 'responseBody', jsonb_build_object('code', 'OPERATION_OUTCOME_UNKNOWN'))
 WHERE operation_key = $1 AND kind = 'panel_mutation' AND fingerprint = $2
   AND state = 'processing' AND lease_until < statement_timestamp()
RETURNING result->'statusCode' AS status_code, result->'responseBody' AS response_body;
```

One row → winner (re-execute with the returned `attempt_count`, or replay the stored 503). Zero rows → someone else owns it or it is not takeable; then a **classification-only** read (`SELECT kind, state, fingerprint, lease_until, result ... WHERE operation_key = $1`): no row (reaped meanwhile) → retry 3.1 once; `kind IS NULL` or other fingerprint → 422 `IDEMPOTENCY_KEY_REUSED`; `completed` → replay; `processing` with valid lease → 409 `PANEL_OPERATION_ALREADY_IN_PROGRESS` + `Retry-After: 2`; `failed_retryable` on a `terminal_unknown` route → see architect question 1. The read never decides ownership, so it is not read-then-write.

**Exactly one winner:** under READ COMMITTED, concurrent `UPDATE`s on the same PK serialize on the row lock; the loser re-evaluates the `WHERE` against the winner's committed version (`state = 'processing'` with a fresh lease, or `completed`) and matches 0 rows.

### 3.3 Complete and fail (fenced)

```sql
-- 2xx/4xx, or 5xx on a terminal_unknown route (body = {code:'OPERATION_OUTCOME_UNKNOWN'}, status 503)
UPDATE processed_operations
   SET state = 'completed', lease_until = NULL, updated_at = statement_timestamp(),
       result = result || jsonb_build_object('statusCode', $4::int, 'responseBody', $5::jsonb)
 WHERE operation_key = $1 AND fingerprint = $2 AND state = 'processing' AND attempt_count = $3
RETURNING 1;

-- 5xx on a reexecutable route
UPDATE processed_operations
   SET state = 'failed_retryable', lease_until = NULL, updated_at = statement_timestamp(),
       result = result - 'statusCode' - 'responseBody'
 WHERE operation_key = $1 AND fingerprint = $2 AND state = 'processing' AND attempt_count = $3
RETURNING 1;
```

The `attempt_count = $3` fence stops a slow original owner (its lease expired and was taken over) from overwriting the new owner's outcome. Zero rows → log `code` + truncated key hash only (AC 26) and keep the response; the header `idempotency-store: pending` stays as today. Replays never store or re-send headers (AC 23); the one-time overlay secret body substitution stays in the route.

## 4. Indexes

```sql
CREATE INDEX "processed_operations_panel_finished_idx"
  ON processed_operations (updated_at)
  WHERE kind = 'panel_mutation' AND state IN ('completed', 'failed_retryable');

CREATE INDEX "processed_operations_panel_lease_idx"
  ON processed_operations (lease_until)
  WHERE kind = 'panel_mutation' AND state = 'processing';
```

- Both serve only the reaper (§5); begin, takeover and completion use the PK. Size is bounded by 24 h of panel mutations (hundreds of rows), and chat rows are excluded by the predicate.
- Plain `CREATE INDEX` (not `CONCURRENTLY`): it holds a `SHARE` lock (blocks writes, not reads) for the build time of a small table; `CONCURRENTLY` cannot run in a transaction block and adds failure modes (invalid index) not worth it here. Re-evaluate if `processed_operations` exceeds ~1 M rows (chat growth) — see risk R5.

## 5. Reaper (API process: at startup and every N minutes; not the worker)

```sql
WITH doomed AS (
  SELECT operation_key FROM processed_operations
   WHERE kind = 'panel_mutation'
     AND ((state IN ('completed', 'failed_retryable') AND updated_at < statement_timestamp() - interval '24 hours')
       OR (state = 'processing' AND lease_until < statement_timestamp() - interval '24 hours'))
   ORDER BY operation_key
   LIMIT 500
   FOR UPDATE SKIP LOCKED
)
DELETE FROM processed_operations p USING doomed d
 WHERE p.operation_key = d.operation_key
RETURNING 1;
```

- Loop while a batch returns 500 rows, each batch its own short transaction; stop after a bounded number of batches per run. `SKIP LOCKED` means the reaper never waits on a row that a takeover or completion is updating, and never blocks them for longer than one batch.
- `kind = 'panel_mutation'` is the hard guard: chat and archive challenge rows (`kind IS NULL`) are never selected (AC 24). Their own retention is out of scope.
- Retention clock is `updated_at` (time of the last outcome), so a stored replay is available for 24 h after completion, not after creation. Legacy rows (backfilled `updated_at = created_at`) go on the first run.
- A takeover racing with deletion of a > 24 h expired row: the `UPDATE` waits for the reaper's commit, finds no row, returns 0; the classification read finds none and 3.1 re-inserts. Correct, because a lease expired for 24 h means the original request is long gone.
- Use `SET LOCAL lock_timeout = '2s'` per batch; a timeout skips the run and logs a code, never crashes the API.

## 6. Migration plan (expand only)

Single migration, e.g. `2026102xxxxxxx_panel_operation_lease` (name chosen by `@dev` at implementation; timestamp after any OPS-20 migration that merges first, both touch `schema.prisma`):

1. `SET lock_timeout = '5s'; SET statement_timeout = '60s';` — fail fast rather than queue behind a live API transaction; the deploy runs with the API stopped (`prisma migrate deploy` before start), so contention is not expected.
2. One `ALTER TABLE processed_operations ADD COLUMN kind TEXT, ADD COLUMN state TEXT, ADD COLUMN fingerprint TEXT, ADD COLUMN lease_until TIMESTAMPTZ(3), ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0, ADD COLUMN updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;` — `ACCESS EXCLUSIVE` for milliseconds; constant/stable defaults are stored in the catalog (no rewrite). Existing non-panel rows get `updated_at` = migration time; harmless (never read for them).
3. Backfill (bounded to panel rows, which are few): `UPDATE processed_operations SET kind = 'panel_mutation', state = 'completed', fingerprint = COALESCE(result->>'fingerprint', ''), lease_until = NULL, attempt_count = 0, updated_at = created_at WHERE result->>'kind' = 'panel_mutation';` — the `COALESCE` keeps the CHECK satisfiable for any malformed legacy row (it is unmatchable anyway).
4. `ADD CONSTRAINT ... CHECK (...) NOT VALID` for both constraints, then `VALIDATE CONSTRAINT` (only `SHARE UPDATE EXCLUSIVE`).
5. Both `CREATE INDEX` (§4).
6. Prisma schema: new optional fields with `@map`, `attemptCount Int @default(0)`, `updatedAt DateTime @default(now())` (no `@updatedAt`). Chat and archive challenge code unchanged.

Duration risk: steps 2, 4, 5 scale with table size because of chat rows (validation and index predicate evaluation scan the table). At expected sizes (≤ 10^5 rows) this is sub-second to a few seconds; the `statement_timeout` turns an unexpected large table into a clean failure, not a hung deploy. No `ENUM`, no type change, no default change on existing columns, no `DROP`.

## 7. Snapshot and rollback

- **Snapshot before deploy:** `pg_dump --table=processed_operations --format=custom` of the product database to a project-local path (never a backup table in the database). The migration itself only adds; the snapshot protects against a bad backfill.
- **Code rollback (preferred):** old code ignores the new columns. It reads `result.kind`/`result.fingerprint` (kept) and its `panel:<session>:` keys never match `panel:v2:` rows, so v2 rows are inert. Rows written by old code have `kind IS NULL` columns with `result.kind = 'panel_mutation'` → they pass the CHECK (non-panel branch). Rolling forward again requires re-running the step 3 backfill (idempotent, add `AND kind IS NULL`) so the reaper sees them; the forward migration or the API startup must include it.
- **Schema rollback:** a forward migration that drops the two indexes, two constraints and six columns. Dropping columns is destructive and needs explicit owner approval; it is not part of this plan.

## 8. RLS

Not applicable. This is a local, single-operator PostgreSQL (not Supabase/PostgREST): no `anon`/`authenticated` roles, no client connects to the database directly, and rows have no per-user ownership. Authorization is in the API (`onRequest` host, origin, session and CSRF checks). Enabling RLS would add policies for the single application role and protect nothing. Re-evaluate only if a second DB role or direct client access appears.

## 9. SQL-level integration tests (disposable PostgreSQL 18, real Prisma migrations; no SQLite, no Prisma mocks)

Race tests use **two or more real connections** (two `PrismaClient` instances or two `pg` clients); interleaving is forced deterministically by holding a row lock in an open transaction on connection A (`BEGIN; SELECT ... FOR UPDATE` or the takeover `UPDATE` without commit) while connection B issues its statement, then committing A.

| # | Test | Expected |
|---|---|---|
| T1 | Migration applies on an empty DB and on a DB seeded with legacy rows (panel `processing`, panel `completed`, chat message, chat cooldown, archive challenge `issued`) | Legacy panel rows → `completed`, no lease, `updated_at = created_at`; non-panel rows have all panel columns `NULL`/`0`, `result` byte-identical |
| T2 | CHECK: insert non-panel row with `state` set; panel row `processing` without lease; `completed` with lease; `state = 'done'`; `kind = 'other'` | Each rejected (`23514`) |
| T3 | Unchanged writers: run the chat cooldown/message and archive challenge issue/confirm repository paths after migration | Same results as before; columns stay `NULL`/`0` |
| T4 | Begin twice concurrently with the same key (2 connections) | Exactly one `INSERT ... RETURNING` row; the other gets 0 and classifies `in_progress` |
| T5 | Stuck after 5xx: `terminal_unknown` 5xx completes with stored 503 `OPERATION_OUTCOME_UNKNOWN`; `reexecutable` 5xx → `failed_retryable`, no body | Row states as stated; replay returns 503 code; retry with same key re-executes once |
| T6 | Expired-lease takeover (set `lease_until` in the past) for each class | `reexecutable`: `attempt_count` 2, new lease; `terminal_unknown`: `completed` 503 stored, no re-execution |
| T7 | Concurrent takeover, 2 and 5 connections, lease expired | Exactly one row returned in total; losers 0 rows → 409 classification |
| T8 | Valid lease | Takeover 0 rows; classification → 409 + `Retry-After: 2` |
| T9 | Fingerprint mismatch (same key, other body/url) on each state | 0 rows on takeover; classification → 422 `IDEMPOTENCY_KEY_REUSED` |
| T10 | Replay of `completed` | Stored status/body returned; no header stored in `result` |
| T11 | Fencing: owner A (attempt 1) lease expires, B takes over (attempt 2), A completes with `attempt_count = 1` | A's `UPDATE` 0 rows; B's outcome kept |
| T12 | Reaper keeps non-panel rows: seed old (> 24 h `created_at`) chat, cooldown, archive challenge rows plus panel rows in each state at 23 h / 25 h | Only panel `completed`/`failed_retryable` with `updated_at` > 24 h and `processing` with lease expired > 24 h are deleted |
| T13 | Reaper batching: 1 200 eligible rows, batch 500 | 3 batches, all deleted, non-panel untouched |
| T14 | Reaper vs takeover (2 connections): A holds the row lock via takeover in an open transaction; reaper runs | Reaper skips the locked row (`SKIP LOCKED`), does not wait; after A commits, the row is not eligible |
| T15 | Reaper deletes > 24 h expired row while B's takeover waits | B gets 0 rows, classification finds none, re-insert succeeds once |
| T16 | Legacy key isolation: legacy `panel:<session>:<k>` row plus request with `panel:v2:<k>` | No match; new row created; first reaper run deletes the legacy row |
| T17 | Completion inside a domain transaction (slice 5 input): domain change + fenced completion in one tx, then forced rollback | Both rolled back; row stays `processing` with lease |
| T18 | `EXPLAIN` of the reaper predicate on a table with 10^5 chat rows | Uses the partial indexes, no seq scan of chat rows |
| T19 | Shape tests updated explicitly: `postgres-foundation`, `qra-postgres-fixtures`, `queue-repository` in-progress (`:641,654`) and archive challenge (`:1807,1868`) | Green with explicit assertions, no loosening |

Evidence class for all of them: **API/PostgreSQL disposable**. Route-level 409/422/`Retry-After` behavior also needs HTTP integration tests (`@qa` plan); these rows prove only the SQL contract.

## 10. Interplay with OPS-20

- OPS-20 writes `refund_eligibility_decisions` and the FND-3 financial outbox (`financial:{redemption_id}`) inside its domain transactions; this design touches neither table. Its new panel mutations start `terminal_unknown`; a lease takeover on them stores `OPERATION_OUTCOME_UNKNOWN` and cannot re-create a decision or outbox row.
- For slice 5, OPS-20 routes have strong guards to cite: the decision PK (one per redemption) and the outbox `idempotency_key` UNIQUE. Completion inside their transaction (Q5) is feasible there; any Twitch call after commit still blocks promotion.
- Both stories change `schema.prisma` and add a migration; whichever merges second renames its migration timestamp and rebases. No ordering dependency between the DDL.

## 11. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | N7: a takeover re-executes a committed operation on a wrongly promoted route | Default `terminal_unknown`; promotion only with T17-style proof per route; fencing prevents double completion, not double execution |
| R2 | Lease (60 s) shorter than a real request (N8) | AC 25 timeouts before the lease ships; fencing (T11) limits damage to the stored outcome |
| R3 | Code rollback then roll-forward leaves `kind IS NULL` panel rows the reaper never sees | Idempotent re-backfill at roll-forward (§7) |
| R4 | Session id remains in `audit_logs.actor_id` indefinitely | Out of scope; keeps option A blocked; separate story |
| R5 | `chat-message:*` rows grow without bound (pre-existing), slowing future DDL on this table | Not changed here; flag for a retention story; `statement_timeout` in the migration |
| R6 | DB clock vs Node clock skew in tests | All lease/reaper times from `statement_timestamp()`; tests set columns directly |

## 12. Questions for `@architect`

1. A key in `failed_retryable` (written while its route was `reexecutable`) is retried after the route is demoted to `terminal_unknown`: replay `OPERATION_OUTCOME_UNKNOWN` or re-execute? Proposal: complete with `OPERATION_OUTCOME_UNKNOWN` (safe side). Should the row store the route class at begin (`route_class TEXT`) to make this explicit?
2. Confirm the database clock (`statement_timestamp()`) as the single time source for lease and retention.
3. Confirm that `result.kind`/`result.fingerprint` stay dual-written for rollback compatibility until slice 7, and `result.state` stops being written.
4. Reaper interval (proposal: every 15 minutes, batch 500, at most 10 batches per run).

## 13. Gate verdict

**GO** for slice 4 implementation planning from the data side: §7 Q1–Q6 answered, migration designed (expand-only, no rewrite, reversible forward), atomic SQL and test list defined. Conditions before slice 4 merges: AC 25 timeouts verified, architect answers to §12 Q1–Q2, T1–T19 Red-first on disposable PostgreSQL. Nothing here was executed; it is a design, not evidence.
