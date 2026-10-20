# Topologia de runtime
[English](../../fullstack-architecture/runtime-topology.md)


```mermaid
flowchart LR
  Browser[Navegador local da operadora] -->|127.0.0.1:3000| Fastify[servidor Fastify local HTTPS]
  OBS[OBS Browser Source] -->|/overlay.html?ref=...#token existente| Fastify
  Fastify --> Web[painel Next de produção e overlay isolado]
  Fastify --> API[rotas Fastify apps/api + domínio]
  API --> DB[(PostgreSQL / Prisma)]
  API --> Twitch[Adaptadores Twurple: OAuth, Helix, EventSub WS]
  API --> Outbox[Workers da outbox PostgreSQL]
  Infra[apps/infra bootstrap/versão/saúde] --> DB
```

`Dockerfile` e `compose.yaml` pull-only definem o runtime; `compose.build.yaml` adiciona explicitamente contextos de source para builds de CI/manutenção. O instalador incorpora somente a configuração runtime e baixa imagem pré-compilada. Sob OPS-15, Next.js App Router usa servidor Node de produção e é a origem local do painel/overlay; Fastify continua autoridade de domínio/API atrás do proxy same-origin. Serviços Compose: `bootstrap` one-shot; `db` persistente e saudável; `migrate` one-shot após saúde do banco; `bot` sem root após conclusão da migration. O host publica somente `127.0.0.1:3000:3000`; portas da API e do banco não são publicadas. Volumes persistem DB e segredos operacionais. O bot monta catálogos first-party da imagem e o diretório comunitário do host somente para leitura; instaladores criam esse diretório. Desenvolvedores usam `npm ci` e depois `npm run dev` para HTTPS/HMR e PostgreSQL isolado. Teste instalador/runtime em Compose isolado com dados descartáveis; nunca use volumes ativos para migrations ou ensaio de rollback.
