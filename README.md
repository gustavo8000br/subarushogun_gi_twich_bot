# Genshin Twitch Queue Bot

[![Status: alpha](https://img.shields.io/badge/status-alpha-8a2be2)](VERSION)
[![JavaScript ESM](https://img.shields.io/badge/JavaScript-ESM-f7df1e?logo=javascript&logoColor=222)](package.json)
[![Node.js 24.20.0](https://img.shields.io/badge/Node.js-24.20.0-339933?logo=nodedotjs&logoColor=white)](package.json)
[![Docker Compose v2](https://img.shields.io/badge/Docker-Compose_v2-2496ed?logo=docker&logoColor=white)](compose.yaml)
[![TDD](https://img.shields.io/badge/tests-Red%E2%86%92Green%E2%86%92Refactor-bb3333)](docs/stories.md)

English | [Português brasileiro](README.pt-BR.md)

A local-first, self-hosted Twitch queue bot for Genshin Impact community sessions. The project is being built to let one streamer manage several custom queues while keeping application data in a PostgreSQL database on the streamer's own computer.

> **Development status:** alpha, active implementation. Compose/PostgreSQL/version identity, queue domain foundation, durable financial outbox, OAuth/EventSub adapters, initial chat handling and a protected local panel/API are present. Twitch reward lifecycle and several required operations are incomplete. Do not use this build to operate a live queue yet.

## Contents

- [Principles](#principles)
- [What works today](#what-works-today)
- [Requirements](#requirements)
- [First run](#first-run)
- [Daily operation](#daily-operation)
- [Updating](#updating)
- [Twitch setup status](#twitch-setup-status)
- [Development](#development)
- [Contributing](#contributing)
- [Commit messages and versioning](#commit-messages-and-versioning)
- [Troubleshooting](#troubleshooting)
- [Project roadmap](#project-roadmap)
- [Data and security](#data-and-security)
- [Documentation](#documentation)
- [License](#license)

## Principles

- **Local ownership:** this application is intended to run on the streamer's computer. It has no project-owned hosted backend, remote database, synchronization service, or telemetry.
- **Recoverable operations:** queue order and point operations are designed to survive process and machine restarts. The financial outbox and reconciliation are not implemented yet.
- **Least privilege:** the planned Twitch integration uses the streamer's own app and account, with only the scopes needed for redemptions and chat.
- **No game credentials:** the bot does not ask for or handle Genshin passwords. A visible UID is a public game identifier, not an account credential.
- **Test first:** behavior changes follow Red → Green → Refactor. See the [story log](docs/stories.md) for commands and observed results.

## What works today

The current foundation provides:

- A Compose stack with a one-shot secret bootstrap, PostgreSQL, Prisma migrations, and a Fastify service.
- A local panel with a Twitch setup flow, queue creation/entry actions, live queue projections and financial-operation status; the API uses local session, CSRF, Host and Origin checks.
- `/health` reports runtime product version and live database/Twitch integration state.
- Queue lifecycle, redemption validation/import, state transitions, outbox processing, Twitch OAuth/EventSub/reconciliation foundations, chat parsing/authorization, call notification/timeouts, queue-clear confirmation and single-call account ownership foundations.
- Persistent database and secret volumes. The database is not published on a host port; the application defaults to `127.0.0.1:3000`.
- Version validation/materialization scripts and the initial Prisma schema/migration.

The current build is **not ready for live operation**. Creating a queue currently creates only the local queue record: it does not create or associate a Twitch reward. The UI says so. Queue archive/delete, cross-queue account ownership concurrency, complete idempotency/revision protection, resend/history controls, and several reconciliation/resolution flows are still incomplete. UX desk research is documented, but usability validation has not happened. No real Twitch operation has been verified with authorized credentials.

## Requirements

- Docker Engine or Docker Desktop with Docker Compose v2.
- A browser on the same computer.
- Internet access on first build to download pinned images and packages.

You do not need Node.js, PostgreSQL, or a compiler installed to run the Compose application. Node.js is needed for development and local checks; the repository currently pins Node.js `24.20.0`.

## First run

1. Clone this private repository, or extract a project copy you were given.
2. Open a terminal in the project directory. On Linux/macOS, make the helper executable once with `chmod +x iniciar.sh` if needed.
3. Start the stack:

   ```sh
   ./iniciar.sh
   ```

   On Windows, run `iniciar.bat` from the project folder. Both helpers build and start the Compose services, wait for the local panel address to respond, and open the browser when a local browser launcher is available.

   To run the same startup flow directly:

   ```sh
   docker compose up --build -d
   ```

4. Open [http://localhost:3000](http://localhost:3000). The first foundation screen is a placeholder while the Twitch installation wizard is being developed.
5. Check service health:

   ```sh
   curl http://localhost:3000/health
   ```

   A response currently resembles:

   ```json
   {
     "status": "ok",
     "product_version": "v0.1.0-0000000-alpha",
     "dependencies": {
       "database": "connected",
       "twitch_api": "not_configured"
     }
   }
   ```

   The zero SHA is the documented marker used before a Git source commit has been materialized into a build. It does not indicate a release.

### Advanced local port

Port `3000` is deliberately not changed automatically if it is occupied. Choose another host port explicitly and register the matching callback when Twitch setup becomes available:

```sh
APP_PORT=3217 docker compose up --build -d
```

For PowerShell:

```powershell
$env:APP_PORT = "3217"
docker compose up --build -d
```

The address is then `http://localhost:3217`; the local panel displays the matching OAuth callback for that port.

## Daily operation

Run these commands from the project directory:

| Task | Command |
| --- | --- |
| See service status | `docker compose ps` |
| Follow all logs | `docker compose logs -f` |
| Follow bot logs | `docker compose logs -f bot` |
| Stop containers and preserve data | `docker compose stop` |
| Start stopped containers | `docker compose start` |
| Stop and remove containers/network, preserving data | `docker compose down` |
| Start and rebuild the image | `docker compose up --build -d` |

The database and operational secrets are stored in named Docker volumes. `docker compose down` leaves those volumes intact. **Do not use `docker compose down -v` as routine maintenance:** removing volumes deletes local database data and the generated database password. There is no product backup/export workflow yet, so take an appropriate database backup before doing any manual storage maintenance.

## Updating

For a source checkout with repository access:

```sh
git pull --ff-only
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 migrate bot
curl http://localhost:3000/health
```

Compose rebuilds the bot image and runs pending Prisma migrations before starting the bot. The persistent database and secrets volumes remain in place. Read the release notes before updating once published releases are available; this project is currently in alpha and has no published release channel. For a custom `APP_PORT`, use the same value on each start/update command.

To update a packaged image in a future release, follow that release's pinned image instructions. Do not pull an unpinned `latest` tag.

## Twitch setup status

Twitch credentials and OAuth are configured through the local panel, not pasted into `.env` or YAML files. Client Credentials validation and Authorization Code scaffolding are implemented, with encrypted-at-rest storage not guaranteed. Token refresh, EventSub, chat and reconciliation code are present but have not been exercised with an authorized Twitch account. Reward management is incomplete. Never put a Client Secret, access token, authorization code, or database password in a Git-tracked file, issue, screenshot, or chat message.

The callback defaults to `http://localhost:3000/callback`. Register a confidential Twitch application with that exact callback and enable the required Twitch account security. See [Integrations](docs/integrations.md) for the reviewed API plan and official documentation.

## Development

The product is a JavaScript ESM monolith organized by application responsibility:

```text
apps/
  api/       Fastify API, domain, Prisma schema and migrations
  infra/     Docker Compose and operational scripts
  web/       Static browser panel
tests/       Unit and PostgreSQL integration tests
docs/        Stories, decisions and operator documentation
```

Use Node.js `24.20.0` and npm. The local PostgreSQL integration tests use an isolated test database/container, not the application's persistent database volume.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run review:static
docker compose config --quiet
```

The static review uses OpenGrep `1.30.0` with repository-local rules in `.opengrep/rules.yml`. It runs locally without an account or hosted review service. Install the pinned release from the [official OpenGrep release page](https://github.com/opengrep/opengrep/releases) and make `opengrep` available on `PATH`. This is rule-based static analysis, not an AI code review; human and AIOX reviews remain required.

Before implementing a behavior, add a test that demonstrates the missing behavior, run it and record the observed Red result, then implement the smallest change, rerun the affected tests, and refactor with tests passing. Record the command and actual outcome in the English and pt-BR story logs. Do not report a test, integration, or Twitch operation as verified unless it was run.

## Contributing

The repository is private, so contributions require repository access. Start with the existing [FND-1 through FND-6 stories](docs/stories.md) and their acceptance criteria. Coordinate scope in the matching GitHub issue before starting work that changes product behavior or architecture.

Contribution expectations:

1. Keep application code in JavaScript ESM with JSDoc; do not add TypeScript, a transpiler, or a frontend bundler.
2. Follow test-first Red → Green → Refactor for each behavior, bug fix, and requirement change. Use real PostgreSQL integration tests for database constraints and transaction guarantees.
3. Keep Twitch, database, and chat boundaries behind the existing application modules; use fakes for remote Twitch behavior and real test PostgreSQL where persistence is the contract.
4. Update affected English documentation and its equivalent under `docs/pt-BR/`. Keep commands, paths, story IDs, dates, and evidence consistent.
5. Never commit `.env`, Docker volumes, database dumps, Twitch credentials/tokens, or raw user chat/redemption payloads.
6. Update the relevant story checklist and file list; report any checks that could not run and why.

Run the quality checks listed in [Development](#development) before requesting review. The lint, typecheck, tests, Compose validation, and story evidence should describe the same revision being reviewed.

## Commit messages and versioning

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) with a concise imperative summary:

```text
<type>(<optional scope>): <summary>
```

Examples:

```text
feat(queue): add atomic manual ordering
fix(outbox): retry uncertain redemption updates safely
docs(readme): explain first run and upgrades
test(domain): cover called-to-in-progress transition
```

Common types are `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, and `chore`. Use `!` or a `BREAKING CHANGE:` footer for an incompatible public behavior or contract change. Commits do not automatically change the product version. The project uses SemVer with a separate release stage and materialized runtime identity; releases, tags, and stage promotion follow [`docs/VERSIONING.md`](docs/VERSIONING.md) and are handled by the DevOps release workflow.

## Troubleshooting

### The panel address does not open

Run `docker compose ps` and `docker compose logs --tail=150 bootstrap db migrate bot`. Confirm Docker is running and that the configured host port is free. If port `3000` is occupied, set `APP_PORT` explicitly as described above; the application does not select a different port silently.

### The bot is not healthy

Check `docker compose ps` and `docker compose logs -f bot db migrate`. The `bot` service waits for a healthy database and a successful migration service. `/health` reports database connectivity and Twitch setup status separately. Twitch showing `not_configured` is expected until the wizard and Twitch integration are implemented.

### A migration or image build failed

Read the `migrate` and `bot` logs, then retry after correcting the reported cause with `docker compose up --build -d`. Do not remove volumes to work around an unexplained migration failure; preserve the database so the failure can be investigated.

### Startup did not open a browser

Open `http://localhost:3000` yourself. The startup helper prints the address if the operating system has no supported browser launcher.

## Project roadmap

| Story | Scope | Status |
| --- | --- | --- |
| FND-1 | Bilingual foundation docs and Compose startup/shutdown verification | In progress |
| FND-2 | Queue domain, UID rules, parser, authorization, and PostgreSQL ordering | In progress |
| FND-3 | Durable financial outbox, retries, confirmation, and recovery | In progress; worker/lease/outbox implemented, final audit pending |
| FND-4 | Twitch credentials, OAuth, rewards, EventSub, and reconciliation | In progress; reward lifecycle and live Twitch check pending |
| FND-5 | Chat commands, calls, timeouts, cleanup confirmation, current account, and shared application services ([issue #1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1)) | In progress; cross-queue account concurrency, remote reward open/close and complete shared-service coverage pending |
| FND-6 | UX planning with references, complete panel, setup wizard, protected API, and local security ([issue #6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6)) | In progress; reward lifecycle, full product operations, API idempotency/revision controls and usability validation pending |

The story log is the source for detailed status and test evidence. A feature is not complete because it appears in this roadmap.

## Data and security

The intended installation is single-channel and local. Data and secrets live in local Docker volumes and can contain sensitive operational information. Docker volume persistence does not guarantee encryption at rest. Keep the project directory and Docker data under your account's control, protect backups, and do not upload volumes, database dumps, `.env` files, or logs containing sensitive information to GitHub.

The product never needs a Genshin login or password. UID acceptance is planned as a nine-digit ASCII string for this product version; it is not a universal statement about every Genshin account or server. Chat and reward text are untrusted input and must not be echoed or stored raw.

If you discover a secret committed accidentally, revoke or rotate it immediately and notify the repository maintainers privately. Do not paste the secret into a public issue.

## Documentation

- [Portuguese README](README.pt-BR.md)
- [Stories and TDD evidence](docs/stories.md) · [pt-BR](docs/pt-BR/stories.md)
- [Twitch and infrastructure integrations](docs/integrations.md) · [pt-BR](docs/pt-BR/integrations.md)
- [Versioning and releases](docs/VERSIONING.md) · [pt-BR](docs/pt-BR/VERSIONING.md)
- [User-facing changes](CHANGELOG.md) · [pt-BR](docs/pt-BR/CHANGELOG.md)
- [Internal changes](CHANGELOG_INTERNAL.md) · [pt-BR](docs/pt-BR/CHANGELOG_INTERNAL.md)

## Operational references

The structure of this guide was informed by public, real projects rather than copied from their documentation: [Streamer.bot's introduction](https://docs.streamer.bot/get-started/introduction) is a useful example of explaining local ownership and direct provider connections; [PhantomBot](https://github.com/PhantomBot/PhantomBot) keeps installation and safe operation visible to self-hosters; and [Twitch Voxer](https://github.com/w0rxbend/twitch-voxer) illustrates a Compose-based first-run, log, update, and persistent-data guide. Their architecture and credential setup are not adopted wholesale; this project keeps its own local setup wizard and secret handling requirements.

## License

No license file has been published. Until the project maintainers choose and add a license, the source code is not granted for redistribution or reuse by default.
