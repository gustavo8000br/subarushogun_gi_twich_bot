# Arquitetura Fullstack: Bot local de filas da Twitch

[English](../fullstack-architecture.md) · Fonte: [spec FND-0](../stories/FND-0/spec/spec.md), [pesquisa](../stories/FND-0/spec/research.json) e [PRD](../prd.md).

## Restrições da arquitetura

Uma instalação local, uma broadcaster/app Twitch, um processo de bot, PostgreSQL local via Compose, sem backend público/armazenamento remoto/telemetria. Runtime do produto em JavaScript ESM; o código do navegador é uma aplicação Next.js App Router (JavaScript ESM com JSDoc) servida pelo servidor de produção do Next.js, com o Fastify como processo de API separado em loopback no mesmo contêiner. `.env.example` continua sendo scaffolding do framework AIOX. Código em `apps/*`.

## Topologia de runtime

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

`Dockerfile` e `compose.yaml` pull-only na raiz são entrypoints do runtime; `compose.build.yaml` adiciona contextos de build local somente para CI/manutenção. O instalador da plataforma incorpora o manifest de runtime e baixa imagem pré-compilada. Serviços Compose: `bootstrap` de execução única; `db` persistente e saudável; `migrate` de execução única após a saúde do banco; `bot` sem root e iniciado só após migrations concluídas. `apps/infra/scripts/start-product.mjs` inicia o servidor Next.js (`PANEL_HOST` `0.0.0.0`, `PANEL_PORT` 3000) e o Fastify (`APP_HOST` `127.0.0.1`, `API_PORT` 3109) e encerra ambos quando qualquer um termina. O host publica somente `127.0.0.1:${APP_PORT:-3000}` para a porta 3000 do contêiner; a porta do Fastify não é publicada. Banco sem porta publicada. Volumes mantêm banco e segredos operacionais. Desenvolvedores executam `npm ci` uma vez e depois `npm run dev` para Next HMR/Fastify watch e PostgreSQL descartável isolado por worktree.

## Módulos da aplicação

- `apps/frontend`: painel do operador em Next.js App Router e rota isolada do overlay OBS; consome projeções explícitas da API e renderiza texto com segurança.
- `apps/web`: arquivos do painel vanilla, não mais servidos desde a Onda 1 do cutover (a `/` de produção é a Visão geral do Next) e removidos na Onda 4 do cutover (os arquivos do overlay vanilla foram removidos na Onda 3); `apps/frontend` não o importa mais; os módulos compartilhados foram para `apps/shared/panel` (S-03) e os catálogos de localização foram para `apps/shared/localization/catalogs` na Onda 2.
- `apps/api`: composição do processo Fastify, segurança local, handlers, serviços de domínio, adaptadores de persistência e Twitch, EventSub e workers duráveis.
- `apps/api/prisma`: schema/configuração Prisma 6, geração do client e migrations PostgreSQL, incluindo restrições SQL não representadas no schema Prisma.
- `apps/infra`: helper de segredo bootstrap, validação/materialização da versão do produto, saúde e utilitários operacionais.
- `tests`: suites Vitest unitárias/contrato e integrações com PostgreSQL isolado real/Compose.

## Dados e consistência

PostgreSQL mantém configuração de filas, chaves globais, entradas, resgates (inclusive rejeitados), outbox, auditoria, conta/configurações, credenciais OAuth e deduplicação de operações. IDs Twitch e UID são strings. Restrições PostgreSQL garantem unicidade de resgates/mensagens, namespace de chaves, integridade fonte/ID, usuário ativo por fila e idempotência financeira/operacional. Alterações da fila são serializadas em transações curtas; alterações globais de conta têm serialização transacional. Nenhuma transação de banco fica aberta durante I/O Twitch.

Para ações terminais, uma transação altera estado, ordem/propriedade de conta, auditoria, fotografia da política e intenção na outbox. O worker chama a Twitch após commit e registra confirmação/retry/conflito/desconhecido. A execução pela rede não é exatamente uma vez. Envio de chat é efeito separado; texto sensível a privacidade é criado no envio com as configurações atuais da fila.

## Fronteira Twitch

Usar o client confidencial e token de usuário da streamer. Client Credentials valida o par de app; Authorization Code usa `state` de uso único associado à sessão. Renovação Twurple é persistida atomicamente. EventSub WebSocket recebe eventos de chat e resgates; Helix gerencia recompensas/status de resgates e envia mensagens. Métodos/campos do SDK fixado são verificados durante implementação. Reconciliação lê páginas remotas, deduplica por ID e nunca infere estado terminal pela ausência em páginas.

## API e segurança local

Rotas do painel exigem sessão local. Validar Host e Origin exatos, bloquear DNS rebinding antes de rotas admin, usar cookies HttpOnly/SameSite e CSRF por sessão, validar schemas/chave de idempotência/revisão nas mutações. Callback OAuth é exceção GET limitada para Origin; Host/sessão/state continuam obrigatórios. Retornar projeções, não entidades Prisma. Sanitizar erros/logs Fastify/SDK/Prisma; nunca retornar ou registrar segredos, tokens, códigos OAuth, senha de banco, connection string ou payload bruto de chat/resgate.

## Operação CLI-first

Ciclo de vida e diagnósticos operacionais estão disponíveis pelos comandos e scripts Docker Compose; operações que alteram domínio continuam nas experiências de painel/chat especificadas. O painel local é superfície de controle exigida pelo produto e não contorna autorização, persistência ou auditoria do domínio.

## Identidade de versão

`package.json` armazena SemVer base, `.release-stage` o estágio e `VERSION` a identidade runtime completa. `apps/infra` valida/materializa prefixo exato de sete caracteres hexadecimais do commit de origem para artefatos; inicialização/verificações comuns não alteram arquivos de versão. Estado da API separa versão do produto, versão do contrato API e revisão do estado.

## Verificação e risco de plataforma

Testes unitários usam portas Twitch falsas e relógio controlável. Garantias de restrição, transações, migrations, leases e recuperação usam PostgreSQL isolado. Aceitação Compose verifica bootstrap, ordem, saúde, persistência após reinício e runtime sem root. Permissões de secrets baseados em arquivo exigem verificação empírica em cada plataforma declarada; nenhuma paridade entre hosts é alegada antes desses testes.
