# Árvore de Código do Produto

[English](../../framework/source-tree.md)

```text
apps/
  api/
    prisma/               schema Prisma, config JS e migrations SQL
    src/
      bootstrap/ domain/ persistence/ outbox/ twitch/
      reconciliation/ commands/ chat/ http/ workers/
  infra/
    scripts/               validação/materialização de versão e operações
    src/                   bootstrap de secrets e utilitários runtime
  web/
    public/                HTML, CSS e JavaScript vanilla
tests/
  unit/
  integration/             contratos Compose e PostgreSQL isolado
docs/
  framework/               convenções de tecnologia/árvore/testes
  stories/                 specs AIOX, stories de implementação e evidências
  pt-BR/                   documentação equivalente em português
Dockerfile
compose.yaml
package.json
package-lock.json
```

`apps/*` é a convenção do código da aplicação. `.env.example` pertence ao scaffolding do framework e não é carregado pelo runtime do produto. Compose na raiz é ponto de entrada de implantação, não módulo da aplicação.
