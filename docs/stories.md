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
**TDD evidence:** Version policy/CLI, Compose/bootstrap, PostgreSQL migrations, and secret-group runtime behavior have completed their recorded Red/Green/Refactor cycles. Operational first-run/restart checks passed on this Linux Docker Engine; bilingual user documentation and required lint/typecheck scripts/gates remain before story completion.

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

**Scope:** SemVer/runtime identity scripts and tests; bilingual project documentation/changelogs; Docker Compose bootstrap, PostgreSQL, migrations, health, and start scripts.  
**Acceptance criteria:**

- Runtime identity follows `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`, with `0.1.0`, `alpha`, and `0000000` before Git materialization.
- Validation/materialization tests cover source consistency, seven-character SHA, no-Git marker, Git discovery failure, artifact materialization, and no version mutation in ordinary validation.
- Compose starts bootstrap → healthy PostgreSQL → migrations → non-root bot; DB has no host port, named volumes persist, and ordinary stop/start scripts never delete volumes.
- PostgreSQL schema and SQL migrations enforce the specified queue-key, active-entry, redemption, and idempotency constraints; integration tests use isolated PostgreSQL and actual migrations.
- English documents and equivalent `docs/pt-BR/` documents exist with reciprocal links and consistent operational instructions.
- **TDD evidence:** see the completed, observed version, Compose/bootstrap, runtime regression, PostgreSQL, test discovery, and quality-script cycles above. Full bilingual operator documentation and remaining acceptance items are still pending.

#### FND-2 — Queue domain, validation, ordering, and parser

**Status:** Draft  
**Scope:** Pure domain rules, UID handling, command parser, authorization decisions, and transaction-backed queue operations.  
**Acceptance criteria:**

- State transitions and financial policy snapshots follow the transition table, with no invalid or terminal-to-active transitions.
- UID accepts only trimmed nine-digit ASCII strings in visible mode; hidden mode discards without persistence or disclosure.
- Parser handles case, repeated spaces, accent variants, reserved names, aliases, argument counts, and viewer identity restrictions.
- PostgreSQL tests prove per-queue active-user uniqueness and race handling; ordering changes are atomic and preserve persisted order.
- **TDD evidence:** pending; record Red, Green, Refactor, and commands only as executed.

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
**Scope:** Twitch chat parsing/execution, authorization, notifications, timeout recovery, clear confirmation, and current-account state.  
**Acceptance criteria:**

- Command and timer paths use the same domain service; message ID deduplication, broadcaster/mod/VIP authorization, channel checks, and viewer cooldown follow the specification.
- Call notification is durable, privacy is checked at send time, timeout begins only after confirmed send, and starting service prevents no-show.
- Clear requires same actor/channel/queue and unchanged active set within 15 seconds; otherwise no mutation or point operation occurs.
- Account auto-switch applies only to individual calls and only its owner can reset to default on termination; manual changes and reset persist and audit.
- Tests cover concurrency, restart, notification failure, privacy changes, and no unintended point effects.
- **TDD evidence:** pending; record Red, Green, Refactor, and commands only as executed.

#### FND-6 — Local panel, protected API, and operator documentation

**Status:** Draft  
**Scope:** Fastify local UI/API, installation/reconnection wizard, queue and redemption operations, local session/CSRF/Host/Origin protection, and operational guides.  
**Acceptance criteria:**

- Panel exposes only specified operations; API returns explicit projections and never serializes Prisma entities or secrets.
- `/api/state` is session-protected and distinguishes product version, API contract version, and state revision; UID follows the current visibility policy.
- Mutations validate schemas, session, CSRF, idempotency key, and applicable revision; DNS-rebinding protections run before admin handlers.
- User-controlled content is rendered as text; tests cover malicious HTML, host/origin/CSRF, OAuth callback, and secret non-disclosure.
- README files document install, login, commands, point policy, recovery, start/stop/update/logs, and version identity in both languages.
- **TDD evidence:** pending; record Red, Green, Refactor, and commands only as executed.

### Planning notes and gates

- The user's prompt is the requirements source; no additional product behavior is introduced by this plan.
- Official Twitch, Twurple, Prisma, PostgreSQL, and Docker documentation must be checked before their integrations are implemented.
- Quality gates required by the project are `npm run lint`, `npm run typecheck`, and `npm test`; PostgreSQL integration, migration, Compose, and version-policy checks are also required by the product specification. These have not yet been run.
- Release or tag creation is out of scope for this foundation task. Stage promotion requires explicit human approval.
- This plan does not claim stories approved, implemented, tested, QA-approved, or complete.
- AIOX environment preflight observed Git/GitHub CLI/Node/npm/Docker/Compose and GitHub authentication; the private remote exists on `main`. Product package/runtime files remain FND-1 TDD work.
- Planning artifacts: `docs/project-brief.md`, `docs/prd.md`, `docs/front-end-spec.md`, `docs/fullstack-architecture.md`, `docs/architecture.md`, `docs/front-end-architecture.md`, and `docs/planning-validation.md`, each with a corresponding `docs/pt-BR/` document.
- The AIOX `markdownExploder` setting is enabled. `@kayvan/markdown-tree-parser` v1.6.1 was installed globally and successfully sharded the PRD, frontend specification, integrated/service/frontend architectures in English and pt-BR; shard filenames were aligned across languages with reciprocal links.
- A requirements JSON syntax error was found during artifact validation and corrected before continuing; all planning JSON files parsed successfully afterward. This was a planning-document correction, not application behavior or TDD evidence.
- The operator selected the required mutable panel and confirmed AIOX CLI-first is a framework guideline; no extra domain CLI is required.

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
