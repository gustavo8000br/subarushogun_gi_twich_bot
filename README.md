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

1. Install Docker and Compose v2. Follow the [installation guide](docs/INSTALLATION.md) for exact requirements, private GHCR access, platform steps, and local HTTPS certificate trust.
2. Start the bot:
   - Linux/macOS: `chmod +x subarushogun_twich_bot_setup.sh` once if needed, then `./subarushogun_twich_bot_setup.sh`.
   - Windows PowerShell: `.\subarushogun_twich_bot_setup.bat`.
3. Trust this installation's local certificate as described in the guide, then open `https://localhost:3000`.
4. Connect your Twitch app in **Conexão do canal**. The [user guide](docs/USER_GUIDE-en_US.md) covers queue setup, chat commands, OBS widgets, recovery, updates, and uninstall.

## Documentation

| Guide | Covers |
| --- | --- |
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

FND-2 through FND-8 and OPS-1 through OPS-4/OPS-6 are complete. FND-1 still needs a manual Windows rerun of the startup-helper fix; FND-9 and OPS-5 are in planning. The [roadmap](docs/ROADMAP.md) lists details and remaining validation boundaries.

## Contributing

The repository is private. For access and contribution requirements, start with [Contributing](docs/CONTRIBUTING.md) and [Development](docs/DEVELOPMENT.md). Product behavior follows test-first Red → Green → Refactor, and affected documentation is maintained in English and pt-BR.

## Data and license

The database and operational secrets are local and may contain sensitive information. Do not share Docker volumes, database dumps, `.env` files, tokens, or logs containing sensitive data. Local volume persistence does not guarantee encryption at rest.

Released under the [MIT License](LICENSE).
