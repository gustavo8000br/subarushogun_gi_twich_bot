# Privacy and state
[Português brasileiro](../pt-BR/front-end-architecture/privacy-and-state.md)


The browser receives only allowlisted API projections for the authenticated operator. UID remains subject to the current queue visibility policy; overlay projections retain their stricter per-widget visibility rules. The locally served OBS overlay uses its existing scoped capability and bearer API contract without a panel session. Secrets are never returned after credential submission. The UI refreshes after settings changes and does not cache rendered notification text. Panel and overlay storage remain separate; do not persist credentials or broaden identity data.

The Next panel initializes the existing local session before protected reads. It loads queue rows only from `GET /api/queues`; the broader `/api/state` projection is not a substitute for the operator projection. The queue screen renders names and queue state as escaped text and does not render UID fields. CSRF tokens stay in client memory and are sent only with mutations alongside idempotency keys; revision-checked settings send the server-provided expected revision. No raw API error body is rendered.
