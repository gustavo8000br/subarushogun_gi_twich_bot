# Entrada de filas e faixas prioritárias — proposta de arquitetura

[English](../../../stories/FND-6/queue-ingress-architecture.md)

**Status:** Decisões do produto aprovadas; implementação em andamento como parte da FND-6.

## Restrições

- Um resgate de pontos Twitch que insere alguém na fila precisa ter sido criado e ser gerenciado por esta aplicação. A Twitch documenta que somente o app criador pode ler, atualizar ou excluir resgates daquela recompensa, e somente o app criador pode alterar/excluir a recompensa. EventSub pode entregar notificações, mas isso não concede propriedade Helix nem autoridade de reembolso.
- Este produto promete rastrear cancelamentos/conclusões de pontos de forma durável. Importar uma recompensa sem gerenciamento permitiria exibir uma entrada sem poder garantir o resultado obrigatório dos pontos.
- Viewers não entram por comando de chat nem pelo painel. Comandos de fila de outro bot não podem ser tratados como fonte de verdade deste produto.
- A instalação atual é somente local. Ela não recebe webhooks públicos de provedores de pagamento, não coleta PIX, não valida eventos de Bits/inscrição e não armazena credenciais ou comprovantes de pagamento.

## Configuração segura de um canal existente

1. Durante a configuração, explicar que uma recompensa existente criada pela Twitch ou por outro app não pode ser adotada como recompensa gerenciada por esta fila.
2. Pedir que o streamer pause/encerre a recompensa antiga pelo app criador ou pelo Twitch Creator Dashboard e desative o comando de entrada do bot antigo antes de abrir a fila substituta.
3. Orientar o streamer a resolver resgates pendentes no sistema antigo. Não importá-los nem afirmar que este app pode reembolsá-los. O operador pode adicionar alguém manualmente somente depois de resolver o resgate antigo fora deste produto; a entrada manual não cria operação de pontos.
4. Criar uma nova recompensa pertencente ao app, inicialmente pausada. Abrir somente depois de o streamer revisar título, custo, política de UID e comportamento.
5. Mostrar no painel a identidade da recompensa gerenciada e o estado de sincronização remota, para o streamer saber qual recompensa realmente alimenta a fila.

Essa troca evita entradas duplicadas e impede viewers de gastar pontos em uma recompensa antiga que o bot não consegue atender. Um observador legado somente de leitura pode ser avaliado separadamente no futuro, mas nunca poderá sugerir cancelamento, reembolso, conclusão ou exclusão segura de recompensa não gerenciada.

## Fontes externas de prioridade

### Benefício externo conferido pelo operador

Streamer/mod confere o benefício na plataforma de origem e adiciona o viewer pelo painel ou comando autorizado no chat. Pelo painel, o operador pode marcar a entrada como prioritária e escolher uma categoria limitada: inscrição, Bits, pagamento externo (incluindo PIX) ou outro benefício conferido pelo operador. A aplicação registra no histórico de auditoria o operador local e a categoria; não afirma que o provedor verificou o benefício.

Adições manuais pelo chat continuam na faixa normal. Não são armazenados comprovantes, chaves PIX, IDs de transação, conteúdo de chat, credenciais de pagamento, credenciais de assinante ou registros financeiros externos. Entradas manuais não têm ID de resgate Twitch e nunca criam operação Twitch de reembolso/consumo de pontos. As regras de uma entrada ativa por usuário/fila e de ciclo de vida da fila permanecem aplicáveis.

### Ordenação prioritária (aprovada)

- Manter duas faixas FIFO por fila: `priority` e `standard`; a prioridade é atendida primeiro. FIFO vale dentro de cada faixa. A movimentação manual de quem aguarda fica restrita à faixa atual; promover/rebaixar coloca a entrada no fim da nova faixa. Atendimento chamado/em andamento nunca é interrompido.
- Operador autenticado no painel pode atribuir/remover prioridade de uma entrada aguardando. O formulário de adição manual do painel também pode criar uma entrada prioritária conferida pelo operador. Categorias limitadas: `subscription`, `bits`, `external_payment` e `operator_override`.
- Entradas continuam manuais e não têm `redemption_id`; ações terminais não criam operação de pontos Twitch. O painel identifica a origem como confirmada pelo operador, não pela Twitch/provedor de pagamento.
- Continua valendo uma entrada ativa por Twitch user e fila. Benefícios repetidos não criam entradas ativas duplicadas, salvo política aprovada separadamente.
- Viewers não escolhem prioridade por comando, menção, nome de exibição, texto de badge, semelhança do título da recompensa ou corpo de requisição.

O operador, não um webhook ou viewer, declara que conferiu o benefício. Como esta aplicação atualmente tem sessão local do painel e cargos autorizados para gestão no chat, somente o painel oferece controles de prioridade; o comando `add` no chat continua na faixa normal para não sugerir uma etapa de conferência que ele não executa.

## Limite das integrações automáticas

- Eventos de inscrição Twitch, Bits e provedores de pagamento são integrações distintas, com permissões e falhas diferentes. Exigem análise separada de escopos e segurança antes de acrescentar permissões ou credenciais.
- Automatizar PIX exige contrato com provedor suportado e callback autenticado acessível ou fluxo de API do provedor; expor este Compose local à internet pública conflita com a arquitetura padrão local-only.
- Até uma story futura definir esses contratos, verificação manual é a única forma suportada de criar entradas que não sejam de resgate. Não solicitar silenciosamente `bits:read`, escopos de inscrição, credenciais de pagamento ou exposição pública de rede.

## Fontes consultadas

- Twitch [referência da API Helix — Get/Update/Delete Custom Reward e Get/Update Redemption](https://dev.twitch.tv/docs/api/reference/), consultada em 2026-10-06. A referência diz que somente o app criador pode gerenciar a recompensa e seus resgates.
- Twitch [tipos de assinatura EventSub — resgates de recompensas Channel Points](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), consultada em 2026-10-06. Eventos add/update podem ser filtrados por broadcaster e ID opcional da recompensa; sua entrega não muda a restrição de propriedade Helix.

Esta decisão não significa integração automática ou verificação bem-sucedida de recompensas antigas, Bits, inscrições ou PIX. O escopo é somente a ordenação local e a auditoria da declaração do operador.
