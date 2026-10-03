# Twitch boundary
[Português brasileiro](../pt-BR/fullstack-architecture/twitch-boundary.md)


Use the streamer's own confidential client and user token. Client Credentials validates the app pair; Authorization Code uses session-bound one-use state. Twurple token refresh writes atomically. EventSub WebSocket receives channel chat and reward redemption events; Helix handles reward CRUD/redemption status and chat send. Adapter methods/fields are checked against pinned SDK versions during implementation. Reconciliation uses paginated remote reads, ID-based dedupe, and never infers terminal state from missing pages.
