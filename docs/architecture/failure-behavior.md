# Failure behavior
[Português brasileiro](../pt-BR/architecture/failure-behavior.md)


Twitch loss keeps the local panel and PostgreSQL available. Pending financial work remains durable and visibly pending/conflicted/unknown. Partial reconciliation cannot delete entries. SIGTERM/SIGINT stops intake/new work, leaves pending rows persistent, disconnects Twitch, and closes Prisma/Fastify cleanly. An advisory lock, if used for single-instance protection, must hold a dedicated PostgreSQL session connection.
