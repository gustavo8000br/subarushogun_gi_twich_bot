# Changelog

[Português brasileiro](docs/pt-BR/CHANGELOG.md)

## Unreleased

- Add a local streamer panel foundation for Twitch setup, queue operations, call notifications, financial operation visibility, queue-clear review/confirmation, and account labels. Queue redemption rewards remain unlinked until reward lifecycle implementation is complete.
- Add chat queue-clear confirmation bound to the same moderator/channel/queue and a 15-second active-entry snapshot; refunds are queued for remote confirmation.
- Add automatic current-account ownership for individual calls, with manual overrides and reset to the configured default when the owning entry ends.
- Add central bilingual operator READMEs covering first run, updates, daily Compose operation, contributions, Conventional Commits, and current implementation boundaries.
- Add dated Twitch/SDK/infrastructure integration decisions with verified package versions, operation scopes, official references, and a clear boundary between planned adapters and live validation.
- Add the pinned local Docker Compose runtime, persistent one-time database secret, PostgreSQL 18.6, and Prisma 6.19.3 foundation.
- Add versioned PostgreSQL persistence tables and database-enforced queue key, redemption, active-entry, source-integrity, and outbox idempotency constraints.
