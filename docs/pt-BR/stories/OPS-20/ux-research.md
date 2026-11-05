# OPS-20 — Pesquisa de UX: elegibilidade de devolução, tratamento de não elegíveis, intervenção manual e reautorização

[English](../../../stories/OPS-20/ux-research.md)

**Autor:** `@analyst` (Atlas), 2026-10-21. **Insumo para:** o gate do `@ux-design-expert` da [story.md](story.md) (ver também [architecture.md](architecture.md), [data-model.md](data-model.md), [research.md](research.md)).
**Natureza:** pesquisa documental e leitura somente dos catálogos atuais do painel. Nenhum navegador, tecnologia assistiva, chamada à Twitch ou teste com pessoas usuárias foi executado. Este documento não atribui nota de UX; a nota cabe ao `@ux-design-expert`.

Marcadores: **VERIFICADO** = confirmado em fonte oficial ou primária em 2026-10-21; **PARCIAL** = confirmado em parte ou só por fontes secundárias; **NÃO VERIFICADO** = não confirmado.

## 1. O que o painel precisa permitir a uma pessoa streamer não técnica

| # | Tarefa | Origem na story |
|---|---|---|
| T1 | Escolher uma regra de devolução por fila: todos / só inscritos / ninguém | CA 1, 4 |
| T2 | Em "só inscritos": incluir streamer, moderadores, VIPs; contar inscrições de presente (padrão: sim) | CA 2, 3; decisões 1, 2, 7 |
| T3 | Escolher o tratamento de não elegíveis: manter UNFULFILLED até decidir (padrão) ou marcar FULFILLED automaticamente (definitivo) | CA 13; decisão 6; architecture §5 |
| T4 | Revisar resgates "em verificação" (`pending_check`/desconhecido) ou "aguardando sua decisão" (`awaiting_streamer`) | CA 7; data-model §2.4 |
| T5 | Intervenção manual por resgate: devolver os pontos / marcar como atendido, com motivo | CA 8 |
| T6 | "Marcar como atendido" em lote | decisão 6; architecture §2.6 |
| T7 | Resolver a falta do escopo `channel:read:subscriptions` (reconectar a Twitch) | CA 9, 10 |
| T8 | Ler resultados de limpar/excluir como contagens por resultado, "solicitado"/"pendente", nunca "confirmado" | CA 12, 13 |

## 2. Fato da plataforma que orienta a UX — VERIFICADO

Referência da API da Twitch, Update Redemption Status (https://dev.twitch.tv/docs/api/reference/#update-redemption-status, página de 2026-10-19, lida na rodada 2 de research.md): “You may update a redemption only if its status is UNFULFILLED.” e “Setting the status to CANCELED refunds the user’s channel points.” Logo, FULFILLED é **definitivo**: não há devolução posterior pela API. Excluir uma recompensa marca como FULFILLED os resgates UNFULFILLED (mesma referência). O padrão `keep_unfulfilled` da arquitetura é a única opção reversível.

Se resgates UNFULFILLED pendentes expiram ou têm limite na Twitch: **NÃO VERIFICADO** (research.md §3). O texto não deve prometer nem uma coisa nem outra.

## 3. Ferramentas comparáveis — como apresentam a devolução

| Ferramenta | Achado | Status |
|---|---|---|
| Painel do Criador / Mod View da Twitch | Fila de pedidos de recompensa com concluir/rejeitar por item e "Complete All"/"Reject All"; rejeitar devolve os pontos; moderadores acessam pela Mod View. Só em guias de terceiros (eklipse.gg, filipchabik.ghost.is); a página oficial https://help.twitch.tv/s/article/channel-points-guide não carregou na ferramenta. Rótulos exatos em pt-BR/es não vistos. | PARCIAL |
| "Pular fila de pedidos" da Twitch | Resgates ficam FULFILLED na hora (referência da API, `should_redemptions_skip_request_queue`). | VERIFICADO |
| Firebot | Opção de pular fila: “These redemptions are approved by Twitch immediately and cannot be refunded from Firebot.” Fila: “you can approve or reject pending redemptions.” (https://docs.firebot.app/v5/core/channel-rewards) — precedente de dizer a irreversibilidade **na própria opção**, antes da escolha. | VERIFICADO (doc oficial de terceiro) |
| Streamer.bot | Concluir/devolver pela subação "Update Redemption Status"; a recompensa precisa ter sido criada pelo Streamer.bot e não pode pular a fila (https://docs.streamer.bot/faq/fulfill-cancel-cpr). UX de construtor de ações, sem regra de elegibilidade. | VERIFICADO |
| Lumia Stream | Fórum: resgates não puderam ser devolvidos porque "Auto Fill Request" estava ligado (https://forum.lumiastream.com/t/redeem-twitch-points-not-working-hfx/632). Mostra o dano real de um preenchimento automático silencioso. | PARCIAL (relato único) |
| Mix It Up | Só achei a doc da Redemption Store própria (https://dev.site.mixitupapp.com/docs/features/consumables/redemption-store); nada sobre devolução na Twitch. | NÃO VERIFICADO |
| StreamElements, Nightbot, Fossabot | Nenhuma documentação encontrada sobre devolver resgates de pontos do canal ou regra por inscrição. | NÃO VERIFICADO |

**Lacuna/oportunidade:** nenhuma ferramenta encontrada oferece regra por fila do tipo "devolver só para inscritos"; hoje isso é feito à mão na fila da Twitch. Não há padrão pronto para copiar, então linguagem simples e consequências explícitas pesam mais. Nenhuma ferramenta mostra o estado "inscrição desconhecida".

## 4. Orientações de acessibilidade (WCAG 2.2 / WAI-ARIA APG)

- **CS 3.3.4 Prevenção de Erros (Legal, Financeiro, Dados), AA — VERIFICADO** (https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html): transações financeiras exigem ao menos um entre reversível / verificado / confirmado. Pontos do canal não são dinheiro, então a aplicação é analogia (**PARCIAL**), mas "marcar FULFILLED" (irreversível) e "devolver os pontos" combinam com a técnica de confirmação G98/G168 (revisar e confirmar). A página também diz que não se pretende exigir confirmação a cada salvamento.
- **CS 4.1.3 Mensagens de Status, AA — VERIFICADO** (https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html): resultados ("12 marcados como atendidos, 2 ignorados") com `role="status"` (ARIA22); erros/avisos com `role="alert"` só quando importantes e urgentes; falha F103 e excesso de assertive.
- **APG Diálogo Modal — VERIFICADO** (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): no “final step in a process that is not easily reversible”, “may be advisable to set focus on the least destructive action”. **APG Alert Dialog — VERIFICADO** (https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/): `role="alertdialog"`, `aria-modal`, título em `aria-labelledby`, mensagem em `aria-describedby`.
- **APG Grupo de Rádio — VERIFICADO** (https://www.w3.org/WAI/ARIA/apg/patterns/radio/): rótulo do grupo por `aria-labelledby`, informação extra por `aria-describedby`, setas mudam a seleção. O APG não trata campos condicionais.
- **GOV.UK Design System, radios — VERIFICADO** (https://design-system.service.gov.uk/components/radios/): fieldset + legend; dica = uma frase curta, sem links; “Conditionally reveal questions only”; nem sempre a pessoa é avisada quando o conteúdo revelado aparece; manter perguntas reveladas simples. Como as setas já selecionam, campos revelados aparecem/somem só ao navegar entre opções — motivo para deixar as caixas de público num fieldset separado, visível quando relevante, e não aninhado no item de rádio. (Inferência, **PARCIAL**.)
- **NN/g, diálogos de confirmação (Nielsen, 2018-02-18, revisado em 2026-08-07) — VERIFICADO** (https://www.nngroup.com/articles/confirmation-dialog/): reservar para ações sérias/irreversíveis; repetir o pedido e o efeito; botões específicos, não Sim/Não; sem "Sim" como padrão; desfazer é melhor que confirmar; excesso ensina a clicar sem ler.
- **Ações em lote — PARCIAL** (Shopify Polaris https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react/select-all-actions; https://www.saasui.design/blog/saas-bulk-actions-ux-patterns): contagem de seleção ao vivo, caixa do cabeçalho em estado misto (ARIA `mixed`) derivado das linhas, deixar claro o alcance ("esta página" vs "todos os resultados"), relatar sucesso parcial. Não normativo.

## 5. Linguagem simples (en / pt-BR / es)

- **pt-BR — VERIFICADO:** a Lei nº 15.263/2025 (Política Nacional de Linguagem Simples, https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15263.htm) vale para órgãos públicos, não para este projeto, mas as técnicas do art. 5 servem de checklist: frases curtas em ordem direta, uma ideia por parágrafo, palavras comuns, explicar jargões, evitar estrangeirismos desnecessários.
- **Inconsistência atual nos catálogos (VERIFICADO, lido em `apps/web/localization/catalogs/panel/*.tsv`):** pt-BR mistura "reembolso" (`queue_settings.refund_*`, `queue.clear.*`) e "Devolução de Pontos do Canal" (`operations.group.points_refund`); es mistura "reembolso" e "devolución de puntos". Recomendo um só verbo: **devolver os pontos / devolver los puntos / return the points**, porque "reembolso" sugere dinheiro.
- Evitar jargão nos rótulos: "UNFULFILLED", "FULFILLED", "escopo", "API". Usar "pendente na Twitch / marcado como atendido / permissão da Twitch". O termo técnico, se necessário, só na dica.
- Estados incertos dizem o que se **sabe** e o que **vem depois**, nunca verbo de devolução no passado: "Ainda verificando se é inscrito. Nenhum ponto foi devolvido." e não "Pontos devolvidos". Solicitado ≠ confirmado: "Devolução solicitada à Twitch" até a Twitch confirmar (CA 12, 14; mesmo tom do `panel.operation.confirm.resolve` atual).
- Privacidade (architecture §7): o chat nunca diz se uma pessoa nomeada é inscrita; o status por pessoa fica só no painel.
- Irreversibilidade: dizer a consequência antes da ação, na própria opção (precedente do Firebot), e de novo na confirmação: "Depois disso, não dá mais para devolver os pontos desses resgates."
- Rótulos da própria Twitch em pt-BR/es para concluir/rejeitar: **NÃO VERIFICADO**; conferir num painel real antes de alinhar termos.

## 6. Exemplos de texto (para revisão de UX, não são strings finais)

| Elemento | en | pt-BR | es |
|---|---|---|---|
| Legenda da regra | Who gets their points back? | Quem recebe os pontos de volta? | ¿Quién recupera sus puntos? |
| Opção | Only subscribers | Só inscritos | Solo suscriptores |
| Dica (inscritos) | Checked with Twitch when the refund is decided | Conferido com a Twitch na hora de decidir a devolução | Se comprueba con Twitch al decidir la devolución |
| Nota de presente | Gifted subs count by default. You can still return points to anyone by hand. | Inscrições de presente contam por padrão. Você ainda pode devolver os pontos de qualquer pessoa manualmente. | Las suscripciones regaladas cuentan por defecto. Igual puedes devolver los puntos a cualquiera manualmente. |
| Tratamento A (padrão) | Keep it pending so I can decide (points can still be returned) | Deixar pendente para eu decidir (ainda dá para devolver os pontos) | Dejar pendiente para decidir (aún se pueden devolver los puntos) |
| Tratamento B | Mark as served automatically — points can no longer be returned | Marcar como atendido automaticamente — os pontos não poderão mais ser devolvidos | Marcar como atendido automáticamente — ya no se podrán devolver los puntos |
| Desconhecido | Checking subscription… No points returned yet. | Verificando inscrição… Nenhum ponto devolvido ainda. | Comprobando suscripción… Aún no se devolvieron puntos. |
| Escopo ausente | To check subscribers, reconnect Twitch and allow "read subscriptions". Until then, these stay pending. | Para conferir inscritos, reconecte a Twitch e permita "ler inscrições". Até lá, ficam pendentes. | Para comprobar suscriptores, vuelve a conectar Twitch y permite "leer suscripciones". Hasta entonces, quedan pendientes. |
| Botão do lote | Mark 12 as served | Marcar 12 como atendidos | Marcar 12 como atendidos |

## 7. Dez recomendações de UX, por prioridade

1. **Irreversibilidade no ponto da escolha.** No rádio de tratamento de não elegíveis, a consequência vai no rótulo de "marcar como atendido automaticamente" (não só em tooltip); `keep_unfulfilled` continua padrão; ao trocar para automático, confirmação em alert dialog com foco em "Manter pendente". (Base VERIFICADA: API da Twitch, Firebot, APG, NN/g.)
2. **Toda confirmação diz quantidade + efeito + permanência**, com botões de verbo ("Marcar 12 como atendidos" / "Manter pendentes"), nunca Sim/Não/OK; sem padrão destrutivo. Confirmar só passos irreversíveis ou de pontos (marcar atendido, devolver, trocar para automático, limpar/excluir), não salvamentos comuns.
3. **Uma lista "Precisa da sua decisão" por fila**, separada em "Verificando inscrição" e "Não elegível — aguardando você", com idade, motivo em palavras simples e ações por linha "Devolver os pontos" / "Marcar como atendido". Contador nos cartões de fila para que nada acumule em silêncio (R2).
4. **Vocabulário de status verdadeiro**, igual no painel e no chat: *verificando*, *aguardando você*, *devolução solicitada*, *devolvido (confirmado pela Twitch)*, *marcado como atendido*, *não foi possível atualizar*. Nada no passado antes da confirmação; 404 nunca aparece como devolvido.
5. **Reautorização como aviso contextual**, nas filas com "só inscritos" e no formulário ao salvar essa regra sem o escopo: o que falta, por quê, o que acontece até lá ("ficam pendentes"), um botão "Reconectar Twitch" e uma mensagem de status na volta com os itens reativados.
6. **Formulário com fieldsets:** grupo de rádio da regra (legenda em forma de pergunta); caixas de público e "contar inscrições de presente" num fieldset separado, exibido só em "só inscritos", com descrição curta e foco estável quando aparece. Esconder o bloco em filas só manuais/canais não afiliados (somente leitura em filas manuais convertidas).
7. **"Marcar como atendido" em lote com segurança:** coluna de caixas com rótulo por linha, caixa do cabeçalho com estado misto, alcance explícito ("12 selecionados" vs "todos os 40 pendentes desta fila"), um id de lote idempotente, resultado em `role="status"` com resultado parcial ("10 marcados, 2 ignorados: já resolvidos").
8. **Diálogo de intervenção com motivo limitado** (≤ 280 caracteres, contador visível, atalhos opcionais como "Ajudou com inscrição"), avisando que não desfaz devolução ou atendimento já solicitado (Q2), e rejeição localizada clara quando estiver desatualizado ou já resolvido.
9. **Textos de limpar/excluir conforme a regra:** contagens por resultado (devolução solicitada / não elegível / verificando) e, ao excluir com pendências, mensagem explícita de bloqueio com as duas saídas; nunca um número único de devoluções antecipado em "só inscritos".
10. **Unificar a terminologia** para "devolver os pontos / devolver los puntos / return the points" nos três catálogos (sem "reembolso"), revisão de linguagem simples pelo art. 5 da Lei 15.263 e um bloco curto "Como funciona" explicando que a inscrição é conferida na hora da decisão e que Prime/presente aparecem como a Twitch informa.

## 8. Armadilhas a evitar

- Dizer ou sugerir "pontos devolvidos" para desconhecido, solicitado ou 404.
- Tratar desconhecido como "não inscrito" (por exemplo, "0 inscritos" quando falta o escopo).
- Esconder a consequência do automático em tooltip ou link de ajuda (dica não deve ter link).
- Aninhar caixas dentro de um item de rádio, fazendo campos surgirem/sumirem ao navegar com setas.
- Excesso de confirmações ou de `role="alert"`/regiões assertive em salvamentos comuns.
- "Selecionar todos" que, sem avisar, só pega a página visível.
- Anunciar no chat o status de inscrição de pessoas nomeadas.
- Rótulos com jargão (UNFULFILLED, escopo, API) e mistura de "reembolso"/"devolução".
- Prometer expiração ou limite de pendências na Twitch (NÃO VERIFICADO).
- Alegar acessibilidade só com revisão estática: ainda falta passar em navegador + leitor de tela (NVDA/VoiceOver).

## 9. Limitações

- A Central de Ajuda da Twitch não carregou; rótulos da fila no painel e regra de expiração não confirmados (PARCIAL/NÃO VERIFICADO).
- Não achei docs de StreamElements, Nightbot, Fossabot ou Mix It Up sobre devolução; ausência de evidência não é evidência de ausência.
- Os textos são rascunhos; não houve teste de leitura com streamers.
- Pontos do canal não são dinheiro; aplicar o CS 3.3.4 é analogia.

## Fontes (acessadas em 2026-10-21)

- Referência da API da Twitch: https://dev.twitch.tv/docs/api/reference/#update-redemption-status
- Ajuda da Twitch (não carregou): https://help.twitch.tv/s/article/channel-points-guide
- Guias de terceiros sobre a fila da Twitch: https://blog.eklipse.gg/streaming-tips/refund-twitch-channel-points.html, https://filipchabik.ghost.is/how-to-refund-channel-points-on-twitch
- Firebot: https://docs.firebot.app/v5/core/channel-rewards
- Streamer.bot: https://docs.streamer.bot/faq/fulfill-cancel-cpr
- Fórum Lumia: https://forum.lumiastream.com/t/redeem-twitch-points-not-working-hfx/632
- Mix It Up: https://dev.site.mixitupapp.com/docs/features/consumables/redemption-store
- WCAG 2.2 CS 3.3.4: https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html
- WCAG 2.2 CS 4.1.3: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- APG Diálogo Modal: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ ; Alert Dialog: https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/ ; Grupo de Rádio: https://www.w3.org/WAI/ARIA/apg/patterns/radio/
- GOV.UK radios: https://design-system.service.gov.uk/components/radios/
- NN/g: https://www.nngroup.com/articles/confirmation-dialog/
- Ações em lote: https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react/select-all-actions, https://www.saasui.design/blog/saas-bulk-actions-ux-patterns
- Lei 15.263/2025: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15263.htm
