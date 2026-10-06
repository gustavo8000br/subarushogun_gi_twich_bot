# Genshin Twitch Queue Bot

[![CI](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/workflows/ci.yml)
[![Status: alpha](https://img.shields.io/badge/status-alpha-8a2be2)](VERSION)
[![JavaScript ESM](https://img.shields.io/badge/JavaScript-ESM-f7df1e?logo=javascript&logoColor=222)](package.json)
[![Node.js 24.20.0](https://img.shields.io/badge/Node.js-24.20.0-339933?logo=nodedotjs&logoColor=white)](package.json)
[![Docker Compose v2](https://img.shields.io/badge/Docker-Compose_v2-2496ed?logo=docker&logoColor=white)](compose.yaml)
[![TDD](https://img.shields.io/badge/tests-Red%E2%86%92Green%E2%86%92Refactor-bb3333)](docs/stories.md)

English | [Português brasileiro](README.pt-BR.md)

A local-first, self-hosted Twitch queue bot for Genshin Impact community sessions. The project is being built to let one streamer manage several custom queues while keeping application data in a PostgreSQL database on the streamer's own computer.

> **Development status:** alpha, active implementation. FND-2 through FND-5 are complete, including queue and reward lifecycle, durable point operations, Twitch adapters and chat commands. FND-6 is completing the protected streamer panel and local security. Twitch operations have not been validated with an authorized live channel; do not rely on this alpha for live point handling until that validation is complete.

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
- **Least privilege:** the Twitch integration uses the streamer's own app and account, with only the scopes needed for redemptions and chat; live-channel behavior still needs operator validation.
- **No game credentials:** the bot does not ask for or handle Genshin passwords. A visible UID is a public game identifier, not an account credential.
- **Test first:** behavior changes follow Red → Green → Refactor. See the [story log](docs/stories.md) for commands and observed results.

## What works today

The current foundation provides:

- A Compose stack with a one-shot secret bootstrap, PostgreSQL, Prisma migrations, and a Fastify service.
- A local panel with Twitch setup, queue creation and entry actions, recent terminal history, waiting-entry reordering, and financial-operation status; the API uses local session, CSRF, Host and Origin checks.
- `/health` reports the product version, local database state, Twitch API connection state, and measured response time for authenticated channels, including channels that are ineligible for Channel Points rewards; the panel shows the same health summary in Portuguese.
- A chatbot runtime that receives Twitch redemption/chat events and processes queue commands, with a local streamer panel for configuration and administration. The panel is the operator console; viewers do not join through it.
- Queue lifecycle, redemption validation/import, state transitions, financial outbox processing, Twitch OAuth/EventSub/reconciliation, chat parsing/authorization, call notifications/timeouts, queue-clear confirmation and current-account ownership.
- Managed Twitch reward creation, editing, open/close, archive and safe deletion, with remote confirmation and recovery for interrupted operations.
- Persistent database and secret volumes. The database is not published on a host port; the application defaults to `127.0.0.1:3000`.
- Version validation/materialization scripts and the initial Prisma schema/migration.

The current alpha is **not yet validated for a live queue session**. The panel supports local queue settings, managed Twitch reward edits, manual Twitch reconciliation, recovery controls, and styled OAuth callback recovery. Mutations use persisted idempotency keys. UX desk research is documented, but no moderated streamer usability session has happened. An authorized read-only Helix health lookup has been verified; no Twitch point or reward write operation has been verified.

## Requirements

- A **64-bit computer** running a supported OS with **Docker Engine or Docker Desktop in Linux-container mode**, the Docker Compose CLI plugin (`docker compose`, not the legacy standalone `docker-compose` command), and permission for your user to run Docker commands. Check with `docker --version` and `docker compose version`.
- A current browser on the same computer (Chrome, Edge, or Firefox recommended) that can trust a local certificate authority.
- Internet access to GitHub Container Registry (GHCR) for application images and whenever the chatbot connects to Twitch.
- Access to this private source repository. During pre-release, the first GHCR package is private by default, so authenticate Docker with a GitHub classic personal access token that has `read:packages`: `docker login ghcr.io --username YOUR_GITHUB_USERNAME`, then enter the token at the password prompt. GHCR package visibility must be changed to public before product launch; public pulls do not require registry login. Never paste a token into commands or project files.
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

> A manual Windows run on Docker Desktop/WSL 2 validated Compose startup, the HTTPS panel and `/health`, update with volume preservation, and both uninstaller choices. That run found a repeated Windows input-redirection message in the startup helper; the helper fix is pending another manual Windows run.

1. Install or update WSL 2 and restart Windows if prompted. In an elevated PowerShell window, use `wsl --install` only if WSL is not installed; use `wsl --update` to update an existing installation. Then verify with `wsl --version` (2.1.5 or later) and enable hardware virtualization in BIOS/UEFI if needed.
2. Install Docker Desktop, select the WSL 2 backend, start Docker Desktop, and wait until it reports that the engine is running. Verify `docker --version` and `docker compose version` in PowerShell. Keep Docker in **Linux containers** mode.
3. Clone the repository or extract the project archive. Open PowerShell in the project directory; paths with spaces are supported by `iniciar.bat`.
4. Until the product launch makes the GHCR package public, authenticate Docker once if the pre-release package is private:

   ```powershell
   docker login ghcr.io --username YOUR_GITHUB_USERNAME
   ```

   Enter a GitHub classic personal access token with `read:packages` at the password prompt. Keep the token private; do not put it in the project directory. After GHCR package visibility is public, skip this step.
5. Start the application:

   ```powershell
   .\iniciar.bat
   ```

   Or run the standard Compose command:

   ```powershell
   docker compose pull
   docker compose up -d
   ```

6. Wait for image downloads and bootstrap to finish. The startup helper opens the local panel when it can; it also creates `.local\localhost-ca.crt` with the public certificate needed by the browser. If the browser was opened before trusting the certificate, close that tab for now.
7. Trust this installation's local certificate for the current Windows user, then restart the browser:

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
3. If the pre-release GHCR package is still private, authenticate Docker once: run `docker login ghcr.io --username YOUR_GITHUB_USERNAME` and enter a GitHub classic personal access token with `read:packages` at the password prompt. Skip this after the package becomes public for launch. Never put the token in project files.
4. Start the application:

   ```sh
   ./iniciar.sh
   ```

   The helper pulls the `main` multi-platform image from GHCR and starts Compose, waits for the local HTTPS health endpoint, and opens a browser when available. It prints the address if automatic browser launch is unavailable. Docker selects `linux/amd64` or `linux/arm64` for the host.

5. Trust the generated local CA in the Ubuntu system store and refresh the certificate bundle:

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

3. If the pre-release GHCR package is still private, authenticate Docker once: run `docker login ghcr.io --username YOUR_GITHUB_USERNAME` and enter a GitHub classic personal access token with `read:packages` at the password prompt. Skip this after the package becomes public for launch. Never put the token in project files.
4. Start the application:

   ```sh
   ./iniciar.sh
   ```

5. Trust the generated local CA in the macOS login keychain, restart the browser, and open `https://localhost:3000`:

   ```sh
   security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db .local/localhost-ca.crt
   ```

### Continue setup on any platform

1. In the panel, confirm the callback shown is exactly `https://localhost:3000/callback` (or the advanced port you selected).
2. In the [Twitch Developer Console](https://dev.twitch.tv/console/apps), create or edit a confidential app and register that **exact HTTPS callback**. If it was first registered with `http://localhost:3000/callback`, replace it with HTTPS. Protocol, host, port and path must match. Twitch credentials belong only in the local setup form; do not send them in chat, issues, screenshots or tracked files.
3. Enter the app's Client ID and Client Secret in the panel and select **Validate and save application**. Then select **Connect with Twitch**, approve the requested scopes, and check that the expected channel identity appears.
4. The chatbot and panel have separate roles: viewers enter only through a queue reward redemption; the streamer/moderators manage queues from authorized chat commands, and the streamer can administer them in the local panel. Creating a queue requests a real Twitch custom reward and consumes one slot in the channel's reward limit. Do not create a test queue on a production channel unless you intend to create that reward.
5. This alpha supports opening, closing, archiving and safely deleting managed rewards, but queue/reward configuration editing and live Twitch validation remain incomplete. Use the panel/API for controlled integration checks, not to run an unattended live queue.

### Existing queue rewards and priority benefits

If an older bot already accepts queue redemptions, pause that reward in the app that created it (or in Twitch Creator Dashboard) and disable the old bot's admission command before opening this bot's replacement reward. Resolve outstanding redemptions in the old system first. This app cannot adopt another app's reward or safely refund/complete its redemptions. Create a new, initially paused reward here, then review it before opening the queue.

For PIX, Bits, subscriptions, or another external priority benefit, the streamer/mod verifies it in the original service and records the viewer through the local panel. The operator may mark that waiting entry as priority. Priority entries are FIFO ahead of standard entries; each lane remains FIFO, and an active service is never interrupted. The audit records the local operator and benefit category, not receipts or payment details. This is a manual operator assertion: the bot does not verify payments/subscriptions, handle money, or create Twitch point operations for manual entries. Chat `add` entries remain standard.

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

   The first materialized alpha image is `v0.1.0-3e0c935-alpha` (source commit `3e0c935dbf63dc3edef265394f6b9da5c78a33fd`); GitHub Actions verified and published its AMD64/ARM64 manifest. Every later CI image uses the exact source commit's seven-character SHA and is verified inside the image. The versioned `VERSION` file stays on the zero marker; no SHA is committed back. Compose tags application images as `main` by default; this tag does not replace the runtime product identity. This alpha image identity is not a launch release or stage promotion.

On Windows, after importing the CA into the current-user trust store, `curl.exe https://localhost:3000/health` should also validate normally. To use curl before importing it, pass `--cacert .\.local\localhost-ca.crt`.

### Advanced local port

Port `3000` is deliberately not changed automatically if it is occupied. Choose another host port explicitly and register the matching callback when Twitch setup becomes available:

```sh
   docker compose pull && APP_PORT=3217 docker compose up -d
```

For PowerShell:

```powershell
$env:APP_PORT = "3217"
docker compose up -d
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
| Pull the published image | `docker compose pull` |
| Start services | `docker compose up -d` |

The database and operational secrets are stored in named Docker volumes. `docker compose down` leaves those volumes intact. **Do not use `docker compose down -v` as routine maintenance:** removing volumes deletes local database data and the generated database password. There is no product backup/export workflow yet, so take an appropriate database backup before doing any manual storage maintenance.

## Updating

For a source checkout with repository access:

```sh
git pull --ff-only
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 migrate bot
curl --cacert .local/localhost-ca.crt https://localhost:3000/health
```

The updater fetches the published GHCR `main` image for the host architecture and runs pending Prisma migrations before starting the bot. The persistent database and secrets volumes remain in place. Read the release notes before updating once published releases are available; this project is currently in alpha and has no published release channel. For a custom `APP_PORT`, use the same value on each start/update command.

The `atualizar.sh` and `atualizar.bat` helpers are for a clean Git checkout on the `main` branch. They fetch and fast-forward `origin/main`, then pull and start the GHCR image. They stop if the checkout has local changes or a different branch; commit/stash your work or update that branch manually. Git and source-repository access are required; GHCR authentication is needed only while the pre-release package is private. Windows helper execution has not yet been validated on native Windows.

`IMAGE_TAG=main` selects the multi-platform manifest. For a diagnostic or explicit architecture pull, use `IMAGE_TAG=main-linux-amd64` or `IMAGE_TAG=main-linux-arm64`. CI also publishes matching versioned tags such as `v0.1.0-abcdef0-alpha-linux-arm64`; a version tag without an architecture suffix is the multi-platform manifest. Do not use an unpinned `latest` tag.

## Uninstalling

Run `./desinstalar.sh` on Linux/macOS or `desinstalar.bat` on Windows. The helper stops and removes this Compose project and the locally cached GHCR image selected by `IMAGE_TAG` (default `main`), while preserving the database, Twitch credentials/tokens, generated database password, and TLS secrets by default. It asks whether to delete data; if you answer yes, it asks you to type `APAGAR` before running `docker compose down --volumes --rmi local`. That permanently erases the project's Docker volumes and removes the exported public localhost CA file. The project source checkout is kept. A custom external `LOCAL_CERT_DIRECTORY` is not deleted by the helper.

You can also preserve data explicitly with `docker compose down --rmi local`. Never use `docker compose down --volumes` unless you intend to permanently erase all local queue data and operational secrets.

## Twitch setup status

Twitch credentials and OAuth are configured through the local panel, not pasted into `.env` or YAML files. Client Credentials validation and Authorization Code flow are implemented, with encrypted-at-rest storage not guaranteed. An authorized read-only Helix user lookup powers the live health probe; token renewal, EventSub, chat, reconciliation and Twitch reward/point writes have automated test coverage but have not been live-validated. Managed reward creation/editing, open/close, archive, and safe deletion have durable recovery paths. The callback screen shows success or recovery guidance and returns to the panel after 30 seconds. Never put a Client Secret, access token, authorization code, or database password in a Git-tracked file, issue, screenshot, or chat message.

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

The GitHub Actions [CI workflow](.github/workflows/ci.yml) runs lint and JavaScript typechecking independently for `apps/api`, `apps/infra`, and `apps/web`; it also runs the complete Vitest suite (including PostgreSQL/Compose integration), OpenGrep, version and Compose validation, and a production image build. The vanilla web app intentionally has no separate bundler/build step; it is checked directly and included in the production image.

Run the focused app checks when changing one area: `npm run lint:api && npm run typecheck:api`, `npm run lint:infra && npm run typecheck:infra`, or `npm run lint:web && npm run typecheck:web`. The GitHub workflow runs all three pairs independently.

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

Check `docker compose ps` and `docker compose logs -f bot db migrate`. The `bot` service waits for a healthy database and a successful migration service. `/health` reports database connectivity, Twitch API status, and the last measured response time. `not_configured` is expected until you save Twitch credentials and connect the channel in the panel. An authenticated but ineligible channel still reports read-only API reachability; reward/chat EventSub processing remains disabled until the channel is eligible. A slow or unavailable Twitch response does not stop the local panel from opening.

### A migration or image build failed

Read the `migrate` and `bot` logs, then retry after correcting the reported cause with `docker compose up --build -d`. Do not remove volumes to work around an unexplained migration failure; preserve the database so the failure can be investigated.

### Startup did not open a browser

Open `https://localhost:3000` yourself. If the browser reports an untrusted certificate, import `.local/localhost-ca.crt` into the current user's root certificate store first. The startup helper prints the address if the operating system has no supported browser launcher.

## Project roadmap

| Story | Scope | Status |
| --- | --- | --- |
| FND-1 | Bilingual foundation docs and Compose startup/shutdown verification | In progress |
| FND-2 | Queue domain, UID rules, parser, authorization, and PostgreSQL ordering | Complete |
| FND-3 | Durable financial outbox, retries, confirmation, and recovery | Complete; live Twitch point operations remain unverified |
| FND-4 | Twitch credentials, OAuth, rewards, EventSub, and reconciliation | Complete; authorized live Twitch acceptance remains for operator validation |
| FND-5 | Chat commands, calls, timeouts, cleanup confirmation, current account, and shared application services ([issue #1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1)) | Complete; QA 9.0/10, live Twitch point operations unverified |
| FND-6 | UX planning with references, complete panel, setup wizard, protected API, and local security ([issue #6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6)) | In progress; local/reward settings, history, persisted API idempotency and manual reconciliation are implemented; additional recovery controls, callback browser E2E and usability validation remain |
| FND-7 | Configurable local OBS overlay widgets ([issue #7](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/7)) | Planned; implementation follows FND-6 completion and QA/UX gates |
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
