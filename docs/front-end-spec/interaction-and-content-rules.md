# Interaction and content rules
[Português brasileiro](../pt-BR/front-end-spec/interaction-and-content-rules.md)


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
