# Story FND-1: Version Identity and Local Runtime Foundation

[Português brasileiro](../../pt-BR/stories/FND-1/story.md)

**Complexity:** COMPLEX
**Executor:** @dev
**Quality gate:** @architect
**Quality gate tools:** Vitest, isolated PostgreSQL integration tests, Docker Compose config/acceptance, AIOX story DOD checklist
**Epic/capability:** Product foundation, FND-1
**Source:** `docs/stories/FND-0/spec/spec.md`; `docs/stories/FND-0/spec/plan.json`; `docs/prd.md`; `docs/fullstack-architecture.md`; `docs/architecture.md`; `docs/framework/tech-stack.md`; `docs/framework/testing-strategy.md`.

## Status

**Done**

## Story

**As a** streamer installing the local queue bot,
**I want** the runtime identity, local secrets, database and migrations to initialize deterministically,
**so that** I can open the panel without manual configuration and retain safe, recoverable data across restarts.

## Acceptance Criteria

1. Product version sources validate as base SemVer in `package.json`, allowed stage in `.release-stage`, and complete runtime identity in `VERSION`; the pre-Git value is `v0.1.0-0000000-alpha`. Materialization uses exactly seven hex characters from the exact source commit and never writes the SHA into the commit that produces it.
2. Normal validation/startup do not mutate version files. Missing Git uses the marker only when Git metadata is unavailable; if Git is present and commit discovery fails, materialization fails.
3. Compose first run performs idempotent bootstrap → healthy PostgreSQL → successful Prisma migrations → non-root bot. A generated DB password is persistent and mounted read-only to DB/migrate/bot; it is not printed, stored in product `.env`/YAML, or regenerated for an initialized DB.
4. PostgreSQL has no published host port; bot publishes `127.0.0.1:3000:3000`, serves Fastify over HTTPS on `0.0.0.0`, waits on DB health/migration completion, and supports health checks and graceful stop. Normal scripts never remove volumes.
5. Prisma CLI/client/adapter are pinned together at 6.19.3 with `prisma-client-js`, `prisma.config.mjs`, and `pg`; migrations enforce global queue-key, redemption, active-entry partial, source/ID, and financial-operation uniqueness/integrity.
6. A real isolated PostgreSQL integration suite runs actual versioned migrations and proves the required constraints and persistence/restart contracts; Compose checks use actual Compose configuration. No SQLite or mocked Prisma substitutes.
7. Root start scripts pull the GHCR `main` multi-platform image, run Compose, wait for the configured `https://localhost` panel address, open the host browser when possible and print the exact fallback address. Windows paths with spaces work; CI also publishes explicit AMD64/ARM64 tags and product-versioned manifests.
8. The runtime version endpoint/state contract reads the complete identity without confusing it with API contract version or state revision; no database URL, DB password, or other secret is emitted in errors/logs.
9. Product application files are located under `apps/web`, `apps/api`, `apps/infra`; AIOX `.env.example` remains untouched framework scaffolding and is not loaded as product configuration.
10. English and pt-BR install/version/integration/story documentation and changelogs are equivalent and linked, including the explicit local CA trust step. Only commands and test evidence actually observed are recorded.
11. The optional Git updater only fast-forwards a clean `main` checkout before pulling/starting the GHCR image. The uninstaller preserves Docker volumes by default; permanent data deletion requires an explicit yes response and typing `APAGAR`. Windows and POSIX helpers follow the same behavior and never remove the source checkout.
12. CI publishes the checked-out `main` source to GHCR for `linux/amd64` and `linux/arm64`; `main` and complete product-version tags are multi-platform manifests, while `-linux-amd64` and `-linux-arm64` tags select a single architecture. Compose defaults to the manifest tag.
13. GHCR package may stay private during pre-release testing, but its visibility must be changed to public before product launch; public installs do not require GHCR credentials.

## Scope

Included: product package/tooling foundation, exact runtime-version validation/materialization, Docker image and Compose graph, persistent one-time DB/TLS secret bootstrap, local HTTPS panel/callback transport, PostgreSQL/Prisma schema and SQL migrations, startup/health/shutdown scripts, isolated integration-test wiring, and bilingual operational/version documentation needed by these behaviors.

Excluded: queue domain logic, Twitch credentials/OAuth, real Twitch calls, command handling and panel implementation. Those belong to FND-2 through FND-6 and will each follow their own TDD cycle.

## Dev Notes

### Architecture and implementation constraints

- Implement app code only under `apps/*`; root `Dockerfile`, `compose.yaml`, start scripts, npm manifest, and docs are entrypoints/tooling. Do not repurpose `.env.example`.
- Exact pins: Node image `node:24.20.0-alpine3.24`; Postgres image `postgres:18.6-bookworm`; Prisma CLI/client/adapter `6.19.3`; Vitest `5.0.3`. The app uses Alpine/musl; PostgreSQL stays on Debian Bookworm.
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
  - [x] 2.4 Add test-first CI image materialization from the exact checked-out commit; pass the external artifact identity as a Compose build argument and verify `/app/VERSION` inside the image.
  - [x] 2.4 Add test-first CI image materialization from the exact checked-out commit; pass the external artifact identity as a Compose build argument and verify `/app/VERSION` inside the image.
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
- [x] 5. Operational acceptance and documentation (AC: 3, 4, 6, 7, 9, 10, 11, 12, 13)
  - [x] 5.1 Add/run isolated first-run/restart Compose acceptance; verified health, real migrations, a persisted database marker, stable secret hash, and graceful bot stop/start.
  - [x] 5.2 Verify health, graceful shutdown, Compose order, and persistent volumes; POSIX helper passed with a copied project path containing spaces and browser-launch fallback. The operator confirmed the current Windows installer works after testing beta `v0.1.0-081ea9b-beta` from Main CD run `38107336763`. This supersedes the retired root `iniciar.bat` helper acceptance; its historical stdin-redirection report is not an open product defect.
  - [x] 5.3 Write linked English/pt-BR central READMEs and integration reference; record the documentation-contract Red/Green/Refactor evidence and update paired changelogs.
  - [x] 5.4 Add test-first local TLS bootstrap, HTTPS callback, secure session cookie, exact HTTPS Origin and host-trust instructions; real isolated Compose confirms TLS/certificate chain and restart persistence.
  - [x] 5.5 Add test-first Git fast-forward updater and interactive POSIX/Windows uninstall helpers; preserve volumes by default and require typed confirmation for deletion. The unified installer superseding the legacy helpers passed native Windows Actions smoke and operator installation acceptance.
  - [x] 5.6 Add Compose/workflow contracts for GHCR tags and main-gated AMD64/ARM64 publish; make startup/update helpers pull the platform-selecting manifest; document pre-release authentication and public-at-launch visibility requirement in both languages. GHCR is public. The beta digest `sha256:df52d36981b1a981a568139ba4443561e2ea378e808321c2a555c6fb63a07b77` pulled anonymously for `linux/amd64` and `linux/arm64` with an empty Docker config; the operator's Windows installer also pulled and installed the image successfully. No physical macOS Docker Desktop run is claimed.
  - [x] 5.7 Record the first materialized alpha identity in the bilingual changelogs, version policy and operator READMEs; verify CI image identity and manifest evidence after PR #14. No launch release, Git tag, or stage promotion was created.
  - [x] 5.7 Test Alpine before adoption: pinned Node/Alpine, Prisma musl engine, actual bootstrap/migrations/HTTPS health in isolated Compose; then clean-build and restart normal Compose while preserving database/secrets volumes.
  - [x] 5.8 Before launch, change GHCR package visibility to public and verify anonymous architecture-manifest pulls. The package is public; anonymous amd64/arm64 pulls passed. A physical macOS host smoke remains optional and is not required to close this foundation story.
- [x] 6. Quality gates and evidence (AC: all)
  - [x] 6.1 `npm run lint`, `npm run typecheck`, `npm test`, PostgreSQL integration/migration tests, Compose config/acceptance, and version checks pass on Linux.
  - [x] 6.2 Update both story indexes and this story's file list/checklist with observed results. The current Windows installer acceptance is confirmed by the operator; the legacy helper was superseded by OPS-5.

## Testing

- Vitest unit suite: version policy and helper tests (no Twitch token).
- Vitest contract suite: Compose YAML/process scripts and health wiring.
- PostgreSQL integration suite: isolated database, actual Prisma migrations and database-enforced contention/uniqueness.
- Compose acceptance: real local image, bootstrap, migration ordering, non-root user, restart persistence and secret behavior on each claimed OS.
- Static checks: `docker compose config`, syntax/lock consistency, `npm run lint`, `npm run typecheck`, `npm test`.
- Red/Green/Refactor evidence is recorded in `docs/stories.md` and the bilingual counterpart. The operator confirmed successful installation with the current Windows beta installer from main commit `081ea9b4c65246a877cd9f77cdb4392acf5009a4`; native Windows smoke and all Main CD jobs passed in run `38107336763`. GHCR anonymous amd64/arm64 pulls passed from an empty Docker config. No physical macOS host test is claimed.

## Local Static Analysis and Quality Gates

**Story type**: Infrastructure and database foundation
**Primary agent**: @dev
**Specialist reviews**: @architect, @data-engineer, and @devops review this completed infrastructure scope before QA closure.

**Quality gates**
- [x] Local OpenGrep `1.30.0` scanner with repository-owned rules executed: 2 rules across 19 JavaScript files, 0 findings.
- [x] `tests/unit/aiox-static-review.test.js` and `tests/unit/opengrep-quality-gate.test.js` passed (4 tests).
- [x] Formal architecture, database, and container-operations reviews completed; scope and evidence are recorded in the QA review below.

**Procedure**: `npm run review:static`. The scanner reports findings and fails according to the blocking rule; it does not edit files. AIOX human review remains separate.

**Focus**: unsafe HTML sinks and credential logging. The legacy root `.bat` helper was superseded by OPS-5; the current Windows installer was accepted by the owner.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-02 | 0.1.0 | Development started (interactive mode) — Status: Ready → InProgress | @dev |
| 2026-10-02 | 0.1.0 | PO validation GO (9/10) — Status: Draft → Ready | @po |
| 2026-10-02 | 0.1.0 | Story created from approved product planning; no implementation evidence yet. | @sm |
| 2026-10-11 | 0.1.0 | Owner-confirmed Windows beta installation and public anonymous multi-platform pulls recorded; Status: InProgress → InReview for QA closure | @dev |
| 2026-10-11 | 0.1.0 | QA Gate PASS (10/10) — Status: InReview → Done; all 13 acceptance criteria and current public image/installer evidence reviewed | @qa |

## Dev Agent Record

### Agent Model Used

AIOX @dev implementation; @architect, @data-engineer, and @devops scoped completion reviews; final lifecycle gate by @qa.

### Debug Log References
- **Prisma dependency security TDD (2026-10-06):** `npm test -- --run tests/unit/prisma-dependency-security.test.js` Red — 1 failed because no patched `deepmerge-ts` override existed; Prisma CLI/client/adapter alignment already passed. Green — 2 passed after adding a scoped `@prisma/config` override to `8.0.2`; the lockfile resolves 8.0.2 while all Prisma packages remain 6.19.3. `npm ci` and `npm audit --audit-level=high` report 0 vulnerabilities; `npx prisma generate` succeeded. `npx prisma validate` first failed without `DATABASE_URL`, then passed with a local test URL. Full suite: 53 files/386 tests passed; lint, typecheck, version validation, OpenGrep (0 findings), Compose config, and diff checks passed. A final `docker compose -p queuebot-security-audit build --no-cache` and isolated first run at port 3221 succeeded: bootstrap completed, PostgreSQL became healthy, migrations exited successfully, `/health` returned `status: ok` with database connected, and the bot healthcheck became healthy. Only the disposable `queuebot-security-audit` containers/network/volumes were removed; the current installation was untouched.
- **Alpine runtime and first materialized image evidence (2026-10-05):** `npx vitest run tests/integration/compose-contract.test.js -t 'defaults local app images'` Red — 1 failed because production `Dockerfile` still declared `node:24.20.0-bookworm-slim` and installed OpenSSL with `apt-get`; Green — `npx vitest run tests/integration/compose-contract.test.js` passed 10/10 after pinning `node:24.20.0-alpine3.24` and `apk add --no-cache openssl`. Before adoption, a clean build generated Prisma 6.19.3 engine `libquery_engine-linux-musl-openssl-3.0.x.so.node`; fresh isolated Compose passed bootstrap, three real PostgreSQL migrations, non-root UID 10001, HTTPS `/health` with connected DB, and healthy status. Initial disposable builds caught an unpublished 3.22 tag (corrected to 3.24) and GID 999 name collision (`ping`); production uses Compose's numeric supplemental GID. All normal app services were then rebuilt using `docker compose build --no-cache --pull`, old project containers/image removed, and `docker compose up -d --no-build` passed on preserved volumes: DB healthy, migrations exited 0/no pending migrations, bot healthy, and `/health` returned `status: ok`/database connected. Original `postgres_data` and `operational_secrets` volumes remain; disposable test volumes/image were deleted. Local AMD64 image size: 769,822,537 bytes vs previous 959 MB. After PR #14 merge, GitHub Actions run `37391271083` passed and published the first materialized alpha identity `v0.1.0-3e0c935-alpha` as a private AMD64/ARM64 manifest. Native Windows/macOS host runs have not been repeated after this base change.
- Static-review migration TDD: `tests/unit/aiox-static-review.test.js` first failed because Layer 2 did not execute the configured command; a later Red exposed the missing workflow-executor static-review phase. Behavior then passed. A repository-wide assertion found stale generated registry files, which were regenerated. Final focused command: `npm test -- --run tests/unit/aiox-static-review.test.js tests/unit/opengrep-quality-gate.test.js` — 4 passed.
- Scanner-gate TDD: `tests/unit/opengrep-quality-gate.test.js` first failed because the story template and scanner command were absent; a later Red caught the missing blocking `--error` flag. The final focused command above passed.
- Final quality gates: `npm test` — 23 files/145 tests passed; `npm run lint`, `npm run typecheck`, `npm run review:static` (19 application JS files/0 findings), `npm run validate:version`, `docker compose config --quiet`, `git diff --check`, and IDE sync strict validation (109/109, no drift) passed.

- `npm test -- --run tests/unit/version-policy.test.js` — Red: 11 failed, 0 passed after test hardening. The module did not exist; missing exports failed behavioral assertions. The earlier preliminary run (8 failed/3 passed) was discarded because invalid-input checks could pass from a missing-function `TypeError`.
- `npm test -- --run tests/unit/version-policy.test.js` — Green: 11 passed after implementing the pure policy functions.
- `npm test -- --run tests/unit/version-policy.test.js` — Refactor: 11 passed after removing an unneeded exported accessor.
- `npm run test:integration -- tests/integration/version-cli.test.js` — Red: 4 failed, 0 passed because the validation/materialization CLI behavior was absent (the CLI files did not exist); the temporary Git fixtures and Vitest ran successfully.
- `npm test -- --run tests/integration/version-cli.test.js -t 'CI image'` — Red: 1 failed because CI did not materialize or verify the source SHA in its Docker image. Green: the same focused test passed after adding the external artifact materialization step and container check.
- Runtime artifact check: `node apps/infra/scripts/materialize-version.mjs --root "$PWD" --output /tmp/aiox-product-version-runtime-test/VERSION` materialized `v0.1.0-f32c37a-alpha` from current `HEAD`; `docker compose build bot` with `PRODUCT_VERSION` succeeded, and `docker compose run --rm --no-deps --entrypoint cat bot /app/VERSION` returned that same value.
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
- `npm run review:static` — an initial broad logger pattern produced a false positive on a file write; narrowing it to supported logger calls removed the false positive. Final: 2 rules on 19 application JavaScript files, 0 findings.
- Temporary behavior fixture: unsafe HTML and credential logging produced 2 expected findings; a file write containing a variable named `password` produced 0 findings.
- Current Linux quality run: `npm test` — 21 files/140 tests passed; `npm run lint`, `npm run typecheck`, `npm run review:static` (18 JS files/0 findings), `docker compose config --quiet`, `npm run validate:version` (`v0.1.0-0000000-alpha`) and `git diff --check` passed.

### Completion Notes List

- Version functions, Compose/bootstrap, schema and real migrations, runtime, bilingual documentation, Compose acceptance, and CI gates have been validated. On 2026-10-11, the owner confirmed that the `main` Windows beta installer works. Public GHCR amd64 and arm64 manifests were pulled anonymously. The legacy `iniciar.bat` helper was superseded by OPS-5; a physical macOS Docker Desktop run was not performed and remains optional, without blocking this foundation story.

## File List

- `package.json`
- `tests/unit/prisma-dependency-security.test.js`
- `VERSION`
- `package-lock.json`
- `iniciar.bat`
- `tests/integration/compose-contract.test.js`
- `tests/integration/container-publish-contract.test.js`
- `.github/workflows/ci.yml`
- `atualizar.sh` and `atualizar.bat`
- `docs/VERSIONING.md` and `docs/pt-BR/VERSIONING.md`
- `tests/integration/version-cli.test.js`
- `.github/workflows/ci.yml`
- `Dockerfile`
- `compose.yaml`
- `README.md`
- `README.pt-BR.md`
- `docs/stories.md`
- `docs/pt-BR/stories.md`
- `CHANGELOG.md`
- `CHANGELOG_INTERNAL.md`
- `docs/pt-BR/CHANGELOG.md`
- `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `.opengrep/rules.yml`
- `.aiox-core/core/quality-gates/layer2-pr-automation.js`
- `.aiox-core/core/orchestration/workflow-executor.js`
- `tests/unit/aiox-static-review.test.js`
- `tests/unit/opengrep-quality-gate.test.js`

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
- `.aiox-core/core/quality-gates/quality-gate-config.yaml`
- `apps/infra/src/bootstrap-secret.mjs`, `apps/infra/scripts/bootstrap.mjs`, `.gitignore`, `.dockerignore`, `compose.yaml`, `Dockerfile`
- `apps/api/src/server.mjs`, `apps/api/src/http/local-session.mjs`, `apps/api/src/http/queue-routes.mjs`, `apps/api/src/twitch/auth-runtime.mjs`, `apps/api/src/twitch/integration.mjs`
- `apps/infra/scripts/healthcheck.mjs`, `iniciar.sh`, `iniciar.bat`, `apps/web/index.html`
- `tests/unit/bootstrap-secret.test.js`, `tests/unit/local-session.test.js`, `tests/unit/local-ignore-policy.test.js`, `tests/unit/queue-routes.test.js`, `tests/unit/twitch-auth-runtime.test.js`, `tests/unit/twitch-oauth.test.js`, `tests/unit/start-script.test.js`, `tests/integration/compose-contract.test.js`, `tests/integration/compose-runtime.test.js`
- `README.md`, `README.pt-BR.md`, `docs/stories/FND-0/spec/spec.md`, `docs/pt-BR/stories/FND-0/spec/spec.md`, `docs/integrations.md`, `docs/pt-BR/integrations.md`, both story indexes and user/internal changelogs in both languages
- Planning source files are listed under the `FND-0` entry in `docs/stories.md`.

### Closure increment file list

- `docs/stories/FND-1/story.md`
- `docs/pt-BR/stories/FND-1/story.md`
- `docs/stories.md`
- `docs/pt-BR/stories.md`
- `docs/session-handoff.md`
- `docs/pt-BR/session-handoff.md`
- `docs/qa/gates/FND-1-version-identity-runtime-foundation.yml`

## QA Results

### Review Date: 2026-10-11

### Reviewed By: Quinn (Test Architect)

### Reviewed Revision: `081ea9b4c65246a877cd9f77cdb4392acf5009a4`

### Code Quality Assessment

**PASS — 10/10.** All 13 acceptance criteria trace to implementation artifacts and observed automated or owner evidence. The owner confirmed successful Windows beta installation. Main CD run `38107336763` passed all jobs, including native Windows installer smoke and multi-platform GHCR publication. Anonymous beta image pulls passed for `linux/amd64` and `linux/arm64` with an empty Docker configuration. No blocking findings remain. A physical macOS Docker Desktop run is not claimed and is optional for this foundation story.

### Specialist Review Summary

- **@architect:** Compose separates bootstrap, healthy PostgreSQL, migrations, and non-root bot startup; secrets stay in a persistent mounted volume, PostgreSQL has no host port, and the application publishes HTTPS on loopback. No blocking architecture finding.
- **@data-engineer:** The foundation migration and Prisma schema enforce queue-key, active-entry, redemption, source/ID, and persisted-state integrity. The real PostgreSQL migration/integration suite passed in the latest Main CD. No schema change is part of this closure increment; no blocking data finding.
- **@devops:** Main CD publishes amd64/arm64 images from the trusted main commit, verifies the versioned manifest, and builds a Windows installer pinned to the verified image digest. The published GHCR beta is publicly pullable without credentials. No blocking delivery finding.

### Compliance Check

- Coding Standards: ✓ No application code changed in this closure increment.
- Project Structure: ✓ Story and handoff artifacts remain in their established bilingual locations.
- Testing Strategy: ✓ Actual PostgreSQL/Compose integration and native installer CI are used; current local suite passed 106 files / 911 tests.
- All ACs Met: ✓ All 13 criteria are checked with evidence; macOS host execution is explicitly optional and not represented as performed.
- Static analysis: ✓ `npm run review:static` passed with 0 findings across 86 files.
- Other gates: ✓ lint, typecheck, image build, Compose config, version/localization validation, IDE sync (109/109), and `git diff --check` passed.

### Security and Performance

No credentials or live Twitch operations were used. Existing security boundaries remain: database is private to the Compose network, bot ingress is loopback-only, secret material is mounted rather than logged, and destructive volume deletion is opt-in. No runtime or performance change was introduced.

### Gate Status

Gate: PASS → `docs/qa/gates/FND-1-version-identity-runtime-foundation.yml`

### Lifecycle Transition

PASS, **10/10**: InReview → Done. Issue #3 is ready for @devops synchronization after the documentation PR merges.
