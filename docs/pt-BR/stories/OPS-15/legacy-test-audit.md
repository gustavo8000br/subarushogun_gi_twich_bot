# OPS-15 — Auditoria de testes legados (vanilla) e revisões independentes, preliminar

[English](../../../stories/OPS-15/legacy-test-audit.md)

**Status:** Preliminar, 2026-10-21. Executada antes da paridade completa a pedido do proprietário, portanto **não** é o gate final: a classificação dos testes legados, a revisão de QA e a de arquitetura devem ser repetidas na migração completa. Classes: **1** contrato comportamental a preservar até existir teste Next equivalente; **2** asserção específica da implementação vanilla já coberta no Next; **3** obsoleto após a remoção.

## Revisões independentes (não são aceite final)

| Revisão | Veredito | Nota | Principais achados |
|---|---|---|---|
| `@qa` (Quinn) | CONCERNS | 5,5/10 (seria FAIL como gate final) | Lint, typecheck, 133 arquivos / 1.199 testes unitários, OpenGrep (149 arquivos / 0 achados) e localização passaram. Achados: células “Pending” antigas no inventário de rotas/ações contradizem os adendos fechados; evidência de browser de QRA-08/09/10 é só de fixtures interceptadas; INV-02/04/07/08/09 sem detalhe rota/ação; builds do AC 10 (`build:frontend`, `npm run build`, `docker compose config`) sem execução registrada neste ciclo; sem axe nem leitor de tela (baseline de UX 8,8/10); texto dos E2E afirmado só no catálogo `en`; mensagens `error` da API fixas em pt-BR (clientes precisam mapear `code`); ramos negativos em runtime (não compareceu, remover, conflitos de mover/prioridade, expiração por relógio) só com mocks de componente/rota; auditoria em lote do QRA-13 omite `actorId`; QRA-02 Channel Points não valida `callTimeoutMin`. |
| `@architect` (Aria) | CONCERNS | 7,5/10 | Sólido: Fastify segue como autoridade; destinos de proxy validados (loopback, porta explícita, sem credenciais); origem/CSRF; cabeçalhos da capability do overlay; runtime de produção com dois processos. Preocupações: **alta** — 13 imports relativos de `apps/frontend` para `apps/web/*.mjs` (inclusive o renderer do overlay) e caminho de catálogo baseado em `process.cwd()`; **média** — dev e produção diferem em `/`, e um segundo overlay vanilla ainda é servido pelo Fastify; **baixa** — restos de static export (`create-overlay-alias.mjs`, filtro `/connection/:path*` obsoleto). |

### Ordem recomendada para remover o painel vanilla (arquitetura)

1. Mover os módulos compartilhados e os catálogos para um pacote neutro (por exemplo `apps/shared/browser/`), resolvendo caminhos via `import.meta.url`.
2. Portar os testes de classe 1 sem equivalente Next (tabela abaixo).
3. Aposentar `POST /api/queues/:queueId/archive` (decisão do proprietário) com seu teste de rota e, se não usado, `repository.archiveQueue`; antes, confirmar que não é contrato público na documentação da superfície HTTP.
4. Remover as regras `/`, `/styles.css`, `/app.js`, o `registerWebRoutes` estático, os arquivos do overlay vanilla e os ativos do painel em `apps/web`.
5. Atualizar as asserções de `compose-runtime` e `next-dev-proxy` na mesma mudança. O rollback é reverter essa mudança; os dados não são afetados.

## Classificação dos testes ligados ao vanilla

| Arquivo | Classe | Equivalente Next | Observação |
|---|---|---|---|
| `tests/integration/panel-localization-contract.test.js` | 1 (misto 1/2) | parcial: catálogos do painel, placeholders, seletor de idioma, página de conexão, plural em operações | Sem equivalente automatizado para o anel de foco visível, empilhamento mobile das políticas de comando e textos de estado vazio de fila/financeiro. Manter os testes de catálogo e reapontá-los. |
| `tests/unit/panel-confirmation-contract.test.js` | 1 (misto) | testes de lista/ciclo de vida de fila; `queue-lifecycle-browser-only` | Portar: diálogo falha fechado quando não abre ou já está aberto; sem `confirm()` nativo; remoção dos textos de ocultar/arquivar dos catálogos. |
| `tests/unit/reward-dialog-contract.test.js` | 1 | nenhum | Portar: botão de fechar deve ser `type="button"`; espaço responsivo do diálogo. |
| `tests/unit/vanilla-fulfillment-feedback.test.js` | 3 após remoção | testes de cumprimento pendente em `next-queue-entry-actions` | Coberto. |
| `tests/unit/web-route.test.js` | misto | shell, ações de entrada, formulário de configurações, lista de fila, seletor de idioma | Manter os casos de modo API-only e de ESM compartilhado (classe 1); os casos que servem `/`, `/app.js`, `/styles.css` caem com o vanilla. |
| `tests/unit/web-application-setup.test.js` | 2 | `next-connection-page` | Antes de apagar, confirmar que o Next nunca mostra a mensagem bruta da Twitch quando a validação de credenciais falha. |
| `tests/unit/panel-error-presentation.test.js` | 2 | testes de erro da página de operações e das ações de entrada | Coberto. |
| `tests/unit/call-deadline-presentation.test.js` | **1** | **nenhum** | Lacuna de paridade: não iniciar a contagem antes da confirmação da Twitch e marcar expirado sem inventar não comparecimento. |
| `tests/unit/call-notification-actions.test.js` | 2 | testes de reenvio em ações de entrada; `queue-call-resend-browser-only` | Coberto. |
| `tests/unit/dom-localization.test.js` | 3 | catálogos do painel | Tradução via DOM é exclusiva do vanilla. |
| `tests/unit/health-status.test.js` | 2 | testes do painel de visão geral | Verificar no Next “não inventa ping” e “reconexão automática como tentando de novo”; se faltarem, viram classe 1. |
| `tests/unit/locale-picker-state.test.js` | 2 | `next-locale-picker` | O fallback para pt-BR com catálogo incompleto não é explícito no Next. |
| `tests/unit/priority-labels.test.js` | 2 | teste de prioridade da lista de fila | Garantir que o Next não reflita dados arbitrários. |
| `tests/unit/queue-onboarding-flow.test.js` | 1 | parcial | “Abrir configurações após criar, sem ativar” e “ativar só depois de sincronizar” não têm teste Next explícito. |
| `tests/integration/compose-runtime.test.js` (caso em `:372`) | 2 temporário | — | Afirma que `/` é vanilla; inverter no cutover. |
| `tests/unit/next-dev-proxy.test.js` (`:32-39`) | 2 temporário | — | Fixa as regras de produção `/`, `/styles.css`, `/app.js`; atualizar no cutover. |

**Lacunas de classe 1 que bloqueiam a remoção:** contagem do prazo de chamada; onboarding pós-criação; diálogo que falha fechado e sem `confirm()` nativo; botão de fechar do diálogo de recompensa; anel de foco e layout mobile das políticas de comando.

## Próximas ações (não feitas neste ciclo)

Reconciliar o inventário (separar “contrato de UI com fixture” de “stack real”); detalhar INV-02/04/07/08/09 por rota/ação; rodar `build:frontend`, `npm run build`, `docker compose config`, axe e renderização `es`/`pt-BR` no browser; corrigir ou registrar formalmente `actorId` do QRA-13 e `callTimeoutMin` do QRA-02; portar os testes de classe 1; depois repetir a auditoria e as duas revisões na migração completa.


## Fechamento de lacunas de classe 1 — 2026-10-21

- **Linha de prazo da chamada** (`apps/frontend/features/queues/call-deadline.jsx`, ligada em `queue-list.jsx`, estilos em `panel.css`): reaproveita `getCallDeadlinePresentation`; vazia no servidor e na primeira pintura (sem divergência de hidratação), só passa a contar depois da entrega confirmada pela Twitch (`callNotifiedAt`), para ao expirar, a expiração só troca o texto (sem transição de no-show), texto simples sem região viva. Revisão UX com escopo **9,0/10** (somente código/texto; sem validação visual, em navegador ou com tecnologia assistiva). O anúncio de expiração sugerido na revisão **não** foi adicionado: o vanilla não tem, então depende de aprovação do proprietário. Testes: `tests/unit/next-call-deadline.test.jsx` (7) e um caso em `next-queue-list`.
- **Anúncio de expiração (aprovado pelo proprietário em 2026-10-21, acréscimo à paridade com o vanilla):** `CallDeadline` informa a expiração uma única vez via `onExpire`, só quando esta montagem acompanhou o fim da contagem (entrada já expirada ao chegar fica em silêncio); `QueueList` mantém uma única região `role="status"` visualmente oculta (`.call-deadline-announcement`), nunca uma por entrada, com a nova chave `panel.entry.call.expired_announcement` (`{user}`, en/es/pt-BR, as duas allowlists). Testes em `next-call-deadline.test.jsx` e `next-queue-onboarding.test.jsx`. Ainda precisa de validação com leitor de tela real (NVDA/VoiceOver); a nota 9,0 cobre só a revisão estática.
- **Orientação pós-salvamento** (`getQueueSettingsFeedback` em `queue-settings.mjs`, provider, `queue-list.jsx`, `queue-settings-form.jsx`): depois de salvar uma fila fechada, a orientação segue a mesma regra que habilita o botão de ativar (`getQueueActionState().canToggleIntake`, não o predicado legado): `activate_next` e foco no botão habilitado; `activate_waiting` só enquanto a sincronização da recompensa está pendente; senão a mensagem genérica de salvo; falha ao atualizar tem precedência. `reward_pending`/`reward_diverged` aparecem como aviso estático no formulário de configurações (como no diálogo vanilla). Nunca ativa sozinho. Revisão UX com escopo **9,2/10** (somente estática; primeira passada 8,5, elevada após três decisões registradas). Desvio aprovado pelo proprietário (2026-10-21): `create_failed` não está no conjunto “aguardando”; mostra a mensagem genérica de salvo, e o aviso do formulário usa a nova chave `panel.queue.onboarding.reward_failed` (“a Twitch não conseguiu criar a recompensa”) em vez de prometer uma confirmação.test.js`, `next-queue-onboarding.test.jsx`.
- **Contratos de classe 1 portados** (`tests/unit/next-panel-class1-parity.test.js`): nenhum `confirm()` nativo em `apps/frontend/features`, fechar/cancelar dos diálogos de recompensa são `type="button"`, sem texto de ocultar/arquivar nos catálogos.
- **Ainda aberto da lista de classe 1:** anel de foco visível e empilhamento mobile das políticas de comando (precisa de validação no navegador).
