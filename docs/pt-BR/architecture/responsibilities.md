# Responsabilidades
[English](../../architecture/responsibilities.md)


A API é um único processo Fastify local na `API_PORT` em loopback (3109 no contêiner do produto), acessado pelo navegador por meio dos rewrites same-origin do servidor Next.js do painel. Controla sessões locais e segurança HTTP, compõe domínio/persistência/adaptadores Twitch, consome eventos Twitch, agenda reconciliação/timers e executa workers duráveis pela outbox PostgreSQL. Não é API hospedada nem serviço multi-tenant. Até o cutover da OPS-15 autorizado pelo proprietário, também ainda serve o shell vanilla de `apps/web` via `@fastify/static`; essa responsabilidade sai junto com `apps/web`.
