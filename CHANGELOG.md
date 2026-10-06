# Changelog

[Português brasileiro](docs/pt-BR/CHANGELOG.md)

This file highlights changes that matter to streamers and viewers. Technical and operational details are in [CHANGELOG_INTERNAL.md](CHANGELOG_INTERNAL.md).

## v0.4.0-alpha

- Streamers can review every chat command in the panel and choose which roles can use supported commands.
- Viewers can ask chat which commands are available to them; streamers and moderators can check that the bot is responding.

## v0.3.0-alpha

- Streamers can configure redemption limits and cooldowns for queue rewards in the panel.
- Chat queue positions now respect the priority and standard lanes when moderators reorder viewers.

- Separate panel pages organize queue and connection settings, show local service status and Twitch response time even for ineligible channels, allow Twitch resynchronization, and return to the panel after channel connection.
- Streamers can review recent queue outcomes and reorder waiting viewers from the panel.
- Streamers can mark a waiting viewer as priority after checking an external benefit; priority and standard viewers are served FIFO in separate lanes.

## v0.2.0-alpha

- Streamers can now pause, reopen, archive, and safely remove managed queues while keeping unfinished work available for recovery.
- Call notifications can be retried from the panel, and account changes stay tied to the person whose service is in progress.
- The bot now keeps track of pending point refunds and completions, so interrupted work remains visible until Twitch confirms the result.
- Viewer queue actions and chat notices are more reliable across restarts, and hidden game IDs are removed when a queue switches to hidden mode.

## First materialized alpha image — v0.1.0-3e0c935-alpha (2026-10-05)

- The first alpha made it possible to run the bot and its streamer panel on the streamer's own computer, with setup guidance for Windows and Linux.
- The panel introduced Twitch account setup and the starting tools for creating and managing queues and their rewards.
- Setup now explains in Portuguese when a channel cannot use reward points, instead of showing an internal error message.
- The local panel and Twitch sign-in use a secure connection, with first-run setup instructions.

This is an early alpha. Some queue management and recovery features are still being completed.
