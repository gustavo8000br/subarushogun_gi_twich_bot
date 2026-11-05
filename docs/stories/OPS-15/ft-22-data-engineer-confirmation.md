# FT-22 (#90) — `@data-engineer` written confirmation: `outbox.payload` holds `{ previousPosition }`

- **Date:** 2026-10-28
- **Agent:** `@data-engineer` (Dara)
- **Scope:** the gate in the OPS-15 story, section "Slices FT-21 and FT-22", FT-22 ("`@data-engineer` written confirmation that `outbox.payload` JSON holds `{ previousPosition }` with no DDL"), and the FT-22 row in `docs/process/backlog-inventory.md`.
- **Method:** static reading of the schema, the real migrations and the code in this checkout. No database was queried, no Docker was started, no test was run, and nothing was implemented. This document is a design confirmation, not runtime evidence.

## Decision

**CONFIRMED, NO MIGRATION.** `outbox.payload` is the right place for `{ previousPosition }`. FT-22 needs no DDL, no new index, no constraint change and no backfill. The `@dev` can start FT-22 (after FT-21, same file `chat-handler.mjs`).

## Evidence

| # | Fact | Location |
|---|------|----------|
| E1 | `payload` is `JSONB NOT NULL DEFAULT '{}'::jsonb`, with no CHECK and no JSON-schema constraint on its content. | `apps/api/prisma/migrations/202610020001_foundation/migration.sql:91` |
| E2 | No later migration changes `payload` (later outbox migrations only touch `lease_token` and the `status` CHECK). | `202610030001_outbox_lease_token/migration.sql:1`, `202610050001_manual_outbox_resolution/migration.sql:1-2`, `20261014230000_outbox_deletion_cancel_verification/migration.sql:1-2` |
| E3 | Prisma maps it as `payload Json @default("{}")`; the only outbox index is `(status, next_attempt_at)`. | `apps/api/prisma/schema.prisma:117,130` |
| E4 | Payload is already the established place for per-task data read by workers (`isOpen`, `queueVersion`, `requestMayHaveReachedTwitch`, `safeToDelete`, `previous`, `baselineRewardIds`). | `apps/api/src/persistence/queue-repository.mjs:511,534,578,828,1088`; `apps/api/src/outbox/reward-worker.mjs:106,172-175,384` |
| E5 | `chat.call` rows are created today with `payload: {}`; the key is unique per entry (`chat.call:<entryId>`). | `queue-repository.mjs:942-950` |
| E6 | The original position exists only before the transition: calling sets `position: null`, writes `safeDetail.previousPosition` in the audit and returns `previousPosition`. | `queue-repository.mjs:1108,1110,1112` (`callSpecificEntry`) and `:1141-1143` (`callNext`) |
| E7 | The claim returns `callPosition: entry.position` at the top level (always `null` for a called entry) and does not return `payload`. | `queue-repository.mjs:1017` |
| E8 | The worker reads `entry.callPosition` (a field that does not exist on `entry`), so it always renders `?`. | `apps/api/src/outbox/chat-worker.mjs:17,29` |
| E9 | The three enqueue callers have `previousPosition` in hand but do not pass it. The chat handler passes `message`, which the repository ignores. | `apps/api/src/http/queue-routes.mjs:612-613,618-619`; `apps/api/src/commands/chat-handler.mjs:203-208` |
| E10 | The legacy fallback pattern already exists: the audit lookup `entry.transitioned` `waiting -> called`, accepted only if `Number.isInteger`. | `queue-repository.mjs:386-391` |
| E11 | `entries.position` is `INTEGER CHECK (position IS NULL OR position > 0)`, so a valid value always fits in a JSON number with no precision loss. | `migration.sql:70` |
| E12 | No path moves an entry from `called` back to `waiting`, so the unique `chat.call:<entryId>` key does not need a second payload per entry. | `queue-repository.mjs` (only admissions write `status: 'waiting'`, `:1930`) |

## Contract for the `@dev`

1. **Format:** `payload = { "previousPosition": <integer >= 1> }`. Store a JSON number, never a string. Do not store `message` text, login, UID or any other chat data in the payload (data minimization; the payload is not a cache of the message).
2. **Write:** `enqueueCallNotification({ entryId, queueId, previousPosition })` writes the value in the same `create`. Callers pass `moved.previousPosition` / `entry.previousPosition` (E9). If the value is not an integer >= 1, write `{}` (that triggers the fallback); never write `null` or `NaN`.
3. **Read:** the claim returns `payload` (or the already-validated `previousPosition`) in the claimed object. The worker uses the claimed task's value (AC 2), not `entry.callPosition` or `entry.position`.
4. **Fallback (AC 3):** if `payload.previousPosition` is missing or not an integer, use the audit lookup from E10 (the same rule as `:386-391`), done inside the claim transaction. If the audit also has nothing, keep `?`; never invent a number.
5. **Resend:** `resendCallNotification` only changes status/attempt fields (`:963-965`), so the payload and the value are kept. Do not reset the payload there.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| R1 — Turning a queue's UID mode to hidden cancels pending `chat.call` rows and sets `payload: {}` (`queue-repository.mjs:1080-1083`). A later resend revives the row with an empty payload. | Low | The audit fallback covers it. Do not change this path in FT-22 (it belongs to UID privacy); only test it. |
| R2 — Legacy rows (`payload: {}`) already in the database. | Low | The fallback covers them; no backfill. The project is beta with no active users and the dev database is disposable. |
| R3 — `enqueueCallNotification` runs in a separate transaction after the call (E9); the value comes from the caller. | Low | The value is captured in the transition transaction (E6) and is immutable afterwards; there is no race on it. |
| R4 — Writing `{ previousPosition: undefined }` in Prisma removes the key; writing `null` creates JSON `null`. | Low | Validate before writing (contract item 2); the reader always uses `Number.isInteger`. |
| R5 — Performance. | None | The read is by primary key on the claimed row; no `payload` filter, so no GIN index is needed. |

## Rollback

There is no schema change. Rolling back is a code revert; rows written with `previousPosition` stay valid for the old code, which ignores unknown keys in `payload`.

## What the `@dev` and the `@qa` must test on isolated PostgreSQL (real migrations; never SQLite or Prisma mocks)

1. **Panel call (specific entry):** an entry at position N >= 2 is called through the route; the `outbox` row `chat.call:<entryId>` has `payload->>'previousPosition' = N` and `jsonb_typeof(payload->'previousPosition') = 'number'`; the worker sends a message with `posição N`.
2. **Panel and chat `callNext` with `count` > 1:** each row gets its own position (1, 2, ...), matching `safeDetail.previousPosition` in the audit of the same entry.
3. **Chat `!fila proximo`:** same check as item 1 (LB-29 expects `1`).
4. **Legacy row:** insert a `chat.call` row with `payload = '{}'` for an entry that was called with an audit `previousPosition`; the worker uses the audit value.
5. **No data at all:** `payload = '{}'` and no audit transition; the message keeps `?` and the task finishes normally (no crash).
6. **Resend after failure:** row in `retry`/`failed`, resend through the panel; the payload is unchanged and the message keeps the position.
7. **UID hidden (R1):** pending row cancelled by the UID change and then resent; the fallback gives the correct position.
8. **Invalid value is not persisted:** the enqueue with `previousPosition` missing or invalid writes `{}`, never `null`.
9. **Schema guard:** `prisma migrate status` (or the existing migration test) shows no new migration in the FT-22 diff.

Also the worker unit test, Red first (AC 4), separated as unit evidence.
