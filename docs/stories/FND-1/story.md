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
  - [x] 5.1 Add/run isolated first-run/restart Compose acceptance; verified health, real migrations, a persisted database marker, stable secret hash, and graceful bot stop/start.
  - [x] 5.2 Verify health, graceful shutdown, Compose order, and persistent volumes; POSIX helper passed with a copied project path containing spaces and browser-launch fallback. Windows batch remains structurally checked but unexecuted on this Linux host.
  - [x] 5.3 Write linked English/pt-BR central READMEs and integration reference; record the documentation-contract Red/Green/Refactor evidence and update paired changelogs.
- [x] 6. Quality gates and evidence (AC: all; Windows platform execution remains an explicit open acceptance item)
  - [x] 6.1 `npm run lint`, `npm run typecheck`, `npm test`, PostgreSQL integration/migration tests, Compose config/acceptance, and version checks pass on Linux.
  - [x] 6.2 Update both story indexes and this story's file list/checklist with observed results; keep FND-1 InProgress while Windows execution remains unavailable.

## Testing

- Vitest unit suite: version policy and helper tests (no Twitch token).
- Vitest contract suite: Compose YAML/process scripts and health wiring.
- PostgreSQL integration suite: isolated database, actual Prisma migrations and database-enforced contention/uniqueness.
- Compose acceptance: real local image, bootstrap, migration ordering, non-root user, restart persistence and secret behavior on each claimed OS.
- Static checks: `docker compose config`, syntax/lock consistency, `npm run lint`, `npm run typecheck`, `npm test`.
- Red/Green/Refactor evidence is recorded in `docs/stories.md` and the bilingual counterpart. Windows execution is not claimed.

## Local Static Review and Quality Gates

**Story Type Analysis**  
**Primary Type**: Infrastructure and database foundation  
**Secondary Type(s)**: Versioning, security, build tooling  
**Complexity**: COMPLEX

**Specialized Agent Assignment**
- Primary agents: @dev
- Supporting: @data-engineer (schema/migration), @devops (Compose/security), @architect (design review)

**Quality Gates**
- [x] Free local OpenGrep review configured and run with repository-authored rules; no CodeRabbit account, license, CLI, or hosted service is used.
- [x] @dev local review and full Linux test/quality gates recorded; native Windows script execution remains unverified.
- [ ] @architect review of migration/Compose/version contracts
- [ ] @data-engineer review of PostgreSQL constraints and persistence evidence
- [ ] @devops review of Docker secret/runtime/publish safety (no push/release requested)

**Review procedure**: Run `npm run review:static` using pinned OpenGrep `1.30.0` and `.opengrep/rules.yml`. The local rules check unsafe HTML sinks and credential logging in `apps/`. This rule-based scan is not contextual AI review; human/AIOX review remains required. Do not invoke CodeRabbit because this project has no license for it.

**Focus Areas**: No secret leakage; no incorrect SHA fallback; no host DB exposure; persistent volume safety; migration ordering; real DB constraint proof; non-root container; avoid platform compatibility claims without execution.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-02 | 0.1.0 | Development started (interactive mode) — Status: Ready → InProgress | @dev |
| 2026-10-02 | 0.1.0 | PO validation GO (9/10) — Status: Draft → Ready | @po |
| 2026-10-02 | 0.1.0 | Story created from approved product planning; no implementation evidence yet. | @sm |
| 2026-10-02 | 0.1.0 | Replaced the unavailable paid CodeRabbit review with pinned local OpenGrep rules; FND-1 remains InProgress pending native Windows batch execution. | @dev |

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
- `npm test -- --run tests/unit/free-review-tool.test.js` — Red because `.opengrep/rules.yml` and the local review configuration were absent. After adding local rules, the npm command and disabled paid gate, subsequent Reds exposed missing `--no-git-ignore` and the AIOX dev-profile command; each was corrected before Green.
- `npm test -- --run tests/unit/free-review-tool.test.js` — Green: the configuration contract passes for local OpenGrep, required rules, invocation, and the disabled CodeRabbit gate.
- Quality-gate wiring regression (2026-10-02): extended the contract first to require an enabled `opengrep` command and absence of the stale CodeRabbit CLI path. Red: `npm test -- --run tests/unit/free-review-tool.test.js` failed because the gate still exposed only the disabled CodeRabbit entry. Updated AIOX config to enable `npm run review:static`; a follow-up assertion failed because its regex mishandled the YAML whitespace, so the assertion was changed to an exact block check. Green: `npm test -- --run tests/unit/free-review-tool.test.js tests/unit/documentation-contract.test.js` — 3 passed.
- `npm run review:static` — an initial broad logger pattern produced a false positive on a file write; narrowing it to supported logger calls removed the false positive. Final: 2 rules on 18 JavaScript files, 0 findings.
- Temporary behavior fixture: unsafe HTML and credential logging produced 2 expected findings; a file write containing a variable named `password` produced 0 findings.
- OpenGrep `1.30.0` was installed through the official pinned release installer; `opengrep --version` returned `1.30.0`. Optional Cosign signature verification was not run because Cosign was unavailable.
- Current Linux quality run: `npm test` — 21 files/140 tests passed; `npm run lint`, `npm run typecheck`, `npm run review:static` (18 JS files/0 findings), `docker compose config --quiet`, `npm run validate:version` (`v0.1.0-0000000-alpha`) and `git diff --check` passed.

### Completion Notes List

- Product-version functions, Compose/bootstrap, migration schema, Linux runtime, bilingual operator/integration documentation, Compose acceptance, and the current Linux quality gates have been validated. FND-1 remains InProgress because `iniciar.bat` has not been executed on a native Windows host; its runtime behavior cannot be claimed from this Linux environment.

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
- `apps/api/src/web-route.mjs`
- `apps/web/index.html` and `apps/web/styles.css`
- `tests/unit/health-route.test.js`
- `tests/unit/web-route.test.js`
- `tests/unit/documentation-contract.test.js`
- `tests/unit/start-script.test.js`
- `tests/integration/compose-runtime.test.js`
- `tests/integration/compose-contract.test.js`
- `README.md` and `README.pt-BR.md`
- `docs/integrations.md` and `docs/pt-BR/integrations.md`
- `docs/stories.md` and `docs/pt-BR/stories.md`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`, and pt-BR changelog counterparts
- `docs/VERSIONING.md` and `docs/pt-BR/VERSIONING.md`
- `.opengrep/rules.yml` and `tests/unit/free-review-tool.test.js`
- `.aiox-core/core/quality-gates/quality-gate-config.yaml`
- Planning source files are listed under the `FND-0` entry in `docs/stories.md`.
