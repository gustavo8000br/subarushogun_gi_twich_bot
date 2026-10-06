# Especificação: operação manual de filas em canais sem elegibilidade para Pontos do Canal

> **Story ID:** FND-9<br>
> **Gerado:** 2026-10-06 UTC<br>
> **Complexidade:** COMPLEX (18/25)<br>
> **Pipeline:** Gather → Assess → Research → Write → Critique → Revise → Critique → Plan<br>
> **Status:** Draft de planejamento concluído; implementação segue fora da sequência atualmente autorizada.

[English](../../../../stories/FND-9/spec/spec.md)

## 1. Visão geral

Viewers normalmente recebem Pontos do Canal Twitch por assistir à live e os trocam por uma recompensa personalizada escolhida pelo streamer, como “beber água”. A FND-9 trata de uma capacidade separada de entrada em filas para um canal ao qual a Twitch não permite criar/usar recompensas de Pontos do Canal por não ser Afiliado ou Parceiro. Nesse modo, o chatbot deve continuar aceitando um comando de adição manual autorizado pelo streamer ou moderador.

Para cada fila em um canal elegível, o bot cria uma Custom Reward dedicada da Twitch pela API e gerencia os resgates dessa recompensa. Recompensas que já existam na lista do streamer (inclusive “beber água”) não são selecionadas como gatilho da fila e permanecem intocadas. Para canal inelegível, usam-se adições manuais autorizadas pelo chat; o app nunca deve afirmar que um comando manual foi um resgate de pontos nem criar operação de reembolso/consumo de pontos para essa entrada.

### Objetivos

- Manter comandos do chat Twitch operacionais quando recompensas de Pontos do Canal estiverem indisponíveis.
- Reutilizar autorização confiável existente, domínio de filas, regras de duplicidade/UID e persistência.
- Distinguir claramente conectividade do chat da elegibilidade a Pontos do Canal no painel e na projeção de conectividade/saúde.
- Criar e gerenciar uma Custom Reward dedicada da Twitch, criada pelo app, para cada fila em canais elegíveis.

### Fora de escopo

- Autoinscrição de viewers, processamento de pagamentos, verificação de Bits/inscrição, webhooks de provedores externos, prioridade automática, segunda conta de bot ou seleção/adoção de recompensa preexistente que não foi criada por este app.
- Alterar saldo de pontos Twitch ou a maneira como viewers ganham pontos assistindo às lives.
- Alterar recompensas personalizadas sem relação, como “beber água”.

## 2. Resumo de requisitos

| ID | Requisito | Prioridade |
| --- | --- | --- |
| FR-1 | Manter operação autorizada do broadcaster no chat/EventSub quando recompensas de Pontos do Canal estiverem indisponíveis. | P0 |
| FR-2 | Streamer e moderadores adicionam manualmente usuário resolvido da Twitch a uma fila pelo comando autorizado existente. | P0 |
| FR-3 | Entradas manuais têm origem `manual`, sem `redemption_id`, sem tarefa financeira na outbox e com auditoria segura. | P0 |
| FR-4 | Explicar o modo manual/inelegível em pt-BR e informar conectividade do chat separada da disponibilidade de Pontos do Canal. | P1 |
| FR-5 | Em cada fila elegível, criar e gerenciar uma Custom Reward dedicada da Twitch por este app; preservar recompensas preexistentes. | P1 |

## 3. Arquitetura proposta

1. Separar o ciclo da conexão Twitch em capacidade de chat e capacidade de Pontos do Canal. Falha/inelegibilidade no teste de Pontos do Canal deve desabilitar somente assinaturas, workers, alterações de recompensa e reconciliação de pontos. Não deve encerrar autorização válida do chat e a assinatura `channel.chat.message`.
2. Continuar usando token de usuário do broadcaster para chatbot instalado e transporte EventSub WebSocket. Manter escopos atuais do chat (`user:read:chat`, `user:write:chat`) para leitura e respostas. Tornar `channel:manage:redemptions` condicional à capacidade de recompensas somente se documentação oficial e testes OAuth instalados confirmarem segurança. Não acrescentar escopos.
3. Reutilizar `!<fila> add <usuário> [UID]`. Autorização streamer/mod vem da identidade atual confiável do broadcaster e badges da mensagem; nunca do corpo ou papel digitado. `add` pelo chat sempre cria entrada manual na faixa normal.
4. Continuar usando repositório/serviço de filas e integridade PostgreSQL existentes. Não criar subsistema financeiro ou de filas para este modo.
5. Exibir estados separados, como chat `connected` e Pontos `unavailable_ineligible`. `/health` e o painel não devem indicar indisponibilidade total Twitch se o chat estiver funcional; nenhuma entidade da API ou erro Twitch bruto é exposto.
6. Em canais elegíveis, criar uma Custom Reward dedicada da Twitch para cada fila por meio deste app. Somente o ID dessa recompensa pode ser aberto, pausado, reconciliado, concluído/cancelado ou excluído. Recompensas genéricas já existentes no canal (por exemplo, “beber água”) não são fonte de fila nem ficam sob controle do app.
7. Manter vínculo um para um entre fila e recompensa por ID Twitch imutável; nunca adotar recompensa preexistente pelo título ou semelhança.

Esta é uma direção de implementação recomendada, não detalhe técnico aprovado. Comportamento de escopos de token e sequência real de assinatura Twurple precisam ser validados antes de alterar código.

### Esclarecimento da API oficial (2026-10-06)

A Twitch documenta `channel.chat.message` com `user:read:chat`; EventSub de resgate e alteração de Custom Reward usam escopos de resgate. A Helix restringe explicitamente o gerenciamento de Custom Rewards a canais elegíveis, enquanto o contrato da assinatura de chat não declara exigência Afiliado/Parceiro. Isso sustenta manter chat e Pontos do Canal como capacidades runtime independentes, mas não prova que o fluxo OAuth inelegível desta aplicação funciona. Antes de implementar, testar OAuth/validação de token somente com escopos de chat e verificar a inscrição WebSocket Twurple; não enfraquecer silenciosamente o fluxo de canal elegível. Consulte a [auditoria de capacidades](../../TWITCH-CAPABILITY-GAP-ANALYSIS.md) e a [referência de integrações](../../../integrations.md).

## 4. Segurança e privacidade

- Somente streamer ou badges de moderador no evento atual podem adicionar outra pessoa. VIP não está incluído sem aprovação separada.
- Viewer não pode se adicionar nem nomear papel/ator no corpo do comando.
- Resolver login Twitch para `twitch_user_id`; preservar uma entrada ativa por usuário/fila.
- Manter regra de UID oculto e nove dígitos ASCII no modo visível; não repetir entradas inválidas.
- Não persistir chat bruto, argumentos rejeitados, comprovantes de pagamento ou IDs de resgate inventados.
- Transições de entrada manual não podem produzir intents `redemption.cancel` ou `redemption.fulfill`.

## 5. Cenários de aceite

1. Broadcaster não Afiliado/Parceiro autorizado conecta o chat e executa comandos de gestão; painel informa que recompensas de Pontos do Canal estão indisponíveis e que o chat está conectado.
2. Streamer/mod executa `!abismo add viewer`; uma entrada manual aguardando é salva com ID Twitch, posição FIFO normal contínua, ator/origem de auditoria, ID de resgate nulo e sem linha financeira na outbox.
3. Viewer comum executa a mesma mutação ou falsifica badges/papel em texto; sistema não faz consulta, insert, ação de pontos nem anúncio de sucesso.
4. Usuário ativo duplicado, fila arquivada/em exclusão, login Twitch inexistente, UID oculto ou UID visível inválido seguem regras atuais sem efeitos indevidos.
5. Remoção/conclusão de entrada manual seguem domínio existente sem chamada à API Twitch de pontos.
6. Canal com recompensa preexistente “beber água” conecta. O bot não a altera; a criação de fila elegível cria outra Custom Reward pausada pelo bot e associa à fila somente o novo ID.
7. Canal elegível mantém entrada por resgate, outbox, reconciliação e recompensas existentes.
8. Perda/revogação do chat aparece separada da inelegibilidade de pontos; reiniciar o bot preserva a entrada manual.

## 6. Plano TDD

- Red/Green unitário: integração inicia EventSub de chat para canal inelegível e nunca inicia assinaturas de resgate/reconciliação; autorização permanece somente streamer/mod; projeções de saúde/painel separam estados.
- Integração PostgreSQL: migrations reais validam origem manual, relações de IDs, unicidade, auditoria e ausência de intenção financeira; mock Prisma não prova esses contratos.
- Fakes de worker/adaptador: provar ausência de chamadas de criar/alterar/apagar/reconciliar recompensa para canal inelegível e ausência de chamada financeira Twitch para entrada manual.
- Regressões de segurança: ator/badge/corpo forjado, origem Shared Chat, ID de comando duplicado, login/UID inválido e display malicioso não geram efeitos indevidos nem exposição.
- Suítes atuais de OAuth, recompensa, EventSub, resgate, reconciliação, chat, fila e outbox de canal elegível continuam passando.
- Aceite do operador: uma conta Twitch autorizada de canal não Afiliado/Parceiro verifica EventSub real de chat e `add` manual; não exige resgate nem operação real de pontos. Sem credencial dessa conta, registrar bloqueio e não alegar validação real.

## 7. Riscos

| Risco | Mitigação |
| --- | --- |
| Tratar inelegibilidade de pontos como desconexão total Twitch continua bloqueando chat | Separar estado das capacidades e testar branch de integração com fake e aceite real controlado depois. |
| Solicitar um escopo que o canal não possa usar bloqueia OAuth antes do modo manual | Manter escopos de chat independentes; validar se `channel:manage:redemptions` pode ser omitido no fluxo manual-only antes de mudar escopos. |
| Gerir acidentalmente recompensa genérica cria expectativa de resgates duplicados | Criar Custom Reward dedicada pelo bot e usar seu ID imutável como única fonte da fila; testar que recompensas sem relação nunca são adotadas ou alteradas. |
| Operador confunde entrada manual com resgate de pontos | Exibir origem/ações pendentes claramente; entrada manual não tem chamada de API de pontos. |

## 8. Decisão de produto pendente

- [x] **Q-1:** Adição manual no chat disponível para streamer e moderadores. Confirmado pelo proprietário do produto em 2026-10-06.
- [x] **Q-2:** Canais elegíveis mantêm entrada por resgate de Pontos do Canal; canais inelegíveis usam entrada manual. Confirmado pelo proprietário do produto em 2026-10-06.
- [x] **Q-3:** Adições manuais continuam permitidas em fila fechada, conforme regra original do produto.

## 9. Crítica do pipeline

**Crítica 1:** NEEDS_REVISION. O pedido inicial informal não diferenciava pontos ganhos assistindo de uma Custom Reward dedicada da fila nem considerava que a integração atual retorna antes do EventSub. Esclarecimento resolveu a distinção, escolheu streamer/mod, confirmou entrada por resgate em canais elegíveis e definiu uma Custom Reward dedicada, criada pelo bot para cada fila elegível.

**Revisão:** Criar uma Custom Reward gerenciada pelo app para cada fila elegível; manter recompensas preexistentes fora do fluxo da fila; separar capacidades de chat e Pontos do Canal; restringir adição manual a atores autorizados no chat; documentar ausência de resgate inventado e efeitos financeiros.

**Crítica 2:** APPROVED AS A PLANNING DRAFT. Requisitos, decisões, restrições, riscos, cenários de aceite e estratégia de teste derivam da especificação original do produto, esclarecimentos do usuário, evidências do repositório e documentação oficial da Twitch. Comportamento Twitch real segue sem verificação. Isso não autoriza implementação; o proprietário decidirá quando FND-9 entra na sequência ativa.

## 10. Resultado do planejamento

A solução recomendada é manter o bot conectado ao chat Twitch, reutilizar comando `add` existente de streamer/mod para canais inelegíveis e desabilitar somente recursos de recompensas de Pontos do Canal quando a Twitch informar inelegibilidade do canal. Pontos do Canal são pontos da plataforma Twitch que viewers ganham assistindo à live e gastam em Custom Rewards. Em canal elegível, cada fila terá uma Custom Reward dedicada da Twitch criada pelo bot pela API; assim, o app que a criou pode consultar e atualizar seus resgates. Recompensas preexistentes, como “beber água”, permanecem intocadas e não são gatilhos de fila.

Não se propõe serviço ou provedor novo. A implementação deve seguir como story própria após FND-7 e no momento escolhido pelo proprietário em relação à FND-8. Este draft não autoriza implementação nem promoção de estágio/versão.
