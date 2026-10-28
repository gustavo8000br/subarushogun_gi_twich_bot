# Responsabilidades
[English](../../architecture/responsibilities.md)


A API é um único processo Fastify local na `API_PORT` em loopback (3109 no contêiner do produto), acessado pelo navegador por meio dos rewrites same-origin do servidor Next.js do painel. Controla sessões locais e segurança HTTP, compõe domínio/persistência/adaptadores Twitch, consome eventos Twitch, agenda reconciliação/timers e executa workers duráveis pela outbox PostgreSQL. Não é API hospedada nem serviço multi-tenant. Desde a Onda 1 do cutover da OPS-15, não serve nenhum arquivo de navegador: `apps/api/src/server.mjs` não registra rota estática e nenhum módulo em `apps/api/src` importa `@fastify/static` (`tests/unit/api-static-surface-contract.test.js`); o painel em `/` é servido pelo Next. Ainda lê os catálogos first-party de `apps/web/localization/catalogs` (`apps/api/src/server.mjs:41`).
