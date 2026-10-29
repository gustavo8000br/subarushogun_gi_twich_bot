# Beta changelog

[All public changelogs](CHANGELOG.md) · [Português brasileiro](docs/pt-BR/CHANGELOG-beta.md)

Types: 🟧 Security · 🟩 Added · 🟦 Changed · 🟨 Deprecated · 🟥 Removed · 🟪 Fixed. Incompatible changes appear first in a warning box.

## v0.2.1-beta

### 🟪 Fixed

- Fixed the final local queue deletion confirmation so the queue title and full warning are displayed instead of an unavailable-text fallback, in both the legacy panel and the Next.js panel.

## v0.2.0-beta

> [!WARNING]
> **Incompatible changes**
>
> - OBS widget links now use the `/overlay?...` address instead of `/overlay.html?...`. An OBS browser source still configured with an older `/overlay.html` link no longer loads the widget: regenerate the link on the Widgets page and paste it into the OBS source.

### 🟧 Security

- Development API listeners now bind to loopback by default instead of exposing the local API on every network interface.

### 🟩 Added

- Queue creation now offers a validated, localized preview for the viewer-call chat message. OBS widgets clearly show which queue and linked reward they use, with a path to create a queue when none are available. Widget editing and Twitch operations provide clearer recovery when an update cannot be confirmed.
- The Next.js chat commands page now lets streamers change the minimum audience for configurable commands. New and implicit policies default to followers; explicit saved policies remain intact, and fixed moderator/streamer commands stay read-only.
- Streamers can cancel a pending reward-backed queue deletion after the app verifies that the exact managed Twitch reward still exists and is paused. The queue and financial history remain recoverable, and a later deletion safely resumes the same intent.
- The operations page now distinguishes Twitch synchronization from Channel Points refunds to viewers and redemption fulfillment.
- When Twitch reward deletion cannot be confirmed, streamers can explicitly archive the local queue through a separate confirmation flow; a restored queue stays paused until the streamer activates it.

### 🟦 Changed

- The home page is now the Overview of the Next panel. On first use, without a Twitch connection, it shows a 'Connect' card instead of opening Connection directly.
- Development startup now checks Node.js, project dependencies, and managed Docker prerequisites before provisioning its isolated database; end-user setup remains on the platform installer with a prebuilt image.
- Queue calls now make the called viewer the current account automatically. OBS offers one player identity source, `Current account`; previously saved in-service widgets continue through that same source.
- Starting service for a called Channel Points viewer now queues Twitch redemption fulfillment immediately. The panel keeps the service active and distinguishes pending, confirmed, and conflicting Twitch reward status from service completion.
- New queues now start with a localized call message that includes the queue's working presence command; the command updates with the suggested slug until the streamer edits the message.
- Twitch OAuth callbacks now return to the styled local connection page, which shows localized success or failure feedback without exposing provider details or leaving the panel.
- Queue creation now preserves reward settings when switching entry modes, follows the selected language for its default call message, and previews the message as it will appear in chat. Invalid message templates receive clear, localized feedback before submission.
- Direct visits to Twitch operations and OBS widgets now wait for the local session and panel snapshot before requesting protected data. New queues default to local manual entry while Twitch is disconnected and link directly to connection setup.
- The Next.js overview now shows bot/API and dependency health, the current account, an exact unresolved-operation total, and the last reconciliation in the current API run; it offers manual and automatic refresh while the page is visible and preserves the last health data when a refresh fails.
- The Next.js overview distinguishes service health with green for functional, yellow for partial/in-progress/unknown, and red for unavailable or unconfigured states, with an explicit localized legend. Narrow screens stack the reconciliation detail below the health heading, and mobile navigation uses a thin purple scrollbar to signal horizontal scrolling.
- The Next.js local panel now identifies the connected Twitch channel and clearly distinguishes an unsaved application secret. Language changes verify the API response and reconcile from persisted state after an uncertain response.

### 🟪 Fixed

- The final local queue deletion confirmation now includes the queue title in the warning, so streamers can verify which queue they are removing.
- OBS widget pages are served by Next.js in production and development; the overlay continues to read live account and queue data from the bot.
- OBS widget links now open on the local overlay page during development.
- Unexpected failures in manual entry, attendance, notification resend, call, queue reorder, priority, and queue-clear actions now expose a safe diagnostic reference. If a call may have been applied without a reliable response, both call controls stay blocked until a successful queue refresh; the alert keeps its reference and offers a retryable refresh. A confirmed empty queue keeps its “no viewers waiting” result. Uncertain clear confirmations still require a successful refresh before another clear.
- Local deletion confirmation stays blocked while cancellation is being verified, preserving a safe way to resume the operation.
- Accepted queue creation, settings, and manual-entry changes remain visible when the follow-up list refresh fails; the panel offers a read-only retry instead of implying rejection or repeating the mutation.
- Archive and unarchive success feedback remains visible after the affected queue leaves the current list, and resend feedback distinguishes an already-queued chat notice without claiming delivery.

## v0.1.2-beta

### 🟪 Fixed

- Deleting a reward-backed queue after a completed service now preserves the pending Twitch fulfillment and waits for confirmation before deleting the reward.

## v0.1.1-beta

### 🟪 Fixed

- OBS browser sources retain their active widget capability after reload, so the current-account overlay can reconnect without a black screen; revocation still disables the widget.

## v0.1.0-beta

### 🟩 Added

- First beta stage build for owner-led evaluation of the Twitch queue bot and streamer panel.
- Includes manual queue workflows, safe recovery for converted queues, and the Windows, macOS, and Linux installer paths.

### 🟦 Changed

- All platform installers display the exact source-derived product version; denied GHCR pulls explain the public-package requirement and preserve local settings/data.
- Windows install/start repairs a stale saved Compose image tag after a successful pull and starts the services with the exact versioned installer image.
- The runtime identity is materialized from the exact source commit as `v0.1.0-HHHHHHH-beta`. GitHub prereleases are published only when the owner manually dispatches the release workflow.
- Queue operation now refreshes the current account and overlay after individual calls, saves edited command permissions reliably, and lets called viewers acknowledge presence without starting service.

### 🟥 Removed

- Removed Hide/Archive from normal queue controls; legacy hidden queues can be shown to viewers and stay paused until separately activated.

### 🟪 Fixed

- When Twitch synchronization is uncertain, streamers can explicitly delete the queue from this panel after two confirmations. This does not delete the Twitch reward; remote uncertainty and financial history are preserved. Reconciliation also recovers removed rewards and late redemptions without treating lookup failures as proof of deletion.
