# Changelog

[Português brasileiro](docs/pt-BR/CHANGELOG.md)

## Unreleased

- Clarify the one-time `chmod +x iniciar.sh` step for Linux/macOS archive installs and add a macOS first-run guide.
- Show Twitch setup states in clear Portuguese panel copy; Affiliate/Partner ineligibility now uses a friendly explanation instead of exposing the internal `INELIGIBLE` status code.
- Serve the local panel and Twitch OAuth callback over HTTPS at `https://localhost`, with a persistent local certificate and documented one-time trust setup.
- Expand first-run guidance for Windows/WSL 2 and Ubuntu/Linux, including HTTPS certificate trust, Twitch callback setup, chatbot-versus-panel roles, and approximate hardware estimates explicitly marked as version-dependent.
- Add Git fast-forward updater and an interactive uninstaller for Linux/macOS and Windows; uninstall preserves local data by default and requires a typed confirmation before volume deletion.
- Update the integration reference and both user changelogs to reflect durable paused reward creation and audited recovery of ambiguous ownership; reward editing/open-close/archive/delete remain incomplete.
- Show verified channel eligibility, Channel Points availability and reward-slot count in the local Twitch setup panel, with clear ineligible/unavailable states.
- Keep the Twitch credential form stable while validation is in flight so a successful save clears the Secret safely after the browser event finishes.
- Create queue rewards through a durable worker; unresolved Twitch outcomes remain visible and the panel can bind a verified app-managed reward with an explicit operator audit.
- Add a local streamer panel foundation for Twitch setup, queue operations, call notifications, financial operation visibility, queue-clear review/confirmation, and account labels. Queue reward creation and ambiguous-association recovery are now available; editing, opening/closing, archiving, and deletion remain incomplete.
- Add chat queue-clear confirmation bound to the same moderator/channel/queue and a 15-second active-entry snapshot; refunds are queued for remote confirmation.
- Add automatic current-account ownership for individual calls, with manual overrides and reset to the configured default when the owning entry ends.
- Add central bilingual operator READMEs covering first run, updates, daily Compose operation, contributions, Conventional Commits, and current implementation boundaries.
- Add dated Twitch/SDK/infrastructure integration decisions with verified package versions, operation scopes, official references, and a clear boundary between planned adapters and live validation.
- Add the pinned local Docker Compose runtime, persistent one-time database secret, PostgreSQL 18.6, and Prisma 6.19.3 foundation.
- Add versioned PostgreSQL persistence tables and database-enforced queue key, redemption, active-entry, source-integrity, and outbox idempotency constraints.
