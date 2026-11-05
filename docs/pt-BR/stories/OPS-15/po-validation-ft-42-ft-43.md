# TS-10, FT-42 (com a TS-12) e FT-43 — validação do `@po` (ondas 4 e 6 do cutover)

[English](../../../stories/OPS-15/po-validation-ft-42-ft-43.md)

**Validador:** `@po` (Pax) — **Data:** 2026-11-05 — **Modo:** YOLO (`[AUTO-DECISION]` marca escolhas autônomas)
**Fatias:** TS-10, FT-42 (carrega a TS-12) e FT-43 (linhas em [backlog-inventory.md](../../process/backlog-inventory.md)) da [OPS-15](story.md) — **Issue:** [#69](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/69) (a issue da OPS-15 existe; mesmo padrão das ondas irmãs).
**Fontes:** [cutover-plan.md](cutover-plan.md) (onda 4, onda 6, DP-3, DP-4, DP-5), [test-suite-audit-2026-10-23.md](test-suite-audit-2026-10-23.md) (classes B e C), [po-validation-ft-41.md](po-validation-ft-41.md), `.claude/rules/story-lifecycle.md` (10 pontos). Estado do código lido em `feat/ops-15-next-panel` no `ea1b1c4` mais o patch da FT-41 sem commit.

## Vereditos

| Fatia | Veredito | Nota | Mudança de status |
|---|---|---|---|
| **TS-10** (portar os contratos da classe B) | **GO** | **9,0/10** | não iniciado -> Ready |
| **FT-42 + TS-12** (remover o painel vanilla e os testes da classe C) | **GO** | **9,1/10** | não iniciado -> Ready |
| **FT-43** (limpeza final) | **GO** | **9,3/10** | não iniciado -> Ready |

"Ready" significa validado para planejamento; os gates da fatia continuam valendo (`@dev` test-first, um único gate do `@qa` no fim do cutover com nota >= 9,0, commits do `@devops`).

## Achados que mudam o plano (estado do código hoje)

1. **Os 8 casos de `web-route` da TS-12 já saíram.** `tests/unit/web-route.test.js` e `web-route-vanilla-modules.test.js` saíram na onda 1 (FT-38). A TS-12 agora cobre **5 arquivos da classe C**: `call-notification-actions`, `dom-localization`, `panel-error-presentation`, `vanilla-fulfillment-feedback`, `queue-onboarding-flow` (todos em `tests/unit/*.test.js`). O `priority-labels` saiu na onda 0.
2. **`panel-localization-contract.test.js` é maior do que a linha da auditoria sugere.** Cerca de 22 casos leem `apps/web/index.html`, `app.js` ou `styles.css`. Só dois estão nomeados como contratos não portados (anel de foco, empilhamento no celular). O `@dev` deve classificar cada caso (CA-TS10-7) antes de apagar ou reescrever o arquivo.
3. **A linha de base de 59 erros do `typecheck:web` está obsoleta.** Desde 2026-10-29 o `tsconfig.web.json` não inclui mais `apps/frontend/**/*.jsx` (a TS-16 devolve depois); portanto, após a remoção, o typecheck cobre só `apps/shared/panel`. A regra "59 não pode crescer" é substituída pelo CA-42-7.
4. **`API_ONLY` tem uma ocorrência restante** (`apps/frontend/scripts/dev-runtime-config.mjs:20`); o servidor não a lê mais. O `@fastify/static` não tem importador em `apps/` (só `package.json:57` e o lockfile).
5. **Outros testes já fixam o cutover:** `first-party-catalog-location.test.js` (sem `apps/web/localization`), `shared-panel-boundary.test.js:49,97`, `dockerfile-frontend-imports.test.js:81-87`, `orphan-module-contract.test.js:10` (guarda `apps/web`). São atualizados no CA-42-5.

## Checklist de 10 pontos

| # | Ponto | TS-10 | FT-42/TS-12 | FT-43 | Nota |
|---|---|---|---|---|---|
| 1 | Título | 1,0 | 1,0 | 1,0 | Nomeia escopo e onda. |
| 2 | Descrição | 0,9 | 1,0 | 1,0 | Plano de cutover ondas 4/6 + classes B/C da auditoria. |
| 3 | CAs testáveis | 0,8 | 0,8 | 0,9 | As linhas do inventário não tinham CAs numerados; CA-TS10-n, CA-42-n e CA-43-n abaixo (Given/When/Then). |
| 4 | Escopo IN/OUT | 0,9 | 0,9 | 1,0 | OUT em CA-TS10-8, CA-42-9, CA-43-5. |
| 5 | Dependências | 0,9 | 0,9 | 1,0 | Ver "Ordem e bloqueios". |
| 6 | Complexidade | 0,9 | 0,9 | 1,0 | Plano: portes 6-12 h `@dev` + 2-4 h de navegador; onda 4 3-5 h; onda 6 1-2 h. |
| 7 | Valor | 0,9 | 1,0 | 0,8 | Remove o último painel duplicado sem perder contratos; a onda 6 é higiene. |
| 8 | Riscos | 0,9 | 0,9 | 0,9 | Portes vazios (checagem de mutação), defeito do Next exposto por um porte (CA-TS10-9), renomeação do check de CI. |
| 9 | Definição de pronto | 0,9 | 0,9 | 0,9 | Gates comuns da seção 4 do plano mais os CAs. |
| 10 | Alinhamento | 1,0 | 1,0 | 1,0 | Rastreia para o plano ondas 4/6, DP-3/4/5, auditoria; sem invenção. |

Médias: TS-10 9,0, FT-42/TS-12 9,1, FT-43 9,3; nenhum ponto abaixo de 0,8.

## Ordem e bloqueios para o `@dev`

**Ordem de execução (um `@dev`, em série, Red antes de Green; o único gate do `@qa` fica no fim de todo o cutover):**
patch da FT-41 (pronto, sem commit) -> **TS-10** -> **FT-42/TS-12** -> **FT-43**. A TS-10 precisa estar verde e provada não vazia antes de qualquer arquivo ou teste vanilla ser apagado; a FT-43 só começa depois da FT-42.

**Bloqueios para iniciar a TS-10: nenhum.** A FT-41 toca só API/repositório/testes da rota archive (conjunto de escrita disjunto), então não bloqueia. FT-23, ST-15 e ST-16 gateiam a conclusão da OPS-15, não estas ondas (DP-0).
**Nada depende do proprietário para iniciar ou terminar o código.** Dois itens ficam fora do código e não bloqueiam o `@dev`: (a) o `@devops` deve verificar, antes de mesclar a branch, se o check de CI `app-quality (web)` é obrigatório no ruleset do repositório e atualizá-lo para a renomeação da DP-5 (configuração do GitHub, fora do diff; o CI não roda em push de branch hoje); (b) a OW-06 (tecnologia assistiva) continua sendo gate de Done da OPS-15.

## Outros agentes: o que realmente é necessário

| Agente | Necessário? | Quando | Por quê |
|---|---|---|---|
| `@ux-design-expert` | **Sim, só validação, após a implementação** (sem plano antes) | Junto do gate final, sobre as checagens de navegador da TS-10 | A DP-4 exige UX + `@qa` para anel de foco e layout no celular. A TS-10 adiciona testes de UI do Next que já existe e, por padrão, não muda UI; um plano antes não agrega valor. Escopo da nota (>= 9,0, restrita): anel de foco da navegação do painel, empilhamento das políticas de comando a 390 px, diálogos de configuração e de resolução de recompensa a 390 e 768 px, axe. **Se um porte expuser um defeito do Next e o `@dev` precisar mudar CSS/marcação (CA-TS10-9), é exigida uma nota curta de UX sobre essa mudança antes do gate**, não antes de começar. |
| `@architect` | **Não** | — | O plano já decide tudo: DP-3 (feita), DP-5 (renomear para `frontend`), guarda de import restrito mantida. A única escolha de desenho restante (escopo de `lint:frontend`/`tsconfig.frontend.json`) está fixada no CA-42-6. Chamar o `@architect` só se o `@dev` achar um defeito do Next que exija mudança estrutural. |
| `@data-engineer` | **Não (confirmado)** | — | Nenhuma mudança de schema, migration, consulta ou repositório na TS-10, FT-42 ou FT-43. |
| `@analyst` | **Não** | — | Trabalho interno ao repositório; nenhuma LACUNA de `docs/research-index.md` se aplica (cabeçalho do plano). |
| `@qa` | Sim, um gate no fim | Após a FT-43 | Deve registrar, por teste removido, o teste do Next que guarda o contrato (R5), e a checagem de mutação (CA-TS10-10). |

## Critérios de aceite — TS-10

Ordem para o `@dev`: escreva cada porte; um porte que passa de imediato é uma caracterização, então prove que não é vazio (CA-TS10-10); um porte que falha é um defeito real do Next (CA-TS10-9). Nenhum arquivo vanilla é tocado na TS-10.

- **CA-TS10-1 (confirmação falha fechada).** Dado o diálogo de confirmação de ciclo de vida/limpeza do Next (`queue-lifecycle-actions.jsx`, `queue-list.jsx`) em jsdom onde `showModal` não existe ou o diálogo já está aberto, quando a pessoa aciona uma ação destrutiva, então nenhuma requisição à API é enviada e a ação nunca roda sem um clique explícito de aceite. Contrato de origem: `panel-confirmation-contract.test.js` "fails closed when the dialog cannot be opened or is already open".
- **CA-TS10-2 (dupla confirmação).** Dada uma fila com sincronização de recompensa incerta, quando a pessoa escolhe a exclusão local, então `archive-local/challenge` é solicitado primeiro, `archive-local/confirm` só é enviado após um segundo aceite separado no diálogo final, e cancelar em qualquer etapa não envia mais nada. Origem: `panel-confirmation-contract.test.js` "requires two separate confirmations before deleting locally when reward sync is uncertain".
- **CA-TS10-3 (diálogos de recompensa, navegador).** Dado o Chromium em 390x844 e 768x900 (estender um script browser-only existente, como `queue-reward-settings-recovery-browser-only.mjs`), quando os diálogos de configuração e de resolução de recompensa estão abertos, então o diálogo cabe na viewport (rolagem interna, sem overflow horizontal), as ações ficam separadas por pelo menos 12 px e o texto do aviso tem pelo menos 14 px. Origem: `reward-dialog-contract.test.js` "gives the dialog responsive space and separates its actions".
- **CA-TS10-4 (saúde).** Dada a visão geral do Next em pt-BR, quando `twitch_api: 'not_configured'` e `twitch_api_ping_ms: null`, então nenhum ping numérico aparece ("Sem medição") e nenhum valor interno vaza; e quando `twitch_api: 'retrying'`, então o estado diz "Reconectando" e a gravidade geral é a de atenção, nem erro nem saudável. Origem: `health-status.test.js`, casos das linhas 26 e 42.
- **CA-TS10-5 (conexão, erro seguro).** Dada a página de conexão do Next e uma validação de credencial que falha com erro de backend cuja mensagem contém uma string parecida com segredo, quando o formulário é enviado, então o alerta visível é o texto seguro localizado e a mensagem bruta nunca aparece no DOM; o campo do segredo do cliente é limpo após a validação assíncrona. Origem: `web-application-setup.test.js` (2 casos).
- **CA-TS10-6 (fallback do seletor de idioma).** Dado um idioma persistido cujo catálogo está incompleto ou ausente, quando o seletor de idioma de Configurações é renderizado, então a opção selecionada é pt-BR; uma escolha em andamento é preservada ao atualizar os catálogos e o idioma persistido aparece quando não há escolha pendente. Origem: `locale-picker-state.test.js` (3 casos; os dois já cobertos são confirmados, não duplicados).
- **CA-TS10-7 (`panel-localization-contract`).** Dados os cerca de 22 casos que leem `apps/web/*`, quando o `@dev` os classifica, então uma tabela na story (ou na nota da onda) mapeia cada caso para (a) o teste do Next ou de catálogo que já o guarda, (b) um novo teste do Next, ou (c) "marcação só do vanilla, removido" com o motivo. Dois casos exigem prova em navegador (Chromium, axe, 390 px): o anel de foco visível do teclado nos controles de navegação do painel e as políticas de comando empilhadas em uma coluna em larguras estreitas. O caso de cobertura de catálogo ("covers every static text and accessible-label key") deve permanecer, reapontado para as fontes do Next/compartilhadas.
- **CA-TS10-8 (OUT).** Nenhuma mudança de código de produção, salvo o CA-TS10-9; nenhum arquivo vanilla editado ou removido; nenhuma dependência nova.
- **CA-TS10-9 (um porte expõe defeito do Next).** Dado um porte vermelho contra o Next, quando a causa é um comportamento ausente, então o `@dev` corrige com a menor mudança test-first e registra; mudança de UI visível exige a nota de UX acima; mudança que não seja pequena (componente novo, contrato de API) para e é relatada ao Orion antes de continuar. `[AUTO-DECISION]` sem decisão do proprietário (motivo: o contrato já era do produto; paridade é o objetivo).
- **CA-TS10-10 (não vacuidade).** Cada porte que passa na primeira execução é mostrado falhando uma vez após quebrar o comportamento em uma linha (checagem de mutação), registrado na nota da onda; o `@qa` repete em amostra.

## Critérios de aceite — FT-42 (carrega a TS-12)

Pré-requisito: todos os CA-TS10-n verdes.

- **CA-42-1 (Red).** Adicione primeiro o contrato: `apps/web` não existe, e nenhum arquivo em `apps/`, `tests/`, configuração ou CI referencia um caminho removido. Visto vermelho antes da exclusão.
- **CA-42-2 (remoção do painel).** Apague `apps/web/app.js`, `index.html`, `styles.css`, `application-setup.mjs`, `call-notification-actions.mjs`, `dom-localization.mjs`, `health-status.mjs`, `locale-picker-state.mjs`, `panel-confirmation.mjs`, `panel-error-presentation.mjs`, `queue-onboarding-flow.mjs`; o diretório `apps/web` deixa de existir. A `legacy` não é tocada.
- **CA-42-3 (testes da TS-12).** Apague os arquivos da classe C `call-notification-actions`, `dom-localization`, `panel-error-presentation`, `vanilla-fulfillment-feedback`, `queue-onboarding-flow` e os cinco arquivos da classe B `panel-confirmation-contract`, `reward-dialog-contract`, `health-status`, `web-application-setup`, `locale-picker-state` (testes só depois que os equivalentes CA-TS10 passarem), e remova ou reescreva `panel-localization-contract.test.js` conforme o CA-TS10-7. O `@dev` registra, por teste removido, o teste do Next ou o motivo da classe (R5).
- **CA-42-4 (os 8 casos de `web-route`).** Registrados como já entregues pela onda 1; confirmar por `git grep` que `web-route` não tem teste nem importador.
- **CA-42-5 (asserções acopladas, mesma mudança).** `shared-panel-boundary.test.js` e `dockerfile-frontend-imports.test.js` afirmam que `apps/web` não existe em vez de varrê-lo, e o caso duplicado "no apps/web import" é fundido (TS-04); `orphan-module-contract.test.js` deixa de guardar `apps/web`; `first-party-catalog-location.test.js`, `next-dev-proxy.test.js` e `compose-runtime.test.js` continuam passando sem referências ao vanilla.
- **CA-42-6 (renomear o job, DP-5).** Renomeie `lint:web`/`typecheck:web` para `lint:frontend`/`typecheck:frontend`, `tsconfig.web.json` para `tsconfig.frontend.json` (inclui `apps/shared/panel/**/*.mjs`; o JSX fica fora até a TS-16), a matriz de CI `[api, infra, frontend]` em `quality-gates.yml` e o `ci-workflow-contract.test.js` (alvo de lint `apps/shared/panel`). `eslint.config.js`: remova o glob `apps/web/**/*.js`, mantenha a regra de import restrito como guarda com mensagem reescrita. Atualize toda referência a scripts, docs ou workflows com os nomes antigos.
- **CA-42-7 (contagem do typecheck).** Registre o resultado do `typecheck:frontend` antes/depois; deve ficar verde (JSX excluído) e a contagem de erros não pode crescer. A linha de base "59" fica aposentada.
- **CA-42-8 (gates e E2E).** Os 15 E2E browser-only passam; `actionlint` no workflow; os gates comuns da seção 4 do plano.
- **CA-42-9 (OUT).** Nenhuma mudança em funcionalidades do Next, no overlay, em `apps/shared`, na API; nenhuma operação no GitHub; a migração para o Biome (FT-30) não começa aqui (a onda 4 vai primeiro); `unarchive`, arquivos da FT-41 e a TS-16 intocados.
- **CA-42-10 (docs, en + pt-BR).** Docs de arquitetura/desenvolvimento listados na seção 1.2 do plano (A-05, A-10) e "Docs" da onda 4 atualizados; as frases de `AGENTS.md`/`CLAUDE.md` sobre remover o painel vanilla viram histórico (redação revisada pelo Orion/`@po`); changelog interno en/pt-BR.

## Critérios de aceite — FT-43

Pré-requisito: FT-42 concluída (a onda 1 já está feita).

- **CA-43-1 (Red, flag).** Adicione em `tests/unit/next-dev-runtime-config.test.js` um teste de que o ambiente de runtime de desenvolvimento não contém `API_ONLY`; visto vermelho, depois remova a linha 20 de `dev-runtime-config.mjs` e as demais referências (`git grep` não acha nenhuma em código, scripts, Compose ou docs fora do histórico).
- **CA-43-2 (dependência).** Dado que `git grep "@fastify/static" apps tests` está vazio, quando ele é removido de `package.json` e `package-lock.json` (via `npm`), então `npm ls @fastify/static` fica vazio e o diff do lockfile contém só esse pacote (e dependências que ficarem sem uso por causa dele), revisado pelo `@qa`. Se houver outro importador, a dependência fica e o motivo é registrado.
- **CA-43-3 (redação).** Nenhum "removido com o painel vanilla" ou texto transitório equivalente permanece em comentários de código ou docs atuais (histórico em changelogs e qa-gates fechados pode ficar). Remova comentários obsoletos, como a nota S-03 em `ci-workflow-contract.test.js`.
- **CA-43-4 (fechamento da story).** O `@po` marca o CA 9 e o CA 15 como superados/fechados na story da OPS-15 (en + pt-BR) com linha no Change Log, depois que a FT-42 estiver incorporada; é ação do `@po`, não do `@dev`.
- **CA-43-5 (OUT e gates).** Nenhum shim de compatibilidade novo; nenhuma mudança de comportamento em runtime; gates comuns mais a prova de `npm ls`; rollback = revert.

## Arquivos tocados pelo `@po`

`docs/stories/OPS-15/po-validation-ft-42-ft-43.md` e a versão pt-BR; `docs/process/backlog-inventory.md` (+ pt-BR; linhas FT-42, FT-43, TS-10, TS-12); `docs/stories/OPS-15/story.md` (+ pt-BR; Change Log).
