# Responsabilidades
[English](../../architecture/responsibilities.md)


A API é um único processo Fastify local. Serve `apps/web`, controla sessões locais e segurança HTTP, compõe domínio/persistência/adaptadores Twitch, consome eventos Twitch, agenda reconciliação/timers e executa workers duráveis pela outbox PostgreSQL. Não é API hospedada nem serviço multi-tenant.
