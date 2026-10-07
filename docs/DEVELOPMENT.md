# Development guide

[Português brasileiro](pt-BR/DESENVOLVIMENTO.md) · [Back to README](../README.md)

## Requirements

- Node.js `24.20.0` and npm.
- Docker Engine/Desktop with Compose v2 for PostgreSQL-backed integration tests and Compose validation.
- Git access to the repository. Twitch credentials are not required for the automated suite.
- OpenGrep `1.30.0` available on `PATH` for the local static-analysis gate.

## Install and check

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run review:static
npm run validate:version
npm run validate:localization
docker compose config --quiet
```

PostgreSQL integration tests provision isolated test resources. They must not use or delete the active product volumes.

### Focused checks

```sh
npm run lint:api && npm run typecheck:api
npm run lint:infra && npm run typecheck:infra
npm run lint:web && npm run typecheck:web
npm test -- --run tests/unit/<test-file>.test.js
```

The vanilla web app is checked directly; it does not have a frontend build/bundler step. GitHub Actions [CI](../.github/workflows/ci.yml) runs on pull requests and calls the shared quality gates. Main image publication and tagged releases are separate workflows; see the [CI/CD guide](CI-CD.md) for triggers, permissions, image tags, and recovery.

## Project layout

```text
apps/api/    Fastify API, domain, Prisma schema and migrations
apps/infra/  Compose and operational scripts
apps/web/    Static browser panel and localization catalogs
tests/       Unit, integration, and browser acceptance tests
docs/        Stories and focused user/developer references
```

For behavior changes, follow the test-first process in [Contributing](CONTRIBUTING.md) and record evidence in the corresponding bilingual story.
