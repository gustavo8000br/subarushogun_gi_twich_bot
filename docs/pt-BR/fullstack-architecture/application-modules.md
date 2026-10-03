# Módulos da aplicação
[English](../../fullstack-architecture/application-modules.md)


- `apps/web`: painel HTML/CSS/JS vanilla; consome projeções explícitas da API e usa APIs seguras para texto.
- `apps/api`: composição do processo Fastify, segurança local, handlers, serviços de domínio, adaptadores de persistência e Twitch, EventSub e workers duráveis.
- `apps/api/prisma`: schema/configuração Prisma 6, geração do client e migrations PostgreSQL, incluindo restrições SQL não representadas no schema Prisma.
- `apps/infra`: helper de segredo bootstrap, validação/materialização da versão do produto, saúde e utilitários operacionais.
- `tests`: suites Vitest unitárias/contrato e integrações com PostgreSQL isolado real/Compose.
