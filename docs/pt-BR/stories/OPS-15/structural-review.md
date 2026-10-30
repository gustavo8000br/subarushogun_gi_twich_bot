# OPS-15 — Revisão estrutural (lente 3: contratos, fronteiras, documentação)

[English](../../../stories/OPS-15/structural-review.md) · Story: [OPS-15](story.md)

- **Revisora:** @architect (Aria), revisão estática de código/documentos na branch `feat/ops-15-next-panel`, árvore de trabalho incluindo WIP não commitado, 2026-10-21.
- **Classe de evidência:** somente leitura estática. Nenhum build, Compose, navegador, OBS/CEF, PostgreSQL ou Twitch foi executado nesta revisão. Cada achado é uma hipótese fundamentada no código citado até ser reproduzido por @dev/@qa.
- **Decisões do proprietário aplicadas:** `apps/web` (vanilla) é legado e será removido por completo após a migração Next; `legacy` é apenas histórico (não é fallback nem rollback); revisão estática é somente OpenGrep.
- **Fora do escopo:** qualidade visual/UX, acessibilidade em runtime, desempenho, schema Prisma.

## Resumo por severidade

| ID | Severidade | Área | Título | Decisão do proprietário? |
|---|---|---|---|---|
| S-01 | Bloqueador | Build | O build do frontend no Docker omite `apps/web/call-deadline-presentation.mjs` | Não |
| S-02 | Bloqueador | Roteamento | Em produção, `/` é reescrito para o shell vanilla do Fastify, que não consegue carregar seus próprios módulos | Sim (cutover) |
| S-03 | Alta | Fronteiras | O runtime Next (painel, overlay OBS, catálogos, Dockerfile) depende de 12 módulos de `apps/web` | Sim (local de destino) |
| S-04 | Alta | Idempotência | Um 5xx deixa o registro de idempotência em `processing` para sempre; o cliente também gera chave nova a cada nova tentativa | Não |
| S-05 | Alta | Sessão | Sessões em memória + token CSRF em cache: reiniciar a API quebra toda mutação até recarregar a página, sem código legível por máquina | Não |
| S-06 | Alta | Contrato de erro | Muitas respostas 4xx/503 trazem texto fixo em pt-BR e nenhum `code`; o cliente reduz tudo a `REQUEST_FAILED` | Não |
| S-07 | Alta | Docs | Documentos de arquitetura ainda descrevem static export / runtime vanilla servido pelo Fastify | Não |
| S-08 | Alta | Docs/plano | Roadmaps e stories mantêm gates de "rollback/ponteiro de recuperação `legacy`" que contradizem a decisão do proprietário | Sim (redação) |
| S-09 | Média | Docs | Contradições de estágio: README "alpha", changelog interno "beta não agendada/v1.0.0", versão real `v0.2.0-beta` | Sim (frase de status) |
| S-10 | Média | Docs | `docs/ROADMAP.md` desatualizado (2026-10-07), omite OPS-11..OPS-20 e conflita com o roadmap de conclusão | Não |
| S-11 | Média | Contrato | `/api/state` e `/api/queues` projetam filas com regras de privacidade diferentes | Não |
| S-12 | Média | Config morta | Filtro de rewrite morto `/connection/:path*`; rewrites `/app.js`, `/styles.css`; aliases `/overlay.html` | Sim (manter alias) |
| S-13 | Média | Docs | A especificação de front-end diz que a interface é só pt-BR e "sem framework de componentes" | Não |
| S-14 | Baixa | Contrato | Isenção de `/api/session` compara `request.url` exato (query string quebra) | Não |
| S-15 | Baixa | Docs | Guia/README em inglês usam rótulos de UI em pt-BR; título no índice de stories ainda diz "estático" | Não |

## Achados

### S-01 — Bloqueador — O build Docker omite um módulo importado pelo painel Next

- `apps/frontend/features/queues/call-deadline.jsx:2` importa `../../../web/call-deadline-presentation.mjs`; o componente é usado por `queue-list.jsx` (arquivo é WIP não rastreado).
- `Dockerfile:9-20` copia 11 módulos de `apps/web` um a um para o estágio `frontend-build`; `call-deadline-presentation.mjs` não está na lista. `npm run build:frontend` (`Dockerfile:22`) deve falhar com import não resolvido assim que esse WIP entrar.
- Causa raiz (falha de planejamento herdada): o build depende de uma allowlist manual de arquivos entre apps, e não de uma fronteira de pacote declarada; nenhum teste unitário falha quando a lista diverge.
- **Correção:** no curto prazo, adicionar a linha COPY e um teste de contrato que leia todo import de `apps/frontend` resolvido em `apps/web` e confirme que cada um é copiado (estender `tests/unit/windows-native-contract.test.js` ou criar teste de contrato do Dockerfile). Correção estrutural: S-03.

### S-02 — Bloqueador — Em produção `/` ainda aponta para o painel vanilla, e esse shell quebra ali

- `apps/frontend/scripts/dev-proxy-config.mjs:48-49` (`buildProductionProxyRules`) adiciona rewrites `beforeFiles` de `/`, `/styles.css` e `/app.js` para o Fastify (`API_PORT` 3109). `beforeFiles` roda antes das páginas Next, então `app/(panel)/page.jsx` (visão geral Next) fica sombreada em produção; em desenvolvimento (`buildDevProxyRules`, linhas 21-30) `/` é Next. Dev e produção mostram produtos diferentes na mesma URL.
- O Fastify continua servindo `apps/web` estaticamente quando `API_ONLY` não está definido (`apps/api/src/server.mjs:128-133`, `apps/api/src/web-route.mjs:10-25`); `apps/infra/scripts/start-product.mjs` e `compose.yaml:50-63` nunca definem `API_ONLY`.
- O `index.html` vanilla carrega `/app.js`, que importa `./application-setup.mjs`, `./panel-navigation.mjs`, `../shared/browser/translate-catalog.mjs` etc. (`apps/web/app.js:1-21`). Só `/`, `/styles.css` e `/app.js` são reescritos; as demais requisições de módulo caem no Next e retornam 404: em produção `/` seria um shell não funcional, enquanto `/queues` etc. são Next.
- **Correção:** remover os rewrites de `/`, `/styles.css`, `/app.js` para que o Next seja dono de `/`; rodar o Fastify com `API_ONLY=true` no script de produto e no Compose; teste de contrato da configuração de produção garantindo que nenhum rewrite aponte para asset vanilla. Exige autorização do proprietário, pois é o próprio cutover (o CLAUDE.md proíbe cutover sem aprovação explícita). Validar em Compose semelhante à produção, não em testes unitários.

### S-03 — Alta — O runtime Next está acoplado ao diretório legado

- 15 declarações de import em `apps/frontend` resolvem para 12 módulos em `apps/web` (ex.: `apps/frontend/features/panel-shell/panel-shell.jsx:8`, `queues/queue-lifecycle-actions.jsx:4,6`, `queues/queue-settings.mjs:1-2`, `connection/connection-page-content.jsx:6`, `commands/command-permissions-page-content.jsx:6`, `widgets/widgets-page-content.jsx:6`, `lib/i18n/panel-catalogs.mjs:2`).
- A entrada do overlay OBS importa `apps/web/overlay-renderer.mjs` (`apps/frontend/app/(overlay)/overlay/overlay-root.jsx:4`).
- Os catálogos de runtime ficam em `apps/web/localization/catalogs/` e a API os lê dali (`apps/api/src/server.mjs:43`); `setup-messages.mjs:1` puxa `apps/shared/browser`.
- Consequência: "remover `apps/web` por completo" hoje quebraria painel, overlay, descoberta de catálogos e a imagem. O plano de remoção precisa ser precedido por uma story de realocação.
- **Correção (opções):** A) mover os módulos puros para `apps/shared/panel/` e os catálogos para `apps/shared/localization/catalogs/` (recomendado: uma fonte, consumida pela API e pelo Next; o Dockerfile já copia `apps/shared` na linha 21); B) movê-los para `apps/frontend/lib/` e apontar a raiz de catálogos da API para o novo local (mais simples, mas a API passa a depender da árvore do frontend); C) mantê-los em `apps/web` e apagar só os arquivos vanilla (deixa um nome de diretório enganoso). Trade-off: A custa uma movimentação mecânica + reescrita de imports + ajuste de caminhos em `validate:localization`; é a única opção que torna a remoção uma deleção pura. Decisão de caminho pelo proprietário/arquitetura; @dev executa com testes.

### S-04 — Alta — Registros de idempotência podem travar e novas tentativas não reutilizam a chave

- `apps/api/src/http/queue-routes.mjs:122` não chama `completePanelOperation` quando `reply.statusCode >= 500`; a linha fica em `state: 'processing'` (`apps/api/src/persistence/queue-repository.mjs:287`). Qualquer requisição posterior com a mesma chave recebe `in_progress` 409 (`queue-repository.mjs:296`, `queue-routes.mjs:116`), sem expiração nem lease.
- Por outro lado, `apps/frontend/lib/api/client.mjs:23` gera um UUID novo por chamada; nenhum chamador em `apps/frontend/features` passa `idempotencyKey` (grep). Após falha de transporte (`client.mjs:33-37`, que corretamente diz que a requisição pode ter chegado ao servidor), uma nova tentativa do usuário é uma operação *nova*; a proteção de replay nunca cobre o caso para o qual existe. Guardas de domínio (versões, chaves de outbox) podem evitar duplicação, mas isso é por rota e não verificado.
- **Correção:** em 5xx, marcar o registro como `failed` (reutilizável com a mesma impressão digital) ou dar lease/expiração a `processing`; no cliente, manter uma chave por intenção no caminho de nova tentativa incerta de cada ação (chamar, limpar, criar, excluir). Exige testes de integração em PostgreSQL com migrations reais para replay, conflito, travado e expirado; @data-engineer revisa o modelo de estados.

### S-05 — Alta — Perda de sessão não se recupera sem recarregar

- Sessões são um `Map` em processo (`apps/api/src/http/local-session.mjs:6`); reiniciar a API (os dois processos são supervisionados juntos por `start-product.mjs`) invalida todo cookie.
- O cliente guarda `csrfToken` durante toda a vida da página (`client.mjs:10,21`) e nunca reinicializa em 401/403. As respostas da API são texto sem `code` (`local-session.mjs:42,47,50,55,58`), então a UI vê `REQUEST_FAILED` e não consegue dizer "sessão expirada, recarregue".
- **Correção:** adicionar códigos estáveis (`LOCAL_SESSION_REQUIRED`, `CSRF_INVALID`, `ORIGIN_INVALID`); o cliente reinicializa uma vez nesses códigos para GETs e mostra aviso localizado de recarga para mutações (nunca repetir mutação automaticamente). Requer revisão UX (afeta a pessoa usuária).

### S-06 — Alta — Contrato de códigos de erro incompleto e texto da API só em pt-BR

- Mensagens fixas em pt-BR sem `code`: idempotência (`queue-routes.mjs:102,105,109,116,117`), operações (`:271,277`), reconciliação (`:281,283`), setup (`:291,293,298`, `:306`), sessão (`local-session.mjs`). Outras rotas enviam `code` (`:402-405,432-433`), então o contrato é inconsistente.
- `client.mjs:41-45` descarta a mensagem e mantém só `code`; respostas sem código ficam indistinguíveis. O painel tem catálogos en/es/pt-BR; o texto da API é texto morto para o cliente Next.
- **Correção:** definir um envelope único `{ code, referenceId? }` para todo não-2xx, enumerar os códigos em `endpoint-catalog-inventory.md` e mapeá-los a chaves de catálogo; teste de tabela de rotas garantindo que todo `reply.code(>=400)` inclua `code`. Compatível: manter `error` durante a migração e remover após a remoção do vanilla.

### S-07 — Alta — Documentos de arquitetura descrevem a topologia abandonada

- `docs/front-end-architecture.md:7` — "`output: 'export'` … servido pelo Fastify … sem servidor runtime Next.js … porta extra"; realidade: runtime Next em `PANEL_PORT` via HTTPS (`apps/frontend/scripts/start-production.mjs:11-12,20`) fazendo proxy para o Fastify em `API_PORT` 3109 (`dev-proxy-config.mjs:33-34`, `compose.yaml:56-57`).
- `docs/front-end-architecture.md:14-22` lista `apps/web/app`, `features`, `out/`; o código está em `apps/frontend/` e não existe `out/`. O mesmo vale para os shards `docs/front-end-architecture/{runtime-and-boundaries,files-and-modules,verification}.md`.
- `docs/architecture.md:7` "a API … serve `apps/web`"; `docs/fullstack-architecture.md:7,13,25` "assets vanilla", "assets estáticos de `apps/web`", "painel HTML/CSS/JS vanilla"; `docs/fullstack-architecture/architecture-constraints.md`. Conferir os equivalentes em `docs/pt-BR/`.
- Restos de static export também em `docs/prd.md`, `docs/stories/FND-0/spec/*`, `eslint.config.js`, `.dockerignore`, `.gitignore`, `tsconfig.json`, `tests/unit/next-frontend-config.test.js` (grep `output: 'export'|out/`); verificar se cada um é histórico ou configuração viva.
- **Correção:** reescrever os três documentos de arquitetura (+ shards, en/pt-BR juntos) para a topologia de dois processos, a fronteira de módulos escolhida em S-03 e a cadeia de segurança (Next HTTPS → Fastify HTTPS em loopback, verificação de Host/Origin com `backendPort`). Specs históricas (FND-0) mantêm o conteúdo, com nota "substituído pela OPS-15".

### S-08 — Alta — Gates de planejamento contradizem a decisão sobre `legacy`/rollback

- `docs/project-completion-roadmap.md:16` lista "ensaiar rollback"; `:27` proíbe mover "o ponteiro local fixo de recuperação `legacy`" antes de "rollback isolado concluído". `docs/stories.md:356` (e pt-BR `:357`) diz que "rollback seguem abertos". A decisão do proprietário diz que `legacy` não é alvo de rollback.
- Falha herdada: o conjunto de gates foi planejado quando o vanilla era fallback; agora bloqueia a remoção com uma condição inalcançável/indesejada.
- **Correção:** trocar "rollback para legacy" por "correção adiante / reimplantar o digest da imagem anterior" (o mecanismo real de recuperação, conforme `docs/VERSIONING.md:31`), nos dois idiomas, registrado no Change Log da story. Proprietário confirma a redação.

### S-09 — Média — Contradições de estágio de release

- `README.md:4,13` e `README.pt-BR.md:4` — badge/aviso "alpha"; `VERSION` = `v0.2.0-0000000-beta`, `.release-stage` = `beta`, `CHANGELOG-beta.md:5` tem `v0.2.0-beta`.
- `CHANGELOG_INTERNAL.md:5` tem como entrada mais recente a FND-9 (2026-10-07), sem entradas OPS-11..OPS-15; `:18` diz que "o plano beta não está agendado"; `docs/VERSIONING.md:19` usa exemplo `v1.0.0-…-beta` contra a base real `0.2.0` (`:15`). `docs/stories.md:370` "Beta timing is not scheduled", embora versões beta já existam.
- `README.md:49` para o status do projeto na OPS-6.
- A regra "versão mais recente primeiro" é respeitada em todos os changelogs de estágio verificados (alpha, beta, interno); nenhuma violação de ordem encontrada. `CHANGELOG-rc.md`/`-stable.md` não têm entradas (esperado).
- **Correção:** uma frase de status aprovada pelo proprietário ("estágio beta, ainda sem release pública") propagada para README (en/pt-BR), changelog interno, exemplo do VERSIONING e índice de stories; adicionar entradas do changelog interno para OPS-11..OPS-15.

### S-10 — Média — `docs/ROADMAP.md` está desatualizado e diverge do roadmap de conclusão

- `docs/ROADMAP.md:5` "conferido … 2026-10-07"; a tabela não tem OPS-11, OPS-12, OPS-13, OPS-14, OPS-15 e OPS-20; FND-9 "Implementation in progress" (`:17`) contra `docs/project-completion-roadmap.md:17` "Ready for Review; aceite do proprietário pendente". `:38` a sequência "FND-9 → DOC-2 → DOC-3" omite a OPS-15 como trabalho ativo. O README chama esse roadmap de "atual".
- **Correção:** tornar `ROADMAP.md` a única tabela de status (ou fazê-lo apontar para o roadmap de conclusão e remover status duplicado), en/pt-BR juntos.

### S-11 — Média — Duas projeções de fila com regras de privacidade diferentes

- `/api/state` usa `queueDto(queue)` (não operador; UID só se `showUidInOverlay`, `queue-routes.mjs:57,173`); `/api/queues` usa `queueDto(queue, { operator: true })` (`:376`). O painel busca as duas a cada polling (`apps/frontend/features/panel-shell/load-panel-snapshot.mjs:3-23`).
- Risco: qualquer componente que leia `state.queues` em vez da projeção de operador esconde UID silenciosamente ou diverge; a duplicação também dobra o trabalho no banco por polling. É um formato da era vanilla que foi carregado.
- **Correção:** retirar `queues` de `/api/state` para o cliente Next (ou documentá-lo como projeção com privacidade de overlay) após confirmar que não há consumidor; teste de contrato garantindo que componentes do painel leiam só `/api/queues`.

### S-12 — Média — Roteamento morto ou transitório

- `apps/frontend/scripts/next-runtime-config.mjs:9` filtra `/connection/:path*` de `beforeFiles`, mas `buildProductionProxyRules` nunca emite essa origem: código morto de um plano anterior.
- Rewrites de `/app.js`, `/styles.css`, `/` (S-02); alias `/overlay.html` → `/overlay` (`dev-proxy-config.mjs:29,51`) e `apps/api/src/http/dev-overlay-alias.mjs:11` atendem URLs OBS existentes. O redirect de `/callback` aponta para `/connection/?oauth=` (`queue-routes.mjs:316`), dependendo de um redirect de barra final com `trailingSlash: false`.
- **Correção:** remover o filtro morto; redirecionar para `/connection?oauth=`; o proprietário decide por quanto tempo `/overlay.html` permanece (fontes OBS existentes dependem dele — manter até o fim de uma janela de migração documentada).

### S-13 — Média — A especificação de front-end é anterior à localização e ao Next

- `docs/front-end-spec.md:20` "Product interface language is pt-BR"; a FND-8 entrega en/es/pt-BR + locales da comunidade. `:36` "No CSS or component framework is required" é orientação da era vanilla. `:7` "não é … overlay", embora o mesmo app Next agora hospede a entrada do overlay.
- **Correção:** atualizar a especificação (en/pt-BR) com a regra de localização, as 9 rotas e a separação de bundles painel/overlay; revisão do especialista UX, por ser voltada à pessoa usuária.

### S-14 — Baixa — Isenção de sessão por URL exata

- `local-session.mjs:54` e `queue-routes.mjs:100` comparam `request.url === '/api/session'`; `request.url` inclui a query string, então `/api/session?x=1` retorna 401. Inofensivo hoje, frágil. **Correção:** comparar `request.routeOptions.url` ou o pathname já interpretado.

### S-15 — Baixa — Deriva de idioma nos docs em inglês

- `README.md:20` "**Conexão do canal**"; `docs/USER_GUIDE-en_US.md:139` usa um rótulo de toggle em pt-BR. A UI em inglês é localizada, então esses rótulos não batem com o que a pessoa usuária em inglês vê.
- `docs/stories.md:356` / pt-BR `:357` título "Frontend Next.js *estático* modular" está desatualizado (há servidor runtime).
- As contagens de títulos de `USER_GUIDE-en_US.md` e `MANUAL_DE_USUARIO-pt_BR.md` coincidem (21/21); a paridade de conteúdo não foi auditada linha a linha aqui (escopo da DOC-3).

## Mapa de contratos API ↔ páginas (resumo)

Todos os endpoints consumidos pelas 9 páginas Next existem em `apps/api/src/http/*.mjs`; nenhuma rota ausente foi encontrada. Rotas administrativas ficam atrás do hook global `onRequest` de sessão/Host/Origin/CSRF (`local-session.mjs:36-59`); `/overlay/api/widget` é público de propósito, com capability bearer; `/health` e `/callback` são públicos por design. Nenhuma rota administrativa sem autenticação foi encontrada. Rotas sem consumidor Next visível: `POST /api/queues/:id/archive-local/challenge|confirm` e `/delete/cancel` não apareceram no grep de caminhos literais em `apps/frontend` (podem ser montadas dinamicamente em `queue-lifecycle.mjs:64-67`); o @qa deve confirmar pelo inventário de endpoints em vez de presumir que estão mortas.

## Sequência recomendada

1. S-01 (uma linha + teste de contrato) → 2. decisão de S-03 e story de realocação → 3. S-04/S-05/S-06 como uma story única de "contrato de erro e replay do painel" (data-engineer + UX) → 4. cutover S-02 com autorização do proprietário e evidência em Compose semelhante à produção → 5. passada de documentação S-07..S-15 em en/pt-BR antes do PR de remoção do vanilla.

## Resolução (2026-10-21, passada somente documental aprovada pelo proprietário)

Alterados: `docs/front-end-architecture.md` e shards `runtime-and-boundaries.md`, `files-and-modules.md`, `verification.md`, `index.md`; `docs/architecture.md` e `architecture/responsibilities.md`; `docs/fullstack-architecture.md` e shards `runtime-topology.md`, `architecture-constraints.md`, `application-modules.md`; `docs/project-completion-roadmap.md`; `docs/ROADMAP.md`; `README.md`/`README.pt-BR.md`; `docs/VERSIONING.md` (todos com as cópias pt-BR).

- **S-07 — resolvido (docs):** topologia de dois processos (servidor Next.js HTTPS → Fastify HTTPS em loopback 3109), lista de rewrites, regra de Host/Origin e o `/` vanilla transitório documentados; export estático marcado como histórico. Segunda passada: `docs/prd.md` e os shards `functional-requirements.md`/`non-goals.md` (FR-11, não objetivos) agora dizem que o servidor Next.js serve o painel, sem export estático; `docs/stories/FND-0/spec/spec.md` tem uma nota "substituída em parte pela OPS-15" que cobre `requirements.json`/`plan.json`/`research.json` (conteúdo histórico preservado). Continua aberto: resíduos em configuração/testes (`eslint.config.js`, `.dockerignore`, `.gitignore`, `tsconfig.json`, `tests/unit/next-frontend-config.test.js`; fora do escopo somente documental) e a localização dos módulos em S-03.
- **S-08 — resolvido (docs):** o roteiro de conclusão e a entrada da OPS-15 em `docs/stories.md` não dependem mais de rollback para `legacy`; o gate aberto é a nova implantação isolada de um digest de imagem anterior. A confirmação do texto pelo proprietário e a entrada no Change Log da story continuam com a OPS-15.
- **S-09 — resolvido (docs):** badge, aviso e estado do README e o exemplo do VERSIONING indicam beta; `gh release list` não retornou nenhuma release (verificado em 2026-10-21), portanto "Beta (ainda sem release pública)" se mantém. `CHANGELOG_INTERNAL.md` tem uma entrada de 2026-10-21, no topo, com o estágio e o status das OPS-11/12/13/15 (a OPS-14 não tem entrada no índice; nada foi inventado), marcando como histórica a linha de 2026-10-11 sobre o plano da beta não agendado; a linha sobre a data da beta em `docs/stories.md` foi substituída.
- **S-10 — resolvido:** ROADMAP atualizado (2026-10-21), OPS-11..OPS-20 incluídas, FND-1/FND-9 corrigidas e a ordem delegada ao roteiro de conclusão.
- **S-15 — resolvido (docs):** rótulo do README em inglês corrigido; os rótulos de UI em negrito de `docs/USER_GUIDE-en_US.md` foram trocados pelos valores do catálogo inglês do painel (`apps/web/localization/catalogs/panel/en.tsv`), e o nome desatualizado da página "Operações financeiras" foi atualizado nos dois guias para o rótulo atual da navegação; o rótulo do controle de troca automática não está nos catálogos, então é descrito em vez de citado. O título do índice de stories não diz mais "estático". A paridade completa de conteúdo continua no escopo da DOC-3.
- **S-13 — aberto:** spec voltada à pessoa usuária; exige revisão do `aiox-ux-design-expert`.
- **S-03 — resolvido para os módulos (2026-10-21, @dev):** os 12 módulos importados pelo Next (`call-deadline-presentation`, `command-catalog-view`, `overlay-renderer`, `overlay-widget-form`, `panel-catalog`, `panel-navigation`, `queue-action-state`, `queue-confirmation-copy`, `queue-settings-version`, `queue-sync-status`, `reward-link-dialog`, `setup-messages`) foram movidos com `git mv` para `apps/shared/panel/` (decisão do proprietário: sem novo workspace). Next, testes, `apps/web/app.js` e `overlay.js` importam o novo caminho; o Fastify o serve ao painel vanilla no prefixo transitório `/shared/panel/` (`web-route.mjs`, removido junto com o painel vanilla). As 12 linhas `COPY apps/web/<módulo>` do Dockerfile saíram (`COPY apps/shared` as cobre); `tsconfig.web.json` e `lint:web` cobrem `apps/shared/panel`; a regra ESLint `no-restricted-imports` bloqueia `**/web/**` em `apps/frontend` e `apps/shared`. Protegido por `tests/unit/shared-panel-boundary.test.js` e `dockerfile-frontend-imports.test.js`. **Ainda aberto:** os catálogos continuam em `apps/web/localization/catalogs` (etapa C separada, decisão do proprietário).
- **S-12 — resolvido em parte (2026-10-21, @dev):** o filtro morto `/connection/:path*` foi removido de `next-runtime-config.mjs`; o teste agora fixa os rewrites de produção exatamente em `buildProductionProxyRules`. **Mantidos por decisão do proprietário:** os rewrites `/`, `/app.js`, `/styles.css` (cutover S-02 não autorizado) e os aliases `/overlay.html`. O destino do redirect `/callback` não foi alterado.
- **Complemento de S-03 (2026-10-21, @dev):** `tests/unit/web-route-vanilla-modules.test.js` percorre todos os imports estáticos de `apps/web/app.js` e `overlay.js` via `registerWebRoutes`; ele mostrou que `../shared/queue-call-message.mjs` (importado desde `5192286`) retornava 404 no Fastify, por isso `apps/shared/queue-call-message.mjs` também foi para `apps/shared/panel/`. Os erros de `typecheck:web` são pré-existentes: 59 em `HEAD` (worktree limpo) e 60 agora; o extra está em WIP não commitado (`queue-list.jsx:297`), não na movimentação; nenhum em `apps/shared/panel`. Não corrigidos (fora de escopo).
- **S-13 — resolvido (docs, 2026-10-22, decisões do proprietário):** `docs/front-end-spec.md` e seus shards (en + pt-BR) agora descrevem o painel Next.js 16 / React 19, os catálogos `en`/`es`/`pt-BR` com o `product_locale` versionado no servidor (painel e respostas de chat), a rota `/overlay` em bundle próprio, as áreas Comandos/Widgets/Configurações (Configurações = idioma do produto, que também define o idioma do chat, e preferências locais; qualquer novidade exige story própria) e a regra de segredos de uso único. A frase "framework CSS ou de componentes não é necessário" foi removida (não se afirma adoção de biblioteca). Conforme a ressalva do plano de UX, não se afirma que o overlay compartilha o idioma do produto (não verificado no código).
