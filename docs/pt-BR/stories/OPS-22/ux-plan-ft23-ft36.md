# OPS-22 / OPS-15 — Plano e revisão de UX únicos: FT-23 + FT-36 (navegação, mensagens, cancelar exclusão)

[English](../../../stories/OPS-22/ux-plan-ft23-ft36.md)

**Autoria:** `@ux-design-expert` (Uma), 2026-11-04. **Stories:** [FT-23](../OPS-15/ft-23-navigation-and-messages.md) (#103, 12 critérios), [OPS-22](story.md) (CAs 15, 20, 21; FT-36 = #100; textos da FT-25 #98 e da FT-26 #99). **Entradas:** [po-validation](po-validation.md) (adendos de 2026-10-30, inclusive a decisão do Orion sobre o cancelamento verificado), [architect-review-ft36](architect-review-ft36.md) (F15-F24, D-23-1, D-36-1..8 e o adendo), [ft-36-data-engineer-confirmation](ft-36-data-engineer-confirmation.md), [arquitetura do frontend](../../front-end-architecture.md), [plano de UX da OPS-20](../OPS-20/ux-plan.md) (modelo e vocabulário).
**Natureza:** apenas portão de planejamento. Nenhum código, catálogo ou estilo foi alterado. Os fatos de código vêm de leitura somente de `apps/frontend/features/queues/{queue-lifecycle-actions.jsx, queue-lifecycle.mjs, new-queue-form.jsx, queue-list.jsx, queues-page-content.jsx, new-queue-page-content.jsx}`, `features/panel-shell/{panel-shell.jsx, panel-provider.jsx}`, `apps/shared/panel/queue-confirmation-copy.mjs`, `apps/frontend/styles/panel.css` e `apps/shared/localization/catalogs/panel/{en,es,pt-BR}.tsv`. Não foi usada a internet.

## 0. Resultado do portão

**Nota: 9,1/10 — apenas revisão estática de código, texto e documentos. Portão: APROVADO (>= 9,0) para o escopo da seção 9.**

**Não coberto por esta nota (NÃO feito):** renderização visual (layout, contraste medido em pixels reais, região fixa, reflow a 320 px), comportamento em navegador real (foco após carga completa do documento, `<dialog>` nativo), tecnologia assistiva (NVDA/JAWS/VoiceOver/TalkBack: se a mensagem de status e o título com foco são ambos anunciados e em que ordem), teste de leitura com streamers. São quatro classes de evidência separadas; nenhuma se infere desta revisão. A seção 7 lista o que só elas provam.

A nota é condicionada aos oito requisitos de implementação da seção 8 (R1-R8). Não são escopo novo: são defeitos do código ou do catálogo atuais que este plano encontrou, e os textos abaixo os substituem.

## 1. Linha de base (o que existe hoje)

| Fato | Evidência |
|---|---|
| O aviso de exclusão e de cancelamento é `useState` local do cartão; morre com o cartão (defeito D-3). | `queue-lifecycle-actions.jsx:13, 50-66, 99-104` |
| O `PanelProvider` é montado por página; a navegação é `<a>`; o retorno da criação vive no `NewQueueForm` e não é levado a `/queues` (D-4). | `panel-shell.jsx:164-166`, `new-queue-form.jsx` (bloco de feedback) |
| O `PanelShell` só tem `role="status"` para carregamento e atualização da visão geral; não há região persistente de resultado. | `panel-shell.jsx:90-104` |
| O título da fila é um `<h2 id="queue-title-<id>">` sem `tabindex`, então não recebe foco programático. O `<h1>` das páginas também não tem `tabindex`. | `queue-list.jsx:342`, `queues-page-content.jsx:11`, `new-queue-page-content.jsx:11` |
| O diálogo de excluir/cancelar é um `<dialog>` nativo com o título genérico "Confirmar ação" e os botões "Cancelar" / "Confirmar". Em "Cancelar exclusão" isso gera o par "Cancelar" (desistir) e "Confirmar" (cancelar a exclusão): dupla negação. | `queue-lifecycle-actions.jsx:105-112`, `panel.confirmation.title`, `panel.dialog.*` |
| O botão "Cancelar exclusão" vem de uma heurística do cliente sobre `remoteSyncStatus`, não da regra do servidor (F17). | `queue-action-state.mjs:33-36` |
| `panel.queue.delete.done` diz "a reward Twitch continua pausada" e `panel.queue.delete.pending` diz "Exclusão local iniciada ... reward intacta". Ambos valem só para filas locais e manuais convertidas. Em fila de Pontos do Canal a recompensa é excluída. | catálogos, linhas 536-537 (pt-BR) |
| O mapeador de falhas conhece 5 códigos de cancelamento (`NOT_PENDING`, `CANCELLATION_STALE`, `REWARD_OPERATION_PROCESSING`, `CANCELLATION_UNVERIFIED`, `QUEUE_NOT_FOUND`) e o status `already_deleted` de um 200. Os 3 códigos novos e as 2 razões novas não têm texto. | `queue-lifecycle.mjs:10-30`, `queue-lifecycle-actions.jsx:55-61` |
| O texto do aviso tem 12 px (`.queue-action-feedback`) e as cores de status foram ajustadas para fundo escuro. O contraste não foi medido. | `panel.css:282-285` |
| O movimento já tem guarda: só `@media (prefers-reduced-motion: no-preference)`. `:focus-visible` tem contorno roxo de 2 px. | `panel.css:21, 349` |
| Os resultados de criação existentes já cobrem os casos úteis: `creation_result.created_local / pending / review / recovered / uncertain / open_queues`. | catálogos linhas 289-297 (pt-BR) |

## 2. Princípios aplicados

1. **Nunca confirmar sem leitura positiva.** "Excluída" só quando a API devolveu `deleted`; "cancelada" só para `status: cancelled`; "criada" nunca diz que a recompensa da Twitch funciona.
2. **Dizer o que aconteceu com os pontos e com as pessoas**, não estados da Twitch: entradas removidas, devoluções *solicitadas* (nunca "devolvidas" antes de a Twitch confirmar), recompensa pausada ou excluída.
3. **Dizer o que é irreversível onde se escolhe**: no diálogo de exclusão, no de cancelamento e no resultado.
4. **Um único canal de mensagem.** Todo resultado de criar, excluir e cancelar vai para uma região persistente; nada vive em componente que pode desmontar.
5. **Toda mensagem que pede uma ação oferece a ação** (atualizar, Operações, Conexão). Sem beco sem saída.
6. **Reusar antes de criar.** A maioria das chaves é reusada ou alterada no lugar; só as chaves novas da seção 4.2 (25, mais `panel.queue.confirm.delete.one`, veja a nota de contagem) são adicionadas.
7. **Um termo por conceito**, seguindo os catálogos atuais: pt-BR "fila", "recompensa" (o texto novo não usa o inglês "reward"), "exclusão", "devolução de pontos", "espectadores"; en "queue", "reward", "deletion", "points refund", "viewers"; es "cola", "recompensa", "eliminación", "devolución de puntos", "espectadores". O es usa o "tú" informal, como o catálogo atual.

## 3. Fluxos e estados

### 3.1 Canal de resultado (compartilhado por todos os fluxos)

- **Um contêiner persistente** no topo do `<main>` (acima do cabeçalho da página) no `PanelShell`, renderizado em toda página e em todo valor de `status` (loading, ready, unavailable). Ele contém **dois elementos vivos sempre montados e vazios na primeira renderização**: `role="status"` (educado) e `role="alert"` (assertivo). A mensagem é escrita em exatamente um deles; o outro é esvaziado. Razão: trocar o `role` de um elemento que já tem texto não é anunciado de forma confiável; a região viva precisa existir antes de o conteúdo mudar. (Isto refina o CA 1 da FT-23, que diz "uma região `role="status"` (erros em `role="alert"`)": mesma intenção, dois elementos estáveis. O `@po` reconhece a redação, ver 8-R4.)
- **Qual elemento:** `alert` = a mudança pedida **não** aconteceu (qualquer recusa 4xx, `not_cancelled`, falha de rede, resultado incerto). `status` = criada, excluída, exclusão pendente, cancelada, atualizada.
- **Conteúdo:** um bloco de frase (estado primeiro, consequência depois), linha opcional de `referenceId` (`panel.error.reference`, mesma regex de validação de hoje), uma ação opcional (botão ou link) e um botão de dispensar. O botão de dispensar e a ação ficam **fora** dos elementos vivos, no mesmo contêiner, para não serem relidos a cada atualização.
- **Duração:** a mensagem fica até (a) um novo resultado substituí-la, (b) a pessoa dispensá-la, (c) a página mudar. Sem dispensa automática (nada some por temporizador; WCAG 2.2.1).
- **Escrita da mensagem:** num documento recém-carregado, o efeito que aplica o resultado roda depois da primeira renderização, então os elementos vivos já existem e estão vazios. O texto é definido nesse efeito, nunca no HTML inicial.
- **Tamanho e contraste:** texto >= 14 px, contraste >= 4,5:1 contra o fundo da região, estado nunca só por cor (as primeiras palavras de cada mensagem nomeiam o estado: "Exclusão pendente.", "Exclusão bloqueada.", "Exclusão cancelada.").
- **Posição:** `position: sticky` no topo da área rolável, para a mensagem continuar visível quando o foco vai para o título de uma fila lá embaixo. Validado só visualmente (seção 7).

### 3.2 Criar uma fila (D-4)

| Passo | Comportamento |
|---|---|
| Envio | Formulário atual. O botão mostra "Salvando…" e fica desabilitado enquanto salva (já é assim). |
| A API confirma a criação (`created`, `pending`, `review`, `recovered`) | Navegar com `navigateTo('/queues/?outcome=<código>&queue=<uuid>')`. O formulário não é limpo na página antiga (ela está saindo). |
| Resultado `uncertain` (sem confirmação) | **Não navegar.** Ficar no formulário com o `creation_result.uncertain` atual no elemento `alert` e o link atual "Abrir filas". O envio continua desabilitado (já é assim), então um segundo clique não cria duplicata. |
| Validação ou conflito de chave (`key_conflict`, entrada inválida) | Ficar no formulário; mensagens de campo e `creation_result.key_conflict` atuais; regras de foco inalteradas. |
| Chegada em `/queues/` | O provider lê `window.location.search` num efeito, valida, define o `panelOutcome`, remove os dois parâmetros com `history.replaceState` e, com a projeção pronta, move o foco (3.7). |

**Códigos (lista fechada) e mensagens de criação** (código para chave; o texto neutro de Pontos do Canal nunca diz que a Twitch funcionou):

| `outcome` na URL | Quando | Chave | Elemento |
|---|---|---|---|
| `queue_created` | Fila de Pontos do Canal criada (qualquer estado na Twitch; o cartão mostra o real) | **nova** `panel.outcome.created.channel_points` | status |
| `queue_created_local` | fila só manual | `panel.queue.creation_result.created_local` (reuso) | status |
| `queue_created_pending` | criação da recompensa aguarda confirmação da Twitch | `panel.queue.creation_result.pending` (reuso) | status |
| `queue_created_review` | a fila existe, a sincronização com a Twitch precisa de revisão | `panel.queue.creation_result.review` (reuso) | status |
| `queue_created_recovered` | uma fila correspondente foi encontrada depois de uma resposta interrompida | `panel.queue.creation_result.recovered` (reuso) | status |

`[AUTO-DECISION]` O `creation_result.created_remote` atual ("Fila criada e recompensa da Twitch sincronizada") também deve atravessar a navegação? → **Não.** Razão: o CA 2 da FT-23 diz que a mensagem não pode prometer que a Twitch deu certo, e a página de destino mostra o estado verdadeiro no cartão. A chave continua em uso só para o retorno no próprio formulário, que já existe.

### 3.3 Excluir uma fila (D-3)

Confirmação (`<dialog>` nativo, R5):

- Título específico (não "Confirmar ação"): "Excluir a fila “{title}”?"
- Corpo, fila de Pontos do Canal: o que é removido (contagem com plural), devoluções *solicitadas*, recompensa excluída só depois que toda devolução for confirmada, pode ficar pendente, **as entradas removidas não voltam nem se a exclusão for cancelada depois**.
- Botões: "Voltar" (primeiro no DOM, recebe o foco, Escape = Voltar) e "Excluir fila" (`button-danger`). Enquanto a requisição roda, os dois ficam desabilitados e o de aceitar mostra "Salvando…". O diálogo só fecha quando o resultado chega.
- Filas locais e convertidas mantêm o corpo atual (alterado só no plural da contagem). Elas não têm caminho de cancelamento, então não levam a frase "não voltam".

**Resultados, por resultado da API e tipo de fila** (mensagens na seção 4):

| Resultado da API | Tipo de fila | Onde | Chave da mensagem | Elemento | Ação na região |
|---|---|---|---|---|---|
| `deleted`, sobram filas | Pontos do Canal | ficar em `/queues/` | `panel.outcome.deleted.reward` | status | nenhuma |
| `deleted`, sobram filas | local (sem recompensa) | ficar | `panel.outcome.deleted.local` | status | nenhuma |
| `deleted`, sobram filas | manual convertida | ficar | `panel.queue.delete.done` (reuso; verdadeiro para este tipo) | status | nenhuma |
| `deleted`, **última fila** | qualquer | navegar para `/new-queue/?outcome=queue_deleted_last_<tipo>&queue=<uuid>`, tipo em `reward`, `local`, `converted` | as mesmas três chaves acima | status | nenhuma |
| `pending` | Pontos do Canal | ficar | `panel.outcome.delete_pending.reward` | status | "Atualizar filas" |
| `pending` | local ou convertida | ficar | `panel.queue.delete.pending` (reuso) | status | "Atualizar filas" |
| `blocked` | qualquer | ficar; **não** é mensagem única: é uma linha persistente no cartão vinda da projeção (`deletionState = blocked`), ver abaixo | `panel.queue.deletion.blocked.*` | linha do cartão (sem anúncio vivo) mais a mensagem da região quando o estado é lido pela primeira vez depois de uma ação | link para a página de Operações |
| erro 4xx / desconhecido | qualquer | ficar | `panel.error.generic` atual + referência quando houver | alert | nenhuma |
| rede, 5xx, resposta inválida | qualquer | ficar | `panel.queue.action_result.uncertain` (reuso) | alert | "Atualizar filas" |

- Uma exclusão que deixa a fila em `deleting` mantém o cartão na tela; o cartão mostra a linha atual `panel.queue.status.pending_delete` (reuso) e o botão "Cancelar exclusão" só quando o **servidor** diz `canCancelDeletion` (R2).
- **Exclusão pendente** nunca usa redação de sucesso ("excluída", "concluída", "removida da Twitch"). **Exclusão bloqueada** mostra a contagem de operações que bloqueiam (chaves de plural), o motivo quando conhecido e um link para Operações. Um `blockReason` desconhecido cai no texto genérico de bloqueio; o código bruto nunca aparece.
- **Pendente não é ao vivo** (CA 9 da FT-23): a mensagem da região e o estado do cartão são os da última projeção. A ação "Atualizar filas" recarrega a projeção (`refreshQueueProjection`) e, se der certo, troca a mensagem por `panel.outcome.refreshed` no elemento status. A atualização ao vivo fica com a OPS-23.
- **Resolução manual** (FT-26): a linha do cartão é uma contagem; a resolução em si acontece em Operações com `panel.operation.action.resolve` e `panel.operation.confirm.resolve` atuais (que já dizem que não confirmam devolução nem atendimento). A seção 3.6 acrescenta só o que falta.

### 3.4 Cancelar uma exclusão (FT-36)

**Visibilidade:** o botão "Cancelar exclusão" existe só quando a projeção do servidor diz `canCancelDeletion` (R2). Enquanto `cancellationInProgress` for verdadeiro, o cartão mostra `panel.queue.deletion.cancelling` e o botão continua disponível (repeti-lo retoma a leitura; é idempotente por desenho, F15/§1.2).

**Diálogo de confirmação** (substitui `panel.queue.confirm.cancel_delete`; três parágrafos curtos em vez de um bloco longo, cada um com `id` listado em `aria-describedby`):

1. O que o app faz: lê a recompensa exata na Twitch e só cancela se ela existir e estiver pausada. Se a Twitch não puder confirmar, nada muda.
2. Se der certo: a fila volta **oculta dos espectadores e fechada**; a recompensa **continua pausada** até você mostrar a fila aos espectadores e abri-la de novo; esses dois passos são seus.
3. O que não volta: as pessoas que estavam na fila já foram removidas e **não voltam**; as devoluções já solicitadas **continuam e não são desfeitas**; nada é apagado.

Botões: "Voltar" (foco padrão, Escape) e "Cancelar exclusão" (primário, não danger: é a direção segura, mas não é trivialmente reversível, por isso mantém um verbo específico em vez de "Confirmar"/"OK").

**Resultados** (todos na região; `status` = a mudança aconteceu, `alert` = não aconteceu):

| API | Código ou razão | Chave | Elemento | Ação |
|---|---|---|---|---|
| 200 `cancelled` | — | `panel.queue.delete.cancelled` (texto alterado) | status | nenhuma |
| 200 `not_cancelled` | `queue_delete_reward_absent` | `panel.queue.delete.cancel.reward_absent` (reuso) | alert | link para Operações |
| 200 `not_cancelled` | `queue_delete_reward_diverged` | `panel.queue.delete.cancel.reward_diverged` (reuso) | alert | link para Operações |
| 200 `not_cancelled` | `queue_delete_cancel_reward_not_paused` | **nova** `panel.queue.delete.cancel.reward_not_paused` | alert | link para Operações |
| 200 `not_cancelled` | `queue_deletion_cancel_verification_unavailable` | `panel.queue.delete.cancel.unverified` (reuso) | alert | "Cancelar exclusão" continua no cartão para tentar de novo |
| 200 `not_cancelled` | `authorization_required` | **nova** `panel.queue.delete.cancel.authorization_required` | alert | link para a página de conexão com a Twitch (`panel.navigation.connection`) |
| 200 `not_cancelled` | qualquer outra razão | `panel.queue.delete.cancel.unverified` (reuso; é verdade: não foi cancelada) | alert | — |
| 409 | `QUEUE_DELETION_ALREADY_COMPLETED` | `panel.queue.delete.cancel.already_deleted` (reuso; mapeada pelo **código**, não por um status 200, R6) | alert | "Atualizar filas" |
| 409 | `QUEUE_DELETION_PAUSE_IN_PROGRESS` | **nova** `panel.queue.delete.cancel.pause_in_progress` | alert | "Cancelar exclusão" continua; a mensagem diz para aguardar alguns segundos |
| 409 | `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` | **nova** `panel.queue.delete.cancel.remote_delete_attempted` | alert | link para Operações |
| 409 | `QUEUE_REWARD_OPERATION_PROCESSING` | `panel.queue.delete.cancel.processing` (reuso) | alert | "Atualizar filas" |
| 409 | `QUEUE_DELETION_NOT_PENDING`, `QUEUE_DELETION_CANCELLATION_STALE` | `panel.queue.delete.cancel.stale` (reuso) | alert | "Atualizar filas" |
| 409 | `QUEUE_DELETION_CANCELLATION_UNVERIFIED` | `panel.queue.delete.cancel.unverified` (reuso) | alert | — |
| 404 | `QUEUE_NOT_FOUND` | `panel.error.queue_not_found` (reuso) | alert | "Atualizar filas" |
| 400, código desconhecido | — | `panel.error.generic` (+ referência) | alert | — |
| rede, 5xx, resposta inválida | — | `panel.queue.delete.cancel.uncertain` (reuso, com `referenceId`) | alert | "Atualizar filas" |

Regras que mantêm o texto honesto:

- **Nenhum texto de recusa diz que a fila está segura ou reaberta.** Cada um diz que a exclusão não foi cancelada (ou o que continua pendente).
- `remote_delete_attempted` diz que o DELETE **pode** ter chegado à Twitch e que a leitura não provou a recompensa; não diz que ela foi excluída.
- Depois de um cancelamento bem-sucedido, o cartão mostra uma fila arquivada, fechada, com recompensa pausada: a linha de estado do próprio cartão e os botões atuais "Mostrar esta fila para viewers" e "Abrir" são o próximo passo. A mensagem de cancelamento nomeia a ordem (mostrar, depois abrir) sem citar os rótulos dos botões, para que uma mudança futura de rótulo não torne o texto falso.
- O mapeamento é só por `code`/`reason`. As frases `error` em português da API nunca são exibidas (architect §1.5).

### 3.5 Excluir a última fila (destino)

`resolvePostActionRoute` devolve `/new-queue/` somente quando a projeção depois da exclusão **não tem nenhuma fila que não esteja `deleted`**. Uma última fila `pending` ou `blocked` fica em `/queues/` (a fila ainda existe e ainda precisa de ação). Em `/new-queue/` a mensagem é a de 3.3 (variantes "excluída"), o `h1` recebe o foco (não há título de fila) e o formulário fica intocado e vazio. O estado vazio de `/queues/` (`panel.queue.empty.title`) só é alcançado por navegação direta e mantém o texto atual.

### 3.6 Textos da FT-25 e da FT-26 que vivem nas mesmas telas

Somente as cadeias que o `@po` listou. Todo o resto de Operações é reusado.

| Necessidade | Reuso | Novo |
|---|---|---|
| Linha de exclusão pendente no cartão | `panel.queue.status.pending_delete` | — |
| Exclusão bloqueada: N operações precisam de revisão | — | `panel.queue.deletion.blocked.{one,many,other}`, `.generic`, `panel.queue.deletion.blocked_link` |
| Operação que bloqueia uma exclusão (etiqueta na linha de Operações) | `panel.operation.status.*` | `panel.operation.blocks_deletion` |
| Estado terminal após 6 tentativas (`attempts_exhausted`) | `panel.operation.status.unknown` | `panel.operation.attempts_exhausted` (o que aconteceu, que nada foi confirmado, que "Reconciliar / tentar novamente" inicia um novo ciclo de 6) |
| Resolução manual | `panel.operation.action.resolve`, `panel.operation.confirm.resolve` | `panel.operation.manual_contradicted` (a nova listagem ainda mostra aberto, o acompanhamento foi retomado) |
| Tentar agora (ciclo novo) | `panel.operation.action.retry` | coberto por `attempts_exhausted` |
| Verificação do cancelamento em andamento | `panel.operation.status.cancel_verification` | — |

### 3.7 Foco após navegar, confirmar e dispensar

| Situação | O foco vai para | Alternativa |
|---|---|---|
| Chegada em `/queues/` depois de criar | `queue-title-<uuid>` (`h2`, `tabindex="-1"`), rolado até a vista sem rolagem suave sob `prefers-reduced-motion` | `h1` da página (`tabindex="-1"`) quando o UUID não está na projeção |
| Chegada em `/new-queue/` depois de excluir a última fila | `h1` da página | — |
| O diálogo abre | botão "Voltar" (primeiro focável; `showModal` nativo) | — |
| O diálogo fecha por Voltar, Escape ou Cancelar | o botão que o abriu (nativo) | se o botão sumiu (o cartão mudou de estado), o `h2` do título da fila; se o cartão sumiu, o `h1` da página |
| Ação concluída (exclusão pendente, cancelada, recusada) | o botão de origem se ainda existir; senão o título da fila; senão o `h1` | como na linha anterior |
| Dispensar pressionado | `h1` da página | — |
| "Atualizar filas" pressionado | fica no botão; a atualização da projeção troca a mensagem por `panel.outcome.refreshed` | se o botão for removido, `h1` |

O foco é movido **depois** de a mensagem ser escrita e depois de a projeção estar pronta. Nunca se move enquanto a pessoa digita em outro campo (o único caso hoje é o formulário de `/new-queue`, onde nada move o foco).

## 4. Microcopy (en, es, pt-BR) com chaves de catálogo

Convenções: `{title}`, `{count}`, `{id}` seguem os placeholders existentes; as chaves de plural usam `.one`, `.many`, `.other` (o pt-BR precisa de `.many`, como `panel.reconciliation.complete.*` já faz). **Reusadas sem alteração:** `panel.queue.creation_result.{created_local,pending,review,recovered,uncertain,open_queues}`, `panel.queue.status.pending_delete`, `panel.queue.delete.pending`, `panel.queue.delete.done`, `panel.queue.delete.cancel.{already_deleted,reward_absent,reward_diverged,unverified,stale,processing,uncertain}`, `panel.queue.action.{delete,cancel_delete}`, `panel.queue.action_result.{saving,uncertain}`, `panel.error.{generic,reference,queue_not_found}`, `panel.navigation.connection`, `panel.operation.*` (chaves de status, ação e confirmação).

### 4.1 Chaves existentes alteradas (mesma chave, texto novo)

| Chave | en | es | pt-BR |
|---|---|---|---|
| `panel.queue.confirm.delete` (Pontos do Canal; plural em `{count}`: `.one`, `.many`, `.other`; mostrada a forma `.other`) | Delete the queue “{title}” and its Twitch reward? {count} active entries will be removed and a points refund will be requested for each redemption. The reward is deleted only after every refund is confirmed, and Twitch may leave it pending. Removed entries do not come back, even if you cancel the deletion later. | ¿Eliminar la cola “{title}” y su recompensa de Twitch? Se quitarán {count} entradas activas y se solicitará la devolución de puntos de cada canje. La recompensa se elimina solo cuando se confirme cada devolución, y Twitch puede dejarla pendiente. Las entradas quitadas no vuelven, aunque canceles la eliminación más adelante. | Excluir a fila “{title}” e a recompensa dela na Twitch? {count} entradas ativas serão removidas e a devolução dos pontos de cada resgate será solicitada. A recompensa só é excluída depois que cada devolução for confirmada, e a Twitch pode deixá-la pendente. As entradas removidas não voltam, mesmo que você cancele a exclusão depois. |
| `panel.queue.confirm.delete.one` (singular; `.many` e `.other` levam o texto acima) | Delete the queue “{title}” and its Twitch reward? {count} active entry will be removed and a points refund will be requested for its redemption. The reward is deleted only after every refund is confirmed, and Twitch may leave it pending. Removed entries do not come back, even if you cancel the deletion later. | ¿Eliminar la cola “{title}” y su recompensa de Twitch? Se quitará {count} entrada activa y se solicitará la devolución de puntos de su canje. La recompensa se elimina solo cuando se confirme cada devolución, y Twitch puede dejarla pendiente. Las entradas quitadas no vuelven, aunque canceles la eliminación más adelante. | Excluir a fila “{title}” e a recompensa dela na Twitch? {count} entrada ativa será removida e a devolução dos pontos do resgate será solicitada. A recompensa só é excluída depois que cada devolução for confirmada, e a Twitch pode deixá-la pendente. As entradas removidas não voltam, mesmo que você cancele a exclusão depois. |
| `panel.queue.confirm.cancel_delete` (parágrafo 1) | Cancel the deletion of “{title}”? The app reads the exact reward on Twitch and cancels only if it exists and is paused. If Twitch cannot confirm it, nothing changes and the deletion stays as it is. | ¿Cancelar la eliminación de “{title}”? La aplicación lee la recompensa exacta en Twitch y cancela solo si existe y está pausada. Si Twitch no puede confirmarlo, no cambia nada y la eliminación sigue como está. | Cancelar a exclusão de “{title}”? O app lê a recompensa exata na Twitch e só cancela se ela existir e estiver pausada. Se a Twitch não puder confirmar, nada muda e a exclusão continua como está. |
| `panel.queue.delete.cancelled` | Deletion cancelled. Twitch confirmed that the reward exists and is paused. The queue is closed and hidden from viewers, and the reward stays paused until you show the queue to viewers and open it again. The people who were in the queue were removed and do not come back; refunds already requested keep going. | Eliminación cancelada. Twitch confirmó que la recompensa existe y está pausada. La cola queda cerrada y oculta para los espectadores, y la recompensa sigue pausada hasta que muestres la cola a los espectadores y la abras de nuevo. Las personas que estaban en la cola ya se quitaron y no vuelven; las devoluciones ya solicitadas continúan. | Exclusão cancelada. A Twitch confirmou que a recompensa existe e está pausada. A fila fica fechada e oculta dos espectadores, e a recompensa continua pausada até você mostrar a fila aos espectadores e abri-la de novo. As pessoas que estavam na fila foram removidas e não voltam; as devoluções de pontos já solicitadas continuam. |

Por que as alterações: o texto atual de `cancelled` diz que os pedidos de devolução "foram preservados", mas não diz que as entradas continuam removidas (I3 do arquiteto e a lista de riscos da FT-23 exigem) e não diz como a recompensa volta a ser usável (D-36-1). O `confirm.delete` atual não menciona a irreversibilidade das entradas removidas e imprime "{count} entradas" sem singular.

### 4.2 Chaves novas

| Chave | en | es | pt-BR |
|---|---|---|---|
| `panel.outcome.created.channel_points` | Queue created. The Twitch reward status appears on the card below; check it before sharing the command with viewers. | Cola creada. El estado de la recompensa de Twitch aparece en la tarjeta de abajo; revísalo antes de compartir el comando con los espectadores. | Fila criada. O estado da recompensa na Twitch aparece no cartão abaixo; confira antes de divulgar o comando aos espectadores. |
| `panel.outcome.deleted.reward` | Queue deleted. Twitch confirmed that the reward was deleted. Redemption history was kept. | Cola eliminada. Twitch confirmó que la recompensa se eliminó. Se conservó el historial de canjes. | Fila excluída. A Twitch confirmou que a recompensa foi excluída. O histórico dos resgates foi preservado. |
| `panel.outcome.deleted.local` | Queue deleted. It had no Twitch reward. History was kept. | Cola eliminada. No tenía recompensa de Twitch. Se conservó el historial. | Fila excluída. Ela não tinha recompensa na Twitch. O histórico foi preservado. |
| `panel.outcome.delete_pending.reward` | Deletion pending. Twitch has not confirmed it yet. Active entries were removed and points refunds were requested; the reward is deleted only after every refund is confirmed. Refresh to see the current state. | Eliminación pendiente. Twitch aún no la ha confirmado. Se quitaron las entradas activas y se solicitó la devolución de puntos; la recompensa se elimina solo cuando se confirme cada devolución. Actualiza para ver el estado actual. | Exclusão pendente. A Twitch ainda não confirmou. As entradas ativas foram removidas e a devolução dos pontos foi solicitada; a recompensa só é excluída depois que cada devolução for confirmada. Atualize para ver o estado atual. |
| `panel.queue.deletion.blocked.one` | Deletion blocked: {count} operation needs your review before it can continue. | Eliminación bloqueada: {count} operación necesita tu revisión para continuar. | Exclusão bloqueada: {count} operação precisa da sua revisão para continuar. |
| `panel.queue.deletion.blocked.many` / `.other` | Deletion blocked: {count} operations need your review before it can continue. | Eliminación bloqueada: {count} operaciones necesitan tu revisión para continuar. | Exclusão bloqueada: {count} operações precisam da sua revisão para continuar. |
| `panel.queue.deletion.blocked.generic` | Deletion blocked: Twitch has not confirmed a step. Review the operations or cancel the deletion. | Eliminación bloqueada: Twitch no ha confirmado un paso. Revisa las operaciones o cancela la eliminación. | Exclusão bloqueada: a Twitch não confirmou uma etapa. Revise as operações ou cancele a exclusão. |
| `panel.queue.deletion.blocked_link` | Review the operations | Revisar las operaciones | Revisar as operações |
| `panel.queue.deletion.cancelling` | Checking the reward on Twitch to cancel the deletion. If this takes long, use Cancel deletion again to resume. | Comprobando la recompensa en Twitch para cancelar la eliminación. Si tarda, usa Cancelar eliminación de nuevo para continuar. | Verificando a recompensa na Twitch para cancelar a exclusão. Se demorar, use Cancelar exclusão de novo para retomar. |
| `panel.queue.confirm.cancel_delete_if_ok` (parágrafo 2) | If it works, the queue goes back hidden from viewers and closed. The reward stays paused until you show the queue to viewers and open it again; both steps are yours. | Si funciona, la cola vuelve oculta para los espectadores y cerrada. La recompensa sigue pausada hasta que muestres la cola a los espectadores y la abras de nuevo; ambos pasos son tuyos. | Se der certo, a fila volta oculta dos espectadores e fechada. A recompensa continua pausada até você mostrar a fila aos espectadores e abri-la de novo; os dois passos são seus. |
| `panel.queue.confirm.cancel_delete_not_restored` (parágrafo 3) | The people who were in the queue were already removed and do not come back. Refunds already requested keep going and are not undone. Nothing is erased. | Las personas que estaban en la cola ya se quitaron y no vuelven. Las devoluciones ya solicitadas continúan y no se deshacen. No se borra nada. | As pessoas que estavam na fila já foram removidas e não voltam. As devoluções de pontos já solicitadas continuam e não são desfeitas. Nada é apagado. |
| `panel.queue.dialog.title.delete` | Delete the queue “{title}”? | ¿Eliminar la cola “{title}”? | Excluir a fila “{title}”? |
| `panel.queue.dialog.title.cancel_delete` | Cancel the deletion of “{title}”? | ¿Cancelar la eliminación de “{title}”? | Cancelar a exclusão de “{title}”? |
| `panel.queue.dialog.back` | Back | Volver | Voltar |
| `panel.queue.delete.cancel.reward_not_paused` | Cancellation was not confirmed because the Twitch reward is not paused. For safety the queue was not reopened and the deletion continues. Review the reward on Twitch or the operations. | No se confirmó la cancelación porque la recompensa de Twitch no está pausada. Por seguridad la cola no se reabrió y la eliminación continúa. Revisa la recompensa en Twitch o las operaciones. | O cancelamento não foi confirmado porque a recompensa na Twitch não está pausada. Por segurança a fila não foi reaberta e a exclusão continua. Revise a recompensa na Twitch ou as operações. |
| `panel.queue.delete.cancel.authorization_required` | Twitch refused the authorization, so the reward could not be read and the deletion was not cancelled. Reconnect the channel on the Twitch connection page and try again. | Twitch rechazó la autorización, así que no se pudo leer la recompensa y la eliminación no se canceló. Reconecta el canal en la página de conexión de Twitch e inténtalo de nuevo. | A Twitch recusou a autorização, então a recompensa não pôde ser lida e a exclusão não foi cancelada. Reconecte o canal na página Conexão Twitch e tente de novo. |
| `panel.queue.delete.cancel.pause_in_progress` | The reward is still being paused on Twitch, so the deletion was not cancelled yet. Wait a few seconds and try again. | La recompensa aún se está pausando en Twitch, así que la eliminación todavía no se canceló. Espera unos segundos e inténtalo de nuevo. | A recompensa ainda está sendo pausada na Twitch, então a exclusão ainda não foi cancelada. Aguarde alguns segundos e tente de novo. |
| `panel.queue.delete.cancel.remote_delete_attempted` | The request to delete the reward may already have reached Twitch, and the read did not confirm that the reward exists and is paused. For safety the deletion was not cancelled. Let it finish or review the operations. | La solicitud para eliminar la recompensa puede haber llegado ya a Twitch, y la lectura no confirmó que exista y esté pausada. Por seguridad no se canceló la eliminación. Déjala terminar o revisa las operaciones. | O pedido para excluir a recompensa pode já ter chegado à Twitch, e a leitura não confirmou que ela existe e está pausada. Por segurança a exclusão não foi cancelada. Deixe-a terminar ou revise as operações. |
| `panel.outcome.dismiss` | Dismiss message | Descartar el mensaje | Dispensar a mensagem |
| `panel.outcome.action.refresh` | Refresh queues | Actualizar colas | Atualizar filas |
| `panel.outcome.refreshed` | Queues refreshed. | Colas actualizadas. | Filas atualizadas. |
| `panel.operation.blocks_deletion` | Blocks the deletion of “{title}” | Bloquea la eliminación de “{title}” | Bloqueia a exclusão de “{title}” |
| `panel.operation.attempts_exhausted` | Automatic attempts ended and Twitch confirmed nothing. Use Reconcile / retry to start a new cycle of 6 attempts, or record a manual resolution. | Los intentos automáticos terminaron y Twitch no confirmó nada. Usa Reconciliar / reintentar para iniciar un nuevo ciclo de 6 intentos, o registra una resolución manual. | As tentativas automáticas terminaram e a Twitch não confirmou nada. Use Reconciliar / tentar novamente para iniciar um novo ciclo de 6 tentativas, ou registre uma resolução manual. |
| `panel.operation.manual_contradicted` | Twitch still lists this redemption as open after your manual resolution, so automatic tracking was resumed. | Twitch sigue listando este canje como abierto tras tu resolución manual, así que se reanudó el seguimiento automático. | A Twitch ainda lista este resgate como aberto depois da sua resolução manual, então o acompanhamento automático foi retomado. |

Contagem: 3 chaves alteradas (`confirm.delete` agora nas três formas de plural, `confirm.cancel_delete`, `delete.cancelled`) e 26 chaves novas (as 25 da seção 4.2, incluindo as 3 formas de plural de `blocked`, mais `panel.queue.confirm.delete.one`, que ainda não existe e é criada junto com as formas de plural alteradas de `confirm.delete`; o `@dev` concilia a lista final com o catálogo; corrigido pela contagem do `@qa` de 2026-11-04), todas com en, es e pt-BR. Os placeholders `{title}` e `{count}` precisam ser registrados para cada chave nova nos mapas de placeholders (`apps/shared/panel/panel-catalog.mjs` e `apps/shared/localization/discover-catalog-module.mjs`, onde `panel.queue.confirm.delete` já é registrada hoje), ou o `npm run validate:localization` falha.

`[AUTO-DECISION]` Estilo do botão no diálogo de cancelamento: primário, não danger. Razão: cancelar uma exclusão leva ao estado seguro; o estilo danger fica em "Excluir fila".
`[AUTO-DECISION]` O plural de `{count}` entradas no diálogo de exclusão usa chaves de plural. Razão: o texto atual imprime "1 entradas".

## 5. Acessibilidade

| Área | Requisito |
|---|---|
| Regiões vivas | Dois elementos estáveis (`role="status"`, `role="alert"`), sempre montados, vazios antes da primeira mensagem; a mensagem é um único nó de texto substituído, `aria-atomic="true"`. Os controles de dispensar e de ação ficam fora dos elementos vivos. |
| Sem anúncio duplicado | Uma mensagem por vez; a anterior é limpa antes. O `status-card` de carregamento e os avisos de atualização da visão geral mantêm seus próprios elementos e não são reusados. |
| Foco | Seção 3.7. Todo alvo de foco programático leva `tabindex="-1"` e contorno `:focus-visible` visível (o atual de 2 px roxo, deslocamento 3 px); nunca `tabindex` > 0. Depois de uma carga completa do documento, o foco é definido uma vez, depois da mensagem. |
| Diálogo | `<dialog>` nativo com `showModal()`, `aria-modal="true"`, `aria-labelledby` = o título específico, `aria-describedby` = os ids dos parágrafos. Escape fecha (= Voltar). O Tab fica dentro. O botão de aceitar fica desabilitado enquanto a requisição roda; o handler de fechamento só zera a ação pendente depois do resultado. |
| Teclado | Todo controle (dispensar, atualizar, link de Operações, link de Conexão, botões do diálogo) alcançável e operável com Tab, Enter e Espaço. Sem armadilha de teclado. Sem novo atalho. |
| Contraste e tamanho | Texto >= 14 px, >= 4,5:1; estado em palavras no texto, nunca só cor; controles >= 44 px (a meta da OPS-20). Não medido aqui (seção 7). |
| Reflow | A região quebra linha a 320 px de largura e 400 por cento de zoom sem rolagem horizontal; a posição fixa não pode cobrir o título com foco (scroll-margin nos alvos de foco). |
| Redução de movimento | Sem animação na região. Qualquer fade ou deslize só existe dentro de `@media (prefers-reduced-motion: no-preference)` (o padrão já usado em `panel.css`). A rolagem até o título usa o comportamento padrão, não `smooth`, quando reduce está ativo. |
| Leitores de tela | As primeiras palavras de cada mensagem nomeiam o estado ("Exclusão pendente.", "Exclusão bloqueada.", "Exclusão cancelada."). Os links dizem o que abrem ("Revisar as operações"). O `referenceId` é uma linha separada (`<small>`), lida depois da mensagem. |
| Idioma | A região herda o `lang` da página; o texto do catálogo já é localizado por `localeState`. |

## 6. Estados de carregamento, vazio, erro e API lenta

| Estado | Comportamento |
|---|---|
| Carregando (`status = loading`) | O contêiner de resultado já está montado. Um resultado da URL é escrito de imediato e os parâmetros são removidos de imediato; o foco se move quando a projeção está pronta. O `status-card` de carregamento atual continua. |
| API indisponível (`status = unavailable`) | O cartão de erro `role="alert"` atual aparece; a mensagem de resultado pode ficar acima dele (é exata: a fila foi criada ou excluída). O foco não vai para um título de fila ausente. |
| Vazio | `/queues/` sem fila mantém `panel.queue.empty.title`. Um UUID criado que não está na projeção cai no `h1`; a mensagem continua aparecendo. |
| URL inválida | Código desconhecido ou UUID malformado: sem mensagem, sem mudança de foco, parâmetros removidos, nada refletido (CA 6 da FT-23). |
| Mutação em andamento | O diálogo continua aberto, botões desabilitados, o de aceitar mostra "Salvando…" (`panel.queue.action_result.saving`). Hoje não existe timeout. |
| **API lenta ou travada** | O timeout de leitura com `AbortSignal` é a **FT-44, incorporada ao CA da OPS-23 (FT-29)** e está **fora do escopo aqui**. Dependência registrada: até a FT-44, uma mutação travada deixa o diálogo em "Salvando…" e uma leitura travada deixa o cartão de carregamento. Este plano não acrescenta timeout, laço de nova tentativa nem caminho "assumir sucesso". O timeout de uma mutação deve terminar na mensagem de incerteza acima, nunca em sucesso nem em nova tentativa cega (OPS-21). |
| Mutação incerta | `panel.queue.action_result.uncertain` / `panel.queue.delete.cancel.uncertain` (alert) com "Atualizar filas"; o formulário de criação continua desabilitado, então nenhuma duplicata é criada. |
| Pendente nunca é ao vivo | Seção 3.3. |

## 7. Critérios verificáveis e classes de evidência

### 7.1 Critérios de UX testáveis por testes automatizados

| # | Critério | Classe |
|---|---|---|
| UX-1 | O `PanelShell` renderiza um contêiner com um elemento `role="status"` e um `role="alert"`, ambos vazios na primeira renderização e em todo valor de `status`. | Componente |
| UX-2 | Depois de um resultado de exclusão e de o cartão desmontar, a mensagem continua na região. | Componente |
| UX-3 | Recusas e `not_cancelled` vão para `alert`; criada, excluída, pendente, cancelada e atualizada vão para `status`. | Unitário (mapeador) + componente |
| UX-4 | O mapeador cobre cada linha da tabela de 3.4: cada `code`/`reason` devolve a chave listada, um `code` desconhecido devolve `panel.error.generic`, uma `reason` desconhecida devolve `unverified`, e nenhum texto livre `error` da API é exibido. | Unitário |
| UX-5 | `resolvePostActionRoute` devolve `/new-queue/` só quando não resta fila fora de `deleted`; última fila pendente ou bloqueada fica em `/queues/`; resultado desconhecido devolve `null`. | Unitário |
| UX-6 | Parser da URL: lista fechada de códigos (os 5 de criação e os 3 `queue_deleted_last_*`), padrão de UUID, desconhecido ignorado, os dois parâmetros removidos com `replaceState`, nada refletido. Prova por mutação: renderizar o `outcome` bruto e este teste falha. | Unitário + mutação do `@qa` |
| UX-7 | Um resultado `uncertain` de criação não navega e mantém o envio desabilitado. | Componente |
| UX-8 | Sem redação de sucesso em `pending`: a chave de `pending` nunca é uma das chaves `deleted.*` ou `done`. | Unitário |
| UX-9 | O botão Cancelar exclusão só aparece pela flag do servidor `canCancelDeletion`; com `cancellationInProgress`, o cartão mostra `panel.queue.deletion.cancelling`. | Componente |
| UX-10 | O diálogo tem título específico, `Voltar` primeiro na ordem do DOM, `aria-labelledby` e `aria-describedby` apontando para ids existentes, botão de aceitar desabilitado ao salvar e três parágrafos de descrição no cancelamento (incluindo o "não voltam"). | Componente |
| UX-11 | Os alvos de foco existem e são focáveis programaticamente (`tabindex="-1"` no título da fila e nos dois `h1`); o auxiliar de foco cai no `h1` quando o UUID está ausente. | Componente |
| UX-12 | Toda chave nova existe em en, es e pt-BR com os mesmos placeholders; as chaves de plural `.one/.many/.other` existem onde listadas; `npm run validate:localization` e os testes de paridade passam. | Localização |
| UX-13 | Nenhum uso novo de `window.location` fora de `navigateTo`. | Unitário / estático |
| UX-14 | E2E em Chromium com fixtures (só texto aprovado): criar e ir a `/queues/` com foco no novo título e a mensagem neutra; excluir com mensagem persistente; excluir a última fila e ir a `/new-queue/`; pendente e bloqueada com o link para Operações; cada recusa de cancelamento; recarregar não repete. Verifica foco calculado, `role` e texto. | E2E somente navegador |
| UX-15 | Nenhuma animação sem `prefers-reduced-motion: no-preference` (teste de contrato de CSS para as regras novas). | Contrato |

### 7.2 O que só validação visual, de navegador ou de tecnologia assistiva cobre (NÃO feita)

- Se `position: sticky` mantém a mensagem visível quando o foco cai num título lá embaixo; contraste real das cores de status, aviso e erro sobre o fundo real; reflow a 320 px e 400 por cento de zoom; aparência do diálogo e visibilidade do anel de foco.
- O comportamento real do foco depois de `window.location.assign` (carga completa do documento), inclusive a ordem entre o anúncio do foco e o anúncio do status.
- Se NVDA, JAWS, VoiceOver e TalkBack anunciam uma mensagem escrita numa região que existia, mas estava vazia na carga do documento, e se o título com foco e a mensagem se interrompem. Se interromperem, a alternativa é definir `aria-describedby` no alvo de foco (a decidir só com evidência).
- Se o texto é entendido por streamers (teste de leitura). As frases "não voltam" e "a recompensa continua pausada até você mostrar e abrir" são as duas mais prováveis de precisar de uma leitura humana.

## 8. Requisitos obrigatórios de implementação (condições da nota)

| # | Requisito | Quem |
|---|---|---|
| R1 | Parar de usar `panel.queue.delete.done` e `.pending` em filas de Pontos do Canal: elas dizem "a reward continua pausada / intacta", o que é falso para esse tipo. Usar as chaves por tipo de 3.3. | `@dev` |
| R2 | Mostrar "Cancelar exclusão" a partir de `canCancelDeletion` e `cancellationInProgress` do servidor, não da heurística de `remoteSyncStatus` (F17). | `@dev` (architect D-36-6) |
| R3 | Acrescentar `tabindex="-1"` ao `h2` do título da fila e aos dois `h1` das páginas. | `@dev` |
| R4 | Reconhecer o refinamento de redação dos CAs 1 e 11 da FT-23: um contêiner persistente com dois elementos vivos estáveis (`status`, `alert`). | `@po` |
| R5 | Trocar o diálogo genérico (título "Confirmar ação", botões "Cancelar"/"Confirmar") em excluir e cancelar exclusão pelo título específico e pelos botões "Voltar" / verbo de 3.3 e 3.4. | `@dev` |
| R6 | Mapear `already_deleted` a partir do código 409 `QUEUE_DELETION_ALREADY_COMPLETED` (o ramo 200 `already_deleted` é morto segundo o arquiteto). | `@dev` |
| R7 | Chaves de plural para a contagem de entradas e para a contagem de bloqueios. | `@dev` |
| R8 | Texto da região >= 14 px (o `.queue-action-feedback` atual tem 12 px) e contraste medido >= 4,5:1 antes de a interface ser entregue. | `@dev` (CSS), `@qa` (medição) |

Se algum de R1-R3, R5, R6 não for atendido no gate do `@qa`, a nota deste plano não vale para a interface entregue.

## 9. Nota por dimensão (revisão estática)

| Dimensão | Nota | Base |
|---|---|---|
| Clareza | 9,2 | Palavras de estado primeiro; entradas, devoluções, recompensa e próximos passos nomeados; os dois textos longos (diálogo e resultado do cancelamento) foram divididos em parágrafos curtos. Resíduo: duas frases precisam de leitura humana. |
| Consistência | 9,1 | A maioria das chaves existentes reusada ou alterada; mesmos termos por idioma; mesmo canal para todo fluxo; mesmo padrão de diálogo da OPS-20 (título específico, botão com verbo, padrão seguro). |
| Acessibilidade | 8,8 | O padrão é sólido (elementos vivos estáveis, alvos focáveis, sem temporizador, movimento reduzido), mas a ordem entre foco e anúncio depois de uma carga de documento, o contraste e o reflow não foram verificados por nenhum navegador nem tecnologia assistiva. É a dimensão que puxa a média para baixo. |
| Recuperação de erro | 9,1 | Toda recusa diz o que não aconteceu e oferece o próximo passo (atualizar, Operações, Conexão, tentar de novo); incerto nunca vira sucesso; o formulário de criação não duplica. Resíduo: não há timeout de leitura (FT-44). |
| Prevenção de erro | 9,3 | Diálogo destrutivo específico com padrão seguro, consequência dita antes e depois, botão derivado do servidor, sem navegação em criação incerta, lista fechada na URL, nenhum texto livre refletido. |
| i18n | 9,0 | Três idiomas para toda chave, formas de plural inclusive `many` do pt-BR, placeholders registrados, nenhum texto livre do servidor exibido. Resíduo: a redação em es e o título longo de Operações foram revisados apenas por leitura. |

**Final: 9,1/10** (média 9,08, arredondada). Vale somente para: o texto e a estrutura deste plano, os arquivos citados na nota de natureza e a revisão estática. **Não** certifica a interface entregue, o navegador, a tecnologia assistiva nem o teste de leitura. O gate do `@qa` ainda deve rodar UX-1 a UX-15 e registrar a 7.2 como pendente ou feita por uma validação separada.

Nenhuma correção é necessária antes da implementação para manter a nota >= 9,0; R1-R8 são necessários durante a implementação para a nota continuar válida.

## 10. Lacunas para o `@analyst` (não bloqueiam a nota)

Conferido `docs/research-index.md`: não há nota sobre regiões vivas. Pela regra de ouro, são LACUNAS, não pesquisa repetida.

1. **LACUNA (baixa):** orientação oficial (WAI-ARIA 1.2 e Authoring Practices, WCAG 2.2 SC 4.1.3 Mensagens de Status e SC 2.2.1) sobre anunciar uma mensagem escrita numa região viva logo depois de uma carga completa do documento, e sobre combiná-la com foco programático em outro elemento. Este plano segue o padrão comum (região presente e vazia, texto definido num efeito), mas não cita fonte. Necessária antes de planejar a validação com tecnologia assistiva.
2. **LACUNA (baixa):** comportamento do `<dialog>` nativo no Chromium e no Firefox para restauração de foco quando o botão de origem é removido do DOM com o diálogo aberto (o plano define uma alternativa explícita; a confirmação em MDN/especificação HTML permitiria ao `@dev` descartá-la ou mantê-la com motivo).
3. **Já adiada (arquiteto):** `useRouter`/`useSearchParams`/`<Link>` do Next 16 antes da FT-28; não é necessária aqui.

## 11. Decisões tomadas (autônomas)

- `[AUTO-DECISION]` Um elemento que troca de `role` ou dois elementos vivos → dois (razão: anúncios confiáveis; o `@po` reconhece, R4).
- `[AUTO-DECISION]` `created_remote` não atravessa a navegação → texto neutro (razão: CA 2 da FT-23).
- `[AUTO-DECISION]` Criação incerta não navega → fica no formulário (razão: evita duplicata e um "criada" falso).
- `[AUTO-DECISION]` Exclusão bloqueada é uma linha persistente do cartão vinda da projeção, com mensagem na região só quando lida pela primeira vez depois de uma ação (razão: bloqueado é um estado, não um evento; o contrato do arquiteto é só por código).
- `[AUTO-DECISION]` Recusas e `not_cancelled` usam `alert`; sucessos e pendente usam `status` (razão: a mudança pedida não aconteceu).
- `[AUTO-DECISION]` Os parâmetros da URL são removidos logo depois de aplicados, mesmo com a projeção ainda carregando (razão: CA 6 e recarregar não pode repetir; a mensagem é exata seja qual for o estado da API).
- `[AUTO-DECISION]` A navegação ao excluir a última fila usa três códigos (`queue_deleted_last_reward`, `_local`, `_converted`) para a mensagem corresponder ao tipo de fila sem texto livre na URL (razão: lista fechada do CA 6).

## Pendências por agente

| Agente | Pendência |
|---|---|
| `@po` | R4 (redação dos CAs 1/11); registrar o 9,1 e seu escopo; manter o gate de UX como "plano entregue, visual/navegador/TA não feitos". |
| `@dev` | R1-R3, R5-R8 e as chaves da seção 4 quando a implementação for agendada (depois dos demais gates). |
| `@qa` | Incluir UX-1..UX-15 no plano de testes e a prova por mutação do UX-6; medir o contraste (R8); decidir se uma validação separada de navegador/TA será agendada (7.2). |
| `@analyst` | Lacunas 1 e 2, baixa prioridade, antes da validação com tecnologia assistiva. |
| `@sm` | Nenhuma. |

## Histórico

- 2026-11-04 — `@ux-design-expert` (Uma): criado o plano único da FT-23 + FT-36 (fluxos, microcopy em en/es/pt-BR com chaves de catálogo, acessibilidade, estados, critérios testáveis, nota 9,1/10 por revisão estática, requisitos R1-R8, lacunas). Apenas documentação; nenhum código, catálogo, estilo ou issue foi alterado.
