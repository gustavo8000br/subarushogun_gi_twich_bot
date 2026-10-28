# Development guide

[Português brasileiro](pt-BR/DESENVOLVIMENTO.md) · [Back to README](../README.md)

## Requirements

- Node.js `24.20.0` and npm.
- Docker Engine/Desktop with Compose v2 for PostgreSQL-backed integration tests and Compose validation.
- Git access to the repository. Twitch credentials are not required for the automated suite.
- OpenGrep `1.30.0` available on `PATH` for the local static-analysis gate.

## Install and check

```sh
npm ci

**Platform status (2026-10-21):** validated by a person on Ubuntu Linux only. Windows is planned and will be accepted by the owner. **macOS has not been validated** (no macOS host available); it shares the Unix base with Linux, so the same flow may work, but that is an assumption. CI runs only the installer smoke on `macos-15`.

npm run build
npm run lint
npm run typecheck
npm test
npm run review:static
npm run validate:version
npm run validate:localization
docker compose config --quiet
```

PostgreSQL integration tests provision isolated test resources. They must not use or delete the active product volumes.

## GitHub Codespaces

The repository includes a Dev Container for repeatable development in GitHub Codespaces. It installs Node.js `24.20.0`, Docker Engine with Compose v2 for isolated PostgreSQL/Compose checks, GitHub CLI, OpenGrep `1.30.0`, Codex CLI `0.161.0`, and the exact dependencies from `package-lock.json` with `npm ci`. The Codespace uses its own Docker daemon and storage; it cannot access or delete Docker volumes on your computer.

To continue work on a pushed branch, open the repository on GitHub, choose that branch, then select **Code → Codespaces → Create codespace on …**. GitHub builds `.devcontainer/devcontainer.json` and runs `.devcontainer/post-create.sh`. Allow the post-create setup to finish before running tests. For project resource needs, a 4-core Codespace is a practical starting point for Docker builds and the full suite; machine availability and billing depend on your GitHub plan and account quota. Stop the Codespace when you finish to stop its compute usage; the workspace is preserved when stopped.

Codex is installed but not authenticated automatically. In the Codespace terminal, run `codex login --device-auth` and complete the sign-in in your browser. This keeps account credentials out of Git and repository secrets. Run `codex` from the repository root to start a session. The Codex VS Code extension is also suggested in the Dev Container, but the CLI works independently.

The prepared image includes the tools needed for the existing project gates. The Codespace itself still needs to be created from GitHub once this branch is pushed; no project data, Twitch tokens, local Docker volumes, or host credentials are copied into it. See the [GitHub Codespaces configuration guide](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/introduction-to-dev-containers), [Docker-in-Docker Feature](https://github.com/devcontainers/features/tree/main/src/docker-in-docker), [Codex CLI](https://developers.openai.com/codex/cli), and [OpenGrep installation guide](https://github.com/opengrep/opengrep/blob/main/INSTALL.md).

### Focused checks

#### Next.js and Fastify development

`npm run dev` names its disposable PostgreSQL Compose project after the last 28 characters of the checkout path. If two checkouts end in the same text, set `DEV_COMPOSE_PROJECT` (lowercase letters, digits, `-`, `_`; up to 63 characters) in each one so they do not share a database volume. Leaving it unset keeps the current name and data.

```sh
npm ci
npm run dev
```

Run `npm ci` once after cloning or when dependencies need reinstalling; it installs exact lockfile dependencies and is not required for each start. Before creating local files or provisioning/migrating a database, `npm run dev` checks Node.js `24.20.0`, local Next/Prisma dependencies and (when `DATABASE_URL` is empty) Docker Compose v2 plus an accessible Docker Engine. A failed check names the missing prerequisite and recovery step. It then starts an isolated PostgreSQL service, snapshots before migrations, launches Fastify in API-only watch mode at `127.0.0.1:${APP_PORT:-3109}`, and Next with HTTPS/HMR at `https://localhost:${NEXT_DEV_PORT:-3000}`. In Codespaces, forward port `3000` to preview the frontend. Next proxies `/api/*`, `/overlay/api/*`, `/health`, and `/callback` to local Fastify (`apps/frontend/scripts/dev-proxy-config.mjs:19-28`); the OBS overlay is the Next `/overlay` route itself and there is no `/overlay.html` alias (removed in OPS-15 cutover Wave 3). The dev configuration allows loopback and the exact Codespaces hostname and passes the matching HTTPS origin for session/CSRF validation. Restart after changing the development origin or Next config. First run creates ignored `.env.product.local` from `.env.product.example` without replacing an existing file. Leave `DATABASE_URL` empty to use the managed DB, bound to host loopback port `55432`, in a worktree-specific Compose project/volume; its password and pre-migration snapshots are stored under `.local/dev-db/`. These are separate from product `compose.yaml`. Use `npm run dev:db:stop` to stop while preserving data and `npm run dev:db:start` to start only the DB. Never use `docker compose down -v` unless you intend to delete development data. An explicit `DATABASE_URL` skips Docker and automatic migrations; use only a disposable database. Set `APP_PORT` and `FASTIFY_DEV_ORIGIN` together when changing the API port. For end users, use the platform installer with a prebuilt image; maintainers build locally with `npm run build` (runtime Compose plus `compose.build.yaml`). `npm run build:frontend` builds the frontend export independently.

Local Compose images use `IMAGE_TAG=dev` by default. Do not push this tag as a main/release artifact; only the validated main-branch workflow promotes `IMAGE_TAG=main`, while installers pin a validated versioned image/digest.

```sh
npm run dev:db:start
npm run dev
# when finished:
npm run dev:db:stop
```

`npm run dev:start` is the same entry point as `npm run dev` (both keep working). While running, it records its own PID and the API/Next child PIDs in ignored `.local/dev-server/state.json`; the file is removed on exit.

`npm run dev:stop` stops the processes recorded by `dev:start` (SIGTERM, SIGKILL after 10 seconds; on Linux it first confirms the recorded PID is still `dev-server.mjs`) and then runs `docker compose -f compose.dev.yaml -p <dev project> down --volumes --rmi local` for the development project only. Before removing anything it refuses (non-zero exit) unless the file is `compose.dev.yaml` at the repository root, the project is the one resolved by `DEV_COMPOSE_PROJECT` or the checkout path and uses the `queuebot-dev-` prefix, and every container/volume carries the matching `com.docker.compose.project` label (containers must also point to that `compose.dev.yaml`). It prints the removed containers, volumes and images, and exits 0 with a message when nothing is running. "Images" means only images built locally for the dev project (`--rmi local`); today `compose.dev.yaml` builds none, so the shared pulled `postgres` image is kept. With an explicit `DATABASE_URL`, only the processes are stopped.

> **Warning:** `npm run dev:stop` DELETES the development database volume, including all development data. The pre-migration snapshots under `.local/dev-db/backups/` are kept.

To stop everything while keeping the data, run `npm run dev:stop -- --keep-data` (the `--` passes the flag through npm). It stops the dev server processes and only the `db` container (`stop db`), preserving volumes and images, with the same file/project/label guards; it never runs `down`. Any other option is rejected before anything is stopped. Refused projects without the `queuebot-dev-` prefix get a message explaining how to remove them manually.

To run the safe Chromium overlay smoke against the active Next preview, use `npm run test:e2e:overlay:browser-only`. It requires local Chrome and intercepts every overlay API response with browser fixtures; it never writes to PostgreSQL, Twitch, Docker, or OBS. This is frontend browser evidence only, not native OBS/CEF or live API acceptance. The separate `npm run test:e2e:overlay` remains the full OBS-connected scenario and may create/remove OBS sources and disposable Compose data.

For the QRA-23 queue deletion-cancellation browser smoke, run `npm run test:e2e:queue-lifecycle:browser-only` against the active loopback Next preview. It intercepts panel API responses and asserts the processing conflict, accessible localized alert, safe diagnostic reference, and same-origin CSRF/idempotency headers. It does not write to the product API/database or Twitch and is not persisted-operation evidence.

```sh
npm run lint:api && npm run typecheck:api
npm run lint:infra && npm run typecheck:infra
npm run lint:web && npm run typecheck:web
npm test -- --run tests/unit/<test-file>.test.js
```

`compose.yaml` is pull-only runtime configuration consumed by the installer. `npm run build` explicitly combines it with `compose.build.yaml` to build the deployable image; CI uses the same pair. GitHub Actions [CI](../.github/workflows/ci.yml) runs on pull requests and calls the shared quality gates. Main image publication and tagged releases are separate workflows; see the [CI/CD guide](CI-CD.md) for triggers, permissions, image tags, and recovery.

## Project layout

```text
apps/api/    Fastify API, domain, Prisma schema and migrations
apps/infra/  Compose and operational scripts
apps/frontend/ Next.js App Router panel and OBS overlay
apps/web/      Vanilla panel files (not served since cutover Wave 1; removed in Wave 4) and localization catalogs (moved out in Wave 2)
apps/shared/    Modules shared by Next and the API (`apps/shared/panel` holds the panel/overlay helpers; Next must not import `apps/web`)
tests/       Unit, integration, and browser acceptance tests
docs/        Stories and focused user/developer references
```

For behavior changes, follow the test-first process in [Contributing](CONTRIBUTING.md) and record evidence in the corresponding bilingual story.

### API diagnostic log levels

The API accepts `APP_LOG_LEVEL` through Compose. It defaults to `info`; supported thresholds are `emergency`, `alert`, `critical`, `error`, `warn`, `notice`, `info`, `verbose`, `debug`, and `trace`. A threshold includes that level and more severe events. Reward-link diagnosis logs aggregate counts at `info` and safe mismatch reason codes at `verbose`; raw Twitch rewards, titles, IDs, prompts, tokens, and error messages are never logged. A missing log-level value falls back to `info`.

For a local source checkout, temporarily start the bot with more detail:

```sh
APP_LOG_LEVEL=verbose docker compose up -d --force-recreate bot
docker compose logs -f bot
```

PowerShell equivalent:

```powershell
$env:APP_LOG_LEVEL = 'verbose'
docker compose up -d --force-recreate bot
docker compose logs -f bot
```

Return to the default afterward with `APP_LOG_LEVEL=info docker compose up -d --force-recreate bot` (PowerShell: set the variable to `info` before the command). These commands recreate only the bot service and preserve database and secret volumes.
