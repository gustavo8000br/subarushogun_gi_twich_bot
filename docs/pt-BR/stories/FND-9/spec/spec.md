# Especificação: modos de fila manual e com reward conforme capacidade Twitch

> **Story ID:** FND-9<br>
> **Atualizado:** 2026-10-07 UTC<br>
> **Complexidade:** COMPLEX (23/25)<br>
> **Pipeline:** Gather → Assess → Research → Write → Critique → Revise → Critique → Plan<br>
> **Status:** Spec Pipeline concluído; implementação autorizada e em andamento em 2026-10-07.

[English](../../../../stories/FND-9/spec/spec.md)

## 1. Visão geral

Viewers normalmente recebem Pontos do Canal Twitch por assistir à live e os trocam por uma recompensa personalizada escolhida pelo streamer, como “beber água”. A FND-9 trata da entrada em filas quando o bot não consegue usar as APIs de recompensas Twitch necessárias. O status Afiliado/Parceiro sozinho não deve definir a elegibilidade: a atualização Monetization for All de maio de 2026 informa que Pontos do Canal estão disponíveis a streamers monetizados após o onboarding do criador, enquanto a referência Helix atual ainda documenta restrições Afiliado/Parceiro para operações de API de recompensas. No modo manual, o chatbot deve continuar aceitando um comando de adição autorizado pelo streamer ou moderador.

Uma fila pode ser vinculada a reward (`channel_points`) ou operar localmente/manual (`manual_only`). Para fila com reward, uma Custom Reward dedicada criada pelo bot é o padrão; reward do Creator Dashboard só é permitida depois que este Client ID comprovar o ciclo completo exigido. Recompensas que já existam na lista do streamer (inclusive “beber água”) não são consideradas gerenciáveis pelo app apenas por aparecerem no Creator Dashboard. Uma fila pode ser criada localmente sem reward e uma fila vinculada a reward pode ser convertida para o modo local/manual. Streamer/moderador pode adicionar alguém gratuitamente após receber um pedido no chat, independentemente da origem da fila; o bot não interpreta mensagens livres como inscrição. Um comando manual nunca é representado como resgate de pontos e nunca cria operação de reembolso/consumo.

### Objetivos

- Manter comandos do chat Twitch operacionais quando recompensas de Pontos do Canal estiverem indisponíveis.
- Reutilizar autorização confiável existente, domínio de filas, regras de duplicidade/UID e persistência.
- Distinguir claramente conectividade do chat da elegibilidade a Pontos do Canal no painel e na projeção de conectividade/saúde.
- Usar Custom Reward criada pelo bot por padrão; permitir reward do Creator Dashboard somente após o bot comprovar o ciclo completo exigido da API.
- Permitir adição manual gratuita por streamer/moderador em qualquer fila ativa, sem exigir que viewer digite comando ou resgate pontos.
- Permitir conversão segura de reward para modo local/manual somente após a Twitch confirmar a pausa; preservar a identidade histórica da reward e drenar os resgates existentes pelo fluxo financeiro atual.

### Fora de escopo

- Autoinscrição de viewers, processamento de pagamentos, verificação de Bits/inscrição, webhooks de provedores externos, prioridade automática ou segunda conta de bot.
- Alterar saldo de pontos Twitch ou a maneira como viewers ganham pontos assistindo às lives.
- Alterar recompensas personalizadas sem relação, como “beber água”.

## 2. Resumo de requisitos

| ID | Requisito | Prioridade |
| --- | --- | --- |
| FR-1 | Manter operação autorizada do broadcaster no chat/EventSub quando recompensas de Pontos do Canal estiverem indisponíveis. | P0 |
| FR-2 | Streamer e moderadores adicionam manualmente usuário resolvido da Twitch a uma fila pelo comando autorizado existente. | P0 |
| FR-3 | Entradas manuais têm origem `manual`, sem `redemption_id`, sem tarefa financeira na outbox e com auditoria segura. | P0 |
| FR-4 | Explicar o modo somente manual/estado da API de recompensas no idioma do produto e informar conectividade do chat separada da capacidade de recompensa. | P1 |
| FR-5 | Permitir fila local somente manual sem reward Twitch; usar reward criada pelo bot por padrão e aceitar reward existente somente após comprovar o ciclo completo da API. | P1 |
| FR-6 | Manter o comando global localizado `ping` disponível para streamer/moderador quando Pontos do Canal estiverem indisponíveis. | P0 |
| FR-7 | Permitir que streamer/moderador adicione viewer manualmente a qualquer fila não arquivada/em exclusão, mesmo quando vinculada a reward. | P0 |
| FR-8 | Permitir conversão de fila vinculada a reward para modo local/manual somente após confirmação da pausa remota; preservar e resolver resgates existentes. | P0 |
| FR-9 | Tratar pedidos livres de viewers no chat como informativos; somente ação `add` explicitamente autorizada cria entrada. | P1 |

## 3. Arquitetura proposta

1. Separar o ciclo da conexão Twitch em capacidade de chat e capacidade de Pontos do Canal. Falha/inelegibilidade no teste de Pontos do Canal deve desabilitar somente assinaturas, workers, alterações de recompensa e reconciliação de pontos. Não deve encerrar autorização válida do chat e a assinatura `channel.chat.message`.
2. Continuar usando token de usuário do broadcaster para chatbot instalado e transporte EventSub WebSocket. Manter escopos atuais do chat (`user:read:chat`, `user:write:chat`) para leitura e respostas. Tornar `channel:manage:redemptions` condicional à capacidade de recompensas somente se documentação oficial e testes OAuth instalados confirmarem segurança. Não acrescentar escopos.
3. Reutilizar `!<fila> add <usuário> [UID]`. Autorização streamer/mod vem da identidade atual confiável do broadcaster e badges da mensagem; nunca do corpo ou papel digitado. `add` pelo chat sempre cria entrada manual na faixa normal.
4. Continuar usando repositório/serviço de filas e integridade PostgreSQL existentes. Não criar subsistema financeiro ou de filas para este modo.
5. Persistir modo explícito da fila e estado de transição. Uma fila manual criada localmente não tem `reward_id`; uma fila convertida de Pontos do Canal mantém o ID/origem imutável da recompensa como associação histórica. Modo manual confirmado não recebe novos resgates nem gerencia a reward. Suas entradas são manuais e não geram operação financeira. Preservar ciclo de vida/histórico da fila.
6. No modo `channel_points`, registrar origem da recompensa (`bot_created` ou `dashboard_existing`) e seu ID Twitch imutável. Recompensa criada pelo bot é o padrão. Seleção de reward do Dashboard só é habilitada quando o app comprova o ciclo completo exigido para aquele ID: abrir/pausar, enumerar resgates pendentes, consultar estado individual após ambiguidade, reconciliar eventos perdidos, cancelar/concluir e excluir com segurança após resolver resgates pendentes.
7. Se a capacidade de reward estiver definitivamente indisponível, permitir que streamer crie fila local/sem reward. Não converter silenciosamente uma fila com reward para modo manual após falha temporária de rede, servidor, OAuth ou escopo; manter chat ativo e exibir estado de capacidade recuperável.
8. Streamer pode solicitar conversão de fila vinculada a reward para modo manual. Persistir intenção de transição, bloquear novas chamadas/entrada de resgates para a fila, solicitar pausa remota e manter `conversion_pending` até confirmação. Em caso de resultado desconhecido/falha, manter o modo reward e permitir retry/reconciliação. Após confirmar a pausa, ativar modo local, manter ID/origem da reward no histórico, cancelar qualquer resgate que chegue durante a transição por intenção durável e continuar o processamento financeiro normal dos resgates já admitidos. Não excluir a reward na conversão.
9. Adição manual permanece disponível a streamer/moderadores autorizados nos modos reward, local/manual e `conversion_pending` (inclusive fila fechada conforme regras existentes), respeitando unicidade de usuário ativo e bloqueios de arquivamento/exclusão. O operador pode ouvir o pedido do viewer e adicioná-lo explicitamente; texto livre não cria entrada.
10. Determinar capacidade da reward pelos resultados reais da API, não somente por `broadcasterType`. Monetization for All informa que Pontos do Canal estão disponíveis a streamers monetizados após onboarding, enquanto a Helix ainda documenta restrições Affiliate/Partner. Distinguir `available`, `unsupported` e `unknown`/temporário.
11. Exibir conectividade do chat separada da capacidade de rewards em `/health` e no painel. Fila manual não deve mostrar “reward aberta/fechada”; ocultar/desabilitar controles remotos de reward e explicar a adição manual. Arquivar/apagar continua bloqueando novas adições.
12. Manter `ping` global localizado disponível para streamer/moderador sempre que chat estiver autorizado, independente da capacidade de rewards. Usar latência em cache; não consultar Helix a cada mensagem.
13. Manter escopos base de chat separados dos escopos de reward. Validar o conjunto OAuth real antes de decidir se `channel:manage:redemptions` pode ser opcional no modo somente manual; se o uso de reward precisar de consentimento adicional, solicitar pelo fluxo OAuth vinculado à sessão sem perder a operação do chat.

Estas decisões refletem as escolhas de produto da seção 8. Comportamento dos escopos OAuth, propriedade da recompensa selecionada no Dashboard e sequência real de assinatura Twurple continuam como gates de evidência antes de habilitar os comportamentos correspondentes.

### Evidência do operador (2026-10-07)

O operador relata que o canal conectado, mas inelegível, não responde a `!fila ping`. Isso corresponde à saída antecipada atual da integração antes de iniciar EventSub. A FND-9 deve manter o comportamento global de ping localizado, restrito a streamer/moderador, junto com o chat mesmo quando recompensas de pontos estão indisponíveis; preservar a resposta Pong, versão do produto e latência em cache, sem adicionar consulta Helix por mensagem. Ainda não alegamos resposta bem-sucedida de chat real.

### Esclarecimento da API oficial (2026-10-06)

A Twitch documenta `channel.chat.message` com `user:read:chat`; EventSub de resgate e alteração de Custom Reward usam escopos de resgate. A Helix restringe explicitamente o gerenciamento de Custom Rewards a canais elegíveis, enquanto o contrato da assinatura de chat não declara exigência Afiliado/Parceiro. Isso sustenta manter chat e Pontos do Canal como capacidades runtime independentes, mas não prova que o fluxo OAuth inelegível desta aplicação funciona. Antes de implementar, testar OAuth/validação de token somente com escopos de chat e verificar a inscrição WebSocket Twurple; não enfraquecer silenciosamente o fluxo de canal elegível. Consulte a [auditoria de capacidades](../../TWITCH-CAPABILITY-GAP-ANALYSIS.md) e a [referência de integrações](../../../integrations.md).

### Discrepância entre monetização e capacidade da API (2026-10-07)

A Central de Ajuda atual para criadores diz que Pontos do Canal estão habilitados para todos os streamers monetizados após concluir o onboarding; o anúncio Monetization for All de maio de 2026 ampliou o acesso além da antiga suposição de Affiliate/Partner. A referência Helix ainda documenta `403 broadcaster is not a partner or affiliate` para operações de API de Custom Rewards. Há conflito entre essas informações para decidir capacidade do produto; não devemos resolvê-lo presumindo o comportamento do Dashboard ou da API. O broadcaster relata que criou uma recompensa pelo Creator Dashboard sem ser Afiliado; isso é evidência fornecida pelo operador de acesso ao Dashboard, não prova que o Client ID deste app consegue criar/gerenciar a recompensa pela Helix.

A referência Helix diferencia visibilidade de propriedade: `GET /helix/channel_points/custom_rewards` pode listar recompensas com `only_manageable_rewards=false`, enquanto `only_manageable_rewards=true` filtra as recompensas gerenciáveis por este Client ID. A referência diz que somente o app que criou uma recompensa pode consultar seus resgates, alterar a recompensa, alterar um resgate ou excluí-la. A entrega de eventos EventSub de resgate exige `channel:read:redemptions` ou `channel:manage:redemptions`, mas não demonstra que o app possa recuperar resgates perdidos nem alterar seu status. Portanto, a documentação não sustenta usar uma recompensa do Dashboard como ciclo financeiro completo da fila.

Consequência para o planejamento: recompensa criada pelo bot é a regra; recompensa criada no Dashboard não é suportada sem teste de aceite Twitch autorizado que comprove o ciclo completo e aprovação explícita do proprietário do produto. Substituir a heurística exclusiva de Afiliado/Parceiro por um resultado explícito da capacidade da API suportada. Distinguir indisponibilidade confirmada de falhas temporárias de rede/autenticação; erro temporário não pode converter silenciosamente fila existente para modo manual. Chat continua independente. Fontes: [Monetization for All](https://blog.twitch.tv/en/2026/05/13/monetization-for-all/), [FAQ de Pontos do Canal](https://help.twitch.tv/s/article/channel-points-faq), [guia de Pontos do Canal para criadores](https://help.twitch.tv/s/article/channel-points-guide?language=en_US), [referência Helix](https://dev.twitch.tv/docs/api/reference/) e [tipos de assinatura EventSub](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/).

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
6. Canal com recompensa preexistente “beber água” conecta. O bot não a altera. Visibilidade no Dashboard ou entrega EventSub isolada não faz o bot adotá-la; adoção permanece desabilitada sem prova e aprovação explícita do ciclo completo da API.
7. Canal com Pontos do Canal no Creator Dashboard, mas capacidade incompleta da API do bot, recebe um resultado de capacidade fiel às operações verificadas; chat é independente e erros temporários não convertem silenciosamente a operação para modo manual.
8. Canal com ciclo completo de API comprovado mantém entrada por resgate, outbox, reconciliação e recursos de recompensa.
9. Perda/revogação do chat aparece separada da capacidade de API de recompensas; reiniciar o bot preserva a entrada manual.
10. Streamer/moderador envia o comando global localizado de ping quando APIs de recompensa estão indisponíveis e recebe Pong, versão do produto e latência Twitch em cache; viewer não recebe resposta, e nenhuma API de reward ou consulta Helix por mensagem é acionada.
11. Streamer/mod adiciona viewer explicitamente e sem custo a uma fila ativa vinculada a reward; a entrada tem origem `manual`, sem ID de resgate nem intenção financeira na outbox.
12. Conversão continua pendente até a Twitch confirmar a pausa; então ativa modo manual, mantém ID/origem anterior da reward como histórico e não exclui a reward.
13. Timeout, 5xx, falha OAuth ou resultado desconhecido não ativa o modo manual; retry/reconciliação resolve o estado real da Twitch sem efeitos duplicados.
14. Resgate que chega durante a conversão recebe cancelamento durável; resgates já admitidos e suas intents financeiras seguem confirmação/recuperação normal.
15. Texto livre de viewer pedindo para entrar não faz consulta ou inserção; somente `add` explícito e autorizado cria entrada.
16. Fechar, arquivar e converter fila de reward gerenciada confirma `is_paused=true`; reabrir confirma `is_paused=false`. O GET Helix retorna `is_in_stock`, mas o contrato atual de Update Custom Reward não aceita esse campo. Não o envie nem exija, não persista snapshot de estoque e não afirme que o app marca reward como esgotada. Reconciliar somente os campos graváveis documentados de pausa/configuração.

## 6. Plano TDD

- Red/Green unitário: integração inicia EventSub de chat para canal inelegível sem iniciar assinatura/reconciliação de resgates; `ping` autorizado de streamer/mod continua disponível e retorna a resposta/version/latência em cache; viewer não recebe resposta de ping; não se adiciona probe por mensagem. Autorização continua exclusiva de streamer/mod; projeções de saúde/painel separam os estados.
- Integração PostgreSQL: migrations reais validam origem manual, relação histórica da reward, unicidade, auditoria, estado de transição, lock/serialização e ausência de intenção financeira para entradas manuais; mock Prisma não prova esses contratos.
- TDD de conversão: comprovar Red para estado após confirmação de pausa, recuperação de falha/resultado desconhecido, cancelamento por corrida de evento, preservação das tarefas financeiras existentes, retry idempotente e ausência de DELETE da reward. Usar PostgreSQL isolado real e fake de Twitch somente na fronteira externa.
- TDD de chat/add manual: provar add gratuito autorizado nos dois modos e ausência de autoinscrição por texto livre de viewer.
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
| Fila muda localmente quando a pausa Twitch é desconhecida ou chega resgate concorrente | Persistir transição; ativar somente após confirmar pausa; usar cancelamento durável idempotente e preservar/drenar operações financeiras existentes. |

## 8. Decisões de produto

- [x] **Q-1:** Adição manual no chat disponível para streamer e moderadores. Confirmado pelo proprietário do produto em 2026-10-06.
- [x] **Q-2:** Canais elegíveis usam resgate de Pontos do Canal por padrão; modo manual também fica disponível por escolha do operador. Canais inelegíveis usam entrada local/manual quando reward não estiver disponível. Confirmado pelo proprietário em 2026-10-06 e ampliado em 2026-10-07.
- [x] **Q-3:** Adições manuais continuam permitidas em fila fechada, conforme regra original do produto.
- [x] **Q-4:** Uma fila pode existir localmente no modo somente manual, sem recompensa Twitch, e receber comandos `add` autorizados de streamer/moderador. Confirmado pelo proprietário do produto em 2026-10-07.
- [x] **Q-5:** Suportar recompensas criadas pelo bot e permitir selecionar recompensa do Creator Dashboard somente quando o bot comprovar acesso ao ciclo completo da API necessário. Visibilidade no Dashboard ou entrega EventSub isolada não bastam. Confirmado pelo proprietário do produto em 2026-10-07.
- [x] **Q-6:** Determinar a capacidade pelas operações reais suportadas pela API, não por `broadcasterType`; distinguir falhas temporárias de resultados definitivos de indisponibilidade. Confirmado como consequência exigida da Q-5 em 2026-10-07.
- [x] **Q-7:** Streamer/moderador pode adicionar viewer gratuitamente em qualquer fila ativa após receber um pedido; viewer não precisa digitar comando nem resgatar reward, mas mensagens livres nunca fazem autoinscrição. Confirmado pelo proprietário em 2026-10-07.
- [x] **Q-8:** Uma fila com reward pode ser convertida para modo local/manual. Preservar/drenar resgates existentes; ativar modo local somente após confirmação da pausa remota; cancelar resgate que concorra com a transição; manter identidade histórica da reward. Confirmado pelo proprietário em 2026-10-07.
- [x] **Q-9:** O proprietário pediu para marcar reward gerenciada como esgotada ao pausar/arquivar, se a Twitch permitir. O contrato atual Update Custom Reward da Helix não aceita `is_in_stock`; um PATCH real retornou HTTP 200, mas a resposta e o GET seguinte mantiveram `is_in_stock=true`. Usar o estado `is_paused` confirmado, preservar estoque controlado pela Twitch e nunca afirmar que houve transição para sem estoque.

## 9. Crítica do pipeline

**Crítica 1:** NEEDS_REVISION. O pedido inicial informal não diferenciava pontos ganhos assistindo de uma Custom Reward dedicada da fila nem considerava que a integração atual retorna antes do EventSub. Esclarecimento resolveu a distinção, escolheu streamer/mod, confirmou entrada por resgate em canais elegíveis e definiu uma Custom Reward dedicada, criada pelo bot para cada fila elegível.

**Revisão:** Manter chat independente; adicionar modo persistido de fila local/somente manual; usar reward criada pelo bot por padrão; permitir reward do Dashboard somente após comprovar ciclo completo; preservar invariantes financeiros e separar falha temporária de capacidade indisponível.

**Crítica 2 (2026-10-07):** APPROVED FOR PLANNING. As divergências da documentação oficial estão registradas sem alegar suporte; a observação do operador sobre o Dashboard está identificada como evidência fornecida pelo operador. Decisões cobrem filas locais, suporte condicional a reward do Dashboard, adição gratuita pelo operador nos dois modos e conversão após pausa confirmada com preservação/drenagem dos resgates. O pedido de marcar sem estoque depende de suporte API; o contrato atual da atualização Helix e a prova real mostram que essa integração não controla `is_in_stock`. Escopos OAuth, aceite Twitch real, migration, prova de propriedade/API, concorrência na transição e recuperação de retries continuam como gates de evidência. A implementação foi autorizada em 2026-10-07 e está em andamento.

## 10. Resultado do planejamento

A proposta separa modo de fila de origem da entrada: filas são vinculadas a reward (`channel_points`) ou locais/manuais (`manual_only`); o modo vinculado usa reward criada pelo bot por padrão ou reward verificada do Dashboard, enquanto entradas manuais explícitas são permitidas nos dois modos. Fila local nova não tem ID de reward; fila convertida mantém o ID/origem anterior como histórico. O chat funciona independentemente da capacidade de reward. Falha temporária Twitch nunca muda silenciosamente a origem da fila. Conversão unidirecional só se efetiva após confirmação da pausa; conserva a reward e drena resgates existentes, incluindo cancelamento durável de qualquer resgate concorrente. Pausa/reabertura usa `is_paused`; `is_in_stock` permanece controlado pela Twitch e não é critério de sucesso. Streamer/moderador pode adicionar viewer gratuitamente de forma explícita nos dois modos. Mensagem livre não é interpretada como inscrição. Entradas manuais não geram trabalho financeiro na outbox. Rewards existentes são apenas candidatas e não são aceitas sem gate de propriedade/ciclo API.

Não se propõe serviço ou provedor novo. A implementação está em andamento na FND-9 após autorização explícita. Testes de adaptador/API com mocks não comprovam comportamento de reward ao vivo nem rótulo exibido ao viewer; isso deve permanecer pendente até teste autorizado. Este plano não autoriza promoção de estágio/versão.
