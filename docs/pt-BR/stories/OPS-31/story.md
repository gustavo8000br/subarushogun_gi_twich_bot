# OPS-31 — Fila natural e devolução de pontos do canal por grupo

[English](../../../stories/OPS-31/story.md)

**Status:** Pronta (redigida pelo `@sm` em 2026-11-06). `@po` **GO 8,7/10** em 2026-11-06 ([po-validation](po-validation.md)); passou a Pronta em 2026-11-06 quando a issue passou a existir (regra do projeto: Pronta = GO + issue). **Issue:** [#115](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/115) (criada pelo `@devops`; corpo em [issue-body-changes-2026-11-06b](../../process/issue-body-changes-2026-11-06b.md)).
**Fonte:** pedido do proprietário de 2026-11-06 e a nota de pesquisa do `@analyst` [2026-11-06-queue-group-refund](../../research/2026-11-06-queue-group-refund/README.md) (viabilidade SUFICIENTE, 9,1/10; seções citadas abaixo como "nota §N").
**Relacionadas:** OPS-20 (devolução por status de inscrito; `@architect` e `@data-engineer` tratam esta story e a OPS-20 como um desenho só, nota §8.1), OPS-22 (recuperação financeira; a outbox e a leitura de verificação são reaproveitadas sem mudança), OPS-26 (comandos de chat do sistema), OPS-23 (SSE; o "próximo" do widget), FT-70 (documentar o reembolso por duplicidade), FT-68/FT-69.
**Itens registrados:** **ST-24** do inventário (esta story) e fatias **FT-71..FT-78**; escopo proposto da 0.4.0-beta+ (proprietário, 2026-11-06). Veja [backlog-inventory](../../process/backlog-inventory.md).
**Coordenação necessária:** `$aiox-po` (validação), `$aiox-architect` (serviço de decisão, uma intenção terminal por resgate, fila de envio dos avisos), `$aiox-data-engineer` (esquema), `$aiox-ux-design-expert` (plano e revisão, mínimo 9,0, antes do `@dev`), `$aiox-analyst` (feito: a nota; nova pesquisa só para LACUNA), `$aiox-devops` (issue), `$aiox-qa` independente (plano de testes, execução em canal real, veredito).

## Problema

- A fila funciona, mas é muda: a pessoa não sabe a posição nem o que fazer, um não comparecimento ou um turno pulado não deixa rastro no chat, o fim do atendimento não é anunciado e o widget não mostra quem é o próximo.
- O streamer não consegue premiar um grupo (inscritos, moderadores, VIPs, lista própria) devolvendo os pontos de um resgate. Hoje todo resgate normal é cumprido ao iniciar o atendimento; um resgate cumprido **nunca pode ser reembolsado** pela API (nota §3), então a escolha é feita uma vez, a partir de uma decisão gravada antes da chamada à Twitch.

## História

Como streamer,
quero que a fila converse com o público no chat, trate não comparecimentos e reordenações de forma visível e devolva os pontos dos grupos que eu escolher,
para que a fila pareça natural e quem eu quero premiar não perca os pontos.

## Decisões do proprietário tomadas como dadas (2026-11-06)

- O fluxo da fila **continua** com `redemption.fulfill` ao iniciar o atendimento (`in_progress`) para resgates normais.
- Escopo: (1) aviso no chat ao entrar (posição e instrução); (2) não compareceu / pular / reordenar com mensagem no chat; (3) mensagem de fim de atendimento e "próximo" no widget; (4) pausar ou fechar a fila com aviso (resgates novos recusados com reembolso); (5) devolução de pontos por grupo, a critério do streamer.
- Grupos: inscritos (pagos, presenteados e Prime), moderadores, VIPs e a lista própria do streamer; **o próprio streamer conta como do grupo**.
- Escopos OAuth: **um por grupo ativado** (inscritos `channel:read:subscriptions`, moderadores `moderation:read`, VIPs `channel:read:vips`; a lista própria não precisa); canais já conectados reautorizam uma vez.
- Falha na consulta: **perguntar ao streamer** (a entrada fica marcada "verificar grupo" no painel e ele decide devolver ou não); nunca devolver nem cumprir sozinho.
- **Momento da devolução (decisão do proprietário, 2026-11-06): um único momento, ao terminar o atendimento.** Para o grupo especial o resgate fica `UNFULFILLED` durante todo o atendimento e é `CANCELED` quando o atendimento é concluído. Não há devolução ao entrar nem ao iniciar. O painel explica, no próprio controle, que os pontos só voltam depois que o atendimento terminar (retenção aceita).
- **Cancelar, pular ou não compareceu de uma entrada de grupo especial (decisão do proprietário, 2026-11-06):** o streamer decide na hora se os pontos voltam; sem devolução automática; o chat informa a pessoa.
- Resgates fora de grupo continuam cumpridos ao iniciar o atendimento.

## Escopo

**Dentro (fatias, na ordem da seção Dependências):**

- **FT-71 (a)** avisos de chat (entrada, fim de atendimento, pausa/fechamento) e textos em pt-BR, en e es.
- **FT-72 (b)** não compareceu, pular e reordenar com mensagem no chat.
- **FT-73 (c)** "próximo" no widget do OBS.
- **FT-74 (d)** configuração `settlement` por fila e grupos de devolução (modelo de dados, painel, lista própria).
- **FT-75 (e)** consulta de grupo, escopos opcionais, reautorização.
- **FT-76 (f)** devolução ao terminar o atendimento (único momento de devolução).
- **FT-77 (g)** estado "verificar grupo" no painel.
- **FT-78 (h)** testes em canal real.

**Fora de escopo:** Send Chat Announcement (nota §6: mensagens simples bastam); lista persistente de inscritos/mods/VIPs (guardar só a decisão, nota §4.3 e §7); listas dirigidas por EventSub; devolução de recompensas não criadas por este produto; recompensas que pulam a fila de pedidos (nunca reembolsáveis); restrição por tier (salvo pedido do proprietário); release, tag, bump.

## Critérios de aceite

As classes de evidência ficam separadas: unitário, integração em PostgreSQL isolado, Twurple falso, canal real. Todo comportamento começa com um teste que falha.

### Grupo A — avisos de chat (FT-71)

1. **Dado** um resgate que cria uma entrada, **quando** ele é aceito, **então** o chat recebe uma mensagem com a posição da pessoa e a instrução a seguir, no idioma do canal.
2. **Dado** um atendimento que termina, **então** o chat recebe uma mensagem de fim de atendimento.
3. **Dado** uma fila pausada ou fechada, **então** o chat recebe um aviso, e **dado** um resgate novo durante a pausa ou o fechamento, **então** ele é recusado com reembolso (`CANCELED`) e a pessoa é informada do motivo.
4. **Dado** uma rajada (limpar, fechar, reordenação em massa), **então** é enviada no máximo uma mensagem-resumo por tipo de evento por uma fila de envio limitada abaixo de 100 mensagens por 30 s; o chamado "sua vez" tem prioridade; avisos informativos são agrupados ou descartados no excesso e nunca reenviados para sempre; `is_sent != true` conta como não entregue (nota §6).
5. **Dado** os avisos, **então** cada um pode ser desligado por fila, existem os três idiomas, nenhum texto leva UID, token ou corpo de chat nos logs, e a mensagem nunca passa de 500 caracteres.

### Grupo B — não compareceu, pular, reordenar (FT-72)

6. **Dado** uma entrada que o streamer marca como não compareceu ou pula, **então** a entrada muda de posição ou de estado por uma regra definida, o chat recebe uma mensagem com a nova situação, e a ação é reversível pelo streamer onde a regra permitir.
7. **Dado** uma reordenação manual, **então** as pessoas afetadas são informadas por uma mensagem agregada (CA 4).

### Grupo C — widget (FT-73)

8. **Dado** um atendimento em andamento com uma entrada aguardando, **então** o widget da conta mostra o "próximo" com o nome de exibição da próxima pessoa; **dado** nenhuma entrada aguardando, **então** não mostra nada enganoso. A verificação do widget segue o método da OPS-25 (OBS nativo) e é uma classe de evidência à parte.

### Grupo D — configuração de devolução e grupos (FT-74)

9. **Dado** uma fila, **então** ela tem `settlement` (`fulfill_on_start`, o padrão, ou `refund_on_end` para os grupos escolhidos) e um conjunto de grupos de devolução (`subscriber`, `moderator`, `vip`, `own_list`); conjunto vazio não devolve a ninguém; as filas existentes migram para `fulfill_on_start` sem mudança.
10. **Dado** a lista própria, **então** ela guarda só o ID numérico e um rótulo opcional, resolve o login digitado uma vez ao adicionar, permite remover e limpar tudo, e comporta no máximo 500 pessoas (adicionar a 501ª é recusado com código estável e mensagem clara). O `@architect` decidiu (D-31-7): a lista é **uma por canal, não por fila**; é apagada com os dados do canal; excluir uma fila remove só a chave `own_list` daquela fila, nunca as pessoas. [AUTO-DECISION `@po`: limite 500 (proposta do desenho aceita; motivo: muito acima de qualquer círculo real de streamer, limita os IDs guardados e a consulta é leitura de banco; o valor é uma constante de configuração, reversível sem migração).]
11. **Dado** o controle `refund_on_end`, **então** o painel explica em palavras simples, no próprio controle, que o status é verificado no momento da decisão e que **os pontos só voltam depois que o atendimento terminar** e ficam retidos até lá.
12. **Dado** um modo de devolução, **então** ele fica desabilitado a menos que: a recompensa tenha sido criada por este produto, "pular a fila de pedidos" esteja desligado, o canal seja afiliado ou parceiro e o escopo de cada grupo ativado esteja concedido. Excluir recompensa ou fila fica bloqueado enquanto houver resgates reembolsáveis pendentes.

### Grupo E — consulta de grupo e escopos (FT-75)

13. **Dado** um resgate, **quando** a decisão roda, **então** o resultado é `eligible | not_eligible | unknown`, gravado uma vez por resgate (`matched_group`, `settlement_mode`, `checked_at`, `unknown_reason`) antes de qualquer chamada à Twitch; uma nova tentativa nunca consulta de novo nem inverte a resposta.
14. **Dado** o streamer, **então** a regra `user_id == broadcaster_id` o torna elegível sem chamada; quem está em vários grupos casa por uma ordem fixa (lista própria, moderador, VIP, inscrito).
15. **Dado** escopo ausente, 401/403/429/5xx, tempo esgotado, corpo malformado ou canal não afiliado, **então** o resultado é `unknown`, nunca "não é do grupo".
16. **Dado** um grupo sendo ativado, **então** só o escopo desse grupo é pedido (somado ao conjunto já concedido), o painel mostra "Reconecte a Twitch para ativar este grupo" e os escopos obrigatórios não mudam, então as conexões existentes continuam funcionando; a lista concedida é verificada com `/validate`.

### Grupo F — devolução ao terminar o atendimento (FT-76)

17. **Dado** alguém de um grupo ativado em uma fila `refund_on_end`, **quando** o atendimento inicia, **então** `redemption.fulfill` é pulado e o resgate continua `UNFULFILLED` durante todo o atendimento; **quando** o atendimento é concluído, **então** `redemption.cancel` o reembolsa. `redemption.cancel` é emitido **somente** na conclusão; quem não é do grupo é cumprido ao iniciar, como hoje.
18. **Dado** duas intenções para um resgate (terminar e remover, nova tentativa e iniciar), **então** existe uma só operação final por resgate (restrição única gravada na mesma transação da decisão; a decisão é gravada antes de qualquer chamada à Twitch). Um pedido tardio contraditório é recusado com código estável, auditado (`settlement.contradictory_request`) e mostrado no painel com o desfecho gravado ("já decidido: devolver / não devolver"); nunca altera a operação gravada; quando a própria operação gravada precisa de revisão (OPS-22 `unknown`, `conflict`, `failed`), ela continua na resolução manual da OPS-22. Um pedido tardio de regra automática (chave, cronômetro) mantém o rebaixamento de hoje, com a linha de auditoria.
19. **Dado** um segundo cancelamento (a Twitch responde 404), **então** a leitura mostra `CANCELED` e ele resolve como já feito, testado com a classe real do Twurple.

### Grupo G — cancelar, pular e não compareceu de uma entrada de grupo especial (FT-76, FT-72)

20. **Dado** uma entrada de grupo especial que o streamer cancela, pula ou marca como não compareceu, **então** o painel pergunta na hora, com duas escolhas claras ("devolver os pontos" e "não devolver") e um texto que diz que a escolha é final; a decisão é gravada antes de qualquer chamada à Twitch, uma única operação final é emitida por resgate (D-31-4: devolver = `redemption.cancel`; **"não devolver" = `redemption.fulfill` gravado no momento da escolha**, nunca deixado `UNFULFILLED`), nada é devolvido automaticamente, e o chat informa a pessoa do resultado em pt-BR, en e es depois que a Twitch confirmar (CA 33). **Pular** mantém a entrada na fila (volta a `waiting`) e **não** pergunta sobre os pontos; a pergunta é feita quando a entrada sai da fila.

### Grupo H — estado "verificar grupo" (FT-77)

21. **Dado** uma decisão `unknown` (falha de consulta do CA 15 sem resposta positiva em outro grupo), **então** o resgate continua `UNFULFILLED`, a entrada fica marcada "verificar grupo" (nunca misturada com o `unknown` financeiro da OPS-22) e o início do atendimento não o cumpre, embora o atendimento comece normalmente; o painel oferece tentar agora, devolver, cumprir ou manter; nada acontece sem a ação do streamer; se o atendimento terminar com a entrada sem solução, a conclusão não decide por ela: a entrada continua `UNFULFILLED`, listada como pendente com as mesmas quatro escolhas.

### Grupo I — testes em canal real (FT-78)

22. **Dado** o canal de testes exclusivo SubaruShogun, **então** o `@qa` executa as seis verificações da lista abaixo com veredito, registradas por classe; nenhum resultado fora do que foi executado é afirmado.

### Transversais

23. **Dado** logs e erros, **então** nenhum UID, login, token, header, corpo de chat ou de resgate aparece; só contagens e códigos de motivo (`matched_group`, `unknown_reason`); falhas inesperadas retornam o texto genérico localizado com `referenceId`.
24. **Dado** a documentação, **então** guia, textos do painel e docs existem em inglês e pt-BR; os testes de localização e de contrato de documentação passam.
25. **Dado** os quality gates, **então** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` e `npm run review:static` estão verdes.

26. **Dado** uma entrada de grupo especial encerrada sem atendimento (limpar a fila, excluir a fila, remover entradas em espera, a pessoa sai, removida durante a chamada), **então** o resultado segue a tabela de gatilhos da D-31-4; coerente com a decisão do proprietário, nada é devolvido automaticamente e o streamer decide na hora. Em limpar e excluir, em dois passos (D-31-6): (1) *preparar* consulta os grupos em blocos de até 100 IDs e devolve **só contagens** (fora do grupo, do grupo, verificar grupo); (2) *confirmar* aplica uma escolha aos membros ("devolver todos", "não devolver" ou "decidir um a um") na mesma transação que remove as entradas, protegida pelo instantâneo da confirmação (instantâneo vencido é recusado). Quem não é do grupo mantém as chaves por gatilho de hoje; um 429 espera uma vez, dentro de um limite curto, e o bloco afetado vira `unknown` (`rate_limited`); a limpeza nunca falha por causa da consulta; o texto do resultado diz "solicitado" ou "pendente", nunca "devolvido", até a Twitch confirmar. [AUTO-DECISION do `@po` de 2026-11-06 confirmada pelo `@architect` (D-31-6); sem pergunta ao proprietário.]
27. **Dado** abuso por reentrada para ser devolvido de novo, **então** o desenho registra os limites de entrada duplicada e por pessoa em vigor (FT-70) e o teste real fecha se um resgate `CANCELED` restaura os limites da recompensa (item 2 do teste real); nenhuma penalidade automática é inventada.
28. **Dado** uma fila pausada ou fechada que recusa um resgate (AC 3), **então** essa devolução de recusa é um caso separado da devolução por grupo (acontece antes de qualquer atendimento, só para recompensas criadas por este produto, e não está sujeita ao momento único do fim do atendimento); os textos não misturam os dois.

### Acrescentados após o desenho do `@architect` (2026-11-11; `architect-design.md` seção 9)

29. **Dado** uma entrada que saiu da fila por não comparecimento, **quando** o streamer a restaura (`no_show→waiting`), **então** a restauração só é permitida enquanto o resgate dela não tem operação terminal (estado de acerto diferente de `intent_recorded`) e a pessoa não tem outra entrada ativa; depois que uma devolução ou um cumprimento foi gravado, a entrada é final (D-31-4, seção 4 do desenho).
30. **Dado** a configuração `refund_on_end`, **quando** ela é salva antes de a fatia da devolução ao terminar (FT-76) ser entregue, **então** a API a recusa com código estável, para que nenhuma fila retenha pontos com a funcionalidade pela metade; a migração única da FT-74 já traz todas as colunas (as filas existentes continuam `fulfill_on_start`).
31. **Dado** um gatilho que não pode perguntar ao streamer (cronômetro de chamada, comando de chat de quem sai, remoção por comando de chat), **quando** a entrada é de um membro, **então** ele nunca decide por um membro: a entrada se fecha e o resgate é listado como `awaiting_choice` (aguardando a decisão do streamer); uma escolha nunca é aceita vinda do chat.
32. **Dado** a escolha em lote de limpar ou excluir (CA 26), **então** ela vale só para membros; resgates em `check_group` nunca são decididos por ela (mantêm as quatro escolhas do CA 21, com ações em lote próprias na lista de pendentes); a exclusão da fila e da recompensa fica em `deleting` enquanto algum resgate estiver `held_for_service`, `awaiting_choice` ou `check_group`.
33. **Dado** um desfecho de devolução ou de não devolução, **então** o chat só informa à pessoa que os pontos voltaram depois que a Twitch confirmar o status remoto (a releitura do worker); uma resposta ausente nunca é confirmação e nunca gera o aviso.


## Decisão do proprietário sobre encerramentos sem atendimento (2026-11-06)

O momento da devolução é um só, ao terminar o atendimento. Para uma entrada de grupo especial cancelada, pulada ou marcada como não compareceu, o proprietário decidiu em 2026-11-06 que **o streamer decide na hora** se os pontos voltam; não há devolução automática nesses casos. Nenhuma pergunta ao proprietário está pendente. Questão de desenho para o `@architect`: qual operação terminal vale para "não devolver" (cumprir o resgate ou outro desfecho) e como se garante a operação final única por resgate.

## Itens abertos do proprietário (não bloqueiam; OW-31-1 do `@architect`, 2026-11-11)

- **OW-31-1 (decidido pelo `@po` como AUTO-DECISION reversível).** Numa fila `refund_on_end`, quem não é do grupo e está em espera, ao ser removido ou sair, é devolvido automaticamente (regra de hoje), enquanto um membro espera a escolha do streamer. Decisão: **manter "nada automático para membros"** (regra do proprietário de 2026-11-06: o streamer decide na hora; devolver membros automaticamente também contradiria o CA 31). Motivo: a alternativa devolveria membros em gatilhos em que o proprietário pediu para ser perguntado, e pode ser acrescentada depois por uma configuração sem migrar decisões passadas. O proprietário pode reverter a qualquer momento; nada fica bloqueado. O texto do painel deve explicar a diferença em palavras simples (`@ux-design-expert`).
- **Máximo da lista própria:** 500 (CA 10), aceito.
- **Só do proprietário, para a FT-78:** reconectar o canal de testes com os novos escopos e fazer os resgates reais.

## Dependências

- **Antes do `@dev`:** nota do `@analyst` (feita); pareceres do `@architect`, do `@data-engineer` e do `@ux-design-expert` (nota mínima 9,0); GO do `@po` e a issue.
- **Ordem (confirmada pelo `@architect`, seção 6 do desenho; numeração inalterada):** FT-71 (traz o limitador e o `chat.notice`) -> FT-72 (depende da FT-71; sem mudança de dinheiro) -> FT-73 (independente, pode andar junto das 1-2; OPS-23 para a atualização) -> FT-74 (**uma migração** com todas as colunas; a API recusa `refund_on_end` até a FT-76, CA 30) -> FT-75 (depende da FT-74; serviço de decisão e adaptador testados isolados) -> FT-76 (depende das FT-72, 74, 75; a fatia do dinheiro, fecha o CA 20 e o CA 26) -> FT-77 (depende da FT-76; acrescenta as quatro ações e a lista) -> FT-78 (duas execuções: avisos após 1-3, dinheiro após 4-7). Um gate do `@qa` ao final; **FT-76 e FT-77 são validadas juntas**. FT-76 e FT-77 usam o nível de modelo "muito complexo"; as demais são tarefas comuns.
- **Stories relacionadas:** OPS-23 para a atualização do widget.
- **A OPS-20 é substituída (confirmado pelo `@architect`, D-31-9; registrado pelo `@po` em 2026-11-11):** a OPS-20 **não** é implementada. A OPS-31 substitui a regra e as audiências dela (AC 1, 2, 9, 10), a regra de gatilhos (o AC 4 vira a tabela da D-31-4), absorve os AC 5-8, 11-12 e 14 e decide o AC 13 (não elegível: cumprir ao iniciar). As opções de presenteado/nível mínimo (AC 3) estão **fora** (proprietário: pago, presenteado e Prime contam; reabrir só a pedido do proprietário). Os AC 15-17 são substituídos pelos gates da OPS-31. **Pendente para o `@devops` (não feito pelo `@po`; o inventário não é editado aqui):** encerrar a issue #76 como substituída pela #115, ou atualizar o corpo dela para dizer isso (só edição de corpo, nunca comentário), e atualizar a entrada da OPS-20 no inventário e no quadro. **Dois resíduos para o backlog (fora do escopo da OPS-31):** R1 (devolver à mão um não membro depois do início é impossível na Twitch; antes do início, remover a entrada já faz isso: sem trabalho, só registro) e R2 (um não comparecimento ou uma remoção durante a chamada com a chave desligada deixa um resgate normal `UNFULFILLED` para sempre; sequência recomendada: cumprir nesse caso). O marcador seguinte é a posição anterior do `@po`, mantida como histórico.
- **Relação com a OPS-20 (posição anterior do `@po`; o `@architect` confirmou no desenho, AC 26):** a OPS-31 é o desenho guarda-chuva e a OPS-20 **não** é implementada à parte. A OPS-31 substitui a regra "todos / só inscritos / ninguém" da OPS-20, suas audiências e sua definição de inscrito (AC 1-3 e 9-10 da OPS-20 viram os grupos dos AC 9-16 da OPS-31; o padrão "devolver em todo gatilho" cede ao momento único). Os AC 5-7 e 14 da OPS-20 são absorvidos pelos AC 13-15, 18 e 21 da OPS-31; o AC 8 da OPS-20 (substituição manual) pelos AC 20-21. A OPS-20 ainda é dona, até o `@architect` decidir: consulta em lote e limite de taxa da limpeza da fila (AC 11-12 da OPS-20), tratamento de resgates não elegíveis (AC 13 da OPS-20; aqui, decisão do proprietário "cumprir ao iniciar") e a definição configurável de inscrito (presenteado / nível; a OPS-31 conta pago, presenteado e Prime). A OPS-20 continua aberta (#76) e só é encerrada ou reduzida pelo `@architect` e pelo `@po` após esse registro.
- **Relação com a OPS-22:** outbox, tentativas limitadas, releitura e resolução manual são reaproveitadas sem mudança; o `redemption.cancel` do fim do atendimento e o cumprimento de "não devolver" são intenções do outbox; o `unknown` da OPS-22 e o `unknown` de grupo (AC 15) são estados diferentes e não se misturam no painel.

## Riscos

1. **Corrida fulfill x cancel.** Mitigação: CA 18 (uma intenção terminal), leitura de verificação, resolução manual.
2. **Consulta de grupo falha.** Mitigação: `unknown` espera o streamer (CA 15, 21); nunca decidir sozinho.
3. **Pontos retidos** até o atendimento terminar (expiração de resgate UNFULFILLED não verificada). Mitigação: texto do painel (CA 11); o proprietário aceitou a retenção.
4. **Abuso:** membros reentrando para serem reembolsados de novo. Mitigação: entrada duplicada e limites por pessoa; teste real se um resgate cancelado restaura os limites da recompensa.
5. **UID em log ou lista persistente.** Mitigação: CA 10 e 23; guardar só a decisão e a lista própria.
6. **Rajadas de chat e mensagens descartadas.** Mitigação: CA 4.
7. **Atrito da reautorização.** Mitigação: um escopo por grupo, texto claro no painel.

## Complexidade (estimativa do `@sm`, a confirmar pelo `@architect`)

Escopo 5, integração 4, infraestrutura 2, conhecimento 3, risco 5 = **19 → COMPLEX** (6 fases mais ciclo de revisão). Confirmado pelo `@architect` em 2026-11-11 (a estimativa do `@sm` era 17; escopo e risco subiram um ponto cada). Dificuldade **GG**, prioridade **P2**.

## Plano de testes

1. **Unitário e Twurple falso:** serviço de decisão para cada grupo e para as causas de `unknown`; unicidade da intenção terminal; cancelamento duplo com a classe real do Twurple; fila de avisos e limites.
2. **PostgreSQL isolado com migrations reais:** `settlement`, grupos, lista própria, colunas de decisão, migração do padrão, corrida pela restrição.
3. **Painel e widget:** testes de componente e scripts de navegador; evidência visual separada de revisão estática.
4. **Canal real (canal de testes SubaruShogun):** o `@qa` cria filas e recompensas; o Orion faz as ações de resgate pelo Chrome; o `@qa` registra o veredito.
5. **Gates:** os sete gates do projeto; veredito do `@qa` antes do commit do `@devops`.

### O que só um teste real fecha (nota §11)

1. Se a Twitch expira um resgate UNFULFILLED.
2. Se um resgate CANCELED restaura o limite por pessoa/por transmissão e o tempo de recarga da recompensa.
3. Se `...redemption.update` dispara para mudanças feitas pelo próprio app.
4. Como o Prime aparece na consulta de inscrição.
5. Se o broadcaster aparece nas próprias listas de inscritos, moderadores e VIPs.
6. O que a segunda autorização traz (só os escopos novos ou o conjunto inteiro).

## Gates de planejamento antes da implementação

- [x] Validação do `@po` (10 pontos) e GO (8,7/10, 2026-11-06).
- [x] `@devops` cria a issue no GitHub (#115, 2026-11-06).
- [x] Desenho do `@architect` ([architect-design](architect-design.md), D-31-1..D-31-11, 2026-11-11); as redações da seção 9 foram aplicadas aqui (CA 10, 18, 20, 21, 26 e novos 29-33).
- [ ] Parecer de esquema do `@data-engineer`.
- [ ] Plano e revisão do `@ux-design-expert`, nota mínima 9,0.
- [ ] Plano de testes do `@qa`.

## Definition of Done

- CAs 1 a 33 com evidência registrada por classe; os seis itens de teste real fechados ou registrados como pendentes.
- Quality gates verdes; veredito do `@qa` registrado; File List e checklists atualizados em inglês e pt-BR.

## Validação do rascunho pelo SM (story-draft-checklist, 2026-11-06)

1. Objetivo e contexto: claros (fila muda; cumprimento irreversível). PASS.
2. Orientação técnica: desenho vindo da nota; pontos abertos atribuídos a especialistas. PASS.
3. Referências: seções da nota, OPS-20, OPS-22, FT-70. PASS.
4. Autossuficiência: escopo, fora de escopo, decisões do proprietário (incluindo o momento único de devolução e os encerramentos sem atendimento) declarados. PASS.
5. Testes: unitário, PostgreSQL, canal real, os seis itens abertos. PASS.
6. Análise estática: `npm run review:static` nos gates. PASS.
- Resultado: pronta para o `@po`, sem pergunta pendente. Prioridade e ordem são propostas.

## File List

- `docs/stories/OPS-31/story.md` (novo; alterado em 2026-11-11 pelo desenho do `@architect`)
- `docs/stories/OPS-31/architect-design.md` (novo, `@architect`)
- `docs/stories/OPS-31/po-validation.md` (reconfirmado em 2026-11-11)
- `docs/pt-BR/stories/OPS-31/story.md` (novo)
- `docs/stories.md` e `docs/pt-BR/stories.md` (entrada do índice)
- `docs/process/backlog-inventory.md`, `docs/process/kanban-board-design.md` e gêmeos pt-BR (ST-24, FT-71..FT-78)
- `docs/process/issue-body-changes-2026-11-06b.md` e gêmeo pt-BR (texto da issue)
- `docs/session-handoff.md` e gêmeo pt-BR (bloco de estado)

Os arquivos de implementação serão listados aqui pelo `@dev` após os gates.

## Change Log

- 2026-11-06 — `@sm` (River): story redigida a partir do pedido do proprietário e da nota do `@analyst`. Status Rascunho. Fatias FT-71..FT-78 registradas. [AUTO-DECISION] ID no inventário → ST-24 (motivo: próximo ID de story livre); todas as prioridades P2. 2026-11-06 (Orion, decisão do proprietário): o único momento de devolução é ao terminar o atendimento; devolução ao entrar e ao iniciar removidas, fatia "devolução ao entrar" apagada, fatias seguintes renumeradas; encerramentos sem atendimento decididos pelo proprietário em 2026-11-06 (o streamer decide na hora).
- 2026-11-06 — `@po` (Pax): validação, **GO 8,7/10**, ver [po-validation](po-validation.md). Edições do `@po`: ordem corrigida (FT-76 antes da FT-77); relação com a OPS-20 e a OPS-22 declarada; AC 26-28 acrescentados (encerramentos em massa, abuso, devolução de recusa); AC 21 completado (atendimento termina com entrada sem solução). O status continua Rascunho até a issue existir (Pronta = GO + issue).
- 2026-11-06 — `@devops` (Gage): issue [#115](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/115) criada; status de Rascunho para Pronta (mecânico, conforme o GO do `@po` e a autoridade do Orion; ACs intactos).
- 2026-11-11 — `@po` (Pax): CAs ajustados ao desenho do `@architect` ([architect-design](architect-design.md), seção 9), **GO reconfirmado 9,3/10** ([po-validation](po-validation.md)). Alterados: CA 10 (uma lista própria por canal, máx. 500, excluir a fila remove só a chave), CA 18 (pedido contraditório recusado com código estável, auditado e mostrado; revisão da OPS-22 permanece), CA 20 ("não devolver" = `redemption.fulfill` gravado na escolha; pular não pergunta), CA 21 (`unknown` -> "verificar grupo", o atendimento ainda começa), CA 26 (lote em dois passos com contagens, limite do 429, texto "solicitado/pendente"). Novos: CA 29-33 (restaurar só sem operação terminal; API recusa `refund_on_end` até a FT-76; gatilhos automáticos nunca decidem por membros; escolha em lote só para membros; aviso no chat só depois da confirmação da Twitch). Complexidade 17 -> 19. OPS-20 registrada como substituída (pendências para o `@devops`). [AUTO-DECISION] OW-31-1 -> manter "nada automático para membros" (reversível; o proprietário pode trocar depois; não bloqueia). [AUTO-DECISION] máximo de 500 na lista própria aceito. CAs 1-9, 11-17, 19, 22-25, 27, 28 intactos; numeração estável (novos CAs ao final).
