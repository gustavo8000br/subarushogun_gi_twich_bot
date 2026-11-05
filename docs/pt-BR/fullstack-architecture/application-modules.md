# Módulos da aplicação
[English](../../fullstack-architecture/application-modules.md)


- `apps/frontend`: painel do operador em Next.js App Router e rota isolada do overlay OBS; consome projeções explícitas da API e renderiza texto com segurança.
- O painel vanilla (`apps/web`) foi removido na Onda 4 do cutover (FT-42; deixou de ser servido na Onda 1 e os arquivos do overlay saíram na Onda 3); os módulos compartilhados ficam em `apps/shared/panel` (S-03) e os catálogos de localização em `apps/shared/localization/catalogs` (Onda 2).
- `apps/api`: composição do processo Fastify, segurança local, handlers, serviços de domínio, adaptadores de persistência e Twitch, EventSub e workers duráveis.
- `apps/api/prisma`: schema/configuração Prisma 6, geração do client e migrations PostgreSQL, incluindo restrições SQL não representadas no schema Prisma.
- `apps/infra`: helper de segredo bootstrap, validação/materialização da versão do produto, saúde e utilitários operacionais.
- `tests`: suites Vitest unitárias/contrato e integrações com PostgreSQL isolado real/Compose.
