# Auditoria de capacidades Twitch e cobertura das stories

[English](../../stories/TWITCH-CAPABILITY-GAP-ANALYSIS.md)

**Consulta:** 2026-10-06 (UTC)<br>
**Workflow:** lentes do AIOX Planning / Spec Pipeline — Gather, Assess, Research, Write, Critique, Plan<br>
**Objetivo:** comparar capacidades oficiais da Twitch relacionadas ao produto com todas as stories locais e issues futuras publicadas. Este é um registro de planejamento/pesquisa, não autorização para implementar ou alterar status de story.

## Conclusão

O modelo de integração principal do produto é compatível com as interfaces documentadas pela Twitch: um cliente de chat local autorizado pela conta do streamer pode ler mensagens por EventSub WebSocket e responder pela Helix; canais elegíveis podem usar Custom Rewards criadas pelo app e gerenciar o estado de seus resgates. O produto trata corretamente os Pontos do Canal como pontos específicos do canal e controlados pela Twitch; não calcula saldos nem cria transferências.

A pesquisa encontrou uma lacuna concreta dentro da FND-6: a especificação original exige limites nativos por usuário por transmissão, por transmissão e cooldown global para cada recompensa de fila. O schema `Queue` atual e o adapter de recompensa ainda não representam essas configurações. Como a FND-6 já inclui edição das configurações de fila/recompensa, refine esse critério nela; use os limites nativos da Twitch sem criar contadores locais concorrentes.

A FND-9 trata de uma separação real de capacidades: a documentação permite EventSub de chat com `user:read:chat`, enquanto operações de recompensa exigem elegibilidade Afiliado/Parceiro e `channel:manage:redemptions`. O repositório atualmente associa inelegibilidade ao encerramento de toda a integração Twitch; portanto, a FND-9 deve separar conectividade de chat da capacidade de Pontos do Canal. A inferência de que a operação de chat manual funcionará de ponta a ponta em canal inelegível ainda precisa de validação autorizada real.

Para a issue #17, dados de assinante/moderador/VIP podem ser avaliados da lista confiável de badges da mensagem EventSub atual. A elegibilidade de follower é diferente: consultar um viewer pela Helix exige `moderator:read:followers`. Recomendação: não incluir acesso condicionado a follower na primeira versão do catálogo, a menos que o proprietário aprove explicitamente o escopo e suas implicações de privacidade. Essa é uma decisão de produto, não uma suposição de implementação.

## Registro do workflow

| Fase | Trabalho realizado | Resultado |
| --- | --- | --- |
| Gather | Inventário das stories locais FND-0 a FND-7 e OPS-1/OPS-2; revisão das issues GitHub #1–#7 e #17–#19; comparação com decisões registradas e ideias soltas. | Mapa atual do backlog abaixo; FND-8/#18, FND-9/#19 e catálogo de comandos/#17 já são itens de planejamento publicados. |
| Assess | Separação entre escopo implementado/coberto, lacunas de aceite atuais da FND-6, stories futuras e capacidades incompatíveis com restrições do produto. | Uma exigência concreta ausente na configuração da recompensa; duas decisões/gates futuros. |
| Research | Consulta em 2026-10-06 à documentação oficial Helix, OAuth, EventSub, chat e Pontos do Canal; inspeção do schema, adapter e pesquisa FND-9 atuais no repositório. | Achados e fontes abaixo e em `docs/integrations.md`. |
| Write | Registro do cruzamento das stories, decisões sobre lacunas e recomendações em inglês e pt-BR. | Este relatório e sua tradução recíproca. |
| Critique | Conferência de cada lacuna proposta contra o Prompt 1 original e as issues existentes; remoção de capacidades Twitch sem relação com filas. | A pesquisa, por si só, não justifica uma nova story independente. |
| Plan | Manter implementação ativa na FND-6; incluir limites nativos da recompensa em suas configurações. Manter #17–#19 e FND-7 na sequência definida. | Nenhuma issue foi editada e esta auditoria não autorizou trabalho de implementação. |

## Cruzamento de stories e issues

| Item | Cobertura/status atual | Achado Twitch e decisão sobre lacunas |
| --- | --- | --- |
| FND-0 — base do produto | Linha de base histórica do MVP/planejamento. | O limite central continua coerente: chatbot local de canal único com painel local do operador; sem serviço hospedado, modo multicanal ou segunda conta de bot. |
| FND-1 — runtime/versão/Compose | Em andamento somente pelo reteste nativo no Windows após a mudança para Alpine/correção do helper; documentação e base de runtime estão registradas. Issue #3 aberta. | A pesquisa Twitch não cria lacuna para a FND-1. Permanecem os critérios existentes de segredo local, callback HTTPS, inicialização e recuperação. |
| FND-2 — domínio das filas | Concluída na story local e issue #2. | IDs Twitch, estado da fila, validação de UID, autorização e ordenação PostgreSQL estão corretamente separados dos payloads do provedor. Nenhuma lacuna nova. |
| FND-3 — outbox financeira | Concluída na story local e issue #5; operação financeira real da Twitch segue sem validação. | O histórico terminal da Helix permanece disponível por apenas alguns dias; o tratamento existente de estado desconhecido e resolução para dados antigos irrecuperáveis é necessário. Não prometer execução exatamente uma vez pela rede. |
| FND-4 — OAuth, recompensas, EventSub | Implementação concluída e issue #4 fechada; nenhuma operação em canal real autorizado alegada. | Escopos e interfaces documentadas correspondem à arquitetura escolhida de token do streamer/WebSocket/Helix. Validação do token na inicialização e de hora em hora continua obrigatória e documentada. |
| FND-5 — ciclo de chat/filas | Concluída localmente e issue #1 fechada; efeitos de pontos reais seguem sem validação. | Send Chat Message retorna `is_sent` e `drop_reason`; o requisito atual de verificar o resultado está correto. O limite Twitch de 500 caracteres por mensagem segue relevante. |
| FND-6 — painel e API local | Em andamento; issue #6 aberta. Edição das configurações da fila e gates finais de operação/recuperação/segurança seguem pendentes. | Acrescentar à configuração atual os limites nativos que faltam: máximo de resgates por transmissão, máximo por usuário por transmissão e cooldown global. Usar a Twitch como autoridade, sem contadores locais. A alteração pertence à recompensa criada pelo app, identificada pelo ID. |
| FND-7 / issue #7 — overlay OBS | Planejada, bloqueada por FND-5/FND-6 e UX; implementação não alegada. | Nenhuma integração Twitch adicional é necessária para projeções locais de filas. Preservar o desenho local existente de capability token e privacidade. |
| OPS-1 — CI | Em revisão local; story existe, mas não há issue correspondente na lista atual do GitHub. | Nenhuma lacuna Twitch específica. Manter build/testes/scanners como gates de release. |
| OPS-2 — status localizado | Em andamento localmente; story existe, mas não há issue correspondente na lista atual do GitHub. | Ajuste pontual de texto pt-BR não conclui i18n. Acompanhar aceite restante em OPS-2/FND-8; não expor enums da Twitch. |
| FND-8 / issue #18 — i18n | Publicada, planejamento necessário após FND-7; implementação não autorizada. | Estados internos/do provedor devem ser mapeados a códigos públicos estáveis e depois a mensagens localizadas. Nenhum escopo Twitch novo é necessário. |
| FND-9 / issue #19 — canais inelegíveis | Rascunho de planejamento publicado; implementação não autorizada. | Separar funcionamento do chat da elegibilidade de Pontos do Canal. Canais elegíveis mantêm resgate por recompensa criada pelo app; canais inelegíveis usam `add` manual por streamer/mod sem operação financeira. Exige validação posterior em canal real. |
| Issue #17 — catálogo de comandos e cargos | Item de planejamento publicado; ainda sem diretório de story formal no repositório local. | A mensagem atual fornece badges confiáveis para verificações contextuais de moderador/assinante/VIP. Acesso por follower exige escopo extra; recomenda-se adiar esse cargo. Comandos exclusivos do streamer permanecem inalteráveis, conforme decisão do produto. |

Inventário do GitHub consultado no remoto privado configurado em 2026-10-06. Issues #1, #2, #4 e #5 estão fechadas; #3 e #6 abertas; #7 e #17–#19 são itens de planejamento abertos. OPS-1 e OPS-2 foram publicadas como novas issues #20 e #21 durante este trabalho. O índice local também mantém FND-0 e FND-1–FND-7. Nenhum comentário foi publicado.

## Achados concretos para levar às stories existentes

### FND-6: configurar limites nativos da recompensa Twitch

A Helix Custom Reward permite criar/atualizar `max_per_stream_setting`, `max_per_user_per_stream_setting` e `global_cooldown_setting`, cada um com indicador de habilitação e valor. O Prompt 1 já exige habilitação/valor dos três. O modelo Prisma `Queue` e o adapter atual não os contêm.

Inclua-os nas configurações da fila da FND-6 com semântica explícita de habilitado/desabilitado e validação de entrada. A listagem de recompensas da API inclui recompensas de outros apps para verificação de capacidade; este app só pode alterar recompensas que criou. A Twitch documenta máximo de 50 recompensas no canal, incluindo desativadas, títulos únicos de até 45 caracteres e descrições de até 200. A edição deve enviar somente campos alterados e permanecer uma operação remota durável/recuperável. Continue sem duplicar localmente os limites nativos por live/usuário.

### FND-9: separar chat e Pontos do Canal em capacidades distintas

A Twitch documenta `channel.chat.message` com `user:read:chat` (e token de usuário do streamer para este cliente local). EventSub de resgate e operações de recompensa exigem escopos de resgate; o gerenciamento de Custom Reward restringe canais inelegíveis. Isso sustenta a separação proposta, mas o comportamento OAuth/runtime da aplicação com token sem `channel:manage:redemptions` e um canal inelegível ainda não foi validado.

A aplicação deve apresentar os estados de chat e Pontos do Canal separadamente. Canal inelegível não deve receber indicação de que toda conexão Twitch caiu quando o chat segue conectado. Entradas manuais continuam com origem `manual`, sem ID de resgate e sem ação financeira na outbox. Manter a regra aceita: apenas streamer/moderador adicionam outra pessoa; viewer nunca se inscreve por conta própria.

### Issue #17: decidir acesso de followers antes de pedir escopo

O payload atual de `channel.chat.message` contém badges como moderador e assinante, permitindo verificações da mensagem presente. `GET /helix/channels/followers?user_id=...` exige `moderator:read:followers` e identidade de streamer/moderador. A assinatura `channel.follow` comunica novos follows, mas não fornece uma lista completa e atual de seguidores.

Recomendação inicial de planejamento: oferecer cargos streamer, moderador, VIP, assinante e todos somente quando o evento atual fornecer badges confiáveis; não oferecer follower como nível de acesso na primeira versão. Se o proprietário quiser essa condição, aprovar explicitamente o novo escopo, o texto do assistente e o comportamento em falhas/dados antigos durante o planejamento de #17.

## Ideias já discutidas e onde estão registradas

| Ideia | Rastreamento | Avaliação |
| --- | --- | --- |
| Streamer opera tudo no painel local; separar conexão, filas, nova fila, operações financeiras e configurações. | FND-6 / issue #6 e pesquisa UX. | Registrada; configuração de fila e gates finais de controles/QA seguem abertos. |
| Reward genérica existente como “beber água” não deve iniciar a fila; usar recompensa dedicada criada por este app. | FND-9 / issue #19. | Registrada e respaldada pelos limites de propriedade de app da Helix. |
| Streamer/mod adiciona pessoas manualmente se o canal for inelegível; canais elegíveis seguem com resgates de pontos. | FND-9 / issue #19. | Confirmada e registrada; faltam separação runtime de chat/Pontos e validação em canal real. |
| Prioridade para benefício externo como inscrição/Bits/PIX. | Trabalho de faixas prioritárias da FND-6 e story. | Registrada como prioridade FIFO conferida pelo operador; não há verificação automática de pagamento/Bits nem armazenamento de comprovante. |
| Catálogo completo de comandos com acesso por cargo, `!<fila> comandos` contextual e comandos exclusivos do streamer imutáveis. | Issue #17. | Registrada em issue publicada; escopo de follower é dependência Twitch material ainda não resolvida. |
| pt-BR padrão, inglês/espanhol, traduções comunitárias e sem vazamento de estado backend. | Issue #18/FND-8; OPS-2 acompanha texto atual. | Registrada. i18n completo segue como escopo futuro. |
| Widgets locais OBS com campos de fila filtrados por privacidade. | FND-7 / issue #7. | Registrada e bloqueada por gates; pesquisa não encontrou necessidade extra Twitch. |
| `/health` com status e latência Twitch visível ao operador. | FND-6. | Implementado no worktree atual com consulta Helix autenticada em cache; reteste independente completo da FND-6 continua pendente. |

Não encontramos outra ideia de produto sem registro nos arquivos de stories atuais ou nas issues publicadas para as áreas Twitch analisadas. Essa afirmação se limita a esses artefatos do repositório e ao contexto de conversa disponível.

## Capacidades intencionalmente excluídas

- Não ler ou simular saldo de Pontos do Canal do viewer, transferir pontos ou emitir pontos. O produto reage ao ID do resgate; a Twitch continua sendo a autoridade sobre pontos.
- Não adotar Custom Rewards não relacionadas pelo título. Propriedade e histórico de resgate dependem do aplicativo criador.
- Não adicionar IRC, segunda conta de bot, escopos amplos de moderação, escopo de follower, Discord, processamento de pagamento ou backend hospedado por causa desta pesquisa.
- Enquetes, previsões, raids, anúncios, placar de Bits e outras áreas Helix não resolvem requisitos de fila atuais e não justificam novas stories nesta análise.

## Fontes oficiais consultadas

- [Referência Twitch Helix](https://dev.twitch.tv/docs/api/reference/) — Custom Rewards/resgates, seguidores do canal e envio de mensagens; consulta em 2026-10-06.
- [Tipos de assinatura Twitch EventSub](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/) — chat, resgate, follow, escopos e payloads; consulta em 2026-10-06.
- [Autenticação de chat Twitch](https://dev.twitch.tv/docs/chat/authenticating/) e [envio/recebimento de mensagens](https://dev.twitch.tv/docs/chat/send-receive-messages/) — escopos de cliente instalado, adequação do WebSocket e resultado de envio; consulta em 2026-10-06.
- [Conceitos e limites da API Twitch](https://dev.twitch.tv/docs/api/guide) — token bucket e uso de `Ratelimit-Reset` em HTTP 429; consulta em 2026-10-06.
- [Ciclo de vida EventSub WebSocket](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/) — keepalive e reconexão/reinscrição; consulta em 2026-10-06.
- [Validação de token Twitch](https://dev.twitch.tv/docs/authentication/validate-tokens/) — validação na inicialização e de hora em hora para sessões OAuth mantidas; consulta em 2026-10-06.
- [Guia de Pontos do Canal para criadores](https://help.twitch.tv/s/article/channel-points-guide), [FAQ](https://help.twitch.tv/s/article/channel-points-faq) e [guia de viewer](https://help.twitch.tv/s/article/viewer-channel-point-guide) — conceitos do produto; consulta em 2026-10-06. O conteúdo da Central de Ajuda é renderizado dinamicamente; as restrições detalhadas de API acima vêm da referência Helix.

## Decisões de planejamento e gates restantes

1. Incorporar os limites nativos da recompensa ao aceite e implementação existentes de configurações de fila/reward na FND-6; manter a Twitch como autoridade dos limites.
2. Não definir cargo follower para #17 sem autorização explícita do proprietário para `moderator:read:followers` durante seu Spec Pipeline.
3. Deixar a ordem de implementação da FND-9 em relação à FND-8 com o proprietário, conforme já registrado na issue #19.
4. Revisitar este cruzamento quando a FND-6 for encerrada ou quando a Twitch alterar sua API. Esta auditoria não criou issue, release, comentário, chamada real Twitch ou conclusão de story.
