# OPS-20 — Plano e revisão de UX (direito à devolução de pontos)

[English](../../../stories/OPS-20/ux-plan.md)

**Autoria:** `@ux-design-expert` (Uma), 2026-10-21. **Story:** [story.md](story.md) (17 CAs, decisões do proprietário 1–7). **Entradas:** [ux-research.md](ux-research.md), [architecture.md](architecture.md) (`pending_check` assíncrono, worker de verificação, três fatias, OD-1 resolvida como aditiva pela decisão 7), [data-model.md](data-model.md), [research.md](research.md) (Rodada de verificação 2), [revisão de UX das páginas da OPS-15](../OPS-15/page-ux-review.md).
**Natureza:** apenas portão de planejamento. Nenhum código, catálogo ou estilo foi alterado. Os fatos de código vêm de leitura somente em `feat/ops-15-next-panel` de `apps/frontend/features/queues/{queue-settings-form.jsx, queue-list.jsx, queue-clear.mjs, queue-lifecycle-actions.jsx}`, `features/connection/connection-page-content.jsx`, `features/operations/operations-page-content.jsx`, `styles/panel.css`, `apps/web/panel-catalog.mjs` e `apps/web/localization/catalogs/{panel,chat}/{en,es,pt-BR}.tsv`.

## 0. Resultado do portão

**Score: 9,1/10, apenas revisão estática de código e texto. Portão: APROVADO (≥ 9,0) para o escopo da seção 12.** Não coberto: renderização visual, navegador real, tecnologia assistiva, teste de leitura com streamers, rótulos reais do painel da Twitch. Três decisões do proprietário são pedidas (seção 13); nenhuma bloqueia o score, mas a OD-UX-1 muda a sequência das fatias.

## 1. Linha de base (o que existe hoje)

| Fato | Evidência |
|---|---|
| A política de pontos é um único fieldset `panel.queue_settings.section_points` (“Conta e políticas de pontos”) com três checkboxes que usam “reembolso”. Aparece em toda fila, inclusive manual. | `queue-settings-form.jsx` (`BOOLEAN_SETTINGS.slice(3)`), catálogos linhas 168–170 |
| O card da fila já mostra até ~9 botões secundários de mesmo peso (revisão da OPS-15, “Filas 6,0”). | `queue-list.jsx`, `queue-lifecycle-actions` |
| Diálogo de limpar: título genérico “Confirmar ação”, botão “Confirmar”, texto promete `{refunds}` reembolsos, sem plural (“1 pessoas”). Diálogo de excluir: mesmo título/botão genéricos. | `queue-list.jsx` L272–283, `queue-lifecycle-actions.jsx`, OPS-15 X3/X4 |
| Existe padrão de plural: chaves `.one/.many/.other` (ex.: `panel.reconciliation.complete.*`). Placeholders são registrados em `panel-catalog.mjs`. | catálogos, `panel-catalog.mjs` |
| `.button-danger` existe; diálogos usam `<dialog>` nativo com `showModal()`; a separação `role="status"`/`role="alert"` já é usada. | `panel.css` L412, diálogos das filas |
| Configurações e ações de entrada somem quando a fila está `deleting` (`canManageEntries`). | `queue-list.jsx` L335 |
| O chat imprime `{refunds}` e diz “O reembolso foi solicitado”. | `chat/*.tsv` `exit_pending`, `remove_pending`, `clear_confirm`, `clear_done` |
| A página Conexão tem só o botão “Reconectar com a Twitch” e nenhuma lista de permissões opcionais; o aviso da permissão de seguidores fica na página Comandos. | `connection-page-content.jsx`, `panel.command.follower_scope_*` |

## 2. Princípios aplicados

1. Dizer o que acontece com os pontos, no resultado para a pessoa espectadora, não em estados da Twitch (“pendente na Twitch”, nunca “UNFULFILLED”).
2. Nunca verbo de devolução no passado antes de a Twitch confirmar; “pedida” até a confirmação; 404 nunca vira “devolvido”.
3. A irreversibilidade é dita na própria opção, de novo na confirmação, com botão de verbo e foco inicial na ação menos destrutiva.
4. Nenhum botão novo na linha de ações do card; as ações novas ficam numa seção recolhida por fila.
5. Um termo por conceito (glossário, seção 9); toda frase com contagem usa chaves de plural.

## 3. Arquitetura de informação e posicionamento

### 3.1 Formulário de configurações — seção “Devolução de pontos”

Substitui o fieldset atual `section_points` (mesma posição, depois de “Privacidade”). Ordem interna, como fieldsets **irmãos** (nunca aninhados dentro de um item de rádio; nota GOV.UK em ux-research §4):

| # | Bloco | Controle | Visível quando |
|---|---|---|---|
| A | “Quando tentar devolver” | os três checkboxes atuais, com novo texto; mais uma dica fixa: remover quem ainda espera, limpar e excluir sempre tentam, seguindo a regra | a fila tem recompensa (`channel_points`, ou manual convertida com resgates antigos) |
| B | “Quem recebe os pontos de volta?” | grupo de rádio: Todo mundo (padrão) / Só inscritos / Ninguém, cada um com dica de uma frase | igual a A |
| C | “Inscritos e exceções” | checkbox “Contar inscrições de presente” (ligado); fieldset “Também devolver para”: Sua própria conta / Moderadores / VIPs (todos desligados); dica aditiva | B = Só inscritos |
| D | “Quando alguém não tiver direito” | grupo de rádio: Deixar pendente para eu decidir (padrão) / Marcar como atendido automaticamente — os pontos não poderão mais ser devolvidos | B ≠ Todo mundo (inerte em “todo mundo”, data-model §1) |
| E | Aviso de permissão | parágrafo de alerta + botão “Permitir na Twitch” (ou texto “salve antes” se houver alteração não salva) | B = Só inscritos e `channel:read:subscriptions` ausente; linha extra se C liga moderadores/VIPs sem a permissão correspondente |
| F | Nota de presente/manual | uma frase: a devolução manual é possível em “Precisa da sua decisão”; variante quando D = automático diz que a devolução manual não é possível | B ≠ Todo mundo |

Regras:
- **Oculto por completo** em filas criadas como `manual_only` e em canais que não são afiliados/parceiros (`getChannelEligibility()`), CA 9/15.
- **Resumo somente leitura** em filas manuais convertidas (architecture §5, Q3): um parágrafo com a regra e o tratamento salvos, sem campos.
- Campos ocultos mantêm o valor do rascunho e são enviados sem mudança (data-model: as flags ficam inertes, não são zeradas).
- Dica abaixo de B: “Vale para as próximas devoluções desta fila, inclusive de quem já está nela.” (verdadeiro: o snapshot é tirado na hora da decisão).
- **A confirmação de “automático” acontece ao Salvar, não ao mudar o rádio** (as setas mudam o rádio; um diálogo na mudança apareceria enquanto a pessoa só navega). Se o rascunho salvo muda D de pendente → automático, Salvar abre antes um diálogo de alerta (seção 5, diálogo S1).
- A barra de Salvar e o indicador `role="status"` de alterações continuam como estão.

### 3.2 Seção por fila “Precisa da sua decisão”

- **Posição:** dentro do card da fila, depois da linha de ações e antes dos grupos de entradas, como `<details>` (recolhido por padrão) cujo `<summary>` lê a contagem (“3 resgates precisam da sua decisão”). Só aparece com contagem > 0. Aparece **também quando a fila está `deleting`** (a exclusão espera esses itens; hoje `canManageEntries` esconde todo o resto).
- **Selo no cabeçalho do card:** o mesmo texto, pequeno, ao lado da pílula de estado (texto, não só cor). Clicar abre o `<details>` e leva o foco ao título.
- **Dois grupos** (cada um `<section>` com `<h3>` e contagem):
  1. “Verificando inscrição” — `pending_check` com `check_pending`/`rate_limited` ou `server_error`/`timeout`/`lookup_error` ainda em nova tentativa. Dica: nenhum ponto devolvido ainda, nada a fazer, mas dá para decidir agora.
  2. “Esperando você” — `awaiting_streamer` e `pending_check` que parou (`scope_missing`, `unauthorized`, `forbidden`, `channel_ineligible`, tentativas esgotadas, `malformed_response` depois da nova tentativa).
- **Conteúdo da linha:** nome de exibição; gatilho em palavras simples; idade (“há 12 min”, `Intl.RelativeTimeFormat` no idioma do painel); uma linha de estado conforme a seção 6; ações “Devolver os pontos” e “Marcar como atendido” (ambas `button-secondary`, 44 px); checkbox de seleção (os dois grupos podem ser selecionados para marcar em lote, pois o override vale para `pending_check`, architecture §2.6).
- **Ação de grupo** (só em “Esperando você” quando houver motivo que uma pessoa pode tentar de novo): “Conferir de novo com a Twitch” (rearmar, architecture Q4). Um botão por grupo, não por linha.
- **As linhas saem da lista** quando a resolução vira `refund_requested`/`fulfill_requested`; o resultado é informado pela região de status e acompanhado na página Operações (grupo de devolução de pontos existente). A lista nunca mostra “confirmado”.
- **O estado de inscrição por pessoa fica só no painel**; nada disso vai para o chat (architecture §7).

### 3.3 “Marcar como atendidos” em lote

- Barra acima das linhas: checkbox de cabeçalho “Selecionar todos os {count} desta lista” (`aria-checked="mixed"` quando parcial, derivado das linhas); texto “{count} selecionados”; botão “Marcar {count} como atendidos” (`button-danger`, desabilitado em 0). Sem “devolver os pontos” em lote (a decisão 6 só prevê lote para marcar como atendido).
- O alcance é explícito: a seleção cobre só as linhas presentes na lista desta fila; no máximo `refundOverride.bulkMax` (100). Se houver mais, o checkbox de cabeçalho seleciona os 100 primeiros (mais antigos) e a dica diz “Até 100 por vez.”
- Ao atualizar, a seleção é podada para as linhas que ainda existem; o diálogo informa a quantidade podada (“2 já foram resolvidos e saíram da seleção”).
- Resultado: um resultado parcial por linha (seção 7), nunca uma frase única misturada.

### 3.4 Texto de limpar e excluir fila

- **Diálogo de limpar** (`QueueClearAction` atual): título “Limpar a fila “{title}”?”; corpo como lista de linhas escolhidas pela regra e pelo tratamento na prévia; linha dos 15 segundos mantida; botões “Voltar” (foco inicial) e “Limpar {count} pessoas” (`button-danger`). Exige que o DTO da prévia exponha `rule`, `handling`, `count`, `redemptionCount` (detalhe de dev/arquitetura; `refundsRequested` só faz sentido em `everyone`).
- **Resultado de limpar:** uma linha por resultado não zero: pessoas removidas, devoluções pedidas, em verificação, esperando você, marcados como atendidos sem devolução.
- **Diálogo de excluir:** corpo conforme a regra; diz que a recompensa da Twitch só é excluída depois que todo resgate for resolvido, inclusive os que esperam decisão, porque excluir a recompensa marca resgates pendentes como atendidos sem devolução (F4). Botões “Voltar” / “Excluir fila” (`button-danger`).
- **Exclusão em andamento:** linha no card “A exclusão está esperando {count} resgates que precisam da sua decisão.” com botão “Ver resgates esperando decisão” (abre 3.2 e leva o foco até lá).

### 3.5 Página Conexão — permissões opcionais

- Novo card “Permissões opcionais” depois do card de status da conexão: uma linha por permissão opcional realmente usada por alguma fila (`subscriptions` se alguma fila usa Só inscritos; `moderators`/`vips` só se alguma fila liga essas opções). Cada linha: nome, propósito em uma frase, estado em texto “Permitida” / “Não permitida”.
- Um botão “Permitir na Twitch” (novo consentimento só da permissão, architecture §3), com a nota de que a pessoa vai para a Twitch, volta e a conexão atual continua funcionando.
- Na volta: `role="status"` com “Permissão concedida. {count} resgates voltaram para verificação.” ou, se negada, um aviso em `role="status"` (não alerta; não é urgente).
- O mesmo botão aparece no banner do card da fila e no bloco E das configurações; os três chamam uma única ação compartilhada.

### 3.6 Unificação de termos em textos existentes

Dentro do escopo de texto da OPS-20: trocar “reembolso” por “devolver os pontos / devolução de pontos” (pt-BR), “reembolso” por “devolver los puntos / devolución de puntos” (es) e “refund” por “return the points” (en) em `queue_settings.refund_*`, `queue.clear.*`, `queue.confirm.delete*`, `operations.group.points_refund` e nos quatro textos de chat. Pedida confirmação do proprietário (OD-UX-2) porque toca textos fora da funcionalidade nova.

## 4. Campos condicionais, grupos de rádio e foco

- Grupos de rádio: `<fieldset>`/`<legend>` nativos + `<input type="radio">` (setas nativas; não é preciso `role="radiogroup"` customizado). A dica de cada opção ligada por `aria-describedby`.
- Revelação de C/D: renderizados depois de B; o foco fica no rádio escolhido. A dica de “Só inscritos” termina com “Mais opções aparecem abaixo.”, para quem usa leitor de tela saber da revelação (GOV.UK: a revelação nem sempre é anunciada). Sem região viva para a revelação.
- Ids únicos por fila (`refund-rule-${queue.id}` …), evitando nos campos novos o tipo de erro X7 da OPS-15.
- Botão de permissão com alterações não salvas: trocado pelo texto “Salve as alterações e depois permita na Twitch.” (ir para o OAuth perderia o rascunho).
- Foco nos diálogos: ao abrir, foco no botão menos destrutivo (“Voltar”/“Manter pendente(s)”); Esc = esse botão; ao fechar, o foco volta para quem abriu. Se a linha que abriu não existe mais (sucesso, ou resolvida por outra pessoa durante a atualização), o foco vai para o título da seção (`tabindex="-1"`); se a seção inteira sumiu, para o `h2` do card (`tabindex="-1"`).
- A atualização periódica nunca move o foco, a não ser que a linha focada suma (aí vale a regra acima, mais a linha de status “A lista mudou: um resgate foi resolvido por outra pessoa.”).
- Validação do motivo: ao enviar sem motivo, foco no campo, `aria-invalid="true"`, erro ligado por `aria-describedby` (`role="alert"` só no erro).

## 5. Diálogos de confirmação

Todos usam `<dialog>` com `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` = título específico, `aria-describedby` = parágrafo do efeito. Nada de Sim/Não/OK/“Confirmar”. Salvamentos comuns não pedem confirmação (nota do SC 3.3.4 em ux-research §4).

| Id | Gatilho | Título | Foco inicial | Botão destrutivo | Motivo |
|---|---|---|---|---|---|
| S1 | Salvar com tratamento mudado para automático | “Marcar automaticamente como atendido?” | “Manter pendente” | “Salvar e marcar automaticamente” (danger) | não |
| R1 | “Devolver os pontos” na linha | “Devolver os pontos de {viewer}?” | “Voltar” | “Devolver os pontos” (primary) | sim |
| M1 | “Marcar como atendido” na linha | “Marcar o resgate de {viewer} como atendido?” | “Voltar” | “Marcar como atendido” (danger) | sim |
| B1 | Lote | “Marcar {count} resgates como atendidos?” (plural) | “Manter pendentes” | “Marcar {count} como atendidos” (danger) | sim, um por lote |
| C1 | Limpar | “Limpar a fila “{title}”?” | “Voltar” | “Limpar {count} pessoas” (danger) | não |
| D1 | Excluir | “Excluir a fila “{title}”?” | “Voltar” | “Excluir fila” (danger) | não |

- Motivo: `<select>` “Motivo (fica no histórico do painel)” com opções prontas por ação mais “Outro motivo”, que revela um `<textarea maxlength="280">` com contador visível de caracteres restantes (não vivo). O motivo salvo é o rótulo da opção no idioma do painel ou o texto digitado (o data-model exige 1–280 caracteres). Segue o padrão de select do `PriorityReasonDialog` existente.
- R1 ganha uma linha quando a linha não tem direito: “Pela regra da fila, esta pessoa não teria direito. Você pode devolver mesmo assim.” e, em `pending_check`, “A verificação em andamento será cancelada.”
- Durante o envio: botões desabilitados, `role="status"` “Enviando…”; envio duplo bloqueado (versão + id de lote).

## 6. Vocabulário de estado e regiões vivas

### 6.1 Estado → texto (painel)

| Estado interno | Texto pt-BR (chave na seção 8) | Grupo |
|---|---|---|
| `pending_check` + `check_pending` / `server_error`,`timeout`,`lookup_error` em nova tentativa | “Verificando inscrição. Nenhum ponto devolvido ainda.” (`status.checking`) | Verificando |
| `pending_check` + `rate_limited` com `next_check_at` | “A Twitch pediu uma pausa. Nova verificação às {time}. Nenhum ponto devolvido ainda.” (`status.rate_limited`) | Verificando |
| `pending_check` + `scope_missing` | “Não deu para conferir: falta a permissão da Twitch.” (`status.scope_missing`) | Esperando você |
| `pending_check` + `unauthorized` | “Não deu para conferir: reconecte a Twitch.” (`status.unauthorized`) | Esperando você |
| `pending_check` + `forbidden` | “A Twitch recusou a verificação.” (`status.forbidden`) | Esperando você |
| `pending_check` + `channel_ineligible` | “O canal não pode usar Pontos do Canal agora.” (`status.channel_ineligible`) | Esperando você |
| `pending_check` + esgotado/malformado | “Não deu para conferir com a Twitch.” (`status.check_failed`) | Esperando você |
| `awaiting_streamer` | “Sem direito pela regra da fila. Pendente na Twitch.” (`status.not_eligible`) | Esperando você |
| `refund_requested` (outbox não confirmado) | “Devolução pedida à Twitch. Aguardando confirmação.” (`status.refund_requested`) | sai da lista; linha de resultado / Operações |
| `fulfill_requested` (não confirmado) | “Marcação como atendido pedida à Twitch. Aguardando confirmação.” (`status.fulfill_requested`) | sai da lista |
| Twitch confirmou CANCELED | “Pontos devolvidos (confirmado pela Twitch).” (`status.refund_confirmed`) | só Operações |
| Twitch confirmou FULFILLED | “Marcado como atendido (confirmado pela Twitch).” (`status.fulfill_confirmed`) | só Operações |
| 404 não UNFULFILLED | “A Twitch informou que o resgate já não estava pendente. Nenhum ponto foi devolvido por este app.” (`status.not_pending_remote`) | Operações / rejeição |

O mapeador é uma função pura (`refund-decision-status.mjs`), exaustiva sobre `resolution × unknown_reason × estado do outbox`, com teste unitário de que as chaves `*_confirmed` só saem para estado do outbox confirmado pela Twitch.

### 6.2 Regiões vivas

- Uma região `role="status"` persistente por seção de decisão para resultados de ação (polite). Criada na montagem, não junto da mensagem, para ser anunciada de forma confiável.
- `role="alert"` só para falhas de ação (erro, versão desatualizada) e para o erro do motivo. Avisos (permissão negada, lote parcial) usam `role="status"` com `is-warning`.
- Atualizações do worker/polling (linhas passando de Verificando para Esperando, contagens mudando) **não** são anunciadas; a contagem do resumo muda em silêncio (evita o excesso de anúncios da falha F103). Exceção: a linha de linha focada removida da seção 4.
- Mensagens de resultado dizem “pedida/enviada à Twitch”, nunca “devolvidos”.

## 7. Celular (390 × 844) e comportamento com teclado/TA

- Configurações: um rádio/checkbox por linha, rótulos de largura total, dicas embaixo; o rótulo longo da opção automática quebra linha (sem cortar); botão de permissão com largura total.
- Linhas de decisão empilhadas — linha 1 checkbox (alvo 44 × 44) + nome; linha 2 gatilho · idade; linha 3 estado; linha 4 duas ações numa grade de 2 colunas com botões de 44 px. Sem rolagem horizontal em 390 px. A barra do lote é estática (não fixa) acima da lista e quebra em duas linhas.
- Diálogos: `width: min(540px, calc(100vw - 28px))` atual; ações empilhadas com o botão destrutivo **por último** no DOM e na tela; textarea do motivo com 3 linhas.
- O selo do card quebra para baixo do título em telas estreitas.
- Teclado: toda ação alcançável por Tab na ordem de leitura; `<details>` abre com Enter/Espaço; setas dentro dos grupos de rádio; Esc fecha diálogos na opção segura; sem armadilha de teclado; foco visível pelo `:focus-visible` global atual.
- TA: nomes acessíveis incluem a pessoa (“Devolver os pontos de {viewer}”, “Selecionar o resgate de {viewer}”), para os botões repetidos serem distinguíveis; grupos são seções rotuladas com títulos; contagens em texto.

## 8. Rascunhos de texto (en / pt-BR / es)

As chaves de plural seguem `panel.reconciliation.*` (`.one`, `.many`, `.other`; `.many` = texto de `.other`). Todo placeholder precisa ser registrado em `panel-catalog.mjs`. `(changed)` = chave existente com texto novo. As tabelas são trilíngues e idênticas às da versão em inglês.

### 8.1 Formulário de configurações

| Chave | Placeholders | en | pt-BR | es |
|---|---|---|---|---|
| `panel.queue_settings.section_points` (changed) | — | Returning points | Devolução de pontos | Devolución de puntos |
| `panel.refund.when.legend` | — | When to try to return points | Quando tentar devolver | Cuándo intentar devolver |
| `panel.queue_settings.refund_removed` (changed) | — | When I remove someone who was called or is being served | Ao remover quem foi chamado ou está em atendimento | Al quitar a alguien llamado o en atención |
| `panel.queue_settings.refund_no_show` (changed) | — | When the called person doesn't show up | Quando a pessoa chamada não aparecer | Cuando la persona llamada no se presente |
| `panel.queue_settings.refund_viewer_leave` (changed) | — | When the called person leaves the queue | Quando a pessoa chamada sair da fila | Cuando la persona llamada salga de la cola |
| `panel.refund.when.always_hint` | — | Removing someone still waiting, clearing or deleting the queue always tries to return points, following the rule below. | Remover quem ainda espera, limpar ou excluir a fila sempre tenta devolver os pontos, seguindo a regra abaixo. | Quitar a quien aún espera, vaciar o eliminar la cola siempre intenta devolver los puntos, según la regla de abajo. |
| `panel.refund.rule.legend` | — | Who gets their points back? | Quem recebe os pontos de volta? | ¿Quién recupera sus puntos? |
| `panel.refund.rule.everyone` | — | Everyone | Todo mundo | Todos |
| `panel.refund.rule.everyone_hint` | — | Same as today: everyone gets their points back. | Como hoje: todos recebem os pontos de volta. | Como hasta ahora: todos recuperan sus puntos. |
| `panel.refund.rule.subscribers` | — | Only subscribers | Só inscritos | Solo suscriptores |
| `panel.refund.rule.subscribers_hint` | — | Checked with Twitch when the points would be returned. More options appear below. | Conferido com a Twitch na hora de devolver. Mais opções aparecem abaixo. | Se comprueba con Twitch al momento de devolver. Más opciones aparecen abajo. |
| `panel.refund.rule.nobody` | — | Nobody | Ninguém | Nadie |
| `panel.refund.rule.nobody_hint` | — | Points are never returned automatically. | Os pontos nunca são devolvidos automaticamente. | Los puntos nunca se devuelven automáticamente. |
| `panel.refund.rule.applies_hint` | — | Applies to the next returns in this queue, including people already in it. | Vale para as próximas devoluções desta fila, inclusive de quem já está nela. | Se aplica a las próximas devoluciones de esta cola, incluso a quienes ya están en ella. |
| `panel.refund.audience.legend` | — | Subscribers and exceptions | Inscritos e exceções | Suscriptores y excepciones |
| `panel.refund.audience.count_gifted` | — | Count gifted subscriptions | Contar inscrições de presente | Contar suscripciones regaladas |
| `panel.refund.audience.count_gifted_hint` | — | Someone who received a gifted sub counts as a subscriber. | Quem ganhou uma inscrição de presente conta como inscrito. | Quien recibió una suscripción regalada cuenta como suscriptor. |
| `panel.refund.audience.also_legend` | — | Also return points to | Também devolver para | También devolver a |
| `panel.refund.audience.broadcaster` | — | Your own account | Sua própria conta | Tu propia cuenta |
| `panel.refund.audience.moderators` | — | Moderators | Moderadores | Moderadores |
| `panel.refund.audience.vips` | — | VIPs | VIPs | VIP |
| `panel.refund.audience.additive_hint` | — | Moderators and VIPs who subscribe already get points back as subscribers. Check these to include the ones who don't. | Moderadores e VIPs inscritos já recebem como inscritos. Marque para incluir também os que não são inscritos. | Los moderadores y VIP suscritos ya los recuperan como suscriptores. Marca para incluir también a los que no lo son. |
| `panel.refund.handling.legend` | — | When someone isn't eligible | Quando alguém não tiver direito | Cuando alguien no tenga derecho |
| `panel.refund.handling.keep` | — | Keep it pending so I can decide | Deixar pendente para eu decidir | Dejar pendiente para decidir yo |
| `panel.refund.handling.keep_hint` | — | The redemption stays pending in Twitch and appears in "Needs your decision". You can still return the points. | O resgate fica pendente na Twitch e aparece em “Precisa da sua decisão”. Você ainda pode devolver os pontos. | El canje queda pendiente en Twitch y aparece en “Necesita tu decisión”. Aún puedes devolver los puntos. |
| `panel.refund.handling.auto` | — | Mark as served automatically — points can no longer be returned | Marcar como atendido automaticamente — os pontos não poderão mais ser devolvidos | Marcar como atendido automáticamente — ya no se podrán devolver los puntos |
| `panel.refund.handling.auto_hint` | — | Keeps your Twitch request list clean, but Twitch does not allow returning points afterwards. | Deixa a lista de pedidos da Twitch limpa, mas a Twitch não permite devolver os pontos depois. | Mantiene limpia tu lista de solicitudes de Twitch, pero Twitch no permite devolver los puntos después. |
| `panel.refund.manual_note` | — | Did someone help with a gifted sub? You can return the points of any pending redemption by hand in "Needs your decision". | Alguém ajudou com uma inscrição de presente? Você pode devolver os pontos de qualquer resgate pendente em “Precisa da sua decisão”. | ¿Alguien ayudó con una suscripción regalada? Puedes devolver los puntos de cualquier canje pendiente en “Necesita tu decisión”. |
| `panel.refund.manual_note_auto` | — | With automatic "served", redemptions of people who aren't eligible can't have their points returned by hand. | Com “atendido automaticamente”, os resgates de quem não tem direito não podem ter os pontos devolvidos manualmente. | Con “atendido automáticamente”, a los canjes de quien no tiene derecho no se les pueden devolver los puntos manualmente. |
| `panel.refund.scope.missing` | — | To check subscribers, Twitch needs your permission. Until then, returns in this queue wait for your decision. No points are returned without it. | Para conferir inscritos, a Twitch precisa da sua permissão. Até lá, as devoluções desta fila esperam a sua decisão. Nenhum ponto é devolvido sem ela. | Para comprobar suscriptores, Twitch necesita tu permiso. Hasta entonces, las devoluciones de esta cola esperan tu decisión. No se devuelven puntos sin él. |
| `panel.refund.scope.missing_roles` | — | To check moderators and VIPs, allow it on Twitch too. Until then, people who aren't subscribers wait for your decision. | Para conferir moderadores e VIPs, permita também na Twitch. Até lá, quem não for inscrito espera a sua decisão. | Para comprobar moderadores y VIP, permítelo también en Twitch. Hasta entonces, quien no sea suscriptor espera tu decisión. |
| `panel.refund.scope.save_first` | — | Save your changes, then allow it on Twitch. | Salve as alterações e depois permita na Twitch. | Guarda los cambios y luego permítelo en Twitch. |
| `panel.refund.scope.allow` | — | Allow on Twitch | Permitir na Twitch | Permitir en Twitch |
| `panel.refund.readonly_summary` | `rule`, `handling` | This queue is now manual. Its earlier redemptions keep this rule: {rule}. When someone isn't eligible: {handling}. | Esta fila agora é manual. Os resgates antigos seguem esta regra: {rule}. Quando alguém não tiver direito: {handling}. | Esta cola ahora es manual. Los canjes anteriores siguen esta regla: {rule}. Cuando alguien no tenga derecho: {handling}. |
| `panel.refund.confirm_auto.title` | — | Mark as served automatically? | Marcar automaticamente como atendido? | ¿Marcar automáticamente como atendido? |
| `panel.refund.confirm_auto.body` | `title` | In “{title}”, redemptions of people who aren't eligible will be marked as served on Twitch. After that, their points can no longer be returned. Redemptions already pending don't change. | Em “{title}”, os resgates de quem não tiver direito serão marcados como atendidos na Twitch. Depois disso, não dá mais para devolver os pontos desses resgates. Os resgates que já estão pendentes não mudam. | En “{title}”, los canjes de quien no tenga derecho se marcarán como atendidos en Twitch. Después, ya no se podrán devolver sus puntos. Los canjes que ya están pendientes no cambian. |
| `panel.refund.confirm_auto.keep` | — | Keep pending | Manter pendente | Mantener pendiente |
| `panel.refund.confirm_auto.accept` | — | Save and mark automatically | Salvar e marcar automaticamente | Guardar y marcar automáticamente |

### 8.2 Lista de decisão, linhas e lote

| Chave | Placeholders | en | pt-BR | es |
|---|---|---|---|---|
| `panel.refund.list.summary.one/.other` | `count` | 1 redemption needs your decision / {count} redemptions need your decision | 1 resgate precisa da sua decisão / {count} resgates precisam da sua decisão | 1 canje necesita tu decisión / {count} canjes necesitan tu decisión |
| `panel.refund.list.title` | — | Needs your decision | Precisa da sua decisão | Necesita tu decisión |
| `panel.refund.group.checking` | — | Checking subscription | Verificando inscrição | Comprobando suscripción |
| `panel.refund.group.checking_hint` | — | No points returned yet. Nothing to do, but you can decide now. | Nenhum ponto devolvido ainda. Não precisa fazer nada, mas você pode decidir agora. | Aún no se devolvieron puntos. No hace falta hacer nada, pero puedes decidir ahora. |
| `panel.refund.group.awaiting` | — | Waiting for you | Esperando você | Esperándote |
| `panel.refund.group.recheck` | — | Check again with Twitch | Conferir de novo com a Twitch | Comprobar de nuevo con Twitch |
| `panel.refund.trigger.removed_waiting` | — | Removed while waiting | Removido enquanto esperava | Quitado mientras esperaba |
| `panel.refund.trigger.removed_while_called` | — | Removed after being called | Removido depois de chamado | Quitado después de ser llamado |
| `panel.refund.trigger.viewer_left_called` | — | Left after being called | Saiu depois de chamado | Se fue después de ser llamado |
| `panel.refund.trigger.no_show` | — | Didn't show up | Não apareceu | No se presentó |
| `panel.refund.trigger.queue_cleared` | — | Queue cleared | Fila limpa | Cola vaciada |
| `panel.refund.trigger.queue_deleted` | — | Queue deleted | Fila excluída | Cola eliminada |
| `panel.refund.row.age` | `age` | {age} | {age} | {age} (value from `Intl.RelativeTimeFormat`) |
| `panel.refund.status.checking` | — | Checking subscription. No points returned yet. | Verificando inscrição. Nenhum ponto devolvido ainda. | Comprobando suscripción. Aún no se devolvieron puntos. |
| `panel.refund.status.rate_limited` | `time` | Twitch asked for a pause. Next check at {time}. No points returned yet. | A Twitch pediu uma pausa. Nova verificação às {time}. Nenhum ponto devolvido ainda. | Twitch pidió una pausa. Nueva comprobación a las {time}. Aún no se devolvieron puntos. |
| `panel.refund.status.scope_missing` | — | Couldn't check: Twitch permission is missing. | Não deu para conferir: falta a permissão da Twitch. | No se pudo comprobar: falta el permiso de Twitch. |
| `panel.refund.status.unauthorized` | — | Couldn't check: reconnect Twitch. | Não deu para conferir: reconecte a Twitch. | No se pudo comprobar: vuelve a conectar Twitch. |
| `panel.refund.status.forbidden` | — | Twitch refused the check. | A Twitch recusou a verificação. | Twitch rechazó la comprobación. |
| `panel.refund.status.channel_ineligible` | — | The channel can't use Channel Points right now. | O canal não pode usar Pontos do Canal agora. | El canal no puede usar Puntos del Canal ahora. |
| `panel.refund.status.check_failed` | — | Couldn't check with Twitch. | Não deu para conferir com a Twitch. | No se pudo comprobar con Twitch. |
| `panel.refund.status.not_eligible` | — | Not eligible under this queue's rule. Pending in Twitch. | Sem direito pela regra da fila. Pendente na Twitch. | Sin derecho según la regla de la cola. Pendiente en Twitch. |
| `panel.refund.status.refund_requested` | — | Return requested from Twitch. Waiting for confirmation. | Devolução pedida à Twitch. Aguardando confirmação. | Devolución solicitada a Twitch. Esperando confirmación. |
| `panel.refund.status.fulfill_requested` | — | "Served" requested from Twitch. Waiting for confirmation. | Marcação como atendido pedida à Twitch. Aguardando confirmação. | Marcado como atendido solicitado a Twitch. Esperando confirmación. |
| `panel.refund.status.refund_confirmed` | — | Points returned (confirmed by Twitch). | Pontos devolvidos (confirmado pela Twitch). | Puntos devueltos (confirmado por Twitch). |
| `panel.refund.status.fulfill_confirmed` | — | Marked as served (confirmed by Twitch). | Marcado como atendido (confirmado pela Twitch). | Marcado como atendido (confirmado por Twitch). |
| `panel.refund.status.not_pending_remote` | — | Twitch said the redemption was no longer pending. No points were returned by this app. | A Twitch informou que o resgate já não estava pendente. Nenhum ponto foi devolvido por este app. | Twitch indicó que el canje ya no estaba pendiente. Esta app no devolvió puntos. |
| `panel.refund.action.return` | `viewer` | Return the points (aria: Return the points of {viewer}) | Devolver os pontos (aria: Devolver os pontos de {viewer}) | Devolver los puntos (aria: Devolver los puntos de {viewer}) |
| `panel.refund.action.serve` | `viewer` | Mark as served (aria: Mark {viewer}'s redemption as served) | Marcar como atendido (aria: Marcar o resgate de {viewer} como atendido) | Marcar como atendido (aria: Marcar el canje de {viewer} como atendido) |
| `panel.refund.select.row` | `viewer` | Select {viewer}'s redemption | Selecionar o resgate de {viewer} | Seleccionar el canje de {viewer} |
| `panel.refund.select.all.one/.other` | `count` | Select the 1 in this list / Select all {count} in this list | Selecionar o 1 desta lista / Selecionar todos os {count} desta lista | Seleccionar el 1 de esta lista / Seleccionar los {count} de esta lista |
| `panel.refund.select.count.one/.other` | `count` | 1 selected / {count} selected | 1 selecionado / {count} selecionados | 1 seleccionado / {count} seleccionados |
| `panel.refund.select.cap` | `max` | Up to {max} at a time. | Até {max} por vez. | Hasta {max} a la vez. |
| `panel.refund.bulk.button.one/.other` | `count` | Mark 1 as served / Mark {count} as served | Marcar 1 como atendido / Marcar {count} como atendidos | Marcar 1 como atendido / Marcar {count} como atendidos |
| `panel.refund.list.loading` | — | Loading redemptions… | Carregando resgates… | Cargando canjes… |
| `panel.refund.list.failed` | — | Couldn't load the redemptions. | Não foi possível carregar os resgates. | No se pudieron cargar los canjes. |
| `panel.refund.list.retry` | — | Try again | Tentar de novo | Intentar de nuevo |
| `panel.refund.list.changed` | — | The list changed: a redemption was resolved by someone else. | A lista mudou: um resgate foi resolvido por outra pessoa. | La lista cambió: otra persona resolvió un canje. |
| `panel.refund.list.empty_after` | — | No redemptions waiting for a decision. | Nenhum resgate esperando decisão. | No hay canjes esperando decisión. |
| `panel.refund.open_list` | — | See redemptions waiting for a decision | Ver resgates esperando decisão | Ver canjes que esperan decisión |

### 8.3 Diálogos de override, motivo e resultados

| Chave | Placeholders | en | pt-BR | es |
|---|---|---|---|---|
| `panel.refund.dialog.back` | — | Back | Voltar | Volver |
| `panel.refund.r1.title` | `viewer` | Return the points of {viewer}? | Devolver os pontos de {viewer}? | ¿Devolver los puntos de {viewer}? |
| `panel.refund.r1.body` | — | Twitch will return the points of this redemption. Once requested, it can't be undone. | A Twitch vai devolver os pontos deste resgate. Depois do pedido, não dá para desfazer. | Twitch devolverá los puntos de este canje. Una vez solicitado, no se puede deshacer. |
| `panel.refund.r1.not_eligible` | — | Under this queue's rule, this person wouldn't be eligible. You can return them anyway. | Pela regra da fila, esta pessoa não teria direito. Você pode devolver mesmo assim. | Según la regla de la cola, esta persona no tendría derecho. Puedes devolverlos igualmente. |
| `panel.refund.r1.cancels_check` | — | The check in progress will be cancelled. | A verificação em andamento será cancelada. | Se cancelará la comprobación en curso. |
| `panel.refund.m1.title` | `viewer` | Mark {viewer}'s redemption as served? | Marcar o resgate de {viewer} como atendido? | ¿Marcar el canje de {viewer} como atendido? |
| `panel.refund.m1.body` | — | After that, the points of this redemption can no longer be returned. | Depois disso, não dá mais para devolver os pontos deste resgate. | Después, ya no se podrán devolver los puntos de este canje. |
| `panel.refund.b1.title.one/.other` | `count` | Mark 1 redemption as served? / Mark {count} redemptions as served? | Marcar 1 resgate como atendido? / Marcar {count} resgates como atendidos? | ¿Marcar 1 canje como atendido? / ¿Marcar {count} canjes como atendidos? |
| `panel.refund.b1.body` | — | After that, the points of these redemptions can no longer be returned. Any already resolved by someone else are skipped. | Depois disso, não dá mais para devolver os pontos desses resgates. Os que outra pessoa já resolveu são ignorados. | Después, ya no se podrán devolver los puntos de estos canjes. Los que otra persona ya resolvió se omiten. |
| `panel.refund.b1.pruned.one/.other` | `count` | 1 was already resolved and left the selection. / {count} were already resolved and left the selection. | 1 já foi resolvido e saiu da seleção. / {count} já foram resolvidos e saíram da seleção. | 1 ya se resolvió y salió de la selección. / {count} ya se resolvieron y salieron de la selección. |
| `panel.refund.b1.keep` | — | Keep pending | Manter pendentes | Mantener pendientes |
| `panel.refund.reason.label` | — | Reason (kept in the panel history) | Motivo (fica no histórico do painel) | Motivo (queda en el historial del panel) |
| `panel.refund.reason.hint` | `max` | Only shown in the panel. Up to {max} characters. | Só aparece no painel. Até {max} caracteres. | Solo se muestra en el panel. Hasta {max} caracteres. |
| `panel.refund.reason.preset.helped_sub` | — | Helped with a sub or gift | Ajudou com inscrição ou presente | Ayudó con una suscripción o regalo |
| `panel.refund.reason.preset.queue_mistake` | — | Queue mistake | Erro na fila | Error en la cola |
| `panel.refund.reason.preset.not_eligible` | — | Not eligible under the channel rule | Sem direito pela regra do canal | Sin derecho según la regla del canal |
| `panel.refund.reason.preset.served_elsewhere` | — | Already served outside the queue | Já atendido fora da fila | Ya atendido fuera de la cola |
| `panel.refund.reason.preset.other` | — | Other reason | Outro motivo | Otro motivo |
| `panel.refund.reason.text_label` | — | Write the reason | Escreva o motivo | Escribe el motivo |
| `panel.refund.reason.remaining` | `count` | {count} characters left | {count} caracteres restantes | {count} caracteres restantes |
| `panel.refund.reason.required` | — | Choose or write a reason to continue. | Escolha ou escreva um motivo para continuar. | Elige o escribe un motivo para continuar. |
| `panel.refund.sending` | — | Sending… | Enviando… | Enviando… |
| `panel.refund.result.return` | `viewer` | Return of {viewer}'s points requested from Twitch. Waiting for confirmation. | Devolução dos pontos de {viewer} pedida à Twitch. Aguardando confirmação. | Devolución de los puntos de {viewer} solicitada a Twitch. Esperando confirmación. |
| `panel.refund.result.serve` | `viewer` | "Served" for {viewer}'s redemption requested from Twitch. Waiting for confirmation. | Marcação como atendido do resgate de {viewer} pedida à Twitch. Aguardando confirmação. | Marcado como atendido del canje de {viewer} solicitado a Twitch. Esperando confirmación. |
| `panel.refund.result.bulk_done.one/.other` | `count` | 1 sent to Twitch to be marked as served. / {count} sent to Twitch to be marked as served. | 1 enviado à Twitch para marcar como atendido. / {count} enviados à Twitch para marcar como atendidos. | 1 enviado a Twitch para marcar como atendido. / {count} enviados a Twitch para marcar como atendidos. |
| `panel.refund.result.bulk_skipped.one/.other` | `count` | 1 skipped: already resolved. / {count} skipped: already resolved. | 1 ignorado: já estava resolvido. / {count} ignorados: já estavam resolvidos. | 1 omitido: ya estaba resuelto. / {count} omitidos: ya estaban resueltos. |
| `panel.refund.result.bulk_rejected.one/.other` | `count` | 1 couldn't be changed: no longer pending in Twitch. / {count} couldn't be changed: no longer pending in Twitch. | 1 não pôde ser alterado: não está mais pendente na Twitch. / {count} não puderam ser alterados: não estão mais pendentes na Twitch. | 1 no se pudo cambiar: ya no está pendiente en Twitch. / {count} no se pudieron cambiar: ya no están pendientes en Twitch. |
| `panel.refund.result.track` | — | Follow the result in Twitch sync and point returns. | Acompanhe o resultado em Sincronização com a Twitch e devolução de pontos. | Sigue el resultado en Sincronización con Twitch y devolución de puntos. |
| `panel.refund.reject.already_has_intent` | — | This redemption already has a request in progress. Nothing was changed. | Este resgate já tem um pedido em andamento. Nada foi alterado. | Este canje ya tiene una solicitud en curso. No se cambió nada. |
| `panel.refund.reject.not_unfulfilled` | — | This redemption is no longer pending in Twitch. Nothing was changed. | Este resgate não está mais pendente na Twitch. Nada foi alterado. | Este canje ya no está pendiente en Twitch. No se cambió nada. |
| `panel.refund.reject.stale` | — | The list changed while you were deciding. It's updated; check and try again. | A lista mudou enquanto você decidia. Já atualizamos; confira e tente de novo. | La lista cambió mientras decidías. Ya está actualizada; revisa e inténtalo de nuevo. |
| `panel.refund.recheck.done.one/.other` | `count` | 1 redemption is being checked again. / {count} redemptions are being checked again. | 1 resgate voltou para verificação. / {count} resgates voltaram para verificação. | 1 canje vuelve a comprobarse. / {count} canjes vuelven a comprobarse. |

Erros inesperados mantêm o texto genérico atual mais `panel.error.reference` `{id}` (regra de erros do CLAUDE.md).

### 8.4 Limpar e excluir

| Chave | Placeholders | en | pt-BR | es |
|---|---|---|---|---|
| `panel.queue.clear.title` | `title` | Clear the queue “{title}”? | Limpar a fila “{title}”? | ¿Vaciar la cola “{title}”? |
| `panel.queue.clear.people.one/.other` | `count` | 1 person will be removed. / {count} people will be removed. | 1 pessoa será removida. / {count} pessoas serão removidas. | Se quitará 1 persona. / Se quitarán {count} personas. |
| `panel.queue.clear.rule_everyone.one/.other` | `count` | Twitch will be asked to return the points of 1 redemption. / … of {count} redemptions. | A devolução dos pontos de 1 resgate será pedida à Twitch. / … de {count} resgates será pedida à Twitch. | Se pedirá a Twitch devolver los puntos de 1 canje. / … de {count} canjes. |
| `panel.queue.clear.rule_subscribers_keep.one/.other` | `count` | 1 redemption will be checked with Twitch. If eligible, its return is requested; if not, it waits for your decision. / {count} redemptions will be checked with Twitch. Eligible ones get a return request; the others wait for your decision. | 1 resgate será conferido com a Twitch. Se tiver direito, a devolução é pedida; se não, espera a sua decisão. / {count} resgates serão conferidos com a Twitch. Quem tiver direito tem a devolução pedida; os demais esperam a sua decisão. | Se comprobará 1 canje con Twitch. Si tiene derecho, se solicita la devolución; si no, espera tu decisión. / Se comprobarán {count} canjes con Twitch. A quien tenga derecho se le solicita la devolución; los demás esperan tu decisión. |
| `panel.queue.clear.rule_subscribers_auto.one/.other` | `count` | … if not, it is marked as served without return. / … the others are marked as served without return. | … se não, é marcado como atendido, sem devolução. / … os demais são marcados como atendidos, sem devolução. | … si no, se marca como atendido, sin devolución. / … los demás se marcan como atendidos, sin devolución. |
| `panel.queue.clear.rule_nobody_keep.one/.other` | `count` | No points will be returned. 1 redemption will wait for your decision. / {count} redemptions will wait for your decision. | Nenhum ponto será devolvido. 1 resgate vai esperar a sua decisão. / {count} resgates vão esperar a sua decisão. | No se devolverán puntos. 1 canje esperará tu decisión. / {count} canjes esperarán tu decisión. |
| `panel.queue.clear.rule_nobody_auto.one/.other` | `count` | No points will be returned. 1 redemption will be marked as served. / {count} redemptions will be marked as served. | Nenhum ponto será devolvido. 1 resgate será marcado como atendido. / {count} resgates serão marcados como atendidos. | No se devolverán puntos. 1 canje se marcará como atendido. / {count} canjes se marcarán como atendidos. |
| `panel.queue.clear.expiry` | — | This confirmation is valid for 15 seconds. | Esta confirmação vale por 15 segundos. | Esta confirmación es válida durante 15 segundos. |
| `panel.queue.clear.accept.one/.other` | `count` | Clear 1 person / Clear {count} people | Limpar 1 pessoa / Limpar {count} pessoas | Quitar 1 persona / Quitar {count} personas |
| `panel.queue.clear.done.one/.other` (changed) | `count` | 1 person removed. / {count} people removed. | 1 pessoa removida. / {count} pessoas removidas. | Se quitó 1 persona. / Se quitaron {count} personas. |
| `panel.queue.clear.out.return.one/.other` | `count` | 1 return requested from Twitch. / {count} returns requested from Twitch. | 1 devolução pedida à Twitch. / {count} devoluções pedidas à Twitch. | 1 devolución solicitada a Twitch. / {count} devoluciones solicitadas a Twitch. |
| `panel.queue.clear.out.checking.one/.other` | `count` | 1 being checked. / {count} being checked. | 1 em verificação. / {count} em verificação. | 1 en comprobación. / {count} en comprobación. |
| `panel.queue.clear.out.awaiting.one/.other` | `count` | 1 waiting for your decision. / {count} waiting for your decision. | 1 esperando a sua decisão. / {count} esperando a sua decisão. | 1 esperando tu decisión. / {count} esperando tu decisión. |
| `panel.queue.clear.out.served.one/.other` | `count` | 1 marked as served, without return. / {count} marked as served, without return. | 1 marcado como atendido, sem devolução. / {count} marcados como atendidos, sem devolução. | 1 marcado como atendido, sin devolución. / {count} marcados como atendidos, sin devolución. |
| `panel.queue.delete.title` | `title` | Delete the queue “{title}”? | Excluir a fila “{title}”? | ¿Eliminar la cola “{title}”? |
| `panel.queue.confirm.delete.one/.other` (changed, everyone) | `count` | 1 active entry will be removed and Twitch will be asked to return its points. The reward is deleted only after every redemption is resolved. This may stay pending if Twitch doesn't confirm. / {count} active entries … their points … | 1 entrada ativa será removida e a devolução dos pontos será pedida à Twitch. A recompensa só é excluída depois que todos os resgates forem resolvidos. Pode ficar pendente se a Twitch não confirmar. / {count} entradas ativas serão removidas e a devolução dos pontos será pedida à Twitch. … | Se quitará 1 entrada activa y se pedirá a Twitch devolver sus puntos. La recompensa solo se elimina cuando todos los canjes estén resueltos. Puede quedar pendiente si Twitch no confirma. / Se quitarán {count} entradas activas … |
| `panel.queue.confirm.delete_rule.one/.other` (subscribers or nobody) | `count` | 1 active entry will be removed. Returning its points follows this queue's rule. The Twitch reward is deleted only after every redemption is resolved, including those waiting for your decision; this keeps Twitch from marking them as served without return. / {count} active entries … | 1 entrada ativa será removida. A devolução dos pontos segue a regra da fila. A recompensa da Twitch só é excluída depois que todos os resgates forem resolvidos, inclusive os que esperam a sua decisão; isso evita que a Twitch os marque como atendidos sem devolução. / {count} entradas ativas serão removidas. … | Se quitará 1 entrada activa. La devolución de puntos sigue la regla de la cola. La recompensa de Twitch solo se elimina cuando todos los canjes estén resueltos, incluso los que esperan tu decisión; así Twitch no los marca como atendidos sin devolución. / Se quitarán {count} entradas activas. … |
| `panel.queue.delete.accept` | — | Delete queue | Excluir fila | Eliminar cola |
| `panel.queue.delete.waiting_decisions.one/.other` | `count` | Deletion is waiting for 1 redemption that needs your decision. / … for {count} redemptions that need your decision. | A exclusão está esperando 1 resgate que precisa da sua decisão. / … {count} resgates que precisam da sua decisão. | La eliminación espera 1 canje que necesita tu decisión. / … {count} canjes que necesitan tu decisión. |

“…” nesta tabela repete a mesma frase na forma plural; a implementação precisa escrever o texto completo.

### 8.5 Página Conexão e banner da fila

| Chave | Placeholders | en | pt-BR | es |
|---|---|---|---|---|
| `panel.connection.optional.title` | — | Optional permissions | Permissões opcionais | Permisos opcionales |
| `panel.connection.optional.subscriptions` | — | Check subscribers | Conferir inscritos | Comprobar suscriptores |
| `panel.connection.optional.subscriptions_hint` | — | Used by queues set to "Only subscribers" to know who gets points back. | Usada pelas filas com “Só inscritos” para saber quem recebe os pontos de volta. | La usan las colas con “Solo suscriptores” para saber quién recupera sus puntos. |
| `panel.connection.optional.moderators` | — | Check moderators | Conferir moderadores | Comprobar moderadores |
| `panel.connection.optional.vips` | — | Check VIPs | Conferir VIPs | Comprobar VIP |
| `panel.connection.optional.roles_hint` | — | Used only by queues that also return points to moderators or VIPs. | Usada só por filas que também devolvem pontos a moderadores ou VIPs. | La usan solo las colas que también devuelven puntos a moderadores o VIP. |
| `panel.connection.optional.granted` | — | Allowed | Permitida | Permitido |
| `panel.connection.optional.missing` | — | Not allowed | Não permitida | No permitido |
| `panel.connection.optional.note` | — | You'll go to Twitch and come back here. Your current connection keeps working. | Você vai para a Twitch e volta para cá. A conexão atual continua funcionando. | Irás a Twitch y volverás aquí. Tu conexión actual sigue funcionando. |
| `panel.connection.optional.done.one/.other` | `count` | Permission granted. 1 redemption is being checked again. / … {count} redemptions are being checked again. | Permissão concedida. 1 resgate voltou para verificação. / … {count} resgates voltaram para verificação. | Permiso concedido. 1 canje vuelve a comprobarse. / … {count} canjes vuelven a comprobarse. |
| `panel.connection.optional.done_none` | — | Permission granted. | Permissão concedida. | Permiso concedido. |
| `panel.connection.optional.denied` | — | Twitch didn't grant the permission. Redemptions keep waiting for your decision. | A Twitch não concedeu a permissão. Os resgates continuam esperando a sua decisão. | Twitch no concedió el permiso. Los canjes siguen esperando tu decisión. |
| `panel.refund.banner.scope_missing` | — | This queue checks subscribers, but the Twitch permission is missing. Until then, returns wait for your decision. | Esta fila confere inscritos, mas falta a permissão da Twitch. Até lá, as devoluções esperam a sua decisão. | Esta cola comprueba suscriptores, pero falta el permiso de Twitch. Hasta entonces, las devoluciones esperan tu decisión. |
| `panel.operations.group.points_refund` (changed) | — | Point returns | Devolução de pontos | Devolución de puntos |

### 8.6 Chat (conforme a regra; privacidade: sem estado de inscrição por pessoa)

| Chave | Placeholders | en | pt-BR | es |
|---|---|---|---|---|
| `chat.queue.exit_pending` (changed, everyone) | — | You left the queue. Returning your points was requested and is awaiting confirmation. | Você saiu da fila. A devolução dos pontos foi pedida e aguarda confirmação. | Saliste de la cola. Se pidió devolver tus puntos y está pendiente de confirmación. |
| `chat.queue.exit_rule` (subscribers) | — | You left the queue. Returning points follows the channel's rule. | Você saiu da fila. A devolução dos pontos segue a regra do canal. | Saliste de la cola. La devolución de puntos sigue la regla del canal. |
| `chat.queue.exit_no_return` (nobody) | — | You left the queue. | Você saiu da fila. | Saliste de la cola. |
| `chat.queue.remove_pending` (changed, everyone) | — | Person removed. Returning the points is awaiting confirmation. | Pessoa removida. A devolução dos pontos aguarda confirmação. | Persona quitada. La devolución de puntos está pendiente de confirmación. |
| `chat.queue.remove_rule` (subscribers/nobody) | — | Person removed. Returning points follows the channel's rule. | Pessoa removida. A devolução dos pontos segue a regra do canal. | Persona quitada. La devolución de puntos sigue la regla del canal. |
| `chat.queue.clear_confirm` (changed, everyone) | `queue`, `clear_command`, `confirm_command`, `count`, `refunds` | Confirm within 15 seconds with !{queue} {clear_command} {confirm_command}: {count} people will be removed; returning points will be requested for {refunds}. | Confirme em até 15 segundos com !{queue} {clear_command} {confirm_command}: {count} pessoas serão removidas; a devolução dos pontos será pedida para {refunds}. | Confirma en 15 segundos con !{queue} {clear_command} {confirm_command}: se quitarán {count} personas; se pedirá devolver los puntos de {refunds}. |
| `chat.queue.clear_confirm_rule` (subscribers/nobody) | `queue`, `clear_command`, `confirm_command`, `count` | Confirm within 15 seconds with !{queue} {clear_command} {confirm_command}: {count} people will be removed; returning points follows the channel's rule. | Confirme em até 15 segundos com !{queue} {clear_command} {confirm_command}: {count} pessoas serão removidas; a devolução dos pontos segue a regra do canal. | Confirma en 15 segundos con !{queue} {clear_command} {confirm_command}: se quitarán {count} personas; la devolución de puntos sigue la regla del canal. |
| `chat.queue.clear_done` (changed, everyone) | `count`, `refunds` | Queue cleared: {count} people removed; returning points requested for {refunds}, awaiting confirmation. | Fila limpa: {count} pessoas removidas; devolução dos pontos pedida para {refunds}, aguardando confirmação. | Cola vaciada: {count} personas quitadas; devolución de puntos solicitada para {refunds}, pendiente de confirmación. |
| `chat.queue.clear_done_rule` (subscribers) | `count` | Queue cleared: {count} people removed. Returning points follows the channel's rule and is being checked. | Fila limpa: {count} pessoas removidas. A devolução dos pontos segue a regra do canal e está em verificação. | Cola vaciada: {count} personas quitadas. La devolución de puntos sigue la regla del canal y se está comprobando. |
| `chat.queue.clear_done_none` (nobody) | `count` | Queue cleared: {count} people removed. No points will be returned. | Fila limpa: {count} pessoas removidas. Nenhum ponto será devolvido. | Cola vaciada: {count} personas quitadas. No se devolverán puntos. |

O suporte a plural no carregador do catálogo de chat não foi verificado; se não existir, manter estas frases como escritas (o risco “{count} pessoas” continua para `count = 1`) e registrar para a OPS-14 (#65), dona dos textos de chat.


## 9. Glossário de termos

| Conceito | pt-BR | en | es | Nunca usar |
|---|---|---|---|---|
| CANCELED da Twitch (devolução) | devolver os pontos / devolução de pontos | return the points | devolver los puntos / devolución de puntos | reembolso, reembolsar, refund (na interface en), estorno |
| FULFILLED da Twitch | marcar como atendido / atendido | mark as served / served | marcar como atendido / atendido | FULFILLED, concluído, completado |
| UNFULFILLED da Twitch | pendente na Twitch | pending in Twitch | pendiente en Twitch | UNFULFILLED, em aberto |
| Pedido enviado, não confirmado | pedida à Twitch, aguardando confirmação | requested from Twitch, waiting for confirmation | solicitada a Twitch, esperando confirmación | devolvido, concluído (antes da confirmação) |
| Estado desconhecido (`pending_check`) | verificando inscrição / não deu para conferir | checking subscription / couldn't check | comprobando suscripción / no se pudo comprobar | não inscrito (para desconhecido), erro |
| `awaiting_streamer` | esperando você / precisa da sua decisão | waiting for you / needs your decision | esperándote / necesita tu decisión | bloqueado |
| Elegibilidade | ter direito / sem direito | eligible / not eligible | tener derecho / sin derecho | elegível (jargão em rótulos) |
| Inscrito | inscrito / inscrição | subscriber / subscription | suscriptor / suscripción | sub, assinante |
| Escopo OAuth | permissão da Twitch | Twitch permission | permiso de Twitch | scope, escopo, API |
| Novo consentimento | permitir na Twitch | allow on Twitch | permitir en Twitch | reautorizar OAuth |
| Reward | recompensa | reward | recompensa | reward (em pt-BR/es) |
| Override manual | decidir manualmente (ações nomeadas pelo efeito) | decide by hand | decidir manualmente | override |

Os rótulos da própria Twitch em pt-BR/es para concluir/rejeitar **NÃO foram verificados** (ux-research §5); “atendido” é termo do produto e precisa ser comparado com o painel real da Twitch antes do lançamento (verificação manual M6).

## 10. Lista de testes

### 10.1 Unitários (Node, `.mjs`)
1. Projeção/alteração/reconciliação das configurações incluem os seis campos novos; campos ocultos mantêm o valor; o payload nunca zera flags.
2. Função de visibilidade: oculto em fila criada manual e em canal não afiliado; somente leitura em convertida; C só em inscritos; D só com regra ≠ todo mundo.
3. Mapeador de estado exaustivo sobre `resolution × unknown_reason × estado do outbox`; chaves `*_confirmed` só com outbox confirmado pela Twitch; 404 vira `not_pending_remote`; desconhecido nunca vira `not_eligible`.
4. Distribuição em grupos (Verificando vs Esperando você) por motivo e tentativas esgotadas.
5. Redutor de seleção em lote: estado misto, limite `bulkMax`, mais antigos primeiro, poda ao atualizar com contagem podada, `resolutionBatchId` estável por diálogo.
6. Validadores da prévia/confirmação de limpar para o novo DTO por regra × tratamento; linhas de resultado omitem zeros.
7. Paridade de catálogo: toda chave nova em en/es/pt-BR com o mesmo conjunto de placeholders registrado em `panel-catalog.mjs`; chaves de plural com `.one/.many/.other`.
8. Guarda de termos: nada de `reembols`/`estorno` nos catálogos de painel e chat pt-BR/es nas chaves de devolução; nada de `UNFULFILLED|FULFILLED|scope|API` em rótulos de devolução.
9. Validação do motivo 1–280, caracteres de controle rejeitados, rótulo pronto salvo no idioma.

### 10.2 RTL (componente)
10. Mudar o rádio da regra revela C/D depois do grupo, o foco fica no rádio, a dica está presente.
11. Salvar com pendente → automático abre S1; foco inicial “Manter pendente”; Esc mantém o rascunho e devolve o foco ao Salvar; aceitar envia uma vez.
12. Bloco de permissão: formulário limpo mostra o botão; com alterações mostra o texto de salvar antes; os três pontos de entrada chamam uma ação.
13. Seção de decisão: texto da contagem no resumo, selo abre e foca o título, aparece em filas `deleting`, some em 0.
14. Linhas: nomes acessíveis únicos por pessoa; ids com escopo de fila.
15. R1/M1/B1: `role="alertdialog"`, rotulado/descrito, foco inicial menos destrutivo, verbos específicos, motivo obrigatório com `aria-invalid` e foco no erro.
16. Resultados: individual, lote parcial (linhas enviados/ignorados/rejeitados), 409 desatualizado com nova busca, pedido já existente; papéis status vs alert.
17. Foco após sucesso/remoção conforme a seção 4; remoção da linha focada pelo polling anuncia `list.changed`.
18. Diálogo de limpar por regra × tratamento, botão de verbo com contagem, plural 1 e n; variantes do diálogo de excluir; linha de exclusão esperando com botão de salto.
19. Card de permissões opcionais na Conexão mostra linhas só quando necessárias; resultado do retorno concedido com contagem / sem contagem / negado.

### 10.3 E2E no navegador (Playwright; fakes da API do painel e da fronteira Twitch, PostgreSQL descartável conforme as regras do projeto)
20. Configurar só inscritos + pendente, limpar uma fila, ver linhas passarem de verificando para esperando após a resposta do worker fake, devolver uma e marcar o resto em lote.
21. Permissão ausente: banner, ida e volta com OAuth fake, mensagem de itens rearmados.
22. Exclusão bloqueada por decisões pendentes, resolver, exclusão continua.
23. Execução só com teclado de 20–22 (sem ponteiro), sem perda de foco para `body`.
24. Viewport 390 × 844 e 1280 × 800: sem rolagem horizontal, alvos ≥ 44 × 44, diálogos cabem; refluxo com zoom de 200%.
25. Varredura axe-core das configurações, da seção de decisão e dos diálogos: zero sérios/críticos.
26. Chat fake: mensagens por regra nunca juntam nome de pessoa e estado de inscrição.

### 10.4 Somente manual (não automatizável aqui)
- M1 NVDA + Firefox (Windows) e M2 VoiceOver + Safari (macOS): dica de revelação do rádio, ordem de leitura do alertdialog, anúncios de status sem duplicação, estado misto do checkbox.
- M3 VoiceOver + Safari iOS em 390 × 844; M4 TalkBack + Chrome Android (opcional).
- M5 Teste de leitura com a streamer real (pt-BR) e uma pessoa falante de es: conseguem prever o efeito de “Marcar como atendido automaticamente” e de “Só inscritos” com inscrição de presente?
- M6 Comparar “atendido”/“devolver” com os rótulos pt-BR/es do painel real da Twitch.
- M7 Revisão visual de contraste de `.is-warning` e `button-danger` nos dois estados.

## 11. Critério “UX pronta” por fatia

**Fatia 1 (migration, avaliador, todo mundo/ninguém, caminhos forçados pela regra).**
- U1.1 Termos unificados nos textos de devolução existentes (seção 3.6) em en/es/pt-BR, teste de guarda 8 verde.
- U1.2 Diálogos de limpar e excluir com títulos específicos, botões de verbo, `button-danger`, foco inicial “Voltar”, chaves de plural; o texto de `everyone` mantém o sentido de hoje (teste de texto dourado).
- U1.3 Texto de chat de `everyone` atualizado; nenhuma outra regra exposta na interface (ver OD-UX-1).
- U1.4 Nova revisão estática do `@ux-design-expert` ≥ 9,0 nos textos alterados.

**Fatia 2 (provedor, worker, permissões, novo consentimento, regra de inscritos).**
- U2.1 Card de permissões opcionais na Conexão e ação compartilhada “Permitir na Twitch” com resultados concedido/negado/rearmado.
- U2.2 Mapeador de estado (teste 3) e chaves de estado da seção 8.2 existem e são testados, mesmo que a lista chegue na fatia 3.
- U2.3 O seletor de regra continua sem expor inscritos/ninguém, a menos que a fatia 3 seja entregue junto (OD-UX-1).

**Fatia 3 (override, lote, listas, bloqueio de exclusão, textos).**
- U3.1 Seção de configurações completa (3.1) com o diálogo S1; casos oculto/somente leitura cobertos.
- U3.2 Seção de decisão, linhas, lote, R1/M1/B1, regras de foco e região viva (seções 3.2–6) implementadas; testes 1–19 verdes.
- U3.3 Textos de limpar/excluir por regra e salto da exclusão em espera; variantes de chat.
- U3.4 E2E 20–26 verdes com fakes; tipos de evidência rotulados separadamente.
- U3.5 Verificações manuais M1–M3 e M5–M7 executadas e registradas na story, ou listadas como pendentes com ciência do proprietário antes do lançamento.
- U3.6 Revisão final do `@ux-design-expert` registrada, separando evidência estática, de navegador e de TA.

## 12. Score (apenas revisão estática de código/texto)

**Escopo revisado:** arquitetura de informação, regras de interação, textos nos três idiomas e lista de testes deste plano, contra os CAs, as decisões 1–7, os estados de arquitetura/data-model e o código atual do painel. **Não coberto:** design visual, comportamento em navegador real, leitores de tela, pesquisa com pessoas usuárias, rótulos do painel da Twitch, suporte a plural no catálogo de chat.

Primeira passada (interna, antes das correções): **8,4/10**. Lacunas encontradas e corrigidas neste documento:
1. A confirmação do automático disparava ao mudar o rádio (hostil às setas) → movida para Salvar (S1). +0,2
2. A lista de decisão sumia em filas `deleting` enquanto a exclusão dependia dela → renderizada de forma explícita, com ação de salto. +0,2
3. A fatia 1 poderia expor “Ninguém” + pendente sem lista para resolver → bloqueio OD-UX-1 e U1.3/U2.3. +0,2
4. Frases com várias contagens quebravam o plural → uma linha por resultado, chaves de plural em todo o painel. +0,1
5. Campo de motivo indefinido embora o data-model o exija → select + “Outro motivo” com limites. +0,1
6. O botão de permissão perderia rascunhos não salvos → variante “salve antes”. +0,1 (arredondado: total 9,1)

| Critério (peso) | Score |
|---|---|
| Cobertura de CAs/decisões (CA 2, 4, 7–9, 12–15; decisões 1–7) (20%) | 9,5 |
| Veracidade de estados e textos (20%) | 9,5 |
| Plano de acessibilidade: semântica, foco, regiões vivas (20%) | 9,0 |
| Simplicidade / sem nova parede de botões / linguagem simples (15%) | 8,5 |
| Completude dos textos en/es/pt-BR, placeholders, plurais (15%) | 9,0 |
| Testabilidade e aceite por fatia (10%) | 9,0 |
| **Ponderado** | **9,1** |

Por que não mais: o card ainda fica mais complexo (mais uma seção recolhível e um selo) numa página avaliada em 6,0 na OPS-15; alinhamento com rótulos da Twitch e plural do chat não verificados; a distinção streamer vs moderador (architecture A2) não foi verificada, então o texto usa “você” para todos; nada aqui foi validado visualmente nem com TA.

## 13. Decisões pedidas ao proprietário

- **OD-UX-1 (recomendado: sim):** expor “Só inscritos”/“Ninguém” no painel só quando a fatia 3 for entregue (lista + overrides), para que nenhum resgate pendente seja criado sem forma de resolvê-lo. As fatias 1–2 ficam no padrão `everyone`.
- **OD-UX-2 (recomendado: sim):** aplicar “devolver os pontos / devolver los puntos / return the points” aos textos de devolução existentes e aos quatro textos de chat (seção 3.6).
- **OD-UX-3 (recomendado: sim):** motivo obrigatório em toda ação manual, inclusive em lote (um motivo por lote), com opções prontas mais “Outro motivo”.

## 14. Riscos

- Resgates pendentes se acumulam na lista de pedidos da Twitch (limite/expiração NÃO verificados); mitigado por selo, lista e lote.
- Verificação assíncrona: logo após uma remoção, painel e chat só podem dizer “verificando”/“segue a regra do canal”.
- O termo “atendido” pode diferir dos rótulos pt-BR/es da própria Twitch (M6).
- Densidade do card; ainda é preciso o ajuste de hierarquia de ações da OPS-15.
- Comportamento de plural no chat desconhecido (OPS-14).
