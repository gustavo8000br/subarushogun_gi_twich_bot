# Interaction and content rules
[Português brasileiro](../pt-BR/front-end-spec/interaction-and-content-rules.md)


- Product interface language is pt-BR. Dates use pt-BR locale; technical IDs and state keys stay English.
- Show pending versus Twitch-confirmed state distinctly. Never label a requested refund/consumption as completed before remote confirmation.
- Explain that manual additions create no points redemption and that hidden UID mode discards supplied UID.
- Confirm irreversible/destructive queue deletion and show the pending redemption/cancellation summary before confirmation.
- Disable controls incompatible with lifecycle/status, while revalidating every operation on the server.
- Explain loading, empty, stale, disconnected, partial-reconciliation, and error states with a next safe action.
- Do not show the secret value or fragments after save. Use a fixed visual placeholder and a replace-and-validate action.
- User-controlled names and text render as text, never HTML. No raw rejected redemption/chat text is echoed.
- `/api/state` and all administrative routes require local session protections; no public state view is implied.
