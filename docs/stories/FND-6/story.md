# Story FND-6: Local Streamer Panel, Protected API, and Operator Experience

[Português brasileiro](../../pt-BR/stories/FND-6/story.md)

**Complexity:** COMPLEX<br>
**Executor:** @dev<br>
**Quality gate:** @qa<br>
**Epic/capability:** Local panel and streamer operations (FND-6)<br>
**Status:** InReview<br>
**Issue:** [#6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6)<br>
**UX planning:** `docs/stories/FND-6/ux-research.md` and its pt-BR counterpart. The desk research and design direction are complete; usability sessions are not claimed.

## User story

As a streamer operating one local installation, I want to configure Twitch, manage every supported queue operation, and see system/recovery status in a clear panel, so I can operate the chatbot during a live stream without editing files or guessing whether an external action succeeded.

## Acceptance criteria

- The panel applies the approved FND-6 information architecture: live overview, queue operations, queue configuration, point recovery, Twitch connection, and local runtime status.
- The panel separates overview, queues/attendance, new queue, financial operations, settings, and Twitch connection into keyboard-accessible pages; first-run OAuth setup appears until connected, the connected-channel summary replaces the wizard afterward, and loss of a previously active connection returns the operator to connection recovery.
- The panel lets an authenticated operator mark a waiting viewer as priority after checking a bounded external-benefit category; two FIFO lanes are ordered priority first, without interrupting called/in-progress service.
- Manual priority admissions are labeled as operator-verified, keep their manual/redemption financial semantics, and never store payment receipts or claim automated verification.
- Queue reward settings include Twitch-native maximum redemptions per stream, maximum redemptions per user per stream, and global cooldown with explicit enable/value controls; the app does not maintain shadow counters for these limits.
- Reward creation and edits use the app-created immutable Twitch reward ID, validate Twitch field constraints, record durable remote intent, and distinguish desired local settings from confirmed remote state, including unknown outcomes.
- The streamer can create and edit queue settings, inspect waiting/called/in-progress/history, manually add, call, start, complete, remove, move, resend, clear, archive, unarchive, open/close and request safe deletion where those application services exist.
- Every visible control performs a real operation or is disabled with a clear reason and next action. The panel uses shared domain/application services and never duplicates domain transitions.
- Twitch configuration and OAuth expose understandable connection, eligibility, permission and recovery states. The Client Secret and tokens never appear in HTML, API responses, URLs, logs or errors.
- `/api/state` remains session-protected and uses explicit projections for `product_version`, `api_contract_version`, state revision, current account, connectivity, queues and privacy-filtered UIDs.
- `/health` reports process/database health, Twitch API connectivity status and measured response latency when configured. An unavailable Twitch integration does not create a container restart loop or make the local panel inaccessible.
- An authenticated but ineligible channel retains token refresh for a read-only Helix reachability probe; `/health` preserves the ineligible status and reports measured latency without starting reward or chat EventSub processing.
- Mutations validate request schemas, local session, Host/Origin, CSRF, operation idempotency and applicable state revision. Repeated operation keys do not repeat domain or financial effects.
- Destructive operations show a reviewable summary and require the domain-specified confirmation. Remote intent stays distinct from Twitch-confirmed state.
- User-controlled text is rendered safely. Automated tests cover host/origin/CSRF, callback session/state, idempotency, concurrent/stale revisions, malicious HTML, secret non-disclosure, and UID privacy changes.
- The panel is keyboard-operable, status is not conveyed by color alone, polling preserves focus/operator context, and the layout works in a narrow desktop window. Manual usability findings are reported only if sessions actually occur.
- Both READMEs describe the current panel workflow, access, point states/recovery, operation, and known platform/live-Twitch validation limits in English and pt-BR.

## Existing foundation

- Local Fastify/static vanilla panel, setup/OAuth flow, CSRF session and Host/Origin checks exist.
- Queue create and operator actions, point-operation views, current-account controls, queue clear, reward ambiguity resolution, call resend, queue archive/unarchive, resumable deletion, terminal history and waiting-entry reordering have initial routes or UI support.
- Local queue settings (timeout, call template, UID output toggles and policy switches) use a protected, version-checked PATCH route and PostgreSQL transaction. UID privacy, reward text, cost, UID input and Twitch-native limits/cooldown use the separate protected reward editor and durable `reward.update` workflow. UID data and pending call text are cleared only as part of this remote intent; local settings cannot bypass Twitch synchronization. PostgreSQL and worker tests cover the flow; live Twitch behavior remains unverified.
- Operator-verified priority admission, priority FIFO ordering, lane-bounded reordering and Portuguese category labels now have route/UI/PostgreSQL coverage.
- Official Twitch review (2026-10-06) found that reward limit/cooldown fields in the original product specification are not yet represented by the current Prisma Queue model or adapter. FND-6 must add them during queue/reward settings work; see `docs/stories/TWITCH-CAPABILITY-GAP-ANALYSIS.md` and the pt-BR equivalent.
- UID-safe DTOs and local-state projection exist. The FND-6 UX desk research and visual/interaction direction are documented.
- Operator-triggered reconciliation is available from the Twitch connection page and API, shares the startup/reconnect reconciler, and coalesces overlapping runs. The operations page exposes retry/reconciliation and explicit manual resolution for irrecoverably unknown redemption state; reward creation ambiguity has a separate revalidated association flow. API mutations require session-scoped persistent idempotency keys and replay completed responses; a repeated key with a changed request conflicts, and a still-processing key requires the operator to refresh state. Remaining acceptance is independent QA and broader eligible-channel Twitch write/EventSub validation. No moderated usability session is claimed.

### TDD — protected local queue-settings editor (partial)

**Red:** A focused web-route contract was added before the settings dialog; it failed because the panel had no queue-settings dialog/action. The failure reason is known from the active work session, but the exact original command is not preserved in the evidence log. This record is intentionally incomplete and does not claim a complete Red trace.

**Green / focused verification:** `npm test -- --run tests/unit/queue-routes.test.js tests/integration/queue-repository.test.js tests/unit/web-route.test.js` — 3 files, 92 tests passed at that point. The original local UID-hide behavior was subsequently corrected: current local settings reject Twitch-managed UID changes, while the protected durable reward edit performs the PostgreSQL cleanup. See the later privacy regression entry below.

**Boundary:** This earlier increment originally hid UID through a local settings update. A later privacy regression test moved that behavior exclusively to the durable Twitch reward edit; current local settings reject `uidMode`, and the reward editor performs atomic UID/pending-notice cleanup. Twitch reward editing and native limit fields are covered in the later TDD section; full FND-6 gates remain open.

## TDD evidence

Record each behavior before implementation with the command, observed Red, Green, and refactor/retest. Do not mark criteria complete based only on mocks when the guarantee depends on PostgreSQL or Compose.

### TDD — panel health and Twitch response latency

**Red:** `npm test -- --run tests/unit/health-route.test.js` — five failures showed missing ping fields, probe timing/cache behavior and degraded status. `npm test -- --run tests/unit/twitch-adapter.test.js -t 'checks Twitch API reachability'` — failed because `adapter.ping` did not exist. `npm test -- --run tests/unit/twitch-integration.test.js -t 'exposes a safe Twitch API probe'` — failed because the integration did not expose the probe. The health display helper and panel markup contracts also failed first because their module/elements were absent.

**Green:** route, adapter, integration, Portuguese projection helper, panel markup and display passed in focused tests. The route caches a successful probe for 60 seconds, measures `ApiClient.users.getUserById`, returns only state/latency, and reports `degraded` if the probe fails. The browser requests `/health` every five seconds but only updates local text labels; Docker's 30-second healthcheck does not make every request reach Twitch.

**Refactor/retest:** covered by the final FND-6 suite and quality gates, to be recorded before this story is marked Done. Official docs checked 2026-10-06: Twitch [Get Users](https://dev.twitch.tv/docs/api/reference/#get-users) accepts a user token for ID lookup without an additional scope; the installed SDK method is documented in Twurple [HelixUserApi](https://twurple.js.org/reference/api/classes/HelixUserApi).

### TDD — protected queue history projection

**Red:** `npm test -- --run tests/unit/queue-routes.test.js tests/integration/queue-repository.test.js -t 'terminal queue history|bounded terminal history'` — PostgreSQL reported `listQueueHistoryProjection is not a function`, and the protected route returned 404.

**Green:** the focused command passed 2 tests using an isolated PostgreSQL container with real Prisma migrations. The repository selects only terminal-entry presentation fields, orders newest first and caps results at 100; the route requires the local session and returns an allowlisted DTO. `npm test -- --run tests/unit/web-route.test.js -t 'serves the bundled pt-BR streamer operations panel'` first failed because the history UI was absent, then passed once the queue card loaded and rendered history on demand using `textContent`.

**Refactor/retest:** focused tests passed 3/3 across repository, protected route and static panel contracts. Final suite and AIOX gates remain pending.

### TDD — protected queue reordering controls

**Red:** `npm test -- --run tests/unit/queue-routes.test.js tests/unit/web-route.test.js -t 'moves only waiting entries|serves the bundled pt-BR streamer operations panel'` — the API returned 404 and the panel source lacked move controls.

**Green:** `npm test -- --run tests/unit/queue-routes.test.js tests/unit/web-route.test.js tests/integration/queue-repository.test.js -t 'moves only waiting entries|moves a waiting entry atomically|serves the bundled pt-BR streamer operations panel'` — 4 passed. The API requires session/CSRF, validates IDs/positions, and invokes the queue-locked repository operation already covered by a real PostgreSQL atomic-ordering test. The UI disables movement at the first/last position and uses refreshed state for each request.

**Refactor/retest:** the focused integration/API/UI command passed after implementation; final FND-6 gates remain pending.

### TDD — audited priority FIFO lanes and manual benefit admission

**Red:** `npm test -- --run tests/integration/queue-repository.test.js -t 'keeps verified priority|calls priority FIFO'` — 2 failed because `repository.setEntryPriority` did not exist. `npm test -- --run tests/integration/queue-repository.test.js -t 'admits an operator verified'` — 1 failed because the repository persisted the requested priority admission as `standard` with no reason. After adding the DB consistency assertion, `npm test -- --run tests/integration/queue-repository.test.js -t 'enforces allowed priority classes'` — 1 failed because PostgreSQL accepted `priority_class='priority'` with a null benefit reason. A first run of that migration test hit a test-file syntax error and was corrected; it is not counted as Red evidence.

**Green:** `npm test -- --run tests/integration/queue-repository.test.js -t 'admits an operator verified|keeps verified priority|enforces allowed priority|calls priority FIFO'` — 4 passed against an isolated PostgreSQL container after the migration added class/category and class/reason consistency checks. `npm test -- --run tests/unit/queue-routes.test.js -t 'benefit category'` — 1 passed; `npm test -- --run tests/unit/priority-labels.test.js tests/unit/web-route.test.js tests/unit/queue-routes.test.js -t 'priority|benefit category|bundled pt-BR streamer operations panel'` — 7 passed.

**Refactor/retest:** queue lock serializes promotion/demotion; destination lane appends after existing members and global displayed positions are renumbered continuously. Manual chat `add` remains standard; panel verifies categories, stores no receipt/provider payload, and does not create financial outbox work. Full-suite/gate retest remains pending.

### TDD — chat movement uses displayed positions without crossing priority lanes

**Red:** `npm test -- --run tests/unit/chat-command-handler.test.js -t 'same priority lane|priority-lane position'` — 2 failed: the handler passed displayed position 4 directly to a lane-local repository operation instead of translating it to position 2, and it attempted a move into another lane instead of rejecting it.

**Green:** the same focused command passed 2 tests after the handler looked up the persisted waiting order, translated global displayed positions to lane-local positions, and rejected targets outside the entry's lane.

**Refactor/retest:** `npm test -- --run tests/unit/chat-command-handler.test.js tests/integration/queue-repository.test.js` first exposed 3 stale audit assertions that counted the expected `entry.manual_added` event together with `entry.transitioned`. The assertions were narrowed to the transition event; the same command then passed 74 tests, including the new chat cases and actual PostgreSQL integration tests. This was an assertion-scope correction, not a change to audit behavior. Full FND-6 suite and quality gates remain pending.

### TDD — separate streamer panel pages and connection recovery

**Red:** `npm test -- --run tests/unit/panel-navigation.test.js tests/unit/web-route.test.js -t 'shows the connection flow|shows one page|falls back to the overview|separate panel pages'` failed because `apps/web/panel-navigation.mjs` did not exist and the served page had no accessible primary navigation. After adding the first page contract, `npm test -- --run tests/unit/web-route.test.js -t 'separate panel pages'` failed on the missing required Client Secret field, exposing an installation form regression before implementation was finished.

**Green:** `npm test -- --run tests/unit/panel-navigation.test.js tests/unit/web-route.test.js` — 7 passed after adding the tested page selector, separate overview/queue/new-queue/operations/settings/connection views, connected summary and setup/reconnect navigation, restoring the required Secret field, and adding a visible credential-validation notice.

**Refactor/retest:** added responsive sidebar navigation with a horizontal narrow-screen layout, keyboard focus styles, and `aria-current` state. The focused 7-test run passed after these changes. Final verification: `npm run lint`, `npm run typecheck`, `npm test` (52 files/360 tests), `npm run review:static` (45 files/0 findings), `docker compose config --quiet`, and `git diff --check` all passed. Independent QA and remaining acceptance gaps are still open.

### TDD — session-scoped persistent API idempotency

**Red:** The repeated-mutation regression failed because the replay response lacked `idempotency-replayed`; the queue creation handler was invoked again. `npm test -- --run tests/integration/queue-repository.test.js -t 'persists idempotency reservations'` failed because `beginPanelOperation` did not exist in the PostgreSQL repository.

**Green:** `npm test -- --run tests/unit/queue-routes.test.js -t 'replays a mutation|omit a valid idempotency key'` — 2 passed. A repeated key/body replays the stored response and invokes queue creation once; invalid/missing keys are rejected before mutation. `npm test -- --run tests/integration/queue-repository.test.js -t 'idempotency key in PostgreSQL'` — 1 passed, verifying a real PostgreSQL unique-key race produces one `started` and one `in_progress`; the same test covers completed response replay and request fingerprint conflict.

**Refactor/retest:** `npm test -- --run tests/unit/queue-routes.test.js tests/unit/web-route.test.js tests/integration/queue-repository.test.js` — 3 files, 104 passed before the extra concurrent-claim assertion was added. The panel now creates a fresh UUID key for each mutating request; server fingerprints canonical method/path/body, scopes keys to the local session, stores no raw request, and replays completed JSON. A request still marked processing returns 409 and asks the operator to refresh before using a new key. Full suite and project gates must be rerun after this increment.

### TDD — operator reconciliation and OAuth callback recovery

**Red:** `npm test -- --run tests/unit/queue-routes.test.js -t 'request Twitch reconciliation'` — the protected operator action returned 404. `npm test -- --run tests/unit/web-route.test.js -t 'queue settings editor'` — the panel had no reconciliation control. The callback decline regression returned `text/plain` instead of an on-brand HTML recovery screen, so provider error details could not be safely replaced with a useful panel action.

**Green:** `npm test -- --run tests/unit/queue-routes.test.js tests/unit/twitch-integration.test.js -t 'request Twitch reconciliation|operator reconciliation'` — 3 passed. The route requires the local CSRF session, returns 503 while integration is unavailable, and delegates to the existing reconciler. Integration tests verify overlapping operator requests share one run. `npm test -- --run tests/unit/web-route.test.js -t 'queue settings editor'` — 1 passed after adding the sync action under Twitch connection. `npm test -- --run tests/unit/queue-routes.test.js -t 'authorization is declined|on-brand OAuth callback'` — 2 passed for styled success/decline pages, sanitized OAuth query state, and 30-second return.

**Refactor/retest:** callback success and failure share the panel stylesheet, localized messaging, countdown and direct link; no provider error description, code or state is rendered. OAuth callback-created and startup-created integrations both expose the coalesced reconciliation operation. Focused route/integration/web tests passed; global gates are recorded in Quality and review below.

### TDD — UID privacy changes only through the durable Twitch reward edit

**Red:** Before the repository and UI guard were added, the new regression observed the local-settings route accept `uidMode: hidden` with HTTP 200 and PostgreSQL update the row, increment its version, and bypass reward synchronization. The PostgreSQL test also initially resolved instead of rejecting with `INVALID_LOCAL_QUEUE_SETTING`.

**Green:** `npm test -- --run tests/unit/queue-routes.test.js tests/unit/web-route.test.js tests/integration/queue-repository.test.js` — 3 files, 98 tests passed. Local settings now reject Twitch-managed fields, the local dialog no longer offers UID mode, and PostgreSQL verifies UIDs/call notices are retained by local policy edits and cleared only through the versioned remote reward update. The repository-only legacy `setUidMode` bypass was removed.

**Refactor/retest:** `npm test -- --run tests/unit/queue-routes.test.js tests/unit/twitch-integration.test.js tests/unit/web-route.test.js` — 3 files, 37 tests passed after callback/reconciliation changes; the previous 98-test focused persistence/API/UI run passed after the privacy fix. The complete suite and project gates are recorded below.

### TDD — Twitch-native reward limits, durable reward edits, and OAuth callback screen

**Red:** `npm test -- --run tests/unit/twitch-adapter.test.js tests/unit/queue-routes.test.js -t 'native reward|Twitch-native'` — 2 expected failures showed the Helix projection omitted native settings and the create route discarded them. `npm test -- --run tests/unit/web-route.test.js -t 'separate panel pages'` — failed because the new-queue form lacked the three native settings. `npm test -- --run tests/integration/queue-repository.test.js -t 'persists queue creation and a managed reward creation intent atomically'` first failed because the generated Prisma Client did not yet contain the newly tested columns; after running the allowed `npx prisma generate --schema apps/api/prisma/schema.prisma`, the migration-backed PostgreSQL persistence contract passed. A follow-up assertion for the queue projection failed because the repository omitted the fields; after the projection fix it passed. `npm test -- --run tests/unit/queue-routes.test.js -t 'version-checked Twitch reward edits'` returned 404 for the missing route. `npm test -- --run tests/integration/queue-repository.test.js -t 'persists app-owned reward edits'` failed because the repository method was absent. `npm test -- --run tests/unit/reward-outbox-worker.test.js -t 'preflights ownership/config|lost PATCH response|no longer matches'` had 3 failures because the worker did not dispatch `reward.update`. `npm test -- --run tests/unit/web-route.test.js -t 'queue settings editor'` failed because the reward editor was absent. The callback contract failed first because the endpoint returned only a bare confirmation; an added history-scrubbing assertion then failed until the OAuth code/state were removed from the browser address after successful exchange. PostgreSQL check-constraint test setup initially used an invalid queue slug; after correcting it, the driver exposed PostgreSQL SQLSTATE 23514 as an unknown Prisma request error, so the assertion was changed to verify the actual named database constraint.

**Green:** focused unit contracts passed with `npm test -- --run tests/unit/queue-routes.test.js tests/unit/twitch-adapter.test.js tests/unit/reward-outbox-worker.test.js tests/unit/web-route.test.js -t 'on-brand OAuth callback|native reward|Twitch-native|persisted Twitch-native limits|version-checked Twitch reward edits|preflights ownership/config|lost PATCH response|no longer matches|separate panel pages|queue settings editor'` — 4 files, 11 passed, 45 skipped. PostgreSQL/migration tests passed with `npm test -- --run tests/integration/queue-repository.test.js -t 'persists app-owned reward edits|persists queue creation and a managed reward creation intent atomically|enforces positive values for persisted Twitch-native reward limits'` — 3 passed, including durable intent fields, projection, check constraints, privacy clearing, claim/lease preparation, confirmation and audit. The OAuth callback test passed with `npm test -- --run tests/unit/queue-routes.test.js -t 'on-brand OAuth callback'`; it covers escaped channel display name, panel styling hooks, direct return, 30-second redirect, and removing code/state from browser history. Worker tests cover safe preflight, confirmed PATCH, resolving a lost response without repeating the PATCH, and refusing a divergent reward.

**Refactor/retest:** the user-facing reward editor is separate from local attendance policy settings. Empty native-limit fields map to `null` (disabled); the app has no shadow counters. Every edit uses the stored app-owned reward ID, records previous configuration and a versioned outbox key, and hides/clears stored UIDs when UID mode becomes hidden. An uncertain PATCH result is queried before retry; a changed/foreign reward is left unknown. The callback shares the panel stylesheet, uses an escaped channel label, provides a direct return link and countdown, and removes OAuth query parameters from browser history. An authorized read-only Helix probe is now validated live; reward, redemption, chat and EventSub operations still require eligible-channel live validation.

### TDD — health probe and token recovery for authenticated ineligible channels

**Red:** `npm test -- --run tests/unit/health-route.test.js tests/unit/twitch-integration.test.js -t 'ineligibility distinct|eligibility before opening'` — 2 expected failures showed that `/health` returned a null ping for an authenticated ineligible channel and the Twitch integration exposed no probe after eligibility was denied.

**Green:** the same focused command passed 2 tests. The integration now retains `RefreshingAuthProvider` for authenticated read-only health probes but starts no reward/chat EventSub or financial work for an ineligible channel. `/health` measures `getUserById`, caches for 60 seconds, reports the actual latency, and preserves `ineligible` as the channel state.

**Refactor/retest:** `docker compose up -d --build` rebuilt and restarted only application services while preserving PostgreSQL and operational-secret volumes. Live authorized read-only check: `curl --cacert .local/localhost-ca.crt https://localhost:3000/health` returned HTTP 200, database `connected`, Twitch `ineligible`, and `twitch_api_ping_ms: 193`; the browser dashboard subsequently displayed 322 ms. No Twitch reward, redemption, chat, or EventSub write/operation was performed. `npm test -- --run tests/unit/documentation-contract.test.js -t 'public changelogs concise'` then failed because the public version section had 6 bullets, exceeding its 5-item limit; after folding this operator-facing detail into the existing status bullet, the same command passed. Focused and full test/gate results are recorded below.

### Browser verification — OAuth callback recovery

On 2026-10-06, Chrome opened the real local app callback with a simulated Twitch decline (`/callback?error=access_denied&error_description=must-not-be-shown`). The rendered screen used the panel design, displayed a localized recovery action and 30-second countdown, and did not echo `error_description`. After 31 seconds the browser returned to `https://localhost:3000/`. This validates the browser decline/recovery branch and timer; successful Twitch consent was not repeated. Browser console errors came from an installed Chrome extension, not project assets.

## Quality and review

Verification on 2026-10-06: `npm test` — 52 files, 384 tests passed; `npm run lint`; `npm run typecheck`; `npm run review:static` — 45 application JavaScript files, 0 findings; `npm run validate:version`; `docker compose config --quiet`; and `git diff --check` passed. `docker compose up -d --build` completed with database and bot healthy, preserving PostgreSQL and operational-secret volumes. Operator-triggered reconciliation, protected retry/manual-resolution controls, persisted idempotency, styled OAuth callback states, the real-browser decline/redirect path, and a live authorized read-only Helix probe are covered. The channel was confirmed ineligible; reward writes, redemptions, chat delivery, and EventSub recovery were not run. No moderated usability session is claimed. Independent QA review is now in progress. FND-5 is merged; this story consumes its queue lifecycle and account-ownership services.

## File list

- `apps/web/app.js`, `apps/web/index.html`, `apps/web/styles.css`
- `apps/web/panel-navigation.mjs`, `tests/unit/panel-navigation.test.js`
- `apps/api/src/health-route.mjs`, `apps/api/src/runtime.mjs`, `apps/api/src/twitch/`
- `tests/unit/health-route.test.js`, `tests/unit/twitch-integration.test.js`, `tests/unit/health-status.test.js`
- `apps/api/src/http/queue-routes.mjs`, `apps/api/src/http/local-session.mjs`
- `apps/api/src/persistence/queue-repository.mjs`
- `apps/api/src/commands/chat-handler.mjs`
- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/202610060001_priority_lanes/`
- `apps/api/prisma/migrations/202610060002_reward_native_limits/`
- `apps/api/src/outbox/reward-worker.mjs`, `apps/api/src/twitch/helix-adapter.mjs`
- `apps/web/app.js`, `apps/web/index.html`, `apps/web/styles.css` (queue reward editor and OAuth callback styling)
- `apps/web/priority-labels.mjs`, `tests/unit/priority-labels.test.js`
- `docs/stories/TWITCH-CAPABILITY-GAP-ANALYSIS.md`, `docs/pt-BR/stories/TWITCH-CAPABILITY-GAP-ANALYSIS.md`
- `docs/integrations.md`, `docs/pt-BR/integrations.md`
- `docs/stories/FND-6/queue-ingress-architecture.md`, `docs/pt-BR/stories/FND-6/queue-ingress-architecture.md`
- `tests/unit/chat-command-handler.test.js`, `tests/integration/queue-repository.test.js`, and other affected `tests/unit/`/`tests/integration/` files
- `README.md`, `README.pt-BR.md`, `docs/stories.md`, `docs/pt-BR/stories.md`
- `docs/stories/FND-6/ux-research.md`, `docs/pt-BR/stories/FND-6/ux-research.md`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `package.json`, `package-lock.json`, `VERSION`, `.aiox/project-status.yaml`

## Change Log

| Date | Version | Change | Author |
| --- | --- | --- | --- |
| 2026-10-06 | 0.3.0 | FND-6 implementation and test evidence prepared for independent QA review. | @dev |
