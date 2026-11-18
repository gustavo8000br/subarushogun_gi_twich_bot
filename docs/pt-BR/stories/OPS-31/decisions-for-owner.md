# OPS-31 — Decisões para o proprietário (desenho v2, revisado com as respostas do proprietário)

[English](../../../stories/OPS-31/decisions-for-owner.md)

**Preparado por:** `@architect` (Aria), 2026-11-15. **Revisado em 2026-11-15** com as respostas do proprietário a O-1..O-10. Cada resposta abaixo é o texto literal do proprietário (como entregue ao orquestrador), seguido do que ela faz no desenho. Fonte: [architect-design-v2](architect-design-v2.md) (seção entre colchetes). O-1 e O-2 repetem decisões abertas da [auditoria de 2026-11-13](../../audits/audit-2026-11-13.md) (D-06, D-17); os estados de dinheiro não podem ser construídos sem elas. **Revisado de novo em 2026-11-15 (v2.2)** com as respostas do proprietário às Q-1, Q-2 e à pergunta da fusão, e a nova regra do proprietário sobre o fim da live. **Revisado pela terceira vez em 2026-11-15 (v2.3)** com as respostas do proprietário às Q-3, Q-4 e DB-5.

Já decidido antes e **não** perguntado de novo: devolução só no fim do atendimento; o streamer decide na hora o cancelamento/adiamento/ausência de um membro; grupos inscrito (pago, presenteado, Prime), moderador, VIP, lista própria, o streamer conta como membro; um escopo por grupo; falha na consulta pergunta ao streamer; lista própria com no máximo 500; OW-31-1 (nada automático para membros); uso de modelos (D-18, orquestrador).

## Situação

| Item | Situação | Decidida em | Efeito curto |
|---|---|---|---|
| O-1 | DECIDIDA (A) | 2026-11-15 | Resolução manual auditada de `conflict`/`failed` (P0) |
| O-2 | DECIDIDA (configuração por fila) | 2026-11-15 | Política S1 "encerrada com a chave desligada" |
| O-3 | DECIDIDA (configuração por fila) | 2026-11-15 | Política S2 "conclusão direta" |
| O-4 | DECIDIDA (configuração por fila) | 2026-11-15 | Política S3 "conclusão de moderador pelo chat" |
| O-5 | DECIDIDA (configuração por fila) | 2026-11-15 | Política S5 "teto de reentrada" (contador: seção 3.11 do desenho) |
| O-6 | DECIDIDA (A) | 2026-11-15 | Liquidação externa só no painel, sem mensagem no chat |
| O-7 | DECIDIDA (A) | 2026-11-15 | Sem limite de tempo na OPS-31; contagem visível; a OPS-32 traz a política de 7 dias |
| O-8 | DECIDIDA (configuração por fila) | 2026-11-15 | `limpar` pelo chat roda; destino dos membros é a política S4 |
| O-9 | DECIDIDA (A) | 2026-11-15 | Um estado, "fechada" |
| O-10 | DECIDIDA (A) | 2026-11-15 | Filas novas com os avisos do plano de UX; filas existentes tudo desligado |
| Q-1 | DECIDIDA | 2026-11-15 | O `concluir` do próprio streamer pelo chat devolve como o painel (segue a política da fila S2) |
| Q-2 | DECIDIDA | 2026-11-15 | O teto S5 conta por live, pelo EventSub `stream.online`/`stream.offline` (não pela janela deslizante) |
| Fusão | DECIDIDA | 2026-11-15 | Uma nova live logo depois da anterior (queda de conexão) é a MESMA sessão; janela padrão 10 min, configurável |
| LIVE-1 | DECIDIDA (regra do proprietário) | 2026-11-15 | O fim da live não limpa nem reseta as filas, nem altera entradas ou resgates |
| Q-3 | DECIDIDA | 2026-11-15 | Uma devolução feita sem live conta contra a ÚLTIMA sessão de live |
| Q-4 | DECIDIDA | 2026-11-15 | Só `type=live` abre sessão de live |
| DB-5 | DECIDIDA | 2026-11-15 | O teto conta na intenção; devolução que falha não devolve orçamento; sem escrita extra do worker; acima do teto a devolução espera o streamer |

## O-1 — Como uma tarefa financeira `conflict` ou `failed` sai da revisão? (auditoria D-06) [P0, §3.7] — DECIDIDA

**Proprietário (2026-11-15), literal:** "O-1 A: resolução manual auditada de `conflict`/`failed` (`remoteConfirmed:false`; no conflict mostrar o status remoto lido)."
- **Efeito:** o P0 acrescenta a saída manual auditada para os dois estados, como o `unknown` tem hoje. O painel mostra, no `conflict`, o status remoto gravado pela última leitura do worker (e a hora, **HIPÓTESE** de que a hora esteja disponível: o `@data-engineer` confirma). Não é preciso nova chamada à Twitch para mostrá-lo.

## O-2 — Resgate normal deixado `UNFULFILLED` com uma chave desligada [P7 + política S1, §3.10] — DECIDIDA

**Proprietário (2026-11-15), literal:** "O-2: resgate UNFULFILLED com chave desligada → **segue o que o streamer define no painel** (configuração por fila)."
- **Efeito:** não há resposta global; é uma configuração por fila (S1) com os valores `wait` (padrão seguro das filas novas), `fulfill`, `refund`, mais `legacy` (comportamento de hoje) mantido só para as filas que existem na atualização. Como `wait` precisa do estado `awaiting_choice`, o comportamento entra no P7, **não** no P0 (o P0 perde o item R2). A decisão D-17 da auditoria segue aberta para as filas existentes até o streamer escolher um valor.

## O-3 — Conclusão direta (chamado → concluído) de um membro [P7 + política S2, §3.10] — DECIDIDA

**Proprietário (2026-11-15), literal:** "O-3: conclusão direta (called→completed) como fim do atendimento → **o streamer decide** (configuração por fila)."
- **Efeito:** configuração S2: `wait` (padrão), `refund` (conta como fim do atendimento), `fulfill` (pontos mantidos, regra de hoje).

## O-4 — O `concluir` de um moderador pelo chat pode devolver os pontos de um membro? [P7 + política S3, §3.10] — DECIDIDA

**Proprietário (2026-11-15), literal:** "O-4: `concluir` de moderador pelo chat devolve pontos de membro → **segue a configuração da fila**."
- **Efeito:** configuração S3: `wait` (padrão) ou `refund`. O `concluir` do próprio streamer pelo chat é tratado como o fim de atendimento do painel (ver pergunta aberta Q-1).

## O-5 — Abuso por reentrar para ser devolvido de novo [P7 + política S5, §3.10, §3.11] — DECIDIDA

**Proprietário (2026-11-15), literal:** "O-5: teto contra reentrada → **configurável pelo streamer** (configuração por fila/live)."
- **Efeito:** configuração S5 (teto e janela). O desenho conta as devoluções derivando-as de dados já gravados (`redemptions.user_id`), não de um novo armazém de dado pessoal (seção 3.11). Pergunta aberta Q-2 (o que é "live": o produto não tem noção de sessão de transmissão). (v2.2) "Por live" agora é definido pela Q-2 e pela resposta da fusão abaixo; a seção 3.11 do desenho traz a sessão de live.

## O-6 — Quando a Twitch finaliza um resgate retido fora do produto [§3.8] — DECIDIDA

**Proprietário (2026-11-15), literal:** "O-6 A: liquidação externa só registrada no painel ("liquidado na Twitch"), sem mensagem no chat."
- **Efeito:** `settled_external` é registrado e mostrado só no painel; nenhum aviso de chat é criado para ele (seção 3.8 atualizada).

## O-7 — Quanto tempo podem durar "esperando sua decisão" e "verificar grupo"? [§3.2 regra 3, §3.7] — DECIDIDA

**Proprietário (2026-11-15), literal:** "O-7 A: sem limite de tempo na OPS-31; contagem visível no cartão da fila e na navegação; a OPS-32 traz a política de 7 dias."
- **Efeito:** nenhum temporizador na OPS-31. A contagem de decisões pendentes sai em `GET /api/state` e aparece no cartão da fila e na navegação (textos e posição são do `@ux-design-expert`).

## O-8 — Limpar a fila pelo chat (`limpar`) com membros nela [§3.6 item 5, política S4] — DECIDIDA

**Proprietário (2026-11-15), literal:** "O-8: `limpar` pelo chat roda (renova o ciclo da fila); o destino dos pontos dos membros **segue a configuração da fila**."
- **Efeito:** a limpeza roda; não membros seguem a regra de hoje (devolução); membros vão para onde S4 diz: `wait` (padrão), `refund` ou `fulfill`. A resposta no chat dá as contagens.

## O-9 — "Pausada" e "fechada": um estado ou dois? [§7.1, AC 3] — DECIDIDA

**Proprietário (2026-11-15), literal:** "O-9 A: um estado, "fechada"."
- **Efeito:** nenhum estado novo; chat e painel dizem "fechada".

## O-10 — Quais avisos no chat começam ligados nas filas novas? [§7.2] — DECIDIDA

**Proprietário (2026-11-15), literal:** "O-10 A: filas novas com avisos como no plano de UX (entrada, atendimento, estado da fila, pontos ligados; reordenação desligada); filas existentes tudo desligado."
- **Efeito:** as cinco colunas de avisos mantêm `false` como padrão do banco (linhas existentes ficam desligadas); o código de criação de fila grava os padrões do UX nas filas novas.

## Decididas na revisão v2.2 (2026-11-15)

Nota sobre o texto: os textos abaixo são as respostas do proprietário repassadas ao `@architect` pelo orquestrador; as mensagens originais do proprietário no chat não estavam disponíveis para este agente.

### Q-1 — O `concluir` do próprio streamer pelo chat para um membro em atendimento — DECIDIDA

**Proprietário, como repassado:** "Q-1: o `concluir` do próprio streamer pelo chat devolve como o painel (segue a política da fila, S2)."
- **Efeito:** o `concluir` do próprio streamer pelo chat tem o mesmo efeito do fim de atendimento do painel (devolução de um membro retido). Uma conclusão direta `called→completed` segue a política S2 da fila, para o streamer como para qualquer pessoa. Moderadores continuam no S3. A `[AUTO-DECISION]` anterior agora é decisão do proprietário; nenhuma mudança nas tabelas do desenho.

### Q-2 — O que "por live" significa para o teto S5 — DECIDIDA

**Proprietário, como repassado:** "Q-2: o teto 'por live' (S5) usa o EventSub `stream.online`/`stream.offline` (não a janela deslizante)."
- **Efeito:** uma sessão de live por canal, alimentada pelo EventSub e por uma reconciliação com Get Streams ([desenho 3.11 e 3.12](architect-design-v2.md), pesquisa [EventSub stream.online](../../research/2026-11-15-eventsub-stream-online/README.md)). A janela em horas (`reentry_window_hours`) fica só como **plano alternativo** quando nenhuma sessão é conhecida ou a assinatura foi revogada. Pacote novo P6b (antes do P7) e migração M4.

### Fusão — Uma nova live logo depois da anterior — DECIDIDA

**Proprietário, como repassado:** "uma nova live que começa logo depois da anterior (queda de conexão) conta como a MESMA sessão."
- **Efeito:** uma janela de fusão (valor inicial de **10 minutos**, sugerido pela pesquisa e **configurável**; o 10 não é constante da Twitch). Uma live que começa dentro da janela depois do fim da anterior entra na mesma sessão e mantém o orçamento do teto.

### LIVE-1 — O fim da live não reseta as filas — DECIDIDA (regra do proprietário)

**Proprietário, como repassado:** "quando a live ENCERRA, o produto NÃO apaga nem reseta as filas. As filas continuam como estão até o streamer resetar."
- **Efeito:** o fim da live só fecha a sessão de contagem do teto S5. Não dispara limpar, devolução, expiração nem mudança de estado de nenhuma fila, entrada ou resgate. O desenho diz isso de forma explícita (invariante LIVE-1, seções 0, 1, 3.11, 3.12, 6.1) e propõe o AC 13 (seção 17); o teste de mutação em PG o comprova.

## Decididas na revisão v2.3 (2026-11-15)

Nota de redação: como repassado ao `@architect` pelo orquestrador; as mensagens originais do proprietário não estavam disponíveis a este agente.

### Q-3 — Uma devolução feita sem live em andamento — DECIDIDA

**Proprietário, como repassado:** "Q-3: retorno sem live conta contra a ÚLTIMA sessão de live."
- **Efeito:** quando não há live em andamento, a janela do teto é a última sessão de live; o fim da live não dá orçamento novo e ninguém é bloqueado (acima do teto a devolução só espera). Desenho 3.11 D (a). A janela em horas de plano alternativo fica só para "nenhuma sessão conhecida / assinatura revogada / sessão obsoleta" (3.11 D (b)).

### Q-4 — Tipos de transmissão que abrem sessão de live — DECIDIDA

**Proprietário, como repassado:** "Q-4: só `type=live` abre sessão."
- **Efeito:** `rerun`, `premiere`, `playlist` e `watch_party` são registrados como ignorados e não gravam nada (desenho 3.11 B regra 1).

### DB-5 — O que o teto conta e quando — DECIDIDA

**Proprietário, como repassado:** "DB-5: o teto conta na intenção; falha do reembolso não devolve orçamento; sem escrita extra do worker; acima do teto o reembolso espera o streamer."
- **Efeito:** o teto conta quando a intenção de devolução é registrada, não quando a Twitch confirma; uma devolução que depois termina `failed` ou `resolved_manual` não devolve orçamento; o worker financeiro não faz nenhuma escrita extra para o teto (nenhuma aresta de lock nova); acima do teto uma devolução automática vira `awaiting_choice` e espera o streamer, que ainda pode devolver à mão. Desenho 3.11 C2 e o portão (seção 4).

## Perguntas abertas depois desta revisão

Nenhuma. A Q-3 e a Q-4 estavam abertas na v2.2 e estão decididas acima.

- Nenhuma.

Também ficam com os especialistas, não com o proprietário: a faixa e o texto da janela de fusão (`@ux`) e os valores de retenção (`@data-engineer`; a revisão do DE propõe sessões inteiras com mais de 90 dias).

Nenhuma decisão do proprietário está pendente para o desenho.

## Ações do proprietário (não decisões) necessárias depois

- Reconectar o canal de teste com os escopos novos e fazer os resgates reais da FT-78 (execuções A e B).
- Confirmar que os pontos reais gastos na execução B no canal de teste são aceitáveis (a autorização de 2026-11-05 cobre o canal de teste).
- Transmitir uma live curta no canal de teste para a execução C do P8 (começar, parar, reiniciar dentro e fora da janela de fusão, derrubar a conexão) e observar o comportamento real do EventSub e o custo da assinatura.
