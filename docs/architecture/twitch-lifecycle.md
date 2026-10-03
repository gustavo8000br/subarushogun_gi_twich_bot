# Twitch lifecycle
[Português brasileiro](../pt-BR/architecture/twitch-lifecycle.md)


OAuth routes validate client-app credentials before replacing stored values; secret reads return presence only. OAuth callback validates Host, session, state and one-use expiry. Refresh provider persists each token atomically. Runtime validates token at startup/hourly. EventSub WebSocket registers redemption add/update and chat message handlers. Adapters normalize SDK enums/field shapes at their boundary. Reconciliation starts event observation, verifies app-owned reward settings, imports paginated unfulfilled redemptions, checks unresolved local IDs individually, applies confirmed external terminal status through the domain service, then resumes applicable workers/timers.
