# Front-End Specification: Local Operator Panel

[Português brasileiro](pt-BR/front-end-spec.md) · Product requirements: [PRD](prd.md), FR-11 and AC-17/18.

## Users and primary tasks

The streamer/operator uses the browser on the same computer to set up Twitch, inspect integration health, create and operate queues, manage chat commands and OBS widgets, resolve uncertain point operations, and review history. The panel is an authenticated operator surface; it is not a public viewer portal. The OBS overlay is served by the same Next.js application on a separate route and bundle (`/overlay`), authenticated by a per-widget capability link, and never exposes panel data or controls.

## Information architecture

1. **Setup and reconnection:** exact callback URL, Twitch developer-console guidance, Client ID/Secret replacement, validation state, connect/reconnect action, channel identity and eligibility.
2. **Overview:** local product/API/state versions, database/bot/chat/EventSub state, last reconciliation, reward-count warning, active financial issues.
3. **Queues:** open/closed/archived/deletion-pending state; queue settings; create/edit/open/close/archive/unarchive/delete with explicit confirmation.
4. **Queue detail:** waiting order, called entries, in-progress service, terminal history; manual add, call, start, complete, remove, move, and safe call retry.
5. **Points and recovery:** pending, confirmed, conflict, or unknown operations with retry/reconcile actions that cannot change the recorded intent.
6. **Commands:** chat command catalog and policies.
7. **Widgets:** create, style, and preview overlay widgets; generate, regenerate, and revoke their one-time OBS links.
8. **Settings:** product language (which also sets the chat language) and local preferences, such as the current/default account text labels and reset behavior. Anything new in Settings needs its own story.

## Interaction and content rules

- The interface is localized through message catalogs (`en`, `es`, `pt-BR`; default `pt-BR`). The product language is a server-side setting (`product_locale`, versioned) shared by the panel and chat replies; dates and numbers use `Intl` with the active product language. No user-facing string is hard-coded in components. Technical IDs and state keys stay English.
- Show pending versus Twitch-confirmed state distinctly. Never label a requested refund/consumption as completed before remote confirmation.
- Explain that manual additions create no points redemption and that hidden UID mode discards supplied UID.
- Confirm irreversible/destructive queue deletion and show the pending redemption/cancellation summary before confirmation.
- Disable controls incompatible with lifecycle/status, while revalidating every operation on the server.
- Explain loading, empty, stale, disconnected, partial-reconciliation, and error states with a next safe action.
- Do not show the secret value or fragments after save. Use a fixed visual placeholder and a replace-and-validate action.
- One-time secrets (widget OBS links) are shown once, masked by default, copied via a button with visible success/failure status, and never logged, persisted, or announced in live regions; their dialog cannot be dismissed accidentally, and closing without copying requires explicit confirmation.
- User-controlled names and text render as text, never HTML. No raw rejected redemption/chat text is echoed.
- `/api/state` and all administrative routes require local session protections; no public state view is implied.

## Privacy presentation

An operator may see UID only when the current queue mode is visible. Chat messages, calls, and the overlay projection each follow their separate toggles. Hiding UID clears persisted values and invalidates any previously rendered notification text; notification content is resolved using current privacy settings at send time.

## Accessibility and layout

Use semantic headings, explicit labels, keyboard-operable controls, visible focus, adequate contrast, and status text that does not rely on color alone. Prioritize readable desktop operation during a live; keep forms compact and queue actions easy to scan. The panel is a Next.js (App Router) application using React 19; styles are project CSS (`panel.css`, `overlay.css`). Overlay code must not import panel modules (bundle boundary).

## Acceptance coverage

UI contract tests cover setup states, health, queue lifecycle, entries, financial states, reconciliation, visible errors, authenticated projections, and safe text rendering. The UI consumes explicit API contracts and does not make security or domain decisions itself.
