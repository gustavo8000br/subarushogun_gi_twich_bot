# Verification and unresolved platform risk
[Português brasileiro](../pt-BR/fullstack-architecture/verification-and-unresolved-platform-risk.md)


Unit tests use fake Twitch ports and controllable clocks. Guarantees for constraints, transactions, migrations, leases and recovery use an isolated PostgreSQL database. Compose acceptance verifies bootstrap, order, health, restart persistence and non-root runtime. File-backed secret permissions need empirical checks on each claimed host platform; no platform parity is claimed before those checks.
