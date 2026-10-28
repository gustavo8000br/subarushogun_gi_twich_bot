# Topologia de runtime
[English](../../fullstack-architecture/runtime-topology.md)


```mermaid
flowchart LR
  Browser[Navegador local da operadora] -->|https://127.0.0.1:3000| Next[servidor Next.js apps/frontend :3000]
  OBS[OBS Browser Source] -->|/overlay?ref=...#token| Next
  Next -->|rewrites /api, /overlay/api, /health, /callback| API[apps/api Fastify + domínio, loopback :3109]
  API --> DB[(PostgreSQL / Prisma)]
  API --> Twitch[Adaptadores Twurple: OAuth, Helix, EventSub WS]
  API --> Outbox[Workers da outbox PostgreSQL]
  Infra[apps/infra bootstrap/versão/saúde] --> DB
```

`Dockerfile` e `compose.yaml` pull-only definem o runtime; `compose.build.yaml` adiciona explicitamente contextos de source para builds de CI/manutenção. O instalador incorpora somente a configuração runtime e baixa imagem pré-compilada. Sob OPS-15, Next.js App Router usa servidor Node de produção via HTTPS e é a origem local do painel/overlay; Fastify continua autoridade de domínio/API na porta loopback 3109, atrás dos rewrites same-origin. Desde a Onda 1 do cutover da OPS-15, o Next serve a `/` (a Visão geral) e o Fastify não serve nenhum arquivo de navegador; o Fastify recebe só `/api/*`, `/overlay/api/*`, `/health` e `/callback` (`apps/frontend/scripts/dev-proxy-config.mjs:41-46`). O OBS carrega a rota Next `/overlay` pelo link do widget `/overlay?ref=...#token` (`apps/api/src/domain/overlay-widget-service.mjs:41`); o alias legado `/overlay.html` foi removido na Onda 3 do cutover e `/overlay.html` agora recebe 404 do Next (`tests/integration/compose-runtime.test.js:376`). Serviços Compose: `bootstrap` one-shot; `db` persistente e saudável; `migrate` one-shot após saúde do banco; `bot` sem root após conclusão da migration. O host publica somente `127.0.0.1:3000:3000`; portas da API e do banco não são publicadas. Volumes persistem DB e segredos operacionais. O bot monta catálogos first-party da imagem e o diretório comunitário do host somente para leitura; instaladores criam esse diretório. Desenvolvedores usam `npm ci` e depois `npm run dev` para HTTPS/HMR e PostgreSQL isolado. Teste instalador/runtime em Compose isolado com dados descartáveis; nunca use volumes ativos para migrations ou testes de recuperação. A recuperação é correção adiante ou nova implantação de um digest de imagem anterior; `legacy` não é alvo de rollback.
