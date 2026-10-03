# Persistence contract
[Português brasileiro](../pt-BR/architecture/persistence-contract.md)


Prisma 6.19.3 and `prisma-client-js` are pinned to preserve JavaScript generation. `prisma.config.mjs` reads a connection string assembled at runtime from Compose service host and a mounted password file. Do not print or expose it. Schema and versioned migrations live in `apps/api/prisma`; SQL adds partial unique/check constraints. Integration tests apply the same real migrations to an isolated PostgreSQL database.

Repositories provide short explicit transactions. Queue-level mutations use database coordination plus unique constraints; global account updates serialize across queues. Unique conflicts for duplicate active redemptions are expected domain outcomes and enqueue cancellation rather than crashing event intake. No transaction spans remote I/O.
