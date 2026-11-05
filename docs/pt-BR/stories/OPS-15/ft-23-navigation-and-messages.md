# OPS-15 / FT-23 — Navegação e mensagens depois de criar ou excluir uma fila (D-3/D-4)

[English](../../../stories/OPS-15/ft-23-navigation-and-messages.md)

**Status:** InReview (Em revisão; o `@dev` concluiu o ponto de controle CP-4 em 2026-11-04; antes Ready, GO do `@po` 9,1/10, 2026-11-04, issue #103). O gate único do `@qa` do ciclo OPS-22 é o próximo passo; as condições da "Definição de pronto" valem ali.
**Tipo:** fatia da OPS-15 (painel Next, voltada à pessoa usuária). Linha FT-23 do [inventário do backlog](../../process/backlog-inventory.md).
**Issue:** [#103](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/103), sub-issue da [#69](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/69) (OPS-15). A [story](story.md) da OPS-15 continua sendo a mãe; este arquivo guarda só a fatia.
**Ciclo:** viaja no ciclo único da OPS-22 (FT-25 #98 + FT-26 #99 + FT-36 #100), como checkpoint CP-4, depois que a FT-36 estiver verde (proprietário, 2026-10-30; [parecer do arquiteto](../OPS-22/architect-review-ft36.md), seção 3). Mantém card e issue próprios.
**Fontes:** decisões do proprietário de 2026-10-27 (defeitos D-3 e D-4 da [bateria ao vivo](live-battery-2026-10-26-results.md)); fatia S-D da [revisão de arquitetura dos defeitos do painel](panel-defects-architecture-review.md); decisão D-23-1 do [parecer do `@architect` sobre a FT-36](../OPS-22/architect-review-ft36.md) (seção 4) e a revalidação do `@po` de 2026-10-30 ([po-validation](../OPS-22/po-validation.md)). Nenhum requisito abaixo é novo: cada um vem dessas fontes.

## História

Como streamer que usa o painel Next,
quero que o painel me leve à página certa e diga com clareza o que aconteceu depois que eu crio ou excluo uma fila,
para nunca perder a mensagem de resultado quando a página muda e nunca ler "sucesso" enquanto a Twitch não confirmou a mudança.

## Contexto

Defeito D-3: depois de excluir uma fila, o aviso fica no estado local do card (`queue-lifecycle-actions.jsx`) e some quando o card é desmontado. Defeito D-4: criar uma fila não leva à fila criada. O `PanelProvider` é montado por página e a navegação usa links comuns; portanto ainda não existe um provedor compartilhado (isso é a FT-28, OPS-23).

A decisão D-23-1 do `@architect` **desacopla a FT-23 da FT-28**: a FT-23 entrega agora com o provedor por página existente, e a FT-28 depois troca uma única função de navegação. A dependência do inventário "FT-23 -> FT-28" passa a ser **branda**.

## Desenho (do `@architect`, não decidido aqui)

1. **Resultados na mesma página** (excluir, com os estados excluída / exclusão pendente / exclusão bloqueada, e cancelar exclusão, todos em `/queues`): a mensagem sai do estado do card e vai para um `panelOutcome` no nível da página, no `PanelProvider` existente. O `PanelShell` o renderiza uma única vez em uma região persistente `role="status"` (`role="alert"` para erros).
2. **Resultados entre páginas** (criar: `/new-queue` para `/queues`; excluir a última fila: `/queues` para `/new-queue`): a mensagem viaja na URL como um **código de lista fixa** mais o **UUID da fila**. A página de destino lê `window.location.search` em um efeito, valida o código contra a lista e o UUID contra um padrão de UUID, define o `panelOutcome`, move o foco e remove os dois parâmetros com `history.replaceState`.
3. **Uma única função de navegação** `navigateTo(href)`. Hoje ela chama `window.location.assign(href)` (carga completa do documento, como o painel já faz com links comuns). A FT-28 depois troca só o corpo dela pelo router do Next.
4. **Função pura** `resolvePostActionRoute(outcome, projection)` devolve `{ href, focusId, outcome }` ou `null`, com teste unitário.
5. **Nenhum hook de navegação do Next** (`useSearchParams`, `useRouter`) é usado: não há nota de pesquisa sobre eles (lacuna adiada para o gate de planejamento da FT-28).

A linha do inventário usava a forma `/queues?queue=<id>` para criar; o desenho do arquiteto acima (`?outcome=<código>&queue=<uuid>`) a substitui.

## Critérios de aceite

Cada critério é testável. Os textos visíveis exatos, os nomes dos membros da lista de códigos e os alvos de foco vêm do plano de UX compartilhado; esta story fixa o comportamento, não a redação.

1. **Região de resultado persistente.** Dado um excluir ou cancelar exclusão em `/queues`, quando a ação retorna, então a mensagem aparece em uma região persistente de resultado renderizada pelo `PanelShell` e continua visível depois que o card da fila é desmontado. A região é **um contêiner que existe uma vez por página e guarda dois elementos vivos sempre montados, mesmo vazios**: um com `role="status"` para resultados de sucesso e pendentes, e outro com `role="alert"` para recusas e erros. O `role` de um elemento que já tem texto nunca é trocado (a troca de `role` em elemento já preenchido não é anunciada de forma confiável); a mensagem é escrita no elemento que corresponde ao seu tipo. Os dois elementos estão presentes antes de qualquer mensagem ser definida, e a mensagem só sai por um novo resultado, uma dispensa ou uma troca de página. (Redação refinada pelo `@po` em 2026-11-04 para aceitar o requisito R4 do plano de UX; o critério "uma região `role="status"`" é cumprido por esse contêiner.)
2. **Criar leva à fila criada.** Dado que uma fila é criada em `/new-queue`, quando a API confirma a criação, então o painel navega para `/queues`, a fila criada é identificável pelo UUID, o foco vai para o título dessa fila (alternativa: o `h1` da página quando a fila não está na página) e a mensagem de status **não** promete que a Twitch teve sucesso.
3. **Excluir mostra o estado real.** Dado um excluir, quando o resultado é `deleted`, a mensagem diz que foi excluída; quando é `pending`, a mensagem diz "exclusão pendente" (nunca uma redação de sucesso); quando é `blocked`, a mensagem diz que está bloqueada e leva a Operações. Os três estados são os da AC 15 da OPS-22.
4. **Excluir a última fila.** Dado um excluir que não deixa nenhuma fila, quando termina, então o painel navega para `/new-queue` e mostra a mensagem de resultado ali. Dado um excluir que deixa ao menos uma fila, o painel fica em (ou volta para) `/queues` com a mensagem persistente.
5. **Cancelar exclusão usa o mesmo canal.** Dado um cancelamento de exclusão pendente ou bloqueada (FT-36), então a mensagem de sucesso e cada mensagem de recusa usam a mesma região persistente, com uma mensagem por `code`/`reason` do contrato da FT-36, vinda do plano de UX compartilhado.
6. **Contrato da URL.** Os únicos dados na URL são um código de resultado de uma lista fechada e um UUID de fila. Um código desconhecido ou um UUID malformado é **ignorado** (sem mensagem, sem erro exibido, nunca refletido na página). Depois de aplicar um resultado válido, os dois parâmetros são removidos com `history.replaceState`, então recarregar a página não repete a mensagem. A API e os logs nunca recebem os parâmetros.
7. **Ponto único de navegação.** Toda navegação pós-ação passa por `navigateTo(href)`; nenhum componente chama `window.location` diretamente para isso. O comportamento é carga completa do documento até a FT-28.
8. **Função de rota pura.** `resolvePostActionRoute` não tem efeitos colaterais e cobre: criar, excluída, pendente, bloqueada, resultados de cancelamento, exclusão da última fila (para `/new-queue`) e um resultado desconhecido (devolve `null`).
9. **Pendente não é ao vivo.** A passagem de "exclusão pendente" para "excluída" ou "bloqueada" aparece na **próxima carga da projeção** (carga da página ou o refresh existente), não ao vivo. A atualização ao vivo e a navegação sem recarregar o documento ficam com a OPS-23 (FT-28/FT-29).
10. **Localização.** Nenhum texto visível novo existe sem entradas nos catálogos en, es e pt-BR em `apps/shared/localization/catalogs/`; `npm run validate:localization` passa com as chaves novas.
11. **Acessibilidade.** A região é anunciada de forma educada (`status`) ou assertiva (`alert`) conforme definido, o foco depois da navegação cai no elemento do critério 2 ou no `h1`, e o plano registra o que foi checado por revisão estática e o que foi checado em navegador real ou tecnologia assistiva (não são a mesma evidência).
12. **Sem regressão dos fluxos de excluir e cancelar** da OPS-22: o contrato da API, a auditoria e os estados não mudam; a FT-23 só muda onde o resultado é mostrado e para onde o painel navega.

## Escopo

**DENTRO:** `panelOutcome` no provedor existente; a região persistente no `PanelShell`; o parser do resultado na URL; `resolvePostActionRoute`; `navigateTo`; tratamento de foco; as chaves de catálogo (en/es/pt-BR) das mensagens; os testes abaixo.
**FORA:** o provedor compartilhado no layout e a navegação por `<Link>` (FT-28); a atualização ao vivo de pendente para excluída e o SSE (FT-27, FT-29); qualquer mudança de API, schema ou worker; os estados e o mecanismo de cancelamento da OPS-22 em si (FT-25/FT-36); texto visível não aprovado no plano de UX.

Conjunto de escrita esperado (do arquiteto): `panel-provider.jsx`, `panel-shell.jsx`, `new-queue-form.jsx`, `queue-lifecycle-actions.jsx`, `queue-list.jsx`, um novo `post-action-route.mjs` e os três catálogos. A FT-23 vem **antes** da FT-28 (mesmos arquivos); a FT-28 reaplica sobre ela e troca o ponto de navegação; os contratos de `panelOutcome` e da URL passam sem mudança.

## Dependências e gates

| Gate | Responsável | Estado |
| --- | --- | --- |
| Plano de UX único da FT-23 + FT-36 (mensagens, região viva, foco, texto de confirmação), nota **>= 9,0**, registrado na story | `@ux-design-expert` | **PLANO ENTREGUE 2026-11-04: 9,1/10, apenas revisão estática** ([ux-plan-ft23-ft36.md](../OPS-22/ux-plan-ft23-ft36.md)). Escopo revisado: texto, estrutura e leitura de código/catálogo. Validação visual, em navegador real e com tecnologia assistiva **NÃO feita** e não implícita na nota. As condições R1-R8 do plano valem para a implementação; o `@po` reconhece o R4 (redação dos CAs 1 e 11). |
| Plano de testes do `@qa` (as classes de teste desta story, incluindo a prova por mutação) | `@qa` | **FECHADO 2026-11-04** ([qa-test-plan.md](../OPS-22/qa-test-plan.md): plano único do pacote, FT-23 = G4, testes U23/K23/L23/C23/E23 com 3 execuções no Chromium) |
| Validação do `@po` (Draft -> Ready) | `@po` | **FECHADO 2026-11-04: GO 9,1/10** ([po-validation](../OPS-22/po-validation.md), adendo de 2026-11-04) |
| FT-36 verde (CP-3) | `@dev` | Exigido antes do CP-4 |
| Issue | `@devops` | Existe: [#103](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/103) |
| FT-28 (provedor compartilhado) | OPS-23 | **Branda**: não é exigida; a FT-28 troca o ponto de navegação depois |
| Estados de exclusão da FT-26 | OPS-22 | Fundida na FT-25 (ciclo único); a projeção `deletionState`/`blockReason` é necessária para o critério 3 |

Se o plano de UX atrasar, vale a alternativa do arquiteto: as fatias de API e worker podem receber o gate do `@qa` sem a FT-23, que então segue na janela seguinte (divisão de gate que exige decisão do orquestrador).

## Testes por classe

Red primeiro. As classes de evidência ficam separadas; nenhuma substitui outra.

| Classe | O que prova |
| --- | --- |
| Unitário (Vitest) | `resolvePostActionRoute` para cada resultado e para a última fila; o parser da URL (lista fechada de códigos, padrão de UUID, valor desconhecido ignorado, parâmetros removidos); `navigateTo` é o único chamador. |
| Componente (Vitest + DOM) | A região `role="status"`/`role="alert"` é renderizada uma vez pelo `PanelShell`, existe antes da mensagem e mantém a mensagem depois que um card é desmontado; alvo de foco e alternativa. |
| Localização | `npm run validate:localization` e os testes de paridade passam para as chaves novas em en, es e pt-BR. |
| E2E só de navegador (Chromium, fixtures, sem Twitch), apenas com texto aprovado | criar e ir a `/queues` com foco e status que não promete; excluir com o status persistente; excluir a última fila e ir a `/new-queue` com a mensagem; exclusão pendente e bloqueada (com o link para Operações); mensagens de cancelar exclusão; recarregar depois de chegar não repete a mensagem. |
| Prova por mutação (`@qa`) | Renderizar o parâmetro `outcome` cru: o teste unitário do parser deve falhar (depois reverter). |
| Não coberto aqui | Twitch ao vivo (AC 19 da OPS-22, OW-16), PostgreSQL e Compose (sem mudança de API, schema ou proxy), OBS/CEF nativo, tecnologia assistiva, salvo validação separada registrada. |

## Riscos

- **Recarga completa até a FT-28.** A página recarrega ao navegar; a passagem de pendente para excluída não é ao vivo até a OPS-23 (critério 9).
- **Injeção pela URL.** Refletir um parâmetro livre seria risco de XSS ou falsificação; mitigado pela lista fechada, pelo padrão de UUID e por "desconhecido é ignorado" (critério 6), provado pelo teste de mutação.
- **Redação enganosa de sucesso** enquanto a Twitch não confirmou (risco financeiro e de confiança); mitigado pelos critérios 2 e 3 e pelo plano de UX.
- **Colisão de conjunto de escrita com a FT-28** (mesmos arquivos); mitigada pela ordem FT-23 e depois FT-28 e pela estabilidade dos contratos.
- **API de navegação do Next sem pesquisa.** Evitada de propósito; só vira lacuna real quando a FT-28 trocar o ponto de navegação, e então o `@analyst` confere a documentação oficial do Next 16 antes desse gate de planejamento.
- **As entradas não são restauradas depois de uma exclusão cancelada** (I3 da OPS-22): o texto de confirmação precisa dizer isso; pertence ao plano de UX compartilhado.

## Definição de pronto

Critérios 1-12 atendidos com as classes de evidência acima; as condições de UX abaixo passam no gate do `@qa`; plano de UX >= 9,0 registrado; veredito do `@qa` emitido com nota; `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` e `npm run review:static` verdes; checklist e lista de arquivos da story atualizados; en e pt-BR em paridade.

### Condições de UX do plano (condições do gate do `@qa`, `@po` 2026-11-04)

A nota 9,1/10 de [ux-plan-ft23-ft36.md](../OPS-22/ux-plan-ft23-ft36.md) (seção 8) só vale se **R1, R2, R3, R5 e R6 passarem no gate do `@qa`**; R4, R7 e R8 também são checados ali. Nenhum CA acima muda; são condições sobre como eles são cumpridos.

- **R1 (textos por tipo de fila):** as mensagens de exclusão de filas de Pontos do Canal nunca dizem que a reward "continua pausada" ou "intacta"; usam-se as chaves de catálogo específicas por tipo do plano, no lugar das genéricas `panel.queue.delete.done` / `.pending`.
- **R2 (botão vindo do servidor):** a ação "Cancelar exclusão" aparece a partir dos campos do servidor `canCancelDeletion` e `cancellationInProgress`, não da heurística de `remoteSyncStatus`.
- **R3 (foco):** `tabindex="-1"` no título da fila e nos dois `h1` de página, para que os alvos de foco dos critérios 2 e 11 possam receber foco.
- **R4 (região):** o contêiner com dois elementos vivos sempre montados (`status` e `alert`) descrito no critério 1.
- **R5 (diálogo específico):** excluir e cancelar exclusão usam um diálogo com título específico e os botões "Voltar" e o verbo da ação ("Cancelar exclusão" no segundo), sem dupla negação; o diálogo genérico "Confirmar ação" não é usado.
- **R6 (já excluída):** o resultado `already_deleted` é mapeado pelo código 409 `QUEUE_DELETION_ALREADY_COMPLETED` (o ramo 200 é morto, segundo o arquiteto).
- **R7 (plural):** contagens de entradas e de operações bloqueadas usam formas de plural do catálogo nos três idiomas.
- **R8 (legibilidade):** o texto da região de resultado tem pelo menos 14 px e razão de contraste de pelo menos 4,5:1, **medida** (não presumida) antes de a UI sair.

**Limite da evidência (inalterado):** a nota 9,1 é revisão estática. Validação visual, em navegador real, de leitura humana e com tecnologia assistiva **NÃO foi feita**; continua sendo ação do proprietário (A-05) e nenhum gate desta story a afirma.

## Lista de arquivos

Ponto de controle CP-4, `@dev` 2026-11-04 (patch cumulativo `.local/ops22/cp-4.patch`, só da fatia `.local/ops22/cp-4-ft23-only.patch`):

- `apps/frontend/features/panel-shell/post-action-route.mjs` (novo): `OUTCOME_CODES` (lista fechada de 8), `resolvePostActionRoute`, `getOutcomeFromCode`, `navigateTo` (a única costura de navegação)
- `apps/frontend/features/panel-shell/outcome-url.mjs` (novo): `readOutcomeFromLocation` (lista fechada + UUID, sempre remove os dois parâmetros com `history.replaceState`)
- `apps/frontend/features/panel-shell/outcome-region.jsx` (novo): um contêiner, dois elementos vivos sempre montados (`status`, `alert`), controles fora deles
- `apps/frontend/features/panel-shell/panel-provider.jsx`, `panel-shell.jsx`: `panelOutcome`, efeito de chegada pela URL, pedido de foco, `reportQueueOutcome`, `dismissPanelOutcome`, `refreshFromOutcome`, navegação após criação confirmada; a região é o primeiro filho de `<main>`
- `apps/frontend/features/queues/queue-lifecycle.mjs`: `getQueueLifecycleOutcome` (mapeador puro), `getQueueDeletionView` (R2), os três códigos 409 da FT-36, feedback de falha da exclusão
- `apps/frontend/features/queues/queue-lifecycle-actions.jsx`: diálogo específico (R5), contagens no plural (R7), linhas do cartão (verificando, bloqueada), resultados por `onOutcome`
- `apps/frontend/features/queues/queue-list.jsx`, `queues-page-content.jsx`, `new-queue-page-content.jsx`, `new-queue-form.jsx`: `tabindex="-1"` no título da fila e nos dois `h1` (R3), ligação do `onOutcome`, criação incerta no elemento `alert`, formulário travado durante a navegação
- `apps/frontend/features/operations/operations-page-content.jsx`: exibe `attempts_exhausted`, `blocks_deletion` (título da fila vindo da projeção) e `manual_contradicted` (E23-08)
- `apps/frontend/styles/panel.css`: `.outcome-*`, `.queue-deletion-line`, `scroll-margin-top` nos alvos de foco (texto de 15 px, sem animação)
- `apps/shared/localization/catalogs/panel/{en,es,pt-BR}.tsv`, `apps/shared/panel/panel-catalog.mjs`, `apps/shared/localization/discover-catalog-module.mjs`: textos das seções 4.1 e 4.2 do plano de UX, `{title}` e `{count}` registrados
- `apps/web/app.js` (painel legado, um ponto de chamada): a confirmação da exclusão usa as formas de plural para não quebrar
- `package.json`: script `test:e2e:queue-outcome:browser-only`
- Testes (novos): `tests/unit/post-action-route.test.js`, `next-outcome-url.test.js`, `next-outcome-region.test.jsx`, `next-outcome-catalogs.test.js`, `next-outcome-css-contract.test.js`, `tests/e2e/queue-outcome-browser-only.mjs`
- Testes (estendidos ou adaptados): `tests/unit/next-queue-lifecycle.test.js`, `next-queue-lifecycle-actions.test.jsx`, `next-operations-page.test.jsx`, `next-queue-creation-form.test.js`, `next-queue-list.test.js`, `panel-confirmation-contract.test.js`, `next-locale-picker.test.jsx`, `next-overview-panel.test.jsx`, `tests/e2e/queue-lifecycle-browser-only.mjs`, `queue-creation-accepted-browser-only.mjs`, `queue-creation-uncertain-browser-only.mjs`, `tests/integration/compose-runtime.test.js`
- `CHANGELOG-beta.md`, `docs/pt-BR/CHANGELOG-beta.md`, `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`, esta story e a story da FT-23 (en e pt-BR)

## Notas de desenvolvimento

Red e Green por grupo, mutações, decisões e achados estão na [OPS-22, Fatia 5 — FT-23](../OPS-22/story.md). Evidência por critério de aceite e por condição de UX:

| CA | Evidência (automática) | Só verificação humana / visual / assistiva prova |
| --- | --- | --- |
| 1 região persistente | K23-01 (3 status, dois elementos vivos vazios), K23-02, teste da região (os mesmos dois nós sobrevivem a todo resultado), E23-02 | se um leitor de tela anuncia texto escrito num elemento que estava vazio na carga |
| 2 criar vai para a fila | linhas de criação do `post-action-route`, K23-03, E23-01 (URL, foco no título, texto neutro, parâmetros removidos) | pixels, posição da rolagem |
| 3 excluir mostra o estado real | linhas de exclusão do `post-action-route`, K23-08, E23-02, E23-04 | compreensão do texto |
| 4 última fila | U23-02, K23-02 (uma chamada de `navigateTo`), E23-03 | nada além da prova automática |
| 5 cancelar, uma mensagem por code/reason | U23-05 (13 linhas de erro + 7 de razão), E23-05 (13 recusas, 2 elementos), E23-06 | compreensão do texto |
| 6 contrato da URL | `next-outcome-url` (8 formas ignoradas, parâmetros preservados, sem API de histórico), M10a/M10b, recarga em E23-01/E23-03 | nada |
| 7 costura única | varredura estática em `post-action-route.test.js`, K23-02 (`navigateTo` simulado) | nada |
| 8 função pura | `post-action-route.test.js` (entradas congeladas, sem acesso a `location`, desconhecido -> `null`) | nada |
| 9 pendente não é ao vivo | E23-04 (a mensagem fica até "Atualizar filas" ou nova carga) | nada |
| 10 localização | `next-outcome-catalogs`, `validate:localization`, testes de paridade e de placeholders | revisão da redação es/pt-BR |
| 11 acessibilidade | papéis, `tabindex`, foco, ids do diálogo por testes de componente e E2E | leitor de tela, ordem de anúncio, anel de foco visual, posição sticky, 320 px |
| 12 sem regressão | arquivos de API intocados; `compose-runtime` 7/7; suítes de exclusão/cancelamento unitárias e E2E | Twitch ao vivo (OW-16) |

| R | Evidência automática | Humana / visual |
| --- | --- | --- |
| R1 | M20, K23-08, E23-02 | texto compreendido |
| R2 | M21, K23-04 | nada |
| R3 | MUX2, K23-06, foco em E23-01/E23-02 | aparência do anel de foco |
| R4 | MUX1, K23-01, teste de identidade dos nós | anúncio por tecnologia assistiva |
| R5 | MUX4, K23-05, E23-05 (textos do diálogo) | nada |
| R6 | M22, U23-08, E23-05 | nada |
| R7 | K23-09, renderização de plural em L23-01, testes de plural do diálogo | nada |
| R8 | MUX5, C23-02: 15 px; status 12,45:1, alerta 10,90:1, controles 11,95:1 (aritmética sobre o CSS declarado) | medição em pixels reais e no fundo real |

Limite de evidência (inalterado): o 9,1 é revisão estática; a validação visual, em navegador real, de legibilidade humana e com tecnologia assistiva NÃO foi feita.

## Histórico de mudanças

| Data | Mudança | Autor |
| --- | --- | --- |
| 2026-11-04 | Criada a story da fatia FT-23 (Rascunho) a partir da linha do inventário, das decisões do proprietário de 2026-10-27 e do desenho D-23-1 do `@architect` (desacoplada da FT-28). Nenhum requisito foi inventado; a redação e os nomes dos códigos ficam para o plano de UX compartilhado. | `@sm` |
| 2026-11-04 | `@po` (Pax): `*validate-story-draft` = **GO 9,1/10**, status Rascunho -> **Ready** (issue #103; gates do `@architect`, do `@data-engineer`, UX 9,1 e plano de testes do `@qa` fechados). Critério 1 reescrito para aceitar o R4 (um contêiner persistente com dois elementos vivos sempre montados, `status` e `alert`; trocar o `role` de elemento já preenchido não é anunciado de forma confiável). Condições de UX R1-R8 acrescentadas à Definição de pronto como condições do gate do `@qa` (nota só vale se R1, R2, R3, R5, R6 passarem). Apenas revisão estática; validação visual/humana/assistiva não feita (ação do proprietário A-05). Nenhum outro CA alterado. | `@po` |
| 2026-11-04 | 0.2.1 — Desenvolvimento concluído (modo YOLO) — Status: Ready → InReview. `@dev` (Dex): FT-23 implementada test-first no ponto de controle CP-4 (12 critérios e R1-R8 com a evidência acima); nenhum CA, escopo ou título mudou; nenhum arquivo de servidor foi tocado. | `@dev` |
