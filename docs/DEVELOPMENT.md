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

```sh
npm run lint:api && npm run typecheck:api
npm run lint:infra && npm run typecheck:infra
npm run lint:web && npm run typecheck:web
npm test -- --run tests/unit/<test-file>.test.js
```

The vanilla web app is checked directly; it does not have a frontend build/bundler step. GitHub Actions [CI](../.github/workflows/ci.yml) runs on pull requests and calls the shared quality gates. Main image publication and tagged releases are separate workflows; see the [CI/CD guide](CI-CD.md) for triggers, permissions, image tags, and recovery.

## Project layout

```text
apps/api/    Fastify API, domain, Prisma schema and migrations
apps/infra/  Compose and operational scripts
apps/web/    Static browser panel and localization catalogs
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
