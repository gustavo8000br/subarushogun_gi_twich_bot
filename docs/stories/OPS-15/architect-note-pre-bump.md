# Architect note before @dev: D-8 ping, FT-53, D-6 (2026-11-05)

Português: `docs/pt-BR/stories/OPS-15/architect-note-pre-bump.md`. Inputs: `po-validation-bugs-pre-bump.md` (AC-D8, AC-F53, AC-D6) and the code read on this date. No GAP in `docs/research-index.md` (rows 17 and 20); no web research. Design only; no code, no git.

## D-A1. D-8 `ping`: one shared asynchronous probe

Current state: `registerHealthRoute` (`apps/api/src/http/health-route.mjs`) owns the probe, a 60 s cache and the single-flight (`pendingProbe`); the chat reads `getTwitchHealth()` through `createTwitchHealthBridge`, which is a passive snapshot (null when `/health` was not called). The clock is `Date.now` (not monotonic).

Decision:
- **Where:** new module `apps/api/src/twitch/shared-api-probe.mjs`, `createSharedApiProbe({ probe, getIntegrationStatus, nowMs = () => performance.now(), ttlMs, failureTtlMs })`, created once in `server.mjs` over `runtime.integration.probeTwitchApi`. `registerHealthRoute` and the chat handler both receive it; the route's private cache is removed (the `probeCacheMs` parameter is replaced by the probe's TTL).
- **Clock:** `performance.now()` (monotonic), `Math.max(0, Math.round(delta))`, integer ms. `twitch.ping()` stays `GET /helix/users?id=<broadcaster>` through Twurple.
- **TTL:** success 30 s, failure 5 s (negative cache, so a failing Twitch is not hammered by chat). Both are named constants in one config object, injectable for tests (fake timers). 30 s (not 60 s) keeps `ping` close to reality; one Helix call per 30 s is far below the rate limit.
- **Who triggers:** whoever asks first (`/health` or `!fila ping`) while the cache is stale; everyone else awaits the same promise (single-flight), so AC-D8-3 and AC-D8-5 hold by construction: one measurement, two readers.
- **Contract:** `read()` returns `{ state: 'ok', ms }`, `{ state: 'failed' }` or `{ state: 'not_connected' }`. `not_connected` when the integration status is not in `connected | degraded | reconciling | ineligible` (same set `/health` uses today); then zero Helix calls. `/health` maps `ok` to `status: connected, pingMs`, `failed` to `status: degraded, pingMs: null`, `not_connected` to today's mapping. Public `/health` fields unchanged.
- **Timeout:** the probe is bounded by 5 s (`Promise.race`); timeout counts as `failed`. The chat never hangs on a stalled Helix.
- **Invalidation:** the cache is dropped when the integration status changes to a non-connected one (or the Twurple instance is rebuilt: `clearSession` in `integration.mjs`), so a stale 219 ms never survives a reconnect.
- **Error codes (closed):** confirm `TWITCH_PROBE_FAILED` (probe threw, returned non-true, or timed out) and `TWITCH_NOT_CONNECTED`. No third code: a timeout is a failure. The code is a fixed string, never `error.message`.
- **Reply without measurement** (`chat.ping.error`, three catalogs; `{version}`, `{code}`): pt-BR `Pong 🏓 - {version} - sem medição da Twitch ({code}).`; en `Pong 🏓 - {version} - no Twitch measurement ({code}).`; es `Pong 🏓 - {version} - sin medición de Twitch ({code}).` Success keeps `Pong 🏓 - {version} - {latency}ms.` No invented number, no raw error. UX review of the final wording stays with `@ux-design-expert` (reply is chat text, not panel).
- **Chat handler:** `getTwitchHealth` is replaced by `probeTwitchApi: () => sharedProbe.read()` and awaited; the existing 5 s cooldown still applies. Version formatting (AC-D8-4) reads the same `VERSION` source as `validate:version`; pure function, never throws.
- **Compatibility:** `createTwitchHealthBridge` becomes unnecessary (the probe is built before both consumers); remove it with its test, or keep a thin adapter in one step; `@dev` chooses, the contract is the one above.

Risks: (1) a failed probe poisoning the cache: bounded by 5 s failure TTL; (2) `pendingProbe` left set after a throw: clear in `finally`; (3) leak: error text never leaves the module. Tests: the five named cases of AC-D8-1/2/3/5 with fake clock and fake adapter; AC-D8-6 with the real `ApiClient` plus fake `fetch` (Twurple fake); one test that the invalidation on status change forces a new call.

## D-A2. FT-53: closed `reason` in the 409

Current state: `cancelQueueDeletion` (`domain/queue-service.mjs`) knows `errorCode` in `fail()` but throws `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` without it; the route (`http/queue-routes.mjs`) answers `{ code, error }` for all refusals.

Decision: `fail()` attaches `reason` to the thrown error from a **closed mapping of `errorCode`**; the route copies `reason` into the body only when it is in the allowlist, and only for this one `code`.

| `errorCode` (internal) | `reason` (public) |
|---|---|
| `authorization_required` (401) | `authorization_required` |
| `queue_deletion_cancel_verification_unavailable` (5xx, network) | `verification_unavailable` |
| `queue_delete_reward_absent` | `reward_absent` |
| `queue_delete_reward_diverged` | `reward_diverged` |
| `queue_delete_cancel_reward_not_paused` | `reward_not_paused` |

- The internal code is never exposed as such; the public value is the mapped one. Anything not in the table: field omitted (AC-F53-2 "without reason"). Free text is impossible by construction.
- **DTO compatibility:** `reason` is additive and optional; `code` and `error` are unchanged, so old clients keep working (beta, no users). The panel switches on `reason === 'authorization_required'` for the specific text and "authorize again" action; every other or missing value falls back to the current generic text. Panel text lives in the three catalogs; `@ux-design-expert` >= 9.0 (AC-F53-3).
- Risks: reason becomes an oracle of Twitch state (low: already visible in the audit and to the same authenticated owner); leaking adapter message (the existing canary tests must stay green). Race: none new, the mapping runs after `failQueueDeletionCancellation` has committed. Tests (PostgreSQL, real migrations): PG36-05 401 row asserts the body `reason`; a 5xx row asserts `verification_unavailable`; canary test on the body; contract test that every emitted `reason` is in the allowlist. Panel test with the 409 fixture.

## D-A3. D-6: structured log of every `degraded` transition

Current state: only `reconciliation_partial` / `reconciliation_failed` log (`logReconciliationDegraded`, event `twitch_reconciliation_degraded`); the `onDisconnect` and `onRevoked` paths of `integration.mjs` call `publishStatus('degraded', ...)` silently.

Decision: log inside `publishStatus` (single choke point), not at each call site, so no future source is silent.
- Event `twitch_integration_degraded`, `level: warn`, `source: 'twitch.integration'`, `details: { reason, trigger?, type?, revokeStatus? }`.
- **Closed `reason` list:** `eventsub_disconnected` (was established), `eventsub_startup_disconnected` (never established), `subscription_revoked` (with `type` = subscription type and `revokeStatus` from Twitch's closed enum), `reconciliation_partial`, `reconciliation_failed`. The reconciliation reasons keep the existing line `twitch_reconciliation_degraded` unchanged (AC-D6-2); the new line is for the three EventSub sources only, and `publishStatus` writes it only when the call carries one of those reasons, avoiding a duplicate line for reconciliation.
- **No noise:** keep `lastDegradedKey = reason|type|revokeStatus`; write only when the status goes into `degraded` or the key changes; reset the key on any non-degraded status. One line per transition (AC-D6-3).
- **Safety:** wrap in `try/catch` exactly like `logReconciliationDegraded`; a logging failure never changes the status. `type` and `revokeStatus` pass through a small allowlist before logging (unknown value logged as `other`), so no Twitch free text, token, UID or chat body can enter.
- Tests (Twurple fake EventSub runtime, no network): disconnect before `onConnected` logs `eventsub_startup_disconnected` once and the retry does not repeat it; disconnect after connect logs `eventsub_disconnected`; revocation of a non-chat type logs `subscription_revoked` with `type`; fake reconciler `partial` still yields only the old line; logger that throws leaves status `degraded`; a serialized-line canary test (no `Bearer`, no UID).

## Order and ownership
1. **@dev Red first:** D-6 logs (AC-D6-1/3), then FT-53 (AC-F53-1/2, PostgreSQL), then D-8 (AC-D8-1/2/3/5 with fake clock).
2. Lower-priority Green: AC-D8-4, 6, 7, 8; panel text after the UX note.
3. **Owner-dependent:** "pode transmitir" for D-6 root cause, OW-17 live `ping` (AC-D8-9); neither enters the `@dev` or `@qa` gate.
