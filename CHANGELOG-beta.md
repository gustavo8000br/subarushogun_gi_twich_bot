# Beta changelog

[All public changelogs](CHANGELOG.md) · [Português brasileiro](docs/pt-BR/CHANGELOG-beta.md)

## v0.2.1-beta

- Fixed the final local queue deletion confirmation so the queue title and full warning are displayed instead of an unavailable-text fallback.

## v0.2.0-beta

- Streamers can cancel a pending reward-backed queue deletion after the app verifies that the exact managed Twitch reward still exists and is paused. The queue and financial history remain recoverable, and a later deletion safely resumes the same intent.
- The operations page now distinguishes Twitch synchronization from Channel Points refunds to viewers and redemption fulfillment.
- Local deletion confirmation stays blocked while cancellation is being verified, preserving a safe way to resume the operation.

## v0.1.2-beta

- Deleting a reward-backed queue after a completed service now preserves the pending Twitch fulfillment and waits for confirmation before deleting the reward.

## v0.1.1-beta

- OBS browser sources retain their active widget capability after reload, so the current-account overlay can reconnect without a black screen; revocation still disables the widget.

## v0.1.0-beta

- First beta stage build for owner-led evaluation of the Twitch queue bot and streamer panel.
- Includes manual queue workflows, safe recovery for converted queues, and the Windows, macOS, and Linux installer paths.
- All platform installers display the exact source-derived product version; denied GHCR pulls explain the public-package requirement and preserve local settings/data.
- Windows install/start repairs a stale saved Compose image tag after a successful pull and starts the services with the exact versioned installer image.
- The runtime identity is materialized from the exact source commit as `v0.1.0-HHHHHHH-beta`. GitHub prereleases are published only when the owner manually dispatches the release workflow.
- Queue operation now refreshes the current account and overlay after individual calls, saves edited command permissions reliably, and lets called viewers acknowledge presence without starting service.
- Removed Hide/Archive from normal queue controls; legacy hidden queues can be shown to viewers and stay paused until separately activated.
- When Twitch synchronization is uncertain, streamers can explicitly delete the queue from this panel after two confirmations. This does not delete the Twitch reward; remote uncertainty and financial history are preserved. Reconciliation also recovers removed rewards and late redemptions without treating lookup failures as proof of deletion.
