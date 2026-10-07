# OPS-8 TDD log

[Português brasileiro](../../pt-BR/stories/OPS-8/tdd-log.md)

## Planning phase — 2026-10-07

- The Spec Pipeline was completed before behavior implementation. No implementation tests have run yet, so no Red/Green result is claimed here.
- This is a timestamped planning baseline; implementation evidence is appended below and supersedes the “not run yet” state.
- Planning identified the first required regression: a network/timeout error from startup token validation currently sets `reconnect_required` and marks the credential row, despite not proving revocation. The test must first demonstrate that incorrect behavior.
- Each behavior change below records the exact command, Red failure caused by missing/incorrect behavior, Green implementation result, and refactor rerun.

## Increment P1 — typed startup token recovery and hourly retry (2026-10-07)

- **Behavior:** temporary validation errors remain retryable and do not mark OAuth credentials as lost; a 401 access token tries the saved refresh token; only a definitively rejected refresh or identity/scope mismatch requests reconnection; transient hourly validation retries on a controlled timer.
- **Red — transient startup:** `npm test -- --run tests/unit/twitch-auth-runtime.test.js -t 'keeps saved credentials recoverable when startup validation fails transiently'` — failed because the runtime returned `reconnect_required` for `TypeError: fetch failed`.
- **Red — access-token refresh:** `npm test -- --run tests/unit/twitch-auth-runtime.test.js -t 'keeps saved credentials recoverable|refreshes an invalid access token'` — 2 failed: transient validation incorrectly requested consent and an invalid access token skipped the saved refresh token.
- **Red — hourly retry contract:** `npm test -- --run tests/unit/twitch-auth-runtime.test.js -t 'retries transient hourly validation failures'` — failed because the interval callback did not surface the async validation result to the controlled test and no observable retry callback was scheduled.
- **Green/refactor:** `npm test -- --run tests/unit/twitch-auth-runtime.test.js` — initially 7 passed, then 8 passed after adding the transient refresh-provider reconstruction regression. The runtime now creates the provider only after remote token validation, refreshes invalid access tokens, waits for durable token persistence before activation, classifies only structured known token-endpoint 400/401 failures as definitive refresh rejection, and uses bounded 5-second-to-5-minute jittered retries for transient hourly validation. Raw SDK errors are not projected.
- **TDD correction:** the first draft of the startup rejection test treated a generic validation error as permanent. It was updated before Green to use the actual Twurple `InvalidTokenError` plus structured HTTP 401 from the token endpoint, so the accepted test matches the verified SDK contract.

## Increment P2 — non-blocking integration supervisor (2026-10-07)

- **Behavior:** local runtime creation returns while Twitch validation/eligibility is pending; transient authentication and Channel Points availability failures schedule one jittered retry; stop cancels retry; successful recovery creates one active adapter/listener.
- **Red — local readiness:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'returns the local integration while Twitch eligibility is still unreachable'` — failed because the local integration waited for the unresolved eligibility promise and hit the test's 25 ms guard.
- **Red — transient eligibility:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'retries transient Channel Points eligibility failures'` — failed because `channel_points_unavailable` was projected as permanent `ineligible`, with no retry scheduled.
- **Green/refactor:** `npm test -- --run tests/unit/twitch-integration.test.js tests/unit/twitch-auth-runtime.test.js` — 17 passed after local readiness was decoupled from Twitch, retries were supervised at 5 seconds through 300 seconds with jitter, and late startup was guarded by stop state. Eligibility failures recover without duplicating listeners.

## Increment P3 — EventSub startup exhaustion (2026-10-07)

- **Behavior:** EventSub reports initial socket failure separately from a real previously established socket disconnect. An initial failure stops that listener and schedules a supervised restart; an established socket reconnect remains under Twurple's persistent connection policy and is reconciled by the existing ready/reconnect path.
- **Red — EventSub disconnect signal:** `npm test -- --run tests/unit/eventsub-runtime.test.js -t 'reports initial socket exhaustion separately'` — failed because the runtime never notified its caller when the first socket disconnected.
- **Red — supervised listener restart:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'restarts EventSub after startup socket exhaustion'` — after temporarily removing the restart branch, failed because status stayed `degraded` instead of `retrying` and no timer was created.
- **Green/refactor:** `npm test -- --run tests/unit/eventsub-runtime.test.js tests/unit/twitch-integration.test.js tests/unit/twitch-auth-runtime.test.js` — 23 passed with safe disconnect metadata and one supervised listener restart. Raw disconnect errors are not exposed.

## Increment P4 — visible retry state (2026-10-07)

- **Behavior:** `/health`, setup status, and the panel show an explicit localized retry state (`retrying` / “Reconnecting”), separate from confirmed OAuth reconnection requirements.
- **Red:** `npm test -- --run tests/unit/health-status.test.js -t 'shows automatic reconnection as a retrying state'` — failed because the new status fell back to “Estado desconhecido”. `npm test -- --run tests/unit/health-route.test.js tests/unit/setup-messages.test.js tests/unit/health-status.test.js` — setup localization cases failed with the safe “Status unavailable” fallback.
- **Green/refactor:** the three-file command passed after adding the whitelisted health state and pt-BR, English, and Spanish catalog/status labels. Then `npm test -- --run tests/unit/twitch-integration.test.js tests/unit/twitch-auth-runtime.test.js tests/unit/eventsub-runtime.test.js tests/unit/health-status.test.js tests/unit/health-route.test.js tests/unit/setup-messages.test.js` passed 81/81 before the added EventSub restart case; the final affected-suite rerun is recorded below.
- **Environment-only command error:** an initial combined Vitest invocation supplied `--testNamePattern` twice and was rejected by the CLI before tests ran; it is not counted as Red evidence.

## Increment P5 — return to healthy status after hourly recovery (2026-10-07)

- **Behavior:** transient hourly token validation marks the integration retrying; successful token validation returns it to connected only while the EventSub socket is currently ready. A token recovery alone never claims chat readiness.
- **Red:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'leaves retrying after scheduled token validation recovers'` — failed because no `onRecovered` callback was passed to the auth runtime (`TypeError: authCallbacks.onRecovered is not a function`).
- **Green/refactor:** the same targeted command passed after wiring safe recovery state to the current EventSub availability; the test covers recovery both before and after EventSub readiness.

## Increment P6 — revoked scope vs temporary Channel Points outage (2026-10-07)

- **Behavior:** Helix 401/403 during Channel Points eligibility is treated as authorization loss and asks for OAuth reconnection; other failures remain retryable and never leak SDK response text.
- **Red — adapter:** `npm test -- --run tests/unit/twitch-adapter.test.js -t 'distinguishes revoked Channel Points authorization'` — failed because HTTP 403 was collapsed into `channel_points_unavailable` instead of a distinct authorization decision.
- **Red — integration:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'requires OAuth reconnection when Channel Points returns an authorization denial'` — failed because the integration exposed `ineligible` and did not mark the saved authorization for reconnection.
- **Green/refactor:** the adapter now returns only a safe authorization reason; integration marks reconnect-required, stops Twitch work, and does not start EventSub. The final focused regression suites pass as recorded below.

## Increment P7 — preserve exponential delay after EventSub startup failures (2026-10-07)

- **Behavior:** repeated failures before EventSub's first ready event increase the backoff; the retry counter resets only after a real ready socket.
- **Red:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'restarts EventSub after startup socket exhaustion'` — failed because the second startup failure still retried after 5,000 ms rather than 10,000 ms.
- **Green/refactor:** the counter is now preserved through adapter/listener construction and reset on `onReady`. Final focused command: `npm test -- --run tests/unit/twitch-integration.test.js tests/unit/twitch-auth-runtime.test.js tests/unit/eventsub-runtime.test.js tests/unit/twitch-adapter.test.js tests/unit/health-status.test.js tests/unit/health-route.test.js tests/unit/setup-messages.test.js` — 7 files, 99 passed.

## Increment P8 — cancel retries during shutdown (2026-10-07)

- **Behavior:** SIGTERM/SIGINT integration shutdown cancels the pending initialization timer; a late timer callback cannot start another auth/listener attempt.
- **Red:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'cancels a scheduled initialization retry during shutdown'` — failed because `clearTimeout` was not called for the retry timer.
- **Green/refactor:** the same command passed after shutdown canceled the timer and retained the stopped guard. The complete focused integration/auth/EventSub/adapter/health/setup command passed 7 files / 100 tests.

## Increment P9 — OAuth not-yet-authorized is not a retry failure (2026-10-07)

- **Behavior:** a validated Twitch app without broadcaster access/refresh tokens stays `not_configured`; it does not create an auth provider or a retry loop before the streamer completes OAuth.
- **Red:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'does not retry while a Twitch app is saved but the channel has not completed OAuth'` — failed because status became `retrying` and scheduled a retry.
- **Green/refactor:** the same targeted command passed after the supervisor required stored user tokens before beginning Twitch validation/retries; the normal OAuth callback starts it after tokens persist.

## Increment P10 — refresh an invalid Helix access token (2026-10-07)

- **Behavior:** a Helix 401 is separated from scope denial (403), validated/refreshed using the saved Authorization Code refresh token, and the eligibility read is repeated once after confirmed token recovery. A 403 remains `reconnect_required`; temporary network/service errors remain retryable.
- **Red — adapter:** `npm test -- --run tests/unit/twitch-adapter.test.js -t 'classifies an invalid access token separately'` — failed because HTTP 401 was classified as authorization denial.
- **Red — integration:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'refreshes a rejected Helix access token'` — failed because the auth runtime's saved-token validation was never invoked.
- **Green/refactor:** `npm test -- --run tests/unit/twitch-integration.test.js tests/unit/twitch-auth-runtime.test.js tests/unit/twitch-adapter.test.js` — 3 files / 40 tests passed. Token recovery reuses the current provider, and the read is retried only once.

## Increment P11 — rebuild Twurple after a cached transient refresh failure (2026-10-07)

- **Behavior:** when `getAccessTokenForUser` fails during an automatic refresh, Twurple caches that failure on its provider. A transient outage must reconstruct the provider from persisted credentials so a later retry can refresh; definitive auth loss still stops retries.
- **Red:** `npm test -- --run tests/unit/twitch-auth-runtime.test.js -t 'access-token acquisition itself cached a transient refresh failure'` — failed as expected: `providerFactory` was called once instead of twice; the next attempt reused Twurple's cached failed provider.
- **Green/refactor:** the same targeted test passed after the runtime recognized the public `CachedRefreshFailureError` and recreated the provider from persisted credentials. `npm test -- --run tests/unit/twitch-auth-runtime.test.js tests/unit/twitch-integration.test.js tests/unit/twitch-adapter.test.js` then passed 3 files / 41 tests.

## Increment P12 — await durable reconnect-required state (2026-10-07)

- **Behavior:** when Twurple reports a definitive refresh rejection through its callback and the same exception reaches startup, both paths share and await one persistence operation before startup returns `reconnect_required`.
- **Red:** `npm test -- --run tests/unit/twitch-auth-runtime.test.js -t 'waits for reconnect-required persistence when Twurple reports a rejected refresh callback'` — failed because the runtime promise settled while the repository's `markReconnectRequired` promise was still unresolved.
- **Green/refactor:** the targeted regression passed after `loseAuth` retained a shared promise; the complete auth-runtime suite passed 10/10.

## Increment P13 — enforce the retry ceiling after jitter (2026-10-07)

- **Behavior:** both the hourly token-validation loop and the application integration supervisor must keep the randomized retry delay at or below 300 seconds, including when jitter is at its maximum.
- **Red — auth runtime:** `npm test -- --run tests/unit/twitch-auth-runtime.test.js -t 'keeps jittered hourly retries at or below the 300-second maximum'` — failed because the final delay was 359,880 ms.
- **Red — integration supervisor:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'keeps jittered integration retries at or below the 300-second maximum'` — failed for the same 359,880 ms delay.
- **Green/refactor:** both targeted commands passed after applying the cap after jitter. `npm test -- --run tests/unit/twitch-auth-runtime.test.js tests/unit/twitch-integration.test.js tests/unit/twitch-adapter.test.js` passed 3 files / 44 tests.

## Persistence and Compose acceptance evidence (2026-10-07)

- Final `npm test` passed 87 files / 728 tests and included real isolated PostgreSQL migrations, outbox persistence/lease recovery, and isolated fresh Compose first-run, HTTPS health, and restart acceptance. This run includes P12 and P13.
- The active installation was inspected before restart: project `subarushogun-gi-twitch-queue-bot`, database container `7dc88a8c95f2`, two existing named volumes (`..._postgres_data`, `..._operational_secrets`), one saved OAuth row, and zero pending/processing/unknown outbox operations. Its channel was ineligible and the read-only Twitch probe was healthy.
- `docker compose up -d --build` rebuilt the current branch as `v0.11.0-0000000-alpha`, reran bootstrap/migrations successfully, and kept the existing database container ID and both volumes. `/health` returned `status=ok`, database `connected`, Twitch `ineligible`, and read-only API latency 192 ms. PostgreSQL still had one OAuth row and zero pending outbox operations. No Twitch reward/chat/redemption write was performed. The existing product volumes were not removed.

## Final quality and clean-instance acceptance (2026-10-07)

- Final gates after P13: `npm run lint`, `npm run typecheck`, `npm test` (87 files / 728 tests), `npm run review:static` (0 findings / 72 JavaScript files), `npm run validate:version` (`v0.11.0-0000000-alpha`), `npm run validate:localization` (chat/lifecycle/overlay/panel/setup; en/es/pt-BR), `docker compose config --quiet`, and `git diff --check` passed. Lint first exposed an unused test callback parameter, then a missing `setImmediate` global in P12; replacing it with `vi.waitFor` fixed the test harness and all gates passed.
- A separate clean project was built and started with `APP_PORT=3308 LOCAL_CERT_DIRECTORY=<temporary-directory> docker compose -p ops8-clean-accept up -d --build`. Bootstrap and six migrations completed; the new database had zero OAuth records; HTTPS `/health` reported `v0.11.0-0000000-alpha`, database `connected`, Twitch `not_configured`. After inserting a test-only persistence marker, bot stop/start preserved the marker, migration count, and database-password hash. The isolated test project remains available at `https://localhost:3308`; its own volumes are separate from and did not replace/delete the user's active volumes.
- After the clean-instance check, the active user install was also rebuilt and remained healthy on the original database container and named volumes; one OAuth row remained and there were zero pending financial outbox operations. The connected channel remains ineligible, so no reward, redemption, chat, or EventSub write path was invoked.
- After P13, both active and isolated images were rebuilt from the current source. Active `/health` returned `ok`, database `connected`, Twitch `ineligible`, and a read-only ping of 191 ms; isolated `/health` returned `ok`, database `connected`, Twitch `not_configured`. Both HTTPS requests passed using each installation's exported CA. The active OAuth record and data/secrets volumes remained intact; the isolated persistence marker remained available. The host trust store still contains an older CA, so system-default browser/curl trust was not revalidated.
