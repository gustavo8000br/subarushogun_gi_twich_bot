# Product Source Tree

[Português brasileiro](../pt-BR/framework/source-tree.md)

```text
apps/
  api/
    prisma/               Prisma schema, JS config and SQL migrations
    src/
      bootstrap/ domain/ persistence/ outbox/ twitch/
      reconciliation/ commands/ chat/ http/ workers/
  infra/
    scripts/               version validation/materialization and operations
    src/                   secret bootstrap and runtime utilities
  web/
    public/                vanilla HTML, CSS and JavaScript
tests/
  unit/
  integration/             isolated PostgreSQL and Compose contracts
docs/
  framework/               project tech/source/testing conventions
  stories/                 AIOX specs, implementation stories and evidence
  pt-BR/                   equivalent Portuguese documentation
Dockerfile
compose.yaml
package.json
package-lock.json
```

`apps/*` is the application-code convention. `.env.example` belongs to framework scaffolding and is not loaded by product runtime. Compose files at the repository root are deployment entrypoints, not application modules.
