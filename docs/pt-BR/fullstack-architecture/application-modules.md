# Módulos da aplicação
[English](../../fullstack-architecture/application-modules.md)


- `apps/frontend`: painel do operador em Next.js App Router e rota isolada do overlay OBS; consome projeções explícitas da API e renderiza texto com segurança.
- `apps/web`: arquivos do painel vanilla, não mais servidos desde a Onda 1 do cutover (a `/` de produção é a Visão geral do Next) e removidos na Onda 4 do cutover (os arquivos do overlay vanilla foram removidos na Onda 3); `apps/frontend` não o importa mais; os módulos compartilhados foram para `apps/shared/panel` (S-03) e os catálogos de localização foram para `apps/shared/localization/catalogs` na Onda 2.
- `apps/api`: composição do processo Fastify, segurança local, handlers, serviços de domínio, adaptadores de persistência e Twitch, EventSub e workers duráveis.
- `apps/api/prisma`: schema/configuração Prisma 6, geração do client e migrations PostgreSQL, incluindo restrições SQL não representadas no schema Prisma.
- `apps/infra`: helper de segredo bootstrap, validação/materialização da versão do produto, saúde e utilitários operacionais.
- `tests`: suites Vitest unitárias/contrato e integrações com PostgreSQL isolado real/Compose.
