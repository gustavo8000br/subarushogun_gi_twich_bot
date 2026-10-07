# Guia de desenvolvimento

[Read in English](../DEVELOPMENT.md) · [Voltar ao README](../../README.pt-BR.md)

## Requisitos

- Node.js `24.20.0` e npm.
- Docker Engine/Desktop com Compose v2 para testes de integração PostgreSQL e validação do Compose.
- Acesso Git ao repositório. A suíte automatizada não exige credenciais Twitch.
- OpenGrep `1.30.0` disponível no `PATH` para o gate local de análise estática.

## Instalar e verificar

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

Os testes de integração PostgreSQL criam recursos isolados. Eles não devem usar nem apagar os volumes ativos do produto.

### Verificações focadas

```sh
npm run lint:api && npm run typecheck:api
npm run lint:infra && npm run typecheck:infra
npm run lint:web && npm run typecheck:web
npm test -- --run tests/unit/<arquivo-de-teste>.test.js
```

O app web vanilla é verificado diretamente; não tem etapa de build/bundler frontend. O [workflow CI do GitHub Actions](../../.github/workflows/ci.yml) executa lint/typecheck por área, Vitest com integração PostgreSQL/Compose, verificações Windows dos scripts, OpenGrep/política de versão, validação Compose e build da imagem de produção.

## Estrutura do projeto

```text
apps/api/    API Fastify, domínio, schema e migrations Prisma
apps/infra/  Compose e scripts operacionais
apps/web/    Painel estático e catálogos de localização
tests/       Testes unitários, integração e aceite de navegador
docs/        Stories e guias específicos de usuário/desenvolvimento
```

Para mudanças de comportamento, siga o processo test-first de [Como contribuir](CONTRIBUICAO.md) e registre as evidências na story bilíngue correspondente.
