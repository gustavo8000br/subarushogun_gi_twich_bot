# Pilha Tecnológica

[English](../../framework/tech-stack.md)

## Código da aplicação

- JavaScript ESM, `type: module`, Node.js 24.20.0 LTS e JSDoc; sem TypeScript de aplicação, transpiler ou bundler.
- Fastify 5.12.5 e `@fastify/static` 10.1.5; HTML/CSS/JavaScript sem framework em `apps/web/public`.
- `@twurple/auth`, `@twurple/api` e `@twurple/eventsub-ws` 8.2.0, fixados juntos.
- Prisma CLI, `@prisma/client` e `@prisma/adapter-pg` 6.19.3; `pg` 8.23.1; PostgreSQL 18.6.
- Vitest 5.0.3; `package-lock.json` versionado e Docker instala com `npm ci`.

## Runtime e estrutura

`apps/api` controla HTTP/domínio/integrações/persistência; `apps/web` contém UI estática; `apps/infra` contém utilitários de bootstrap/versão/saúde. Dockerfile e Compose na raiz são pontos de entrada de implantação. `.env.example` do scaffolding AIOX não é configuração do produto.

Todas as versões de dependências são exatas, sem intervalos ou `latest`. CLI/client/adaptadores compatíveis permanecem na mesma versão. Confirmar novamente compatibilidade e APIs oficiais antes da implementação.
