# Changelog

[Português brasileiro](docs/pt-BR/CHANGELOG.md)

This file highlights changes that matter to streamers and viewers. Technical and operational details are in [CHANGELOG_INTERNAL.md](CHANGELOG_INTERNAL.md).

## v0.2.0-alpha

- Streamers can now pause, reopen, archive, and safely remove managed queues while keeping unfinished work available for recovery.
- Call notifications can be retried from the panel, and account changes stay tied to the person whose service is in progress.
- The bot now keeps track of pending point refunds and completions, so interrupted work remains visible until Twitch confirms the result.
- Viewer queue actions and chat notices are more reliable across restarts, and hidden game IDs are removed when a queue switches to hidden mode.

## First materialized alpha image — v0.1.0-3e0c935-alpha (2026-10-05)

- The first alpha made it possible to run the bot and its streamer panel on the streamer's own computer, with setup guidance for Windows, Linux, and macOS.
- The panel introduced Twitch account setup and the starting tools for creating and managing queues and their rewards.
- Setup now explains in Portuguese when a Twitch channel cannot use Channel Points, instead of showing an internal status code.
- The local panel and Twitch sign-in use HTTPS, with first-run instructions for trusting the local certificate.

This is an early alpha. Some queue management and recovery features are still being completed.
