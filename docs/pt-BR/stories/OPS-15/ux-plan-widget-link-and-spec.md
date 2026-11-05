# Plano de UX OPS-15: diálogo do link de uso único do widget e correções da especificação de front-end (S-13)

[English](../../../stories/OPS-15/ux-plan-widget-link-and-spec.md) · Revisora: `@ux-design-expert` (Uma) · Data: 2026-10-22 · Branch: `feat/ops-15-next-panel`

Somente planejamento. Nenhum código, especificação, catálogo ou issue foi alterado. Fontes lidas: `page-ux-review.md` (Widgets §8, X3), `flow-and-chat-review.md` (E2), `structural-review.md` (S-13), `docs/front-end-spec.md` + cópia pt-BR, `apps/frontend/features/widgets/widgets-page-content.jsx`, `widget-management.mjs`, `app/(panel)/widgets/page.jsx`, `apps/frontend/features/queues/queue-reward-resolution-dialog.jsx`, `apps/frontend/styles/panel.css`, `apps/web/localization/catalogs/panel/{en,es,pt-BR}.tsv`, `tests/unit/next-widgets-page.test.jsx`, `package.json`.

## Item 1 — Diálogo do link de overlay de uso único (defeito que causa perda)

### 1.1 Comportamento atual (evidência estática)

| # | Achado | Evidência |
|---|---|---|
| D1 | `onMouseDown` no backdrop `.widget-secret-backdrop` limpa `secret` — um clique errado destrói a única cópia. | bloco do diálogo do segredo em `widgets-page-content.jsx` |
| D2 | O handler global de `keydown` para Escape limpa `secret` primeiro (`if (secret) setSecret('')`). | effect no início de `WidgetsPageView` |
| D3 | O botão "Fechar" fecha na hora, mesmo sem nada copiado. | ações do diálogo |
| D4 | A chave `panel.widget.link.copied_once` é usada na abertura, mas **não existe em nenhum catálogo** (en/es/pt-BR); `panel.widget.link_lifetime_help` existe nos três e **não é usada**. | catálogos linha 232; componente linhas 172/188 |
| D5 | O foco inicial vai para o primeiro elemento focável na ordem do DOM = o input somente leitura da URL (seleciona o segredo); a ação principal não recebe foco. | `focusable()[0]?.focus()` |
| D6 | O retorno de foco usa o `document.activeElement` capturado quando o effect roda; após criar, o editor já foi desmontado, então o alvo é incerto (provavelmente `body`). Ao regenerar, o diálogo de confirmação e o do segredo coexistem por um instante. | effect + `saveWidget`/`runAction` |
| D7 | O aviso de abertura vai num `role="status"`, anunciado junto com o título; status e falha compartilham um elemento cujo role alterna `status`/`alert` (troca de role em nó existente não é anunciada de forma confiável). | `<p role=…>` do diálogo |
| D8 | A URL secreta completa fica visível em texto claro; uma streamer capturando a tela/navegador na live vazaria o link. | input readOnly `value={secret}` |
| D9 | `link.close_loses` diz "Se perdê-lo, gere outro", mas não diz que o link antigo deixa de funcionar; `link_lifetime_help` diz. | catálogos |
| D10 | Navegar/recarregar com o diálogo aberto perde o link sem aviso. | sem guarda de `beforeunload` |

Ponto positivo: o segredo não vira nó de texto, e o teste unitário existente verifica que ele sai do DOM ao fechar (`next-widgets-page.test.jsx` ~L133–153).

### 1.2 Comportamento-alvo

**Modelo de estado (somente estado local do componente):** `linkDialog = { url, origin: 'create' | 'regenerate' | 'generate', widgetId, copied: false, view: 'link' | 'confirm-close', revealed: false }`.

1. **Sem fechamento acidental.** Clique no backdrop: nada acontece. Escape (e qualquer pedido de fechamento do navegador): nunca fecha; se `copied === false`, muda para a vista `confirm-close`; se `copied === true`, fecha (igual a "Pronto").
2. **Caminho principal.** Botões na vista `link`: `Copiar link` (primário) e `Pronto, copiei o link` (secundário). Após gravação bem-sucedida na área de transferência, `copied = true` e `Pronto` fecha direto.
3. **Cópia manual é legítima.** Se a pessoa copiou selecionando o texto (API de clipboard negada/indisponível), `Pronto` com `copied === false` leva a `confirm-close` (um passo explícito a mais, não um bloqueio).
4. **Vista `confirm-close` (mesmo diálogo, troca de conteúdo, sem diálogo empilhado):** título "Fechar sem copiar o link?"; corpo diz que o link **não poderá ser exibido de novo** e que é possível gerar um novo link no card do widget, o que **invalida este**; botões `Voltar ao link` (foco padrão, secundário) e `Fechar mesmo assim` (perigo). Não há botão "regenerar" dentro do diálogo: o link atual ainda está na tela, e regenerar ali só destruiria um link válido. A oferta de regenerar vem após o fechamento: o foco vai para o botão `Gerar novo link`/`Regenerar` do card e um aviso da página explica. `[AUTO-DECISION] Oferecer regenerar na vista de confirmação? → Não; oferecer no card com retorno de foco (motivo: regenerar no diálogo invalida um link que a pessoa ainda pode copiar; a ação do card já existe com confirmação própria).`
5. **Mascarado por padrão (alternar visibilidade).** O campo mostra um placeholder fixo (`••••••••••••`, sem derivar do tamanho do segredo) com botão `Mostrar link`/`Ocultar link` (`aria-pressed`). Copiar funciona mascarado. A mensagem de cópia manual orienta a mostrar o link antes. Revelado, a URL real fica num input somente leitura (`spellcheck=false`, `autocomplete=off`, `dir="ltr"`, quebra de linha no celular). Motivo: D8 — streamers costumam capturar o navegador. **Decisão do proprietário O1** (mascarado vs. visível por padrão).
6. **Guarda de saída.** Com o diálogo aberto e `copied === false`, registrar `beforeunload` (prompt genérico do navegador; não admite texto próprio). Remover ao fechar/desmontar.
7. **`copied` é só de UI**: o estado do servidor nunca depende dele.

**Primitivo de diálogo — reutilizar o padrão das filas.** Usar `<dialog>` nativo + `showModal()` como em `queue-reward-resolution-dialog.jsx` (top layer, fundo `inert`, contenção de foco nativa, semântica `aria-modal`) no lugar do trap escrito à mão. Guardas necessárias, porque diálogos nativos atendem pedidos de fechamento do navegador:
- evento `cancel` → `preventDefault()` e seguir a regra 1. Pelas regras de close watcher do HTML, o Chromium pode pular o `cancel` cancelável quando não houve ativação da pessoa desde o último (Escape repetido); por isso tratar também o evento `close`: se disparar com `url` definida e sem ter sido iniciado pelo nosso código, chamar `showModal()` de novo já na vista `confirm-close`.
- Adicionar `closedby="none"` onde houver suporte (desativa light-dismiss e pedidos de fechamento); manter as guardas como caminho para todos os navegadores.
- Pesquisa/limitações: MDN `<dialog>` (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog), MDN `closedBy` (https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/closedBy), WHATWG close requests (https://html.spec.whatwg.org/multipage/interaction.html#close-requests), WAI-ARIA APG modal dialog (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), MDN Clipboard `writeText` (https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText). O suporte a `closedby` e o comportamento de Escape duplo **não foram verificados nos navegadores do projeto**; o E2E de navegador abaixo é o gate de evidência. Se o diálogo nativo com guardas falhar nesse E2E, voltar ao backdrop próprio atual com os handlers corrigidos (sem fechar por Escape/backdrop) e `inert` na raiz da página.

**Gestão de foco.**
- Foco inicial: botão `Copiar link` (não o input — evita selecionar/revelar o segredo). Em `confirm-close`: `Voltar ao link`.
- Trap: contenção do modal nativo; ordem de Tab: Mostrar/Ocultar → Copiar link → Pronto (campo, quando revelado, antes dos botões na ordem do DOM).
- Retorno de foco (explícito, não `activeElement`): `regenerate`/`generate` → botão de regenerar/gerar do card daquele widget (localizado por `data-widget-id` após atualizar a lista); `create` → botão `Editar` do novo card; fallback → botão `Criar widget` do cabeçalho. Após `Fechar mesmo assim`, voltar ao botão de regenerar do card.
- Fechar o `alertdialog` de regenerar **antes** de abrir o diálogo do link (sem modais coexistindo).

**Estratégia de live region (nunca anunciar o segredo).**
- `aria-labelledby` = título; `aria-describedby` = parágrafo `link_lifetime_help`, lido uma vez na abertura. Remover o aviso de status da abertura (corrige D4/D7).
- Um nó `role="status"` persistente e inicialmente vazio dentro do diálogo para `Link copiado.`; um nó `role="alert"` persistente e separado para falha de cópia. Texto fixo do catálogo — nunca a URL nem fragmentos.
- A URL nunca aparece em `aria-label`, `aria-describedby`, `title`, título do documento, toasts, avisos da página ou live regions. O placeholder mascarado é `aria-hidden`, com rótulo visualmente oculto "Link oculto".

**Não registrar nem persistir o segredo.** Sem `console.*`, sem payload de telemetria/relatório de erro, sem `localStorage`/`sessionStorage`/IndexedDB, sem estado em URL/query/hash/router, sem contexto React fora da view da página, sem atributo `data-*`. Limpar o estado ao fechar e ao desmontar. Caminhos de erro da API mantêm os avisos genéricos com `referenceId`. O fragmento da URL de capacidade não pode ir para analytics. Verificação estática: teste unitário garantindo que nenhuma chamada de `console` recebe o segredo e que APIs de storage não são tocadas.

**Celular 390×844.** Diálogo `width: min(560px, 100%)`, `max-height: calc(100dvh - 20px)`, rolagem interna; ações empilhadas na vertical, largura total, primária primeiro; botões com ≥ 44 px de altura (igual ao min-height 44px de `.reward-*-dialog`); URL revelada quebra linha (`overflow-wrap: anywhere`); o botão de visibilidade fica na linha do campo. Manter a regra existente `@media (max-width: 480px)` que alinha o backdrop ao topo.

**Resumo de teclado/TA.** Enter/Espaço acionam botões; Escape = regra 1; nenhuma armadilha de teclado além do modal; foco visível pelo outline `:focus-visible` existente (`var(--purple)`); estado comunicado por texto, não só por cor.

### 1.3 Rascunhos de texto (chaves novas/alteradas; nenhum `{placeholder}` necessário)

| Chave | en | es | pt-BR |
|---|---|---|---|
| `panel.widget.link.title` (manter) | Copy this link to OBS | Copia este enlace en OBS | Copie este link para o OBS |
| `panel.widget.link_lifetime_help` (passa a ser usada) | manter | manter | manter |
| `panel.widget.link.done` (nova) | Done, I copied the link | Listo, copié el enlace | Pronto, copiei o link |
| `panel.widget.link.show` (nova) | Show link | Mostrar enlace | Mostrar link |
| `panel.widget.link.hide` (nova) | Hide link | Ocultar enlace | Ocultar link |
| `panel.widget.link.hidden_label` (nova) | Link hidden | Enlace oculto | Link oculto |
| `panel.widget.link.copy_fallback` (alterar) | Couldn't copy automatically. Show the link, select it and copy it before closing — it won't be shown again. | No se pudo copiar automáticamente. Muestra el enlace, selecciónalo y cópialo antes de cerrar; no volverá a mostrarse. | Não foi possível copiar automaticamente. Mostre o link, selecione e copie antes de fechar — ele não será exibido de novo. |
| `panel.widget.link.confirm_close.title` (nova) | Close without copying the link? | ¿Cerrar sin copiar el enlace? | Fechar sem copiar o link? |
| `panel.widget.link.confirm_close.body` (nova) | This link can't be shown again. To use this widget later, generate a new link on its card — this link will then stop working. | Este enlace no se podrá mostrar de nuevo. Para usar el widget más tarde, genera un enlace nuevo en su tarjeta; este dejará de funcionar. | Este link não poderá ser exibido de novo. Para usar o widget depois, gere um novo link no card dele — este link deixará de funcionar. |
| `panel.widget.link.confirm_close.back` (nova) | Back to the link | Volver al enlace | Voltar ao link |
| `panel.widget.link.confirm_close.confirm` (nova) | Close anyway | Cerrar de todos modos | Fechar mesmo assim |
| `panel.widget.notice.link_closed_uncopied` (nova, aviso da página) | Link closed without copying. Use "Generate new link" on the widget card when you need it. | Enlace cerrado sin copiar. Usa "Generar enlace nuevo" en la tarjeta del widget cuando lo necesites. | Link fechado sem copiar. Use "Gerar novo link" no card do widget quando precisar. |
| `panel.widget.link.copied_once`, `panel.widget.link.close_loses` | remover (ausente / substituída) | | |

O rótulo citado em `link_closed_uncopied` deve coincidir, em cada idioma, com os rótulos reais de `panel.widget.action.regenerate`/`generate` no momento da implementação (verificação no validador de localização).

### 1.4 Testes

- **Unit/RTL (`tests/unit/next-widgets-page.test.jsx`, jsdom):** mousedown no backdrop mantém a URL; Escape com `copied=false` mostra `confirm-close` e a URL continua no estado; `Voltar ao link` restaura a vista com foco em `Copiar link`; `Fechar mesmo assim` remove a URL do DOM e mostra o aviso da página; cópia bem-sucedida (mock de `navigator.clipboard.writeText`) → status `Link copiado.` e `Pronto` fecha direto; cópia rejeitada → texto de alerta e `Pronto` leva à confirmação; mascarado por padrão — segredo ausente de `document.body.textContent` e de todos os atributos `aria-*`/`title`, presente só após `Mostrar link`; spies de `console.*` e `Storage.prototype.setItem` nunca chamados com o segredo; alvos de retorno de foco por origem; a confirmação de regenerar fecha antes de o diálogo do link abrir; listener de `beforeunload` só enquanto não copiado. O jsdom não implementa `<dialog>` por completo — fazer stub de `showModal/close` e disparar `cancel`/`close` manualmente; isso **não** é evidência de comportamento em navegador.
- **E2E só de navegador (`tests/e2e/widgets-link-dialog-browser-only.mjs`, Playwright, API/PostgreSQL descartáveis):** criar widget → diálogo; clicar nas coordenadas do backdrop, apertar Escape duas vezes rápido → diálogo continua aberto (cobre o close watcher); conceder permissão de clipboard → Copiar → ler clipboard igual à URL; negar permissão → alerta de fallback; viewport 390×844: sem rolagem horizontal, todas as ações visíveis/alcançáveis; recarregar sem ter copiado → evento de diálogo `beforeunload` disparado. Estende o fluxo E2 (criar → abrir URL do overlay → revogar).
- **TA manual (não automatizado):** NVDA + Firefox/Chrome, Orca + Firefox, VoiceOver iOS (390 px): título + ajuda de validade lidos na abertura; URL nunca anunciada, exceto ao focar o campo revelado; "Link copiado." anunciado uma vez; vista de confirmação anunciada ao apertar Escape; foco volta ao botão do card.
- Quality gates do `CLAUDE.md`, incluindo `npm run validate:localization` para as chaves novas.

## Item 2 — Correções S-13 da especificação de front-end

Fatos do código: `package.json` — `next 16.4.1`, `react 19.3.1`, sem biblioteca de componentes ou framework CSS de terceiros (estilos escritos à mão em `apps/frontend/styles/panel.css` e `overlay.css`). Rotas em `app/(panel)`: `/`, `/connection`, `/queues`, `/new-queue`, `/commands`, `/operations`, `/settings`, `/widgets`; em `app/(overlay)`: `/overlay` (alias `/overlay.html`). Catálogos: `apps/web/localization/catalogs/{panel,chat,setup,lifecycle,overlay}/{en,es,pt-BR}.tsv`. `panel-provider.jsx` usa `pt-BR` como padrão e `state.product_locale` `{ locale, revision }` vindo da API, persistido por `persist-product-locale.mjs`; datas/números usam `Intl.*Format(localeState.locale)`.

| # | Linha da spec | Problema | Tipo |
|---|---|---|---|
| C1 | :20 "Idioma do produto: pt-BR. Datas usam locale pt-BR…" | Contrariada: catálogos en/es/pt-BR, idioma do produto, `Intl` por locale. | Factual |
| C2 | :36 "Framework CSS ou de componentes não é necessário." | Ambígua/desatualizada: React + Next.js é o framework de UI; continua sem biblioteca de componentes/CSS. | Factual + **decisão do proprietário O2** (manter "sem biblioteca de componentes/CSS de terceiros" como regra?) |
| C3 | :7 "…não é um portal público para viewers nem overlay." | A mesma app Next agora hospeda a rota do overlay do OBS (bundle separado). O painel em si continua não sendo o overlay. | Factual |
| C4 | :9–16 a AI lista 6 áreas | Faltam Comandos, Widgets (gestão de links de overlay), Configurações; "Conta" ≠ página atual de Configurações. | Factual (inventário) — o conteúdo exato de Configurações precisa de confirmação do proprietário se mudar escopo |
| C5 | :32 "futura projeção de overlay" | O overlay existe (widgets + links de capacidade). | Factual |
| C6 | ausente | Nenhuma regra para segredos de uso único (links de widget). | Regra de produto — **decisão do proprietário O3** (incorporar a regra do Item 1 à spec) |

### Texto de substituição (en)

- :7 → "The streamer/operator uses the browser on the same computer to set up Twitch, inspect integration health, create and operate queues, manage chat commands and OBS widgets, resolve uncertain point operations, and review history. The panel is an authenticated operator surface; it is not a public viewer portal. The OBS overlay is served by the same Next.js application on a separate route and bundle (`/overlay`), authenticated by a per-widget capability link, and never exposes panel data or controls."
- AI → acrescentar: "**Commands:** chat command catalog and policies." · "**Widgets:** create, style, and preview overlay widgets; generate, regenerate, and revoke their one-time OBS links." · renomear o item 6 para "**Settings:** product language and account text labels with current/default values and reset behavior." (confirmar com o proprietário)
- :20 → "The interface is localized through message catalogs (`en`, `es`, `pt-BR`; default `pt-BR`). The product locale is a server-side setting (`product_locale`, versioned) shared by panel, chat replies, and overlay; dates and numbers use `Intl` with the active product locale. No user-facing string is hard-coded in components. Technical IDs and state keys stay English."
- :32 → "…Chat messages, calls, and the overlay projection each follow their separate toggles…"
- :36 → "The panel is a Next.js (App Router) application using React; styles are project CSS (`panel.css`, `overlay.css`) without a third-party CSS or component library. Overlay code must not import panel modules (bundle boundary)." — substitui só a última frase do parágrafo; o resto fica.
- Novo item (O3): "One-time secrets (widget OBS links) are shown once, masked by default, copied via a button with visible success/failure status, never announced, logged, or persisted, and their dialog cannot be dismissed accidentally; closing without copying requires explicit confirmation."

### Texto de substituição (pt-BR)

- :7 → "A streamer/operadora usa o navegador no mesmo computador para configurar a Twitch, inspecionar a saúde da integração, criar e operar filas, gerenciar comandos de chat e widgets do OBS, resolver operações de pontos incertas e consultar o histórico. O painel é uma área autenticada da operadora; não é um portal público para viewers. O overlay do OBS é servido pela mesma aplicação Next.js em rota e bundle separados (`/overlay`), autenticado por um link de capacidade por widget, e nunca expõe dados ou controles do painel."
- AI → "**Comandos:** catálogo e políticas de comandos de chat." · "**Widgets:** criar, estilizar e pré-visualizar widgets de overlay; gerar, regenerar e revogar os links de uso único para o OBS." · "**Configurações:** idioma do produto e rótulos de texto da conta com valor atual/padrão e restauração."
- :20 → "A interface é localizada por catálogos de mensagens (`en`, `es`, `pt-BR`; padrão `pt-BR`). O idioma do produto é uma configuração do servidor (`product_locale`, versionada) compartilhada por painel, respostas de chat e overlay; datas e números usam `Intl` com o idioma ativo. Nenhum texto voltado à pessoa usuária fica fixo nos componentes. IDs técnicos e chaves de estado permanecem em inglês."
- :32 → "…Mensagens de chat, chamadas e a projeção de overlay seguem seus toggles independentes…"
- :36 → "O painel é uma aplicação Next.js (App Router) com React; os estilos são CSS do projeto (`panel.css`, `overlay.css`), sem biblioteca de CSS ou de componentes de terceiros. O código do overlay não pode importar módulos do painel (fronteira de bundle)."
- Novo item (O3): "Segredos de uso único (links de widget para o OBS) são exibidos uma vez, mascarados por padrão, copiados por botão com status visível de sucesso/falha, nunca anunciados, registrados em log ou persistidos, e o diálogo não pode ser fechado por acidente; fechar sem copiar exige confirmação explícita."

Ressalva: confirmar com FND-8/OPS-14, no momento da edição, se respostas de chat e overlay realmente compartilham o idioma do produto (a paridade de idioma do chat está como CONCERNS em `flow-and-chat-review.md`); se não, remover "compartilhada por … respostas de chat e overlay".

## Decisões do proprietário

- **O1** Campo do link mascarado por padrão (recomendado) vs. visível.
- **O2** Manter "sem biblioteca de componentes/CSS de terceiros" como regra obrigatória.
- **O3** Incluir a regra de segredos de uso único na spec.
- **O4** Escopo do item Configurações na AI (C4).

## Nota (somente revisão estática de código/texto)

Primeira passada 8,4/10: faltava alvo de retorno de foco após criar, contradição de regenerar dentro do diálogo, nenhum risco de pedido de fechamento do navegador, nenhuma guarda de saída. Corrigido acima (§1.2 retorno de foco, AUTO-DECISION, guardas `cancel`/`close` + `closedby`, `beforeunload`). **Final: 9,2/10 — gate aprovado para este escopo.** NÃO coberto: revisão visual, comportamento em navegador real (close watcher, permissões de clipboard), OBS/CEF, testes com tecnologia assistiva, pesquisa com usuárias. Descontos restantes: suporte a `closedby`/Escape duplo não verificado; textos em es não revisados por falante nativo.
