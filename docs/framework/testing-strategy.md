# Testing Strategy

[Português brasileiro](../pt-BR/framework/testing-strategy.md)

- Vitest runs ESM unit and HTTP/UI contract tests without Twitch credentials.
- Write and execute a behavior test before implementing that behavior; observe a behavioral Red, implement the minimum for Green, then refactor and rerun the affected suite.
- Use fake adapters and controllable clocks for external Twitch/time boundaries.
- Use a separate real PostgreSQL test database with actual Prisma migrations for constraints, transactions, concurrency, leases and crash recovery. Never use SQLite or Prisma mocks as proof of persistence guarantees.
- Compose integration checks validate bootstrap, secret persistence/permissions, dependency order, health, non-root bot, restart persistence and safe volume lifecycle.
- Version scripts have tests for exact identity format, source consistency, missing Git marker, seven-character SHA, failed discovery, artifact-only materialization, and no ordinary checkout mutation.
- Do not call a test validated if its command did not run successfully. Log exact commands and observed Red/Green/Refactor outcomes in English and pt-BR stories.
