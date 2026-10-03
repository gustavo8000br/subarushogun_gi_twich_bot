# Data and consistency
[Português brasileiro](../pt-BR/fullstack-architecture/data-and-consistency.md)


PostgreSQL holds queue configuration, global queue keys, entries, redemptions (including rejected ones), outbox, audit, account/settings, OAuth credentials and processed operation dedupe. IDs from Twitch and UID remain strings. PostgreSQL constraints enforce reward/message uniqueness, key namespace uniqueness, source/ID integrity, active user per queue, and stable financial/operation idempotency. Queue changes serialize in short transactions; global account changes use transactionally serialized updates. No database transaction remains open across Twitch I/O.

For terminal entry actions, one transaction changes domain state, order/account ownership, audit, policy snapshot, and outbox intent. The worker calls Twitch after commit, then records confirmation/retry/conflict/unknown. Network execution is not exactly once. Chat sending is a separate effect; privacy-sensitive text is rendered at send time from current queue settings.
