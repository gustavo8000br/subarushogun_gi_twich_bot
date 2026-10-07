# Changelog

[Português brasileiro](docs/pt-BR/CHANGELOG.md)

This file highlights changes that matter to streamers and viewers. Technical and operational details are in [CHANGELOG_INTERNAL.md](CHANGELOG_INTERNAL.md).

## v0.12.0-alpha

- Command access now follows one clear hierarchy: followers, subscribers, VIPs, and moderators inherit access from the selected minimum role. Queue management stays moderator-only, and account changes stay streamer-only.
- The command list and chat help now use the same access rules. Existing permission choices are reset once during upgrade; queues, accounts, credentials, and other saved data remain in place.
- The Commands page groups configurable commands and fixed moderator/streamer commands, shows the full audience included by each threshold, and improves spacing around the save action.

## v0.11.0-alpha

- The bot now retries temporary Twitch connection problems automatically and keeps the local panel available. You only need to reconnect when Twitch authorization has actually expired or changed.

## v0.10.0-alpha

- Streamers can set a minimum audience for each chat command, so higher groups automatically receive access.
- Follower-only commands can verify channel follows through Twitch after the streamer enables that option.

## v0.9.0-alpha

- The installer now shows its progress and confirms resource removal only after checking that product containers, networks, and unused images are gone.
- Optional unattended commands support setup, updates, and removal. Updates and removal keep saved data unless an explicit erase confirmation is supplied.

## v0.8.0-alpha

- One installer per operating system handles setup, updates, and removal of saved data, keeps Windows' first-run language choice, checks Docker architecture compatibility, and stays on the version selected from its release.
- Updates preserve saved queues and settings by default; erasing them requires a clear confirmation.
- Linux now explains how to launch the installer if it opens without an interactive terminal.
- Installation guidance now separates normal prebuilt-image use from developer build requirements.
- When product releases begin, each version will provide the three platform installers and change notes in English and pt-BR from its GitHub Release page.

## v0.7.2-alpha

- Getting started, daily operation, and project status are now easier to find in focused guides.

## v0.7.0-alpha

- The panel now keeps the running version and service status visible, and guides streamers to the next setup or queue action.
- Empty queue and financial-operation pages explain what belongs there and how to continue.
- Panel navigation remains clear on narrow screens and keyboard focus is visibly marked.

## v0.6.0-alpha

- The Twitch sign-in confirmation and recovery page now follows the selected product language.

- Choose Brazilian Portuguese, English, Spanish, or a complete community translation for the panel and bot messages; command roots follow the selected language.

- Choose the product language in the panel. Supported chat replies, OBS labels, and local setup tools can use Brazilian Portuguese, English, or Spanish catalogs.

## v0.5.2-alpha

- The Twitch setup panel now clearly labels channels that are connected but cannot use Channel Points rewards.

## v0.5.1-alpha

- Clarified first-run local certificate setup instructions for Windows, Linux, and macOS.

## v0.5.0-alpha

- Streamers can create independent OBS widgets to show selected queue information or custom text on stream.
- Widgets refresh automatically and resume after a restart; revoked or replaced links no longer show data.
- Queue management commands, including current-account controls, are fixed to streamer and moderator access.

## v0.4.1-alpha

- The project is now available under the MIT License.

## v0.4.0-alpha

- Streamers can review every chat command in the panel and choose which roles can use supported commands.
- Viewers can ask chat which commands are available to them; streamers and moderators can check that the bot is responding.

## v0.3.1-alpha

- Security updates address a reported dependency vulnerability.

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
