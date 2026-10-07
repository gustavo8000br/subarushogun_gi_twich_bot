# OPS-7 TDD evidence

[Português brasileiro](../../pt-BR/stories/OPS-7/tdd-log.md)

Implementation status: in progress. Evidence below records only commands actually run in this worktree; it does not validate Twitch live behavior.

## Increment 1 — inherited minimum-role decision

- **Behavior:** A `subscriber` minimum admits subscriber, VIP (when enabled), moderator and streamer claims, while rejecting `everyone`/viewer; disabling VIP removes only the VIP claim.
- **Red:** `npx vitest run tests/unit/hierarchical-command-policy.test.js` — 2 tests, 1 failed. The existing resolver returned `role_not_allowed` for `subscriber` at a `subscriber` threshold because it only handled explicit allowlists. This was a behavioral failure.
- **Green:** Added a rank-based branch for validated `minimumRole` definitions and a pure highest-effective-role helper. `npx vitest run tests/unit/hierarchical-command-policy.test.js tests/unit/command-catalog.test.js tests/unit/command-authorization.test.js` — 3 files, 18 tests passed; `npm run lint -- --no-warn-ignored` passed.
- **Refactor/retest:** Kept rank evaluation in a pure helper and reran `npm run typecheck && npx vitest run tests/unit/hierarchical-command-policy.test.js tests/unit/command-catalog.test.js tests/unit/command-authorization.test.js` — typecheck passed and 3 files/18 tests passed.

## Increment 2 — account label mutations are streamer-only

- **Behavior:** A target-channel moderator cannot use `!fila conta <nome>` or `!fila conta reset`; the broadcaster identity can. Viewer read-only `!fila conta` remains unchanged.
- **Red:** Changed the authorization regression expectation before implementation, then ran `npx vitest run tests/unit/command-authorization.test.js -t 'restricts account changes to the streamer'` — 1 selected test failed because the moderator was allowed (`allowed: true`) instead of denied with `streamer_only`.
- **Green:** Marked both account mutations immutable to `streamer` in the canonical catalog. Updated stale catalog/API expectations to the approved contract. `npx vitest run tests/unit/command-authorization.test.js tests/unit/command-catalog.test.js tests/unit/queue-routes.test.js` — 3 files, 51 tests passed.
- **Refactor/retest:** Extracted immutable-command decision/reason handling into a pure helper. `npx vitest run tests/unit/command-authorization.test.js tests/unit/command-catalog.test.js tests/unit/queue-routes.test.js` — 3 files/51 tests passed; `npm run lint -- --no-warn-ignored` and `npm run typecheck` passed. This closes only this increment.

## Increment 3 — versioned policy persistence and legacy compatibility

- **Behavior:** Keep schema version separate from concurrency revision; reads never rewrite v1 arrays; the first explicit v2 save converts untouched arrays to `legacy_exact` and changes only the selected command.
- **Red:** New PostgreSQL integration checks failed first for missing `schemaVersion`, invalid v2 state, and unsupported policy objects; the catalog projection test also failed because an object policy was projected as an empty allowlist.
- **Green:** Added strict v1/v2 parsers, explicit legacy conversion, optimistic revision checks, audit data, and the v2 catalog projection. Real isolated PostgreSQL verifies persistence, legacy preservation, concurrent update conflict, and no read-time rewrite. `npx vitest run tests/integration/command-policy-persistence.test.js tests/unit/hierarchical-command-policy.test.js tests/unit/queue-routes.test.js` — 44 tests passed at that checkpoint.
- **Refactor/retest:** Extracted canonical `resolveCommandPolicy`/allowed-role projection and retained a shared schema/revision DTO. Later focused regression set including both PostgreSQL suites passed: 10 files, 196 tests.

## Increment 4 — panel minimum-role editor and localized audience labels

- **Behavior:** Replace role checkboxes with one minimum-role selector, show inherited audience, preserve untouched legacy selections, save only changed commands, and route a follower threshold through consent when the scope is absent.
- **Red:** `npx vitest run tests/unit/command-catalog-view.test.js -t 'projects threshold'` failed because the view model had no `minimumRole` or legacy review state.
- **Green:** Added the threshold projection/merge helpers, safe DOM rendering with `textContent`, per-command dirty state, follower-scope notice, and en/pt-BR/es labels. `npx vitest run tests/unit/command-catalog-view.test.js tests/unit/localization-parity.test.js` — 15 passed; `npm run lint:web` and `npm run typecheck:web` passed.
- **Refactor/retest:** Kept legacy data visible without implicit conversion and only submits explicitly changed cards. Focused web suites passed again in the final focused run.

## Increment 5 — protected catalog projection and OAuth-start route

- **Behavior:** Expose only a follower-scope readiness boolean; an authenticated, CSRF-protected panel request can stage policies and begin optional consent without writing the policy.
- **Red:** The projection test observed missing `followerScopeReady`; the consent-route test returned 404 and the test for absent follower thresholds confirmed no authorization should begin.
- **Green:** Added a safe boolean projection, policy shape/threshold validation and a route returning only an authorization URL. No token/scope arrays were added to this route's response. `npx vitest run tests/unit/queue-routes.test.js -t 'follower authorization|follower consent'` — 3 tests passed; API lint/typecheck passed.
- **Refactor/retest:** Added a sanitized 503 for integration start failures; Red was HTTP 500, Green returned only the safe message. The route suite later passed in the 196-test focused run.

## Increment 6 — one-time OAuth scope and session-bound intent

- **Behavior:** Add `moderator:read:followers` only for an approved optional-scope request, bind the staged policy/revision to one-time session state, and reject callbacks whose validated token omits any requested scope.
- **Red:** `npx vitest run tests/unit/twitch-oauth.test.js -t 'optional follower|omits the optional scope'` — 2 failures: URL omitted the scope and callback succeeded without it.
- **Green:** Extended the hashed one-time state record with approved optional scopes and server-side context, and required Twitch token validation to report all requested scopes before persistence. The full OAuth unit suite passed (8 tests); API lint/typecheck passed.
- **Refactor/retest:** Added integration injection for token validation so the callback/persistence boundary can be exercised without live Twitch. Final OAuth and integration unit suites passed.

## Increment 7 — transactional token/policy commit and Helix follower check

- **Behavior:** A verified callback stores its replacement token and staged follower policy in one PostgreSQL transaction; a failed policy write rolls the token back. Helix checks use the broadcaster token, exact Twitch IDs, tri-state outcomes, and in-flight coalescing only.
- **Red:** For credential transaction rollback, `npx vitest run tests/integration/queue-repository.test.js -t 'staged OAuth policy work'` initially resolved and persisted the new token because the transaction callback was ignored. For adapter checks, `npx vitest run tests/unit/twitch-adapter.test.js -t 'follower status|missing scope|concurrent follower'` failed because `checkFollower` did not exist. The integration startup tests also failed because follower authorization and callback persistence were absent.
- **Green:** Added `commitAdditional` inside the credential transaction, repository policy updates on the caller transaction, session context wiring, and `api.channels.getChannelFollowers(broadcasterId, userId)` guarded by `getCurrentScopesForUser`. Failures produce `unknown`; completed membership is not cached. `npx vitest run tests/integration/queue-repository.test.js -t 'staged OAuth policy work'`, policy PG transaction test, follower adapter tests and integration tests passed.
- **Process note:** The queue-repository helper prototype was written before its regression test was added. I disabled the helper and demonstrated the behavioral Red, then restored it and got Green; this is not strict test-before-first-draft ordering for that helper. The credential-repository callback itself had a true test-first Red. Keep the story open until independent QA reviews this deviation and all remaining acceptance gates.

## Increment 8 — chat authorization, help and cooldown

- **Behavior:** Verify follower only for follower-dependent commands/help; let verified subscribers and higher roles inherit without Helix; unknown status cannot execute the command; enforce the five-second viewer cooldown for follower/subscriber/VIP/viewer claims.
- **Red:** `npx vitest run tests/unit/command-authorization.test.js -t 'inherits follower access'` failed because no follower claim was accepted. Chat-handler tests failed because no follower verification/help warning occurred. `npx vitest run tests/integration/queue-repository.test.js -t 'applies the viewer cooldown to follower'` failed with invalid role because only viewer/VIP/moderator/streamer were accepted.
- **Green:** Added trusted verification input to the pure authorizer, subscriber inheritance, fail-closed localized messages/help notice, and cooldown coverage for every role below moderator. A denied follower result performs no queue read/mutation. Tests passed: `npx vitest run tests/unit/chat-command-handler.test.js tests/unit/command-authorization.test.js tests/unit/twitch-adapter.test.js` — 46 passed; isolated PostgreSQL cooldown test passed.
- **Refactor/retest:** Removed network queries for subscriber/moderator/streamer and completed results are not cached. The integrated focused set passed: 10 files, 196 tests.

## Increment 9 — localization contract for new audience copy

- **Behavior:** Every new panel audience template must declare the `{roles}` interpolation placeholder to the catalog validator for all supported locales.
- **Red:** The first full `npm test` run finished with 87 files, 6 failures and 696 passes. Each failure was caused by the same behavioral contract rejection: `Placeholder allowlist mismatch for key panel.command.audience.current` while discovering/validating the panel catalog.
- **Green:** Added the `{roles}` allowlist entries for `panel.command.audience.current` and `panel.command.audience.proposed` in the shared panel catalog contract. `npx vitest run tests/integration/panel-localization-contract.test.js tests/unit/command-catalog-view.test.js tests/unit/localization-parity.test.js` — 3 files, 34 tests passed.
- **Refactor/retest:** Reran the complete suite: `npm test` — 87 files, 702 tests passed. `npm run lint`, `npm run typecheck`, `npm run review:static` (0 findings), `npm run validate:version`, and `docker compose config --quiet` all passed.

## Remaining gates

Independent AIOX QA score 10/10 and authorized live Twitch follower-consent/API verification remain open. Do not mark OPS-7 Done or begin OPS-8 until those gates pass. No live Twitch follower call has been performed.
## QA regression — malformed follower response identity

- **Behavior:** Treat a Helix follower response containing any user ID other than the exact requested user as `unknown`; do not grant follower access from a mixed or inconsistent response.
- **Red:** `npx vitest run tests/unit/twitch-adapter.test.js -t 'unexpected user id'` — 1 test failed because the adapter returned `follower` for a response containing both the requested ID and an unrelated ID.
- **Green:** The adapter now returns `unknown` if any returned row has a malformed or unexpected ID; only a non-empty all-exact result returns `follower`. `npx vitest run tests/unit/twitch-adapter.test.js` — 1 file, 14 tests passed.
- **Refactor/retest:** Full suite `npm test` — 87 files, 703 tests passed; `npm run lint`, `npm run typecheck`, `npm run review:static` (0 findings), `npm run validate:version`, and `docker compose config --quiet` passed.
## Increment 10 — restore optional follower consent

- **Behavior:** If saved commands require follower access but the optional Twitch scope is missing, show a direct reauthorization action that stages the already-saved follower policies without requiring an artificial policy edit.
- **Red:** `npx vitest run tests/unit/command-catalog-view.test.js -t 'offers reauthorization'` — 1 test failed because `followerAuthorizationRequest` did not exist, so the panel had no safe payload projection for restoring consent.
- **Green:** Added a projection that includes only saved configurable follower-threshold policies and their current revision; the panel shows a localized reauthorization button only when scope is missing and such policies exist. It posts through the existing protected, session-bound OAuth route. `npx vitest run tests/unit/command-catalog-view.test.js tests/unit/localization-parity.test.js` — 2 files, 16 tests passed; `npm run lint:web` and `npm run typecheck:web` passed.
- **Refactor/retest:** Shared the same authorization-start function with the normal save flow to avoid divergent consent behavior. Full retest: `npm test` — 87 files, 704 tests passed; `npm run lint`, `npm run typecheck`, `npm run review:static` (0 findings), `npm run validate:localization`, `npm run validate:version`, `docker compose config --quiet`, and `git diff --check` passed.
## TDD remediation — transaction-boundary regression

- **Behavior:** The repository exposes the transaction-scoped policy mutation needed to atomically commit OAuth credentials and policy state.
- **Red:** With the PostgreSQL regression test already defined, temporarily removed the repository transaction method and ran `npx vitest run tests/integration/queue-repository.test.js -t 'commits staged OAuth policy work atomically with the replacement token'` — the test failed at the missing transactional capability (`TypeError`), proving the behavior was absent.
- **Green:** Restored the repository method delegating to the shared transaction implementation. The same isolated PostgreSQL test passed: 1 selected test passed, 74 skipped.
- **Refactor/retest:** The earlier process note remains above to preserve the initial prototype chronology; this remediation establishes a fresh test-first Red → Green check at the persistence boundary and does not rewrite that history.
