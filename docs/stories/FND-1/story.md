# Story FND-1: Version Identity and Local Runtime Foundation

[Português brasileiro](../../pt-BR/stories/FND-1/story.md)

**Complexity:** COMPLEX  
**Executor:** @dev  
**Quality gate:** @architect  
**Quality gate tools:** Vitest, isolated PostgreSQL integration tests, Docker Compose config/acceptance, AIOX story DOD checklist  
**Epic/capability:** Product foundation, FND-1  
**Source:** `docs/stories/FND-0/spec/spec.md`; `docs/stories/FND-0/spec/plan.json`; `docs/prd.md`; `docs/fullstack-architecture.md`; `docs/architecture.md`; `docs/framework/tech-stack.md`; `docs/framework/testing-strategy.md`.

## Status

**InProgress**

## Story

**As a** streamer installing the local queue bot,  
**I want** the runtime identity, local secrets, database and migrations to initialize deterministically,  
**so that** I can open the panel without manual configuration and retain safe, recoverable data across restarts.

## Acceptance Criteria

1. Product version sources validate as base SemVer in `package.json`, allowed stage in `.release-stage`, and complete runtime identity in `VERSION`; the pre-Git value is `v0.1.0-0000000-alpha`. Materialization uses exactly seven hex characters from the exact source commit and never writes the SHA into the commit that produces it.
2. Normal validation/startup do not mutate version files. Missing Git uses the marker only when Git metadata is unavailable; if Git is present and commit discovery fails, materialization fails.
3. Compose first run performs idempotent bootstrap → healthy PostgreSQL → successful Prisma migrations → non-root bot. A generated DB password is persistent and mounted read-only to DB/migrate/bot; it is not printed, stored in product `.env`/YAML, or regenerated for an initialized DB.
4. PostgreSQL has no published host port; bot publishes `127.0.0.1:3000:3000`, binds Fastify on `0.0.0.0`, waits on DB health/migration completion, and supports health checks and graceful stop. Normal scripts never remove volumes.
5. Prisma CLI/client/adapter are pinned together at 6.19.3 with `prisma-client-js`, `prisma.config.mjs`, and `pg`; migrations enforce global queue-key, redemption, active-entry partial, source/ID, and financial-operation uniqueness/integrity.
6. A real isolated PostgreSQL integration suite runs actual versioned migrations and proves the required constraints and persistence/restart contracts; Compose checks use actual Compose configuration. No SQLite or mocked Prisma substitutes.
7. Root start scripts run `docker compose up --build -d`, wait for the configured published panel address, open the host browser when possible and print the exact fallback address. Windows paths with spaces work.
8. The runtime version endpoint/state contract reads the complete identity without confusing it with API contract version or state revision; no database URL, DB password, or other secret is emitted in errors/logs.
9. Product application files are located under `apps/web`, `apps/api`, `apps/infra`; AIOX `.env.example` remains untouched framework scaffolding and is not loaded as product configuration.
10. English and pt-BR install/version/integration/story documentation and changelogs are equivalent and linked. Only commands and test evidence actually observed are recorded.

## Scope

Included: product package/tooling foundation, exact runtime-version validation/materialization, Docker image and Compose graph, persistent one-time secret bootstrap, PostgreSQL/Prisma schema and SQL migrations, startup/health/shutdown scripts, isolated integration-test wiring, and bilingual operational/version documentation needed by these behaviors.

Excluded: queue domain logic, Twitch credentials/OAuth, real Twitch calls, command handling and panel implementation. Those belong to FND-2 through FND-6 and will each follow their own TDD cycle.

## Dev Notes

### Architecture and implementation constraints

- Implement app code only under `apps/*`; root `Dockerfile`, `compose.yaml`, start scripts, npm manifest, and docs are entrypoints/tooling. Do not repurpose `.env.example`.
- Exact pins: Node image `node:24.20.0-bookworm-slim`; Postgres image `postgres:18.6-bookworm`; Prisma CLI/client/adapter `6.19.3`; Vitest `5.0.3`. Confirm tags/package support before building.
- Runtime connection string is assembled in backend from `db` service and mounted password file with correct URL encoding before Prisma loads. Never print it.
- Secrets volume and database volume are named/persistent. Bootstrap is a one-shot service. Use Compose `service_healthy` and `service_completed_successfully` dependency conditions.
- PostgreSQL SQL constraints may complement Prisma. Active states are `waiting`, `called`, `in_progress`; source is `manual` or `redemption`. Do not delete history physically.
- Docker bot runs non-root, listens on `0.0.0.0` only inside its network namespace and is published to loopback by default. Do not auto-change a busy port.
- Runtime version defaults to the versioned marker; a build with Git must discover full source SHA and derive exactly seven hex characters, validating failure rather than falling back.
- This is infrastructure/persistence work: @data-engineer supports migration review; @devops owns container/deployment safety review. No release/tag/push is included.

### TDD sequence is mandatory

For each behavior below, first create/execute its test and observe a behavioral failure; record the exact output in this story and `docs/stories.md`/`docs/pt-BR/stories.md`. Only then implement the smallest change, rerun to Green, refactor separately, and rerun the affected suite. A missing dependency, syntax error, or unavailable Docker daemon is not a Red result.

1. Version test before version module/CLI.
2. Compose contract test before Docker/Compose/bootstrap/start scripts.
3. Real PostgreSQL migration constraint test before Prisma schema/SQL migration.
4. First-run/restart Compose acceptance before operational changes needed to satisfy it.
5. Documentation follows observed behavior; document blocked platform checks explicitly and never claim parity without evidence.

### Required unit/integration cases

- Exact complete identity grammar, base SemVer only, allowed stage, consistency, seven hex chars, marker without Git, missing/malformed Git, failure discovery, exact commit prefix, artifact-only materialization, and file preservation on ordinary validation.
- Compose topology/order, no DB host port, loopback binding, one-time persistent password, read-only secret mounts, non-root process, health, graceful stop and no volume deletion.
- Actual PostgreSQL migrations: key namespace uniqueness, unique redemption/message/idempotency identifiers, partial active user uniqueness, foreign/source integrity and rejected redemption persistence.
- Compose first run, migration-before-bot, restart/recreation persistence and exact start-script URL. Test each host platform before claiming its compatibility.

### Known limitations to keep visible

- File-backed Compose secret owner/mode behavior differs between Docker Engine/Desktop platforms. Any platform not exercised remains unverified.
- No Twitch app credentials are available; this story makes no live Twitch claim.
- Repo currently has no commit. `VERSION` retains the prescribed `0000000` marker until an artifact is materialized from an existing commit. Do not create a self-referential SHA commit.

## Tasks / Subtasks

- [x] 1. Version policy functions — Red/Green/Refactor complete (AC: 1, 2)
  - [x] 1.1 Add and run Vitest cases for base SemVer, source consistency, allowed stages, marker without Git, full commit SHA prefix, and discovery errors.
  - [x] 1.2 Implement pure ESM validation/materialization functions in `apps/infra/src/version.mjs` after observed Red; prove Green.
  - [x] 1.3 Remove an unused exported accessor and rerun affected tests; behavior remained unchanged.
- [x] 2. Version file/CLI contract — Red/Green/Refactor complete (AC: 1, 2, 8)
  - [x] 2.1 Add and run tests for version source files, read-only validation, exact Git identity discovery, and artifact-output-only materialization; capture behavioral Red.
  - [x] 2.2 Implement `VERSION`, `.release-stage`, version validator and materializer CLIs only after observed Red; validate no version source is written during ordinary checks.
  - [x] 2.3 Refactor CLI path handling and rerun version unit/integration tests.
- [x] 3. Compose/bootstrap contract — Red/Green/Refactor and Linux runtime regression verified (AC: 3, 4, 7, 9)
  - [x] 3.1 Compose contract tests observed missing Compose/secret behaviors before implementation.
  - [x] 3.2 Implement one-shot secret bootstrap, Compose, image and start scripts after Red.
  - [x] 3.3 Advanced-port and unreadable-secret regressions were observed and fixed; Compose contract and `docker compose config --quiet` pass.
- [x] 4. PostgreSQL migrations and constraints — real DB Red/Green verified (AC: 5, 6)
  - [x] 4.1 Isolated PostgreSQL test and real migration observed the absent tables/constraints.
  - [x] 4.2 Implement Prisma schema and SQL migration; real PostgreSQL migration contract passes.
  - [x] 4.3 Validate Prisma schema and rerun migration/Compose affected tests; 9 passed.
- [x] 5. Health response reports runtime version and explicit dependency status (AC: 4, 8)
  - [x] 5.1 Add route tests for version, actual DB query outcome, unconfigured Twitch state, and sanitized DB failure; observe Red.
  - [x] 5.2 Implement health response projection and wire runtime `VERSION`; focused tests pass.
  - [x] 5.3 Rebuild local image and verify response through loopback; run full tests, lint and typecheck.
- [ ] 5. Operational acceptance and documentation (AC: 3, 4, 6, 7, 9, 10)
  - [ ] 5.1 Write/run first-run/restart Compose acceptance before changing runtime wiring; capture Red.
  - [ ] 5.2 Implement health, graceful shutdown and start scripts for tested behavior; verify compose order and persistent volumes.
  - [ ] 5.3 Update English/pt-BR README/versioning/integration/changelog/story docs and verify reciprocal links/commands.
- [ ] 6. Quality gates and evidence (AC: all)
  - [ ] 6.1 Run `npm run lint`, `npm run typecheck`, `npm test`, PostgreSQL integration/migration tests, Compose config/acceptance, and version checks. Do not omit unavailable gates; document exact blockers.
  - [ ] 6.2 Update both story indexes and this story's file list/checklist with actual results; do not mark Done if any acceptance criterion or test is blocked.

## Testing

- Vitest unit suite: version policy and helper tests (no Twitch token).
- Vitest contract suite: Compose YAML/process scripts and health wiring.
- PostgreSQL integration suite: isolated database, actual Prisma migrations and database-enforced contention/uniqueness.
- Compose acceptance: real local image, bootstrap, migration ordering, non-root user, restart persistence and secret behavior on each claimed OS.
- Static checks: `docker compose config`, syntax/lock consistency, `npm run lint`, `npm run typecheck`, `npm test`.
- Exact Red/Green/Refactor evidence is pending until each command is run.

## 🤖 CodeRabbit Integration

**Story Type Analysis**  
**Primary Type**: Infrastructure and database foundation  
**Secondary Type(s)**: Versioning, security, build tooling  
**Complexity**: COMPLEX

**Specialized Agent Assignment**
- Primary agents: @dev
- Supporting: @data-engineer (schema/migration), @devops (Compose/security), @architect (design review)

**Quality Gates**
- [ ] @dev pre-commit review and full required test gates
- [ ] @architect review of migration/Compose/version contracts
- [ ] @data-engineer review of PostgreSQL constraints and persistence evidence
- [ ] @devops review of Docker secret/runtime/publish safety (no push/release requested)

**Self-Healing**: If CodeRabbit CLI is available, @dev light mode, at most two iterations, 15 minutes each, CRITICAL issues only; record HIGH findings. If unavailable, perform manual review and record that CLI review was skipped.

**Focus Areas**: No secret leakage; no incorrect SHA fallback; no host DB exposure; persistent volume safety; migration ordering; real DB constraint proof; non-root container; avoid platform compatibility claims without execution.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-02 | 0.1.0 | Development started (interactive mode) — Status: Ready → InProgress | @dev |
| 2026-10-02 | 0.1.0 | PO validation GO (9/10) — Status: Draft → Ready | @po |
| 2026-10-02 | 0.1.0 | Story created from approved product planning; no implementation evidence yet. | @sm |

## Dev Agent Record

### Agent Model Used

Pending implementation.

### Debug Log References

- `npm test -- --run tests/unit/version-policy.test.js` — Red: 11 failed, 0 passed after test hardening. The module did not exist; missing exports failed behavioral assertions. The earlier preliminary run (8 failed/3 passed) was discarded because invalid-input checks could pass from a missing-function `TypeError`.
- `npm test -- --run tests/unit/version-policy.test.js` — Green: 11 passed after implementing the pure policy functions.
- `npm test -- --run tests/unit/version-policy.test.js` — Refactor: 11 passed after removing an unneeded exported accessor.
- `npm run test:integration -- tests/integration/version-cli.test.js` — Red: 4 failed, 0 passed because the validation/materialization CLI behavior was absent (the CLI files did not exist); the temporary Git fixtures and Vitest ran successfully.
- `npm test -- --run tests/unit/version-policy.test.js tests/integration/version-cli.test.js` — Green: 15 passed after adding version source validation and artifact-only materialization CLIs.
- `npm test -- --run tests/unit/version-policy.test.js tests/integration/version-cli.test.js` — Refactor: 15 passed after making artifact-path resolution platform-aware.
- `npm run validate:version` — `Product version is valid: v0.1.0-0000000-alpha` (read-only check).
- `npm test -- --run tests/integration/postgres-foundation.test.js` — Red: PostgreSQL initialized and migrations completed, then both tests failed because product tables/constraints were absent; Green: 2 passed after schema/migration implementation.
- `npm test -- --run tests/integration/compose-contract.test.js` — runtime secret-group regression Red: `migrate.group_add` absent; Green after GID 999 supplemental group was added.
- `npm test -- --run tests/integration/compose-contract.test.js tests/integration/postgres-foundation.test.js` — 9 passed after runtime fix.
- `docker compose up --build -d`, health check and `docker compose restart bot` — Linux Engine first-run and bot restart passed; database health, read-only secret access, non-root bot UID, migration history, and `/health` response confirmed.
- `docker compose build bot` — success; clean image build ran `npm ci` and Prisma Client generation.
- `npm test -- --run tests/unit/health-route.test.js` — Red: 2 failed because health projection was absent; Green: 2 passed with explicit product/database/Twitch fields and sanitized failure.
- `curl --fail --silent --show-error http://localhost:3000/health` — `{"status":"ok","product_version":"v0.1.0-0000000-alpha","dependencies":{"database":"connected","twitch_api":"not_configured"}}` from the rebuilt running container.

### Completion Notes List

- Product-version functions, Compose/bootstrap, migration schema, and base Linux runtime behavior have been validated. FND-1 remains InProgress: bilingual operator documentation, lint/typecheck/test quality gates, full runtime/API version contract checks, script/browser checks, and additional acceptance evidence remain.

## File List

- `package.json`
- `package-lock.json`
- `tests/unit/version-policy.test.js`
- `apps/infra/src/version.mjs`
- `apps/infra/src/version-files.mjs`
- `apps/infra/scripts/validate-version.mjs`
- `apps/infra/scripts/materialize-version.mjs`
- `.release-stage`
- `VERSION`
- `compose.yaml`
- `Dockerfile`
- `apps/infra/src/bootstrap-secret.mjs`
- `apps/infra/src/database-url.mjs`
- `apps/infra/scripts/bootstrap.mjs`
- `apps/infra/scripts/migrate.mjs`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/202610020001_foundation/migration.sql`
- `apps/api/prisma/migrations/migration_lock.toml`
- `tests/integration/postgres-foundation.test.js`
- `tests/integration/compose-contract.test.js`
- `tests/unit/bootstrap-secret.test.js`
- `tests/unit/database-url.test.js`
- `tests/unit/local-ignore-policy.test.js`
- `tests/unit/test-discovery-contract.test.js`
- `tests/unit/quality-script-contract.test.js`
- `vitest.config.js`
- `eslint.config.js`
- `tsconfig.json`
- `.dockerignore`
- `.gitignore`
- `iniciar.sh`
- `iniciar.bat`
- `apps/infra/scripts/healthcheck.mjs`
- `apps/api/src/server.mjs`
- `apps/api/src/health-route.mjs`
- `tests/unit/health-route.test.js`
- `CHANGELOG.md`
- `CHANGELOG_INTERNAL.md`
- `docs/pt-BR/CHANGELOG.md`
- `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/VERSIONING.md` and `docs/pt-BR/VERSIONING.md`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`, and pt-BR changelog counterparts
- Planning source files are listed under the `FND-0` entry in `docs/stories.md`.
