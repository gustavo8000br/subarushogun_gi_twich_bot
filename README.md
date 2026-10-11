# Genshin Twitch Queue Bot

[![CI](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/workflows/ci.yml)
[![Status: alpha](https://img.shields.io/badge/status-alpha-8a2be2)](VERSION)
[![JavaScript ESM](https://img.shields.io/badge/JavaScript-ESM-f7df1e?logo=javascript&logoColor=222)](package.json)
[![Docker Compose v2](https://img.shields.io/badge/Docker-Compose_v2-2496ed?logo=docker&logoColor=white)](compose.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

English | [Português brasileiro](README.pt-BR.md)

A local-first **Twitch chat bot with a streamer control panel** for Genshin Impact queues. Run it on your own computer; the app keeps its PostgreSQL data and operational secrets in local Docker volumes.

> **Alpha:** core queue, chat, Twitch integration, panel, localization, and OBS widget stories are implemented. Live reward/point writes have not been verified with an eligible Twitch channel. See the [current roadmap](docs/ROADMAP.md).

## Quick start

1. Install Docker Engine/Desktop with Compose v2. If it is missing, the installer offers current official instructions; host installation and any required privileges stay under your control.
2. Download the installer for your system from [GitHub Releases](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/releases) when the first public release is available. Beta timing is not scheduled: FND-1's native Windows retest, full FND-9 acceptance, DOC-2, DOC-3, further owner-prioritized changes, and their release gates remain in the pre-release plan. The owner must explicitly approve beta readiness. Each release will include English and pt-BR notes from that version's changelog sections. See the [installer guide](docs/INSTALLERS.md) for current availability and GHCR access.
3. Trust this installation's local certificate as described in the [installation guide](docs/INSTALLATION.md), then open the panel address shown by the installer.
4. Connect your Twitch app in **Conexão do canal**. The [user guide](docs/USER_GUIDE-en_US.md) covers queue setup, chat commands, OBS widgets, recovery, updates, and uninstall.

## Documentation

| Guide | Covers |
| --- | --- |
| [Installer download guide](docs/INSTALLERS.md) | Where to find the unified installer, how to open it, menu choices, and data behavior |
| [Installation](docs/INSTALLATION.md) | Requirements, first run on Windows/Linux/macOS, HTTPS trust, Twitch setup |
| [User guide](docs/USER_GUIDE-en_US.md) | Queues, commands, panel, Channel Points, OBS, daily operation, recovery |
| [Development](docs/DEVELOPMENT.md) | Tooling, tests, CI, and repository structure |
| [Contributing](docs/CONTRIBUTING.md) | TDD, bilingual docs, README rules, Conventional Commits, PR flow |
| [Roadmap](docs/ROADMAP.md) | Current story and issue status |
| [Integrations](docs/integrations.md) · [Versioning](docs/VERSIONING.md) | Technical references and release identity |
| [Stories](docs/stories.md) · [Changelog](CHANGELOG.md) | Acceptance evidence and user-facing changes |

Each guide links to its Brazilian Portuguese version. Product UI, help, and chat copy support Brazilian Portuguese, English, Spanish, and complete community locales.

## What the bot does

- Runs as a Twitch chatbot and local streamer panel for multiple named queues.
- Accepts viewers through queue-specific Channel Points rewards or authorized manual addition; viewers cannot self-join by chat command or panel.
- Tracks queue order, calls, service, Twitch point-operation status, and recovery after interruption.
- Provides local OBS Browser Source widgets. The validated native OBS setup is Ubuntu 24.04 with OBS Studio 32.2.2 / CEF 127; Windows/macOS OBS certificate trust remains unverified.
- Does not ask for Genshin credentials, process payments, or send private messages.

## Project status

FND-2 through FND-8 and OPS-1 through OPS-6 are implemented. OPS-5 provides one generated installer artifact per desktop OS; native CI checks and user-machine acceptance are tracked separately in the [roadmap](docs/ROADMAP.md). The old FND-1 Windows startup helpers were replaced by this installer; Windows operator acceptance is tracked for the current artifact.

## Contributing

The source repository is public. For contribution requirements, start with [Contributing](docs/CONTRIBUTING.md) and [Development](docs/DEVELOPMENT.md). Product behavior follows test-first Red → Green → Refactor, and affected documentation is maintained in English and pt-BR.

## Data and license

The database and operational secrets are local and may contain sensitive information. Do not share Docker volumes, database dumps, `.env` files, tokens, or logs containing sensitive data. Local volume persistence does not guarantee encryption at rest.

Released under the [MIT License](LICENSE).
