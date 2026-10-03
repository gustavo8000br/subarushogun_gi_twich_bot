# Development Stories

[Português brasileiro](pt-BR/stories.md)

## Product foundation: local Twitch queue bot for Genshin Impact

**Source:** User specification “Prompt 1 — Bot local de filas da Twitch para Genshin Impact”, received 2026-10-02.
**Planning status:** Spec Pipeline and Greenfield Fullstack/Service/UI are approved; AIOX sharding is complete. The operator selected the required mutable product panel, with CLI-first treated as an AIOX framework guideline and no extra domain CLI. Story Development Cycle started with FND-1, validated GO (9/10), now InProgress.
**Complexity:** COMPLEX. The supplied requirements cover local infrastructure, PostgreSQL concurrency, durable financial operations, OAuth, Twitch APIs and EventSub, recovery, local security, chat behavior, and a bilingual operator panel.
**Execution rule:** Every behavior increment starts with a test that fails for the missing behavior, then Green, then Refactor. Record the exact command and observed results in this file and its Portuguese counterpart. No test result is claimed until executed.

### Delivery sequence

The order below follows the specification's suggested stages. Each story must be refined and validated by the AIOX story workflow before implementation. Tests are written before implementation within each story; integration guarantees use a real isolated PostgreSQL instance and real migrations.

#### FND-1 — Version identity and local runtime foundation

**Status:** InProgress (PO validation GO, 9/10).
**Story:** `docs/stories/FND-1/story.md` and `docs/pt-BR/stories/FND-1/story.md`; validation in `docs/stories/FND-1/validation.md` and `docs/pt-BR/stories/FND-1/validation.md`.
**TDD evidence:** Version policy/CLI, Compose/bootstrap, PostgreSQL migrations, secret-group runtime behavior, health projection, bilingual operator docs, isolated Compose acceptance, POSIX start helper, and the static web entrypoint have recorded tests and observed results. Linux checks pass. Windows batch execution remains unverified on this Linux host; FND-1 stays InProgress until that platform criterion is resolved.
**Current quality run (2026-10-02):** `npm test` — 21 files/140 tests passed; `npm run lint`, `npm run typecheck`, `npm run review:static` (OpenGrep 1.30.0; 18 JavaScript files, 0 findings), `docker compose config --quiet`, `npm run validate:version`, and `git diff --check` passed. This local static scan replaces paid CodeRabbit; it is not contextual AI review.

##### FND-1 TDD Evidence — Version policy functions

- **Behavior:** Validate base SemVer, allowed release stages, seven-character source identity, pre-Git marker and exact seven-character prefix from a full Git commit; reject malformed or missing commit identities.
- **Red:** `npm test -- --run tests/unit/version-policy.test.js` — 11 failed, 0 passed after hardening. The version module was absent, so the expected behavior/exports were unavailable. A preliminary 8-failed/3-passed run was discarded because invalid-input tests could accidentally pass on `TypeError` from missing functions.
- **Green:** `npm test -- --run tests/unit/version-policy.test.js` — 11 passed after implementing pure policy functions in `apps/infra/src/version.mjs`.
- **Refactor:** same command — 11 passed after removing an unused exported accessor.

##### FND-1 TDD Evidence — Version files and build CLIs

- **Behavior:** Validate `package.json`, `.release-stage` and `VERSION` read-only; materialize an artifact marker when Git metadata is absent; use exactly seven characters from a committed source; fail when a Git repository has no discoverable commit; preserve all checkout source files.
- **Red:** `npm run test:integration -- tests/integration/version-cli.test.js` — 4 failed, 0 passed because the version CLI files/behavior were absent. Vitest and temporary Git fixture creation succeeded; failures were missing application commands.
- **Green:** `npm test -- --run tests/unit/version-policy.test.js tests/integration/version-cli.test.js` — 15 passed after adding `apps/infra/src/version-files.mjs` and both CLI scripts.
- **Refactor:** same command — 15 passed after making artifact path resolution platform-aware.
- **Read-only source check:** `npm run validate:version` — `Product version is valid: v0.1.0-0000000-alpha`.
- **Scope:** The current repository has no commit, so build materialization from this checkout remains unexecuted; committed-Git behavior was exercised in a disposable fixture repository.

##### FND-1 TDD Evidence — Compose, secret bootstrap, and database URL

- **Behavior:** Compose topology/order, loopback and advanced port callback, one-time persistent secret, URL-safe connection construction, local ignore policy, and non-destructive start scripts.
- **Red:** `npm test -- --run tests/unit/bootstrap-secret.test.js tests/integration/compose-contract.test.js` — 8 failed, 0 passed because Compose configuration and secret helper were absent.
- **Green:** `npm test -- --run tests/unit/bootstrap-secret.test.js tests/integration/compose-contract.test.js` — 8 passed after adding the helper and initial Compose/Docker/start files; the test fixture was corrected to make the `0440` file writable before simulating corruption.
- **URL helper Red/Green:** `npm test -- --run tests/unit/database-url.test.js` first failed 2 behaviors because the module was absent, then passed those tests and the prior bootstrap/Compose suite after implementation.
- **Advanced port Red/Green:** Compose contract first observed target/published 3000 instead of requested 3217; after adding `APP_PORT` consistency, `npm test -- --run tests/integration/compose-contract.test.js tests/unit/bootstrap-secret.test.js tests/unit/database-url.test.js` passed 11 tests.
- **Image/ignore contract:** after pinning the app image identity and adding OpenSSL, the image-contract suite passed; `tests/unit/local-ignore-policy.test.js` first failed because `runtime-secrets/` was not ignored, then passed after the ignore policy was added.
- **Runtime behavior Red/Green:** the first actual `docker compose up --build -d` failed at migration because UID/GID `10001:10001` could not read the Postgres-owned `0440` secret. Added a Compose contract test; `npm test -- --run tests/integration/compose-contract.test.js` observed the missing supplementary group, then passed after granting GID 999 to migrate and bot.
- **Refactor/combined:** `npm test -- --run tests/integration/compose-contract.test.js tests/integration/postgres-foundation.test.js` — 9 passed after the group fix. `docker compose config --quiet` passed.
- **Host acceptance:** `docker compose up --build -d` completed in bootstrap → healthy DB → migration → bot order; bot health returned `{"status":"ok"}`, ran as UID 10001 with GID 999, read the secret, and stayed healthy after `docker compose restart bot`. Migration history remained present. Verified on Linux Docker Engine only.

##### FND-1 TDD Evidence — PostgreSQL schema and integrity constraints

- **Behavior:** Apply real versioned migrations to isolated PostgreSQL 18.6; create the nine product tables; enforce global queue-key, redemption-ID, active viewer/fila, manual/rescue source integrity, and outbox idempotency constraints.
- **Red:** `npm test -- --run tests/integration/postgres-foundation.test.js` — 2 failed after the disposable PostgreSQL container and real `prisma migrate deploy` succeeded. Table assertion returned `[]`; writes failed with `relation "queues" does not exist`.
- **Green:** same command — 2 passed after adding the Prisma models and foundation SQL migration; duplicate keys/resgates/active entries/idempotency keys raised PostgreSQL `23505`, and invalid source/redemption relation raised `23514`.
- **Refactor/validation:** `DATABASE_URL='postgresql://queuebot:isolated-test-password@127.0.0.1:5432/queuebot?schema=public' npm exec prisma validate` — schema valid under Prisma 6.19.3. `docker compose build bot` — success, including `npm ci` and `prisma generate` without a live DB.
- **Combined affected suite:** `npm test -- --run tests/integration/postgres-foundation.test.js tests/integration/compose-contract.test.js tests/unit/bootstrap-secret.test.js tests/unit/database-url.test.js tests/unit/local-ignore-policy.test.js tests/unit/version-policy.test.js tests/integration/version-cli.test.js` — 31 passed before the supplemental-group regression; the focused rerun after that fix passed 9 tests.

##### FND-1 TDD Evidence — Vitest discovery and quality gates

- **Behavior:** Product `npm test` discovers only `tests/`, excluding AIOX framework/template Jest suites; required lint and JSDoc-aware no-emit typecheck commands are present and executable.
- **Discovery Red/Green:** `npm test -- --run tests/unit/test-discovery-contract.test.js` failed because `vitest.config.js` was absent, then passed after limiting Vitest discovery to `tests/**/*.test.js` and excluding `.aiox-core/**`. The first unconfigured `npm test` had 32 product passes and 12 failures from framework Jest globals/missing `@aiox/testing`; after config, `npm test` passed 33 tests.
- **Quality script Red/Green:** `npm test -- --run tests/unit/quality-script-contract.test.js` failed because `lint` and `typecheck` scripts were missing; after adding pinned ESLint/TypeScript tools, flat ESLint config and JSDoc `allowJs/checkJs` no-emit config, the contract passed.
- **Refactor/quality results:** `npm run typecheck` and `npm run lint` passed after resolving stage typing and lint findings. Final `npm test` passed 34 tests in 9 files; `docker compose config --quiet`, `npm run validate:version`, and `git diff --check` passed.

##### FND-1 TDD Evidence — Health response projection

- **Behavior:** `/health` includes the running product identity and explicit database/Twitch API dependency states; it only reports the database connected after a successful query; unconfigured Twitch is reported as `not_configured`, not assumed connected; database errors return 503 without leaking details.
- **Red:** `npm test -- --run tests/unit/health-route.test.js` — 2 failed because `health-route.mjs`/the projection did not exist; the contract expected version and dependency fields and a sanitized 503 response.
- **Green:** same command — 2 passed after adding a testable route registrar and wiring runtime `VERSION` plus real `SELECT 1` status into `/health`.
- **Refactor/runtime verification:** `npm test`, `npm run lint`, and `npm run typecheck` passed (36 tests / 10 files). After `docker compose up --build -d`, `curl --fail --silent --show-error http://localhost:3000/health` returned `{"status":"ok","product_version":"v0.1.0-0000000-alpha","dependencies":{"database":"connected","twitch_api":"not_configured"}}`.

##### FND-1 TDD Evidence — Bilingual central README and integration reference

- **Behavior:** provide reciprocal English/pt-BR central READMEs with truthful implementation status, first run, update, daily operation, persistence warnings, contribution/testing guidance, Conventional Commits and version policy; publish the dated Twitch/SDK/infrastructure operation-scope-adaptation matrix in both languages.
- **Red:** `npm test -- --run tests/unit/documentation-contract.test.js` — 2 failed, 0 passed because `README.md` and `docs/integrations.md` were missing. After writing the documents, the same contract exposed two test-contract mismatches: the README link label differed from the required reciprocal label, and the Portuguese document correctly translated “not implemented” rather than repeating English. These were test/document contract issues, not runtime errors.
- **Red (real-project references):** the contract was extended to require the three researched reference projects; rerunning it returned 1 failed / 1 passed because those references were not yet present.
- **Green:** `npm test -- --run tests/unit/documentation-contract.test.js` — 2 passed after aligning the reciprocal link label, asserting equivalent Portuguese wording, and documenting the references in both READMEs while preserving shared technical identifiers.
- **Refactor/quality:** the focused suite passed 2 tests; `npm run lint`, `npm run typecheck`, and full `npm test` passed (38 tests / 11 files). `docker compose config --quiet`, `npm run validate:version`, and `git diff --check` passed.
- **Compose stop/start:** before stopping, DB reported one successfully applied migration. `docker compose stop -t 30 bot` stopped cleanly; `docker compose start bot` reran bootstrap/migrate dependency steps and restarted the bot. `/health` returned status `ok`, database `connected`, Twitch `not_configured`; migration count remained 1 and `docker compose ps` reported bot healthy. This was Linux Docker Engine only.
- **Compose acceptance test:** `npm test -- --run tests/integration/compose-runtime.test.js` initially failed in the marker assertion because the test queried a JSON scalar as an object; the test fixture query was corrected to `value #>> '{}'`. The rerun passed 2 tests, proving isolated first-run health/migrations and marker/password/migration persistence across graceful stop/start. The initial assertion failure was a test defect, not an application behavior Red.
- **Start-script test:** `npm test -- --run tests/unit/start-script.test.js` — 2 passed. It executed the POSIX helper from a copied path containing spaces with fake Docker/browser commands, confirmed the exact Compose command and URL, and verified fallback output when the browser launcher fails. `tests/integration/compose-contract.test.js` also checks the Windows helper uses quoted `cd /d "%~dp0"` and opens a new browser window.
- **Static web route Red/Green/Refactor:** `npm test -- --run tests/unit/web-route.test.js` first failed because the `apps/api/src/web-route.mjs` module did not exist. After implementation, it found a conflicting root route registered by `@fastify/static`; the implementation removed the duplicate. Adding stylesheet assertions then observed HTTP 404 with `serve:false`; switching to the plugin's static serving/index behavior passed the final route and CSS assertions (1 test). The actual root HTML and `200 text/css` were verified after `docker compose up --build -d`.
- **Full quality/runtime validation:** `npm run lint`, `npm run typecheck`, `npm test` (43 tests / 14 files), `npm run validate:version`, `docker compose config --quiet`, and `git diff --check` passed. Runtime health returned the expected product version, database `connected`, and Twitch `not_configured`; `docker compose ps` showed the bot healthy.
- **Platform boundary:** this host has no `cmd.exe`, Wine, or PowerShell, so the Windows `.bat` was checked structurally but not executed. Do not claim Windows runtime compatibility until exercised on Windows. Live Twitch behavior remains out of scope for FND-1.
- **Research:** official Twitch, Twurple, Prisma 6, PostgreSQL 18, and Docker Compose references were consulted on 2026-10-03 UTC; installed Twurple 8.2.0 declarations were checked. No live Twitch credentials were available.

**Scope:** SemVer/runtime identity scripts and tests; bilingual project documentation/changelogs; Docker Compose bootstrap, PostgreSQL, migrations, health, and start scripts.
**Acceptance criteria:**

- Runtime identity follows `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`, with `0.1.0`, `alpha`, and `0000000` before Git materialization.
- Validation/materialization tests cover source consistency, seven-character SHA, no-Git marker, Git discovery failure, artifact materialization, and no version mutation in ordinary validation.
- Compose starts bootstrap → healthy PostgreSQL → migrations → non-root bot; DB has no host port, named volumes persist, and ordinary stop/start scripts never delete volumes.
- PostgreSQL schema and SQL migrations enforce the specified queue-key, active-entry, redemption, and idempotency constraints; integration tests use isolated PostgreSQL and actual migrations.
- English documents and equivalent `docs/pt-BR/` documents exist with reciprocal links and consistent operational instructions.
- **TDD evidence:** see the observed version, Compose/bootstrap, runtime regression, PostgreSQL, test discovery, quality-script, health projection, docs, Compose acceptance, POSIX helper, and static web-entrypoint checks above. FND-1 remains InProgress only for unexecuted Windows host validation.
- **Static review setup TDD:** `tests/unit/free-review-tool.test.js` first failed because local rules/configuration were absent; later Red runs caught missing untracked-file scanning and AIOX profile command. After corrections, the focused test passed. `npm run review:static` first reported a false positive on a file write; narrowing the credential rule to logger APIs yielded 0 findings across 18 JavaScript files. A temporary fixture reported the two intended unsafe HTML/credential logging findings.

#### FND-2 — Queue domain, validation, ordering, and parser

**Status:** InProgress (story prepared and PO validated GO, 9/10)
**Story:** `docs/stories/FND-2/story.md` and equivalent `docs/pt-BR/stories/FND-2/story.md`; validation in `docs/stories/FND-2/validation.md` and `docs/pt-BR/stories/FND-2/validation.md`.
**Scope:** Pure domain rules, UID handling, command parser, authorization decisions, and transaction-backed queue operations.
**Acceptance criteria:**

- State transitions and financial policy snapshots follow the transition table, with no invalid or terminal-to-active transitions.
- UID accepts only trimmed nine-digit ASCII strings in visible mode; hidden mode discards without persistence or disclosure.
- Parser handles case, repeated spaces, accent variants, reserved names, aliases, argument counts, and viewer identity restrictions.
- PostgreSQL tests prove per-queue active-user uniqueness and race handling; ordering changes are atomic and preserve persisted order.
- **TDD evidence:** transition decisions, UID, parser/keys/authorization, real PostgreSQL repository operations and the unified transition domain service are recorded below; FND-2 remains InProgress pending formal quality review.

##### FND-2 TDD Evidence — Entry transition decision function

- **Behavior:** Accept only specified lifecycle transitions; reject invalid/terminal-to-active changes; distinguish external terminal observations from locally requested point operations; snapshot the supplied queue policy.
- **Test first / harness correction:** `npm test -- --run tests/unit/entry-transitions.test.js` first collected zero tests because the new module import was absent. This was an import failure, not a valid Red. Added an empty contract stub and reran.
- **Red:** Same command — 12 tests, initially 4 failed against the empty stub. A test-matrix fixture was then corrected to reflect that `waiting → completed` and `in_progress → no_show` are invalid, while external terminal observations are allowed. The resulting behavioral Red was 12 tests, 1 failed / 11 passed: external fulfillment was incorrectly classified as a locally requested fulfillment.
- **Green:** Same command after implementation — 12 passed.
- **Refactor:** `npm run typecheck` exposed missing JSDoc properties and error-code typing; the first annotation refinement exposed one helper input mismatch. After correction, `npm run typecheck && npm test -- --run tests/unit/entry-transitions.test.js` passed (typecheck; 12 tests). `npm run lint -- --no-warn-ignored` passed.
- **State at the initial increment:** Transition decisions/policy snapshots and repository persistence/audit were implemented for covered cases. The shared service was added in a later TDD increment below. This does not establish outbox or remote Twitch behavior.

##### FND-2 TDD Evidence — UID validation and hidden-mode discard

- **Behavior:** Trim outer whitespace and accept only nine ASCII digits in visible mode; allow absent UID only when optional; hidden mode discards any input; invalid errors do not echo user text.
- **Red:** `npm test -- --run tests/unit/uid.test.js` — 11 tests failed against the empty validator contract.
- **Green:** Same command after implementation — 11 passed.
- **Refactor:** `npm test -- --run tests/unit/uid.test.js && npm run typecheck && npm run lint` — 11 passed, typecheck and lint passed.
- **State:** Pure UID validation is implemented; real PostgreSQL tests also verify hidden-mode clearing of stored UID and pending call payload.

##### FND-2 TDD Evidence — Queue keys, command parser, and authorization

- **Queue keys:** `npm test -- --run tests/unit/queue-keys.test.js` Red — 25 failures against the empty contract; Green — 25 passed after implementation; `npm test -- --run tests/unit/queue-keys.test.js && npm run typecheck && npm run lint` passed.
- **Parser:** `npm test -- --run tests/unit/command-parser.test.js` Red — 18 tests, 11 failed / 7 passed against the empty parser. A first implementation run caught a fixture mistakenly labeling the valid `add login uid` syntax as rejected; after fixing the fixture, the follow-up regression test observed 19 tests, 1 failed / 18 passed because bare `!<queue>` produced `join`. Changed it to a read-only `lista`; `npm test -- --run tests/unit/command-parser.test.js && npm run typecheck && npm run lint` passed (19 tests).
- **Authorization:** `npm test -- --run tests/unit/command-authorization.test.js` Red — 6 failed against the empty contract; Green — 6 passed. Regression Red then found a moderator could use `sair other-user` (1 failed / 6 passed); after the rule change, the focused suite passed 7 tests with typecheck and lint.
- **State:** Parser, key format/reservation checks and authorization predicate are implemented as pure functions. PostgreSQL tests cover globally unique keys and atomic replacement/rollback; runtime chat/EventSub command handlers are reserved for FND-4/FND-5.

##### FND-2 TDD Evidence — PostgreSQL repository and ordering

- **Initial Red:** `npm test -- --run tests/integration/queue-repository.test.js` — 4 failures because repository operations were absent. The test starts an isolated PostgreSQL container and applies the project's actual Prisma migrations.
- **Green/refinement:** Implemented create/add/move, key replacement, UID privacy cleanup and transition/audit persistence. Integration runs exposed Prisma `void` deserialization and result-shape bugs; fixtures also needed correction for lock acquisition order and an incorrectly pre-colliding alias. Each implementation defect was fixed and the affected PostgreSQL suite rerun; intermediate runs passed 4, 6 and 8 tests.
- **Additional verification:** `npm test -- --run tests/integration/queue-repository.test.js` — 13 passed. Covers one viewer across separate queues, duplicate active entry in one queue, manual add to a closed queue, rejection for archived/deleting queues, concurrent movement and terminal decisions, global key uniqueness/rollback, UID cleanup, persisted transitions/audit, and database rejection of inconsistent source/redemption ID pairs. These final assertions verify existing behavior and migration rules; they did not change application code.
- **Earlier gate checkpoint:** `npm test` — 20 files/139 tests passed; `npm run lint`, `npm run typecheck`, `npm run validate:version`, `docker compose config --quiet`, and `git diff --check` passed.
- **Unified domain service TDD:** `npm test -- --run tests/unit/queue-domain-service.test.js` Red — 2 failed because the empty service contract had no `transitionEntry`; Green — 2 passed after implementing `createQueueDomainService`. `npm test -- --run tests/integration/queue-repository.test.js` — 13 passed after routing real PostgreSQL transition persistence through the service. It proved decisions use locked current state/policy and invalid transitions write no status/audit. Refactor/retest: `npm run typecheck && npm run lint` and both focused suites passed.
- **Current boundary:** FND-2 now has the shared entry-transition domain service; live chat/EventSub command handlers are scheduled for FND-4/FND-5. Formal @architect/@data-engineer and QA review remains open. No outbox or remote Twitch behavior is claimed.
- **Current full gate run (2026-10-03):** `npm test` — 22 files/142 tests passed; the isolated integration suite — 5 files/28 tests passed, including 13 PostgreSQL queue repository cases. `npm run lint`, `npm run typecheck`, `npm run review:static` (OpenGrep 1.30.0; 19 JavaScript files, 0 findings), `npm run validate:version`, `docker compose config --quiet`, and `git diff --check` passed. Documentation contract and service tests — 2 files/4 tests passed.
- **Current boundary:** Runtime chat/EventSub dispatch is not wired. The service does not import Twitch redemptions or perform remote financial operations. Persistence tests use PostgreSQL, not mocked Prisma.

#### FND-3 — Durable outbox and financial recovery

**Status:** Draft
**Scope:** Outbox state machine, worker, leases, retries, audit trail, and remote redemption-state confirmation.
**Acceptance criteria:**

- A terminal local transition, audit entry, and one stable financial intent commit atomically before any Twitch call.
- Restart recovers pending and expired-lease work; timeout/lost response is reconciled against Twitch before retry; opposite remote state is a visible conflict.
- 429, 401/revocation, transient failures, permanent failures, and unknown outcomes remain observable and recoverable without false confirmation.
- PostgreSQL integration tests prove uniqueness, transaction atomicity, lease recovery, and rejected-redemption recovery.
- **TDD evidence:** pending; record Red, Green, Refactor, and commands only as executed.

#### FND-4 — Twitch OAuth, adapters, and reconciliation

**Status:** Draft
**Scope:** Official-doc research, Twitch credentials/OAuth, token persistence/refresh, reward ownership, EventSub WebSocket, Helix adapters, and recovery reconciliation.
**Acceptance criteria:**

- `docs/integrations.md` records dated official sources, pinned compatible library versions, scopes, and operation → endpoint/event → scope → SDK adaptation.
- Client ID/Secret validation uses Client Credentials; OAuth uses one-time session-bound state; secrets/tokens never appear in responses, URLs, or logs.
- Only rewards owned by this app are managed; broadcaster/client binding prevents unsafe account switching; channel eligibility and required scopes are checked.
- EventSub add/update and paginated reconciliation deduplicate by redemption ID, safely handle update-before-add, partial failures, terminal events, and reconnects.
- Adapter tests use fakes; real PostgreSQL integration covers persisted tokens, deduplication, and recovery. No real Twitch success is claimed absent authorized credentials.
- **TDD evidence:** pending; record Red, Green, Refactor, and commands only as executed.

#### FND-5 — Chat commands, calls, service lifecycle, and account ownership

**Status:** Draft
**GitHub issue:** [#1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1)
**Scope:** Twitch chat parsing/execution, authorization, notifications, timeout recovery, clear confirmation, current-account state, and application-service interfaces shared with the operator panel.
**Acceptance criteria:**

- Command and timer paths use the same domain service; message ID deduplication, broadcaster/mod/VIP authorization, channel checks, and viewer cooldown follow the specification.
- Call notification is durable, privacy is checked at send time, timeout begins only after confirmed send, and starting service prevents no-show.
- Clear requires same actor/channel/queue and unchanged active set within 15 seconds; otherwise no mutation or point operation occurs.
- Account auto-switch applies only to individual calls and only its owner can reset to default on termination; manual changes and reset persist and audit.
- Chat handlers and the later panel call the same domain/application services; the panel does not duplicate domain transition rules.
- Tests cover concurrency, restart, notification failure, privacy changes, and no unintended point effects.
- **TDD evidence:** pending; record Red, Green, Refactor, and commands only as executed.

#### FND-6 — Local panel, protected API, and operator documentation

**Status:** Draft
**GitHub issue:** [#6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6)
**Scope:** First plan the operator experience with the AIOX UX Design Expert and current real-world UI references; then deliver the complete local streamer control panel, installation/reconnection wizard, protected API, and operational guides. This stage runs only after the FND-2 through FND-5 domain and Twitch/application-service capabilities it presents are available.
**Acceptance criteria:**

- Before writing panel UI, activate `$aiox-ux-design-expert`, research current real projects and UI references, and produce bilingual operator flows and visual/interaction guidance grounded in the product requirements. UI implementation starts only after this planning artifact is reviewed.
- The streamer can operate every applicable product capability from the panel: Twitch setup/reconnection and eligibility; create/edit/open/close/archive/unarchive/delete queues and reward settings; manually add, call, start, complete, remove, move, and resend notifications; inspect waiting/called/in-progress/history; manage account labels/current account; reconcile Twitch state; and inspect/retry/resolve financial operations where policy permits.
- Sensitive or destructive actions show a reviewable summary and require confirmation where specified; desired remote settings remain distinct from Twitch-confirmed state; server validation remains authoritative.
- Panel calls the same application/domain services as chat and workers. API returns explicit projections and never serializes Prisma entities or secrets.
- `/api/state` is session-protected and distinguishes product version, API contract version, and state revision; UID follows the current visibility policy.
- Mutations validate schemas, session, CSRF, idempotency key, and applicable revision; DNS-rebinding protections run before admin handlers.
- User-controlled content is rendered as text; tests cover malicious HTML, host/origin/CSRF, OAuth callback, and secret non-disclosure.
- Every panel control has a working behavior or is explicitly unavailable with an actionable state; no presentation-only controls, hidden unsupported mutations, or duplicate domain behavior.
- README files document install, login, commands, point policy, recovery, start/stop/update/logs, and version identity in both languages.
- **TDD evidence:** pending; record Red, Green, Refactor, and commands only as executed.

### Planning notes and gates

- The user's prompt is the requirements source; no additional product behavior is introduced by this plan.
- Official Twitch, Twurple, Prisma, PostgreSQL, and Docker documentation must be checked before their integrations are implemented.
- At the FND-0 planning baseline, the quality gates had not yet run. FND-1 results are recorded in the FND-1 section above; the remaining known acceptance gap is execution of `iniciar.bat` on native Windows.
- Release or tag creation is out of scope for this foundation task. Stage promotion requires explicit human approval.
- This plan does not claim stories approved, implemented, tested, QA-approved, or complete.
- AIOX environment preflight observed Git/GitHub CLI/Node/npm/Docker/Compose and GitHub authentication; the private remote exists on `main`. Product package/runtime files remain FND-1 TDD work.
- Planning artifacts: `docs/project-brief.md`, `docs/prd.md`, `docs/front-end-spec.md`, `docs/fullstack-architecture.md`, `docs/architecture.md`, `docs/front-end-architecture.md`, and `docs/planning-validation.md`, each with a corresponding `docs/pt-BR/` document.
- The AIOX `markdownExploder` setting is enabled. `@kayvan/markdown-tree-parser` v1.6.1 was installed globally and successfully sharded the PRD, frontend specification, integrated/service/frontend architectures in English and pt-BR; shard filenames were aligned across languages with reciprocal links.
- A requirements JSON syntax error was found during artifact validation and corrected before continuing; all planning JSON files parsed successfully afterward. This was a planning-document correction, not application behavior or TDD evidence.
- The operator selected the required mutable panel and confirmed AIOX CLI-first is a framework guideline; no extra domain CLI is required.
- The operator expanded FND-6 so the streamer can manage all applicable product operations in the local panel. GitHub issue bodies #1 and #6 were updated to define shared application services and the UX planning gate; no comments were posted. UX research and `$aiox-ux-design-expert` activation are deferred until panel planning.

### File list

- `docs/stories.md`
- `docs/pt-BR/stories.md`
- `docs/stories/FND-0/spec/requirements.json`
- `docs/stories/FND-0/spec/complexity.json`
- `docs/stories/FND-0/spec/research.json`
- `docs/stories/FND-0/spec/spec.md`
- `docs/stories/FND-0/spec/critique.json`
- `docs/stories/FND-0/spec/plan.json`
- `docs/pt-BR/stories/FND-0/spec/requirements.json`
- `docs/pt-BR/stories/FND-0/spec/complexity.json`
- `docs/pt-BR/stories/FND-0/spec/research.json`
- `docs/pt-BR/stories/FND-0/spec/spec.md`
- `docs/pt-BR/stories/FND-0/spec/critique.json`
- `docs/pt-BR/stories/FND-0/spec/plan.json`
- `docs/project-brief.md` and `docs/pt-BR/project-brief.md`
- `docs/prd.md` and `docs/pt-BR/prd.md`
- `docs/front-end-spec.md` and `docs/pt-BR/front-end-spec.md`
- `docs/fullstack-architecture.md` and `docs/pt-BR/fullstack-architecture.md`
- `docs/architecture.md` and `docs/pt-BR/architecture.md`
- `docs/front-end-architecture.md` and `docs/pt-BR/front-end-architecture.md`
- `docs/planning-validation.md` and `docs/pt-BR/planning-validation.md`
- `docs/framework/tech-stack.md`, `coding-standards.md`, `source-tree.md`, `testing-strategy.md` and pt-BR counterparts
- `docs/stories/FND-1/story.md`, `validation.md` and pt-BR counterparts
- Sharded pairs: `docs/prd/` ↔ `docs/pt-BR/prd/`, `docs/front-end-spec/` ↔ `docs/pt-BR/front-end-spec/`, `docs/fullstack-architecture/` ↔ `docs/pt-BR/fullstack-architecture/`, `docs/architecture/` ↔ `docs/pt-BR/architecture/`, and `docs/front-end-architecture/` ↔ `docs/pt-BR/front-end-architecture/`.
