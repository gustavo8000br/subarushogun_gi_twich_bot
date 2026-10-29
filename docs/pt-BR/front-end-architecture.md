# Arquitetura do Frontend: `apps/frontend`

[English](../front-end-architecture.md) · Comportamento do produto: [especificação do frontend](front-end-spec.md).

> Topologia substituída: o plano anterior da FND-0/OPS-15 (`output: 'export'`, assets estáticos servidos pelo Fastify, sem servidor Next.js em runtime) é histórico. A topologia atual abaixo foi conferida no código em 2026-10-21 ([revisão estrutural da OPS-15](stories/OPS-15/structural-review.md), S-07).

## Runtime e limites

O frontend do navegador é uma aplicação Next.js App Router em `apps/frontend/`, servida em produção pelo servidor Node do Next.js (`apps/frontend/scripts/start-production.mjs`) via HTTPS local na `PANEL_PORT` (3000 no contêiner). Não há export estático. O mesmo contêiner executa o Fastify (`apps/api/src/server.mjs`) como processo separado na `API_PORT` 3109 em loopback; `apps/infra/scripts/start-product.mjs` inicia os dois e encerra ambos quando qualquer um termina. O Next reescreve `/api/*`, `/overlay/api/*`, `/health` e `/callback` para a origem Fastify HTTPS em loopback, de modo que o navegador vê uma única origem; o Fastify continua sendo a autoridade de sessão, Host/Origin, CSRF, domínio e Twitch. O overlay OBS é a rota Next `/overlay` e os links de widget têm o formato `/overlay?ref=...#token` (`apps/api/src/domain/overlay-widget-service.mjs:41`). Desde a Onda 3 do cutover da OPS-15 ([registro](stories/OPS-15/cutover-wave-3.md)), o overlay vanilla e o alias legado `/overlay.html` não existem mais: `/overlay.html` recebe 404 do Next, sem redirecionamento (`tests/integration/compose-runtime.test.js:376`), então uma fonte do OBS que ainda usa um link antigo `/overlay.html` precisa de um link novo gerado. Painel e overlay têm layouts e bundles separados.

Desde a Onda 1 do cutover da OPS-15 (2026-10-27, [registro](stories/OPS-15/cutover-wave-1.md)), a `/` de produção é a Visão geral do painel Next (`apps/frontend/app/(panel)/page.jsx:8`) e o Fastify não serve nenhum arquivo de navegador: os únicos rewrites de produção para o Fastify são `/api/*`, `/overlay/api/*`, `/health` e `/callback` (`apps/frontend/scripts/dev-proxy-config.mjs:41-46`), `apps/api/src/server.mjs` não registra rota estática, e `/app.js`, `/styles.css`, `/index.html` e `/shared/panel/*` recebem 404 do Next (`tests/integration/compose-runtime.test.js:372`). Os arquivos restantes de `apps/web/` (só o painel vanilla) continuam no disco, mas não são servidos e são removidos na Onda 4 (os arquivos do overlay vanilla foram removidos na Onda 3; os catálogos de localização foram para `apps/shared/localization/catalogs` na Onda 2, [registro](stories/OPS-15/cutover-wave-2.md)). `legacy` é somente referência histórica, nunca fallback nem alvo de rollback.

O código-fonte do navegador permanece em JavaScript ESM com JSDoc. O build Next.js é a exceção documentada para bundle/transpilation do frontend; não autoriza código de aplicação TypeScript. O navegador nunca importa Prisma nem se comunica diretamente com a Twitch.

## Arquivos e módulos

```text
apps/frontend/
  app/(panel)/         rotas do painel: visão geral, conexão, nova fila, filas, operações, comandos, configurações, widgets
  app/(overlay)/       rota e layout isolados do overlay OBS
  features/            shell do painel, visão geral, filas, operações, configurações, widgets, overlay
  components/ui/       componentes compartilhados de apresentação acessível
  lib/api/             cliente API same-origin e contratos de requests
  lib/i18n/            catálogos runtime, locale e helpers de formatação
  styles/              tokens de design e estilos globais compartilhados
  scripts/             configuração runtime do Next, servidor HTTPS de produção, launcher de desenvolvimento
apps/web/              arquivos do painel vanilla, não servidos desde a Onda 1; removidos na Onda 4
```

Os 12 módulos que o runtime Next compartilha com o painel vanilla (renderer do overlay, `PANEL_PLACEHOLDERS` e helpers de apresentação) ficam em `apps/shared/panel/` (S-03); uma regra ESLint `no-restricted-imports` e `tests/unit/shared-panel-boundary.test.js` proíbem `apps/frontend` e `apps/shared` de importar `apps/web`. Desde a Onda 1 do cutover, o Fastify não os serve mais por HTTP (o prefixo transitório `/shared/panel/` foi removido); o Next os importa do sistema de arquivos (por exemplo, `apps/frontend/features/panel-shell/panel-shell.jsx:8`). Desde a Onda 2 do cutover os catálogos de primeira parte ficam em `apps/shared/localization/catalogs`; a API, o validador e o fallback estático do Next os resolvem por `apps/shared/localization/first-party-catalogs.mjs`, e `tests/unit/shared-panel-boundary.test.js` também falha com qualquer string de caminho `apps/web` no código Next, shared, API ou infra (TS-04).

Manter composição de rotas/layouts fina. Módulos de feature consomem projeções explícitas da API e nunca implementam transições de domínio. Painel e a rota `/overlay` usam entradas separadas para o OBS não baixar o bundle do painel. Conteúdo não confiável permanece como texto e nunca é renderizado como HTML. Consultar estado local na cadência limitada existente; não adicionar WebSocket ao painel. Mutações mantêm CSRF de sessão, chave de idempotência e revisão esperada aplicável.

## Modelo de telas

Configuração/reconexão → visão geral → lista/detalhe de filas → recuperação Twitch/pontos → conta e configurações do produto → gerenciamento de widgets. O overlay OBS é uma entrada de apresentação separada e baseada em capability. Cada superfície existente preserva os estados aplicáveis carregando, vazio, desconectado, desatualizado, parcial, erro, sucesso, pendente, desconhecido e conflito. Controles refletem ciclo de vida atual; a validação do servidor continua autoritativa. Ações destrutivas mantêm as etapas existentes de revisão e confirmação.

## Privacidade e estado

O painel recebe somente projeções de API para a operadora local autenticada. UID é retornado somente conforme política atual de privacidade da fila; projeções do overlay aplicam a política mais restritiva atual de saída. Segredos nunca são retornados após envio de credenciais. O overlay usa sua capability bearer existente sem sessão do painel e não pode expor o segredo do fragmento após inicialização. Mudanças de configuração atualizam projeções sem armazenar texto de notificação renderizado.

## Verificação

Testes de componente e navegador cobrem a matriz de paridade por superfície, ação, endpoint, locale, estado e referência de teste. Contratos de build/Compose verificam o build de produção do Next (`.next`), a lista de rewrites de produção para a origem Fastify HTTPS em loopback, chamadas API same-origin e separação dos bundles painel/overlay. Descoberta runtime de catálogos continua via `/api/localization/catalogs`; testes adicionam um catálogo elegível após o build frontend e verificam disponibilidade sem rebuild ou restart da API. Verificações browser do overlay e OBS/CEF nativo cobrem URLs/capabilities existentes e o orçamento documentado da FND-7. Testes de rota backend continuam responsáveis por sessão, CSRF, Host/Origin, autorização, projeções de privacidade e correção das mutações.
