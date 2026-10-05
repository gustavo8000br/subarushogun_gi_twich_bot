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
- **Recoverable operations:** queue order and point operations are designed to survive process and machine restarts. The PostgreSQL financial outbox and Twitch reconciliation are implemented, but have not been verified against a live channel.
- **Least privilege:** the planned Twitch integration uses the streamer's own app and account, with only the scopes needed for redemptions and chat.
- **No game credentials:** the bot does not ask for or handle Genshin passwords. A visible UID is a public game identifier, not an account credential.
- **Test first:** behavior changes follow Red → Green → Refactor. See the [story log](docs/stories.md) for commands and observed results.

## What works today

The current foundation provides:

- A Compose stack with a one-shot secret bootstrap, PostgreSQL, Prisma migrations, and a Fastify service.
- A local panel with a Twitch setup flow, queue creation/entry actions, live queue projections and financial-operation status; the API uses local session, CSRF, Host and Origin checks.
- `/health` reports runtime product version and live database/Twitch integration state.
- A chatbot runtime that receives Twitch redemption/chat events and processes queue commands, with a local streamer panel for configuration and administration. The panel is the operator console; viewers do not join through it.
- Queue lifecycle, redemption validation/import, state transitions, financial outbox processing, Twitch OAuth/EventSub/reconciliation foundations, chat parsing/authorization, call notification/timeouts, queue-clear confirmation and single-call account ownership foundations.
- Durable Twitch reward creation, paused by default, with capacity checks and a reviewed manual recovery path when Twitch's response leaves reward ownership ambiguous.
- Persistent database and secret volumes. The database is not published on a host port; the application defaults to `127.0.0.1:3000`.
- Version validation/materialization scripts and the initial Prisma schema/migration.

The current build is **not ready for live operation**. Queue reward editing/open-close/archive/delete, cross-queue account ownership concurrency, complete idempotency/revision protection, resend/history controls, and several reconciliation/resolution flows are still incomplete. UX desk research is documented, but usability validation has not happened. No real Twitch operation has been verified with authorized credentials.

## Requirements

- A **64-bit computer** running a supported OS with **Docker Engine or Docker Desktop in Linux-container mode**, the Docker Compose CLI plugin (`docker compose`, not the legacy standalone `docker-compose` command), and permission for your user to run Docker commands. Check with `docker --version` and `docker compose version`.
- A current browser on the same computer (Chrome, Edge, or Firefox recommended) that can trust a local certificate authority.
- Internet access during the first image build and whenever the chatbot connects to Twitch.
- Node.js, PostgreSQL, Git, and a compiler are **not required on the host to run the Compose application**. Node.js `24.20.0` is pinned for project development and runs inside the container.

### Supported host setup

- **Ubuntu/Linux:** Ubuntu 24.04 LTS x86-64 with Docker Engine and the Compose plugin is the environment used for the current Linux acceptance tests. Other Linux distributions need a supported Docker Engine, the Compose v2 plugin, and a shell capable of running `iniciar.sh`; they have not all been tested.
- **Windows:** Docker Desktop for Linux containers with the WSL 2 backend is the intended setup. Docker's current Windows guide lists supported Windows editions/builds, WSL 2 version 2.1.5 or later, a 64-bit SLAT-capable CPU and virtualization enabled in BIOS/UEFI. The support list changes; check [Docker's current Windows requirements](https://docs.docker.com/desktop/setup/install/windows-install/) before installing. Windows Server is not supported by Docker Desktop.
- **macOS:** Docker Desktop for Linux containers and the `docker compose` CLI are needed; macOS host behavior has not been validated for this release.

### Hardware estimates — approximate values only

> These are **approximate estimates for the current alpha build**, not guaranteed minimums or permanent specifications. Docker Desktop has its own platform requirements. Actual usage varies with project version, image rebuilds, the operating system, queue history, logs, and other applications. Requirements can vary by release; we will review and update these estimates as versions and measured usage change.

- CPU: approximately **2 logical cores** available to Docker; 4 cores are more comfortable while the first image is building.
- Memory: approximately **4 GB available to Docker** for this application and its initial build; **8 GB total system RAM is a practical target**, and Docker currently lists 8 GB as a Windows WSL 2 hardware prerequisite.
- Disk: keep approximately **10 GB free** before the first build for images, build cache and initial database/secret volumes. Database and logs can grow over time; required space depends on use and retention.
- No dedicated GPU is required.

The Windows hardware figures above are not our product benchmark. They combine current Docker prerequisites with approximate headroom for this application. See the official [Docker Desktop Windows guide](https://docs.docker.com/desktop/setup/install/windows-install/), [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [Linux post-install steps and Docker access](https://docs.docker.com/engine/install/linux-postinstall/), and [Compose plugin installation](https://docs.docker.com/compose/install/linux/).

## First run

### Windows first run

> Native Windows execution of `iniciar.bat` has not yet been validated by this project. The project has validated the Compose runtime on Ubuntu; if the helper fails on Windows, run the Compose command below and report the exact error before treating Windows setup as verified.

1. Install or update WSL 2 and restart Windows if prompted. In an elevated PowerShell window, use `wsl --install` only if WSL is not installed; use `wsl --update` to update an existing installation. Then verify with `wsl --version` (2.1.5 or later) and enable hardware virtualization in BIOS/UEFI if needed.
2. Install Docker Desktop, select the WSL 2 backend, start Docker Desktop, and wait until it reports that the engine is running. Verify `docker --version` and `docker compose version` in PowerShell. Keep Docker in **Linux containers** mode.
3. Clone the repository or extract the project archive. Open PowerShell in the project directory; paths with spaces are supported by `iniciar.bat`.
4. Start the application:

   ```powershell
   .\iniciar.bat
   ```

   Or run the standard Compose command:

   ```powershell
   docker compose up --build -d
   ```

5. Wait for the first build and bootstrap to finish. The startup helper opens the local panel when it can; it also creates `.local\localhost-ca.crt` with the public certificate needed by the browser. If the browser was opened before trusting the certificate, close that tab for now.
6. Trust this installation's local certificate for the current Windows user, then restart the browser:

   ```powershell
   Import-Certificate -FilePath (Resolve-Path '.\.local\localhost-ca.crt') -CertStoreLocation Cert:\CurrentUser\Root
   ```

   Open `https://localhost:3000`. This local CA is not a public CA; only import the certificate generated in this project's `.local` directory. If the Docker secrets volume is intentionally removed, bootstrap creates a new CA and this trust step must be repeated.

### Ubuntu/Linux first run

1. Install Docker Engine and the Compose plugin for your distribution. For Ubuntu, follow [Docker's official Engine instructions](https://docs.docker.com/engine/install/ubuntu/) and confirm `docker compose version` works.
2. Clone the repository or extract the project archive, then open a terminal in the project directory. If the executable permission was not preserved (common with downloaded archives), run this once:

   ```sh
   chmod +x iniciar.sh
   ```

   This changes only the local file permission; it does not need to be repeated unless the permission is lost again.
3. Start the application:

   ```sh
   ./iniciar.sh
   ```

   The helper builds and starts Compose, waits for the local HTTPS health endpoint, and opens a browser when available. It prints the address if automatic browser launch is unavailable.

4. Trust the generated local CA in the Ubuntu system store and refresh the certificate bundle:

   ```sh
   sudo install -Dm644 .local/localhost-ca.crt /usr/local/share/ca-certificates/queuebot-localhost-ca.crt
   sudo update-ca-certificates
   ```

   Restart the browser and open `https://localhost:3000`.

### macOS first run

> macOS host behavior has not yet been validated by this project. These instructions use the same Docker Compose and HTTPS flow as Linux; report any platform-specific issue before treating macOS as verified.

1. Install and start [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/), then confirm `docker compose version` works in Terminal.
2. Clone the repository or extract the project archive. In Terminal, change to the project directory. If the executable permission was not preserved (common with downloaded archives), run this once:

   ```sh
   chmod +x iniciar.sh
   ```

3. Start the application:

   ```sh
   ./iniciar.sh
   ```

4. Trust the generated local CA in the macOS login keychain, restart the browser, and open `https://localhost:3000`:

   ```sh
   security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db .local/localhost-ca.crt
   ```

### Continue setup on any platform

1. In the panel, confirm the callback shown is exactly `https://localhost:3000/callback` (or the advanced port you selected).
2. In the [Twitch Developer Console](https://dev.twitch.tv/console/apps), create or edit a confidential app and register that **exact HTTPS callback**. If it was first registered with `http://localhost:3000/callback`, replace it with HTTPS. Protocol, host, port and path must match. Twitch credentials belong only in the local setup form; do not send them in chat, issues, screenshots or tracked files.
3. Enter the app's Client ID and Client Secret in the panel and select **Validate and save application**. Then select **Connect with Twitch**, approve the requested scopes, and check that the expected channel identity appears.
4. The chatbot and panel have separate roles: viewers enter only through a queue reward redemption; the streamer/moderators manage queues from authorized chat commands, and the streamer can administer them in the local panel. Creating a queue requests a real Twitch custom reward and consumes one slot in the channel's reward limit. Do not create a test queue on a production channel unless you intend to create that reward.
5. This alpha still lacks reward editing/open-close/archive/delete and has not been validated against a real Twitch account. Use the panel/API for controlled integration checks, not to run an unattended live queue.

For Linux CLI health verification after trusting the CA:

   ```sh
   curl --cacert .local/localhost-ca.crt https://localhost:3000/health
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

On Windows, after importing the CA into the current-user trust store, `curl.exe https://localhost:3000/health` should also validate normally. To use curl before importing it, pass `--cacert .\.local\localhost-ca.crt`.

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

The address is then `https://localhost:3217`; the local panel displays the matching OAuth callback for that port.

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
curl --cacert .local/localhost-ca.crt https://localhost:3000/health
```

Compose rebuilds the bot image and runs pending Prisma migrations before starting the bot. The persistent database and secrets volumes remain in place. Read the release notes before updating once published releases are available; this project is currently in alpha and has no published release channel. For a custom `APP_PORT`, use the same value on each start/update command.

The `atualizar.sh` and `atualizar.bat` helpers are for a clean Git checkout on the `main` branch. They fetch and fast-forward `origin/main`, then rebuild and start Compose. They stop if the checkout has local changes or a different branch; commit/stash your work or update that branch manually. Git and repository access are required for these helpers, but not for running the app. Windows helper execution has not yet been validated on native Windows.

To update a packaged image in a future release, follow that release's pinned image instructions. Do not pull an unpinned `latest` tag.

## Uninstalling

Run `./desinstalar.sh` on Linux/macOS or `desinstalar.bat` on Windows. The helper stops and removes this Compose project and its locally built app image, while preserving the database, Twitch credentials/tokens, generated database password, and TLS secrets by default. It asks whether to delete data; if you answer yes, it asks you to type `APAGAR` before running `docker compose down --volumes --rmi local`. That permanently erases the project's Docker volumes and removes the exported public localhost CA file. The project source checkout is kept. A custom external `LOCAL_CERT_DIRECTORY` is not deleted by the helper.

You can also preserve data explicitly with `docker compose down --rmi local`. Never use `docker compose down --volumes` unless you intend to permanently erase all local queue data and operational secrets.

## Twitch setup status

Twitch credentials and OAuth are configured through the local panel, not pasted into `.env` or YAML files. Client Credentials validation and Authorization Code scaffolding are implemented, with encrypted-at-rest storage not guaranteed. Token refresh, EventSub, chat and reconciliation code are present but have not been exercised with an authorized Twitch account. Durable reward creation and ambiguous-association recovery are implemented; editing, opening/closing, archiving, and deletion are still incomplete. Never put a Client Secret, access token, authorization code, or database password in a Git-tracked file, issue, screenshot, or chat message.

The callback defaults to `https://localhost:3000/callback`. Register a confidential Twitch application with that exact callback and enable the required Twitch account security. If the app was initially registered with `http://localhost:3000/callback`, edit its callback URL in the Twitch Developer Console to HTTPS before connecting; protocol, host, port, and path must match exactly. See [Integrations](docs/integrations.md) for the reviewed API plan and official documentation.

#### Trust the local HTTPS certificate once

The first Compose bootstrap creates a private local certificate authority and a `localhost` server certificate. Only the public CA certificate is exported to `.local/localhost-ca.crt`; its private key stays in the persistent Docker secrets volume. Import the certificate into your current user's trust store before using Twitch OAuth, then restart the browser:

```powershell
Import-Certificate -FilePath .\.local\localhost-ca.crt -CertStoreLocation Cert:\CurrentUser\Root
```

On Linux, install it in the system trust store with `sudo install -Dm644 .local/localhost-ca.crt /usr/local/share/ca-certificates/queuebot-localhost-ca.crt && sudo update-ca-certificates`. On macOS, run `security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db .local/localhost-ca.crt`. Restart the browser after importing it.

This CA is private to this installation and is not issued by a public authority. If you remove the Docker secrets volume, Compose creates a new certificate; import the new `.local/localhost-ca.crt` again. On Windows, remove trust later with `certmgr.msc`: find `QueueBot Local Root CA` under **Trusted Root Certification Authorities > Certificates** and delete it.

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
4. **Documentation is mandatory.** Update every affected primary English document and its equivalent pt-BR document in the same change. Keep commands, paths, story IDs, dates, test results and evidence faithful. A story is not complete and a PR is not ready until both language versions have been checked; never invent test evidence.
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

Open `https://localhost:3000` yourself. If the browser reports an untrusted certificate, import `.local/localhost-ca.crt` into the current user's root certificate store first. The startup helper prints the address if the operating system has no supported browser launcher.

## Project roadmap

| Story | Scope | Status |
| --- | --- | --- |
| FND-1 | Bilingual foundation docs and Compose startup/shutdown verification | In progress |
| FND-2 | Queue domain, UID rules, parser, authorization, and PostgreSQL ordering | In progress |
| FND-3 | Durable financial outbox, retries, confirmation, and recovery | In progress; worker/lease/outbox implemented, final audit pending |
| FND-4 | Twitch credentials, OAuth, rewards, EventSub, and reconciliation | Implementation complete; authorized live Twitch acceptance remains for operator validation |
| FND-5 | Chat commands, calls, timeouts, cleanup confirmation, current account, and shared application services ([issue #1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1)) | In progress; cross-queue account concurrency, remote reward open/close and complete shared-service coverage pending |
| FND-6 | UX planning with references, complete panel, setup wizard, protected API, and local security ([issue #6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6)) | In progress; reward lifecycle, full product operations, API idempotency/revision controls and usability validation pending |
| OPS-2 | Localize Twitch setup states in the panel; future default pt-BR with English/Spanish and community translations | Implementation and QA review in progress |

The future panel localization plan is pt-BR by default, with English and Spanish, and community contributions for additional panel/frontend translations. This release remains pt-BR only. The story log is the source for detailed status and test evidence. A feature is not complete because it appears in this roadmap.

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
