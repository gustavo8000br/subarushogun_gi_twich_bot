# Acceptance and release gates
[Português brasileiro](../pt-BR/prd/acceptance-and-release-gates.md)


Acceptance IDs AC-1 through AC-20 are defined in `stories/FND-0/spec/requirements.json`; they are the authoritative testable behaviors. All behavior is test-first. Required evidence includes unit tests, real isolated PostgreSQL/migration contracts, Compose contracts/acceptance, privacy and security tests, version materialization checks, and bilingual documentation parity. The project quality gates additionally include `npm run lint`, `npm run typecheck`, `npm test`, build, database, Compose and version checks once implemented.
