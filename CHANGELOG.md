# Changelog

[Português brasileiro](docs/pt-BR/CHANGELOG.md)

## Unreleased

## First materialized alpha image — v0.1.0-3e0c935-alpha (2026-10-05)

- Published the first commit-identified alpha image for `linux/amd64` and `linux/arm64` after CI quality/build gates passed. The GHCR package remains private. This image identity is not the public launch release; the product remains on major version `0` and `alpha`.

- Switches the app container from Debian Bookworm to pinned Alpine 3.24 after a clean build and real Compose validation of Prisma musl engine, bootstrap, migrations, HTTPS health, and restart over preserved project data volumes. The local AMD64 image fell from 959 MB to about 770 MB; post-merge QEMU CI built and published both architectures.

- Publish GHCR images for `linux/amd64` and `linux/arm64`; use multi-platform `main`/version tags and explicit architecture suffix tags. Compose startup and update helpers pull the published image.
- Remove the selected local GHCR app image during uninstall while preserving project volumes unless the operator confirms data deletion.
- Materialize the exact source commit's seven-character identity in CI-built container images without changing the tracked `VERSION` file or committing the SHA back.
- Use the `main` Docker image tag by default, separately from the runtime product version.
- Replace the Windows startup helper's panel-check delay to avoid the stdin-redirection message reported during manual Windows acceptance; a manual retest on that platform is still required.
- Clarify the one-time `chmod +x iniciar.sh` step for Linux/macOS archive installs and add a macOS first-run guide.
- Show Twitch setup states in clear Portuguese panel copy; Affiliate/Partner ineligibility now uses a friendly explanation instead of exposing the internal `INELIGIBLE` status code.
- Added GitHub Actions CI with per-app API/infra/web lint and typecheck, the full test suite, OpenGrep, version/Compose validation, and production image build.

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
