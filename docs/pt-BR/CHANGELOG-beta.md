# Histórico beta

[Todos os changelogs públicos](CHANGELOG.md) · [English](../../CHANGELOG-beta.md)

## v0.2.0-beta

### Adicionado

- A criação de fila agora oferece uma prévia localizada e validada da mensagem de chamada no chat. Widgets OBS deixam claro qual fila e reward vinculada usam e indicam como criar uma fila quando não há opções. A edição de widgets e as operações da Twitch orientam melhor a recuperação quando uma atualização não pode ser confirmada.
- A página Next.js de comandos do chat agora permite ao streamer alterar a audiência mínima dos comandos configuráveis. Políticas novas ou sem override usam seguidores; políticas salvas explicitamente são preservadas, e comandos fixos de moderadores/streamer continuam somente leitura.
- Streamers podem cancelar a exclusão pendente de uma fila vinculada a reward depois que o app verifica que a reward exata, gerenciada pela Twitch, ainda existe e está pausada. A fila e o histórico financeiro permanecem recuperáveis, e uma exclusão posterior retoma com segurança a mesma intenção.
- A página de operações agora distingue a sincronização com a Twitch da devolução de Pontos do Canal aos espectadores e da confirmação de resgates.

### Alterado

- A inicialização de desenvolvimento agora verifica Node.js, dependências e Docker antes de provisionar o banco isolado; o usuário final continua pelo instalador da plataforma com imagem pré-compilada.
- Chamadas de fila agora tornam o viewer chamado a conta atual automaticamente. O OBS oferece uma única fonte de identidade do jogador, `Conta atual`; widgets antigos de atendimento continuam usando essa mesma fonte.
- Iniciar o atendimento de um viewer chamado agora solicita imediatamente o fulfillment do resgate de pontos na Twitch. O painel mantém o atendimento ativo e distingue estados pendentes, confirmados e conflitantes da recompensa do encerramento do serviço.
- Filas novas agora começam com uma mensagem de chamada localizada que inclui o comando de presença correto; ele acompanha o slug sugerido até o streamer editar a mensagem.
- Callbacks OAuth da Twitch agora retornam à página local estilizada de conexão, que mostra feedback localizado de sucesso ou falha sem expor detalhes do provider nem deixar o painel.
- A criação de fila preserva as configurações da recompensa ao alternar modos de entrada, acompanha o idioma selecionado para a mensagem de chamada padrão e mostra uma prévia de como ela aparecerá no chat. Modelos inválidos recebem orientações claras e localizadas antes do envio.
- Entradas diretas nas operações Twitch e nos widgets OBS agora aguardam a sessão local e o snapshot do painel antes de consultar dados protegidos. Filas novas começam com entrada manual local quando a Twitch está desconectada e oferecem um link direto para a configuração da conexão.
- A visão geral do Next.js agora mostra a saúde da API do bot e das dependências, a conta atual, a contagem exata de operações não resolvidas e a última conciliação desta execução da API; oferece atualização manual e automática enquanto a página está visível e preserva os últimos dados de saúde quando a atualização falha.
- A visão geral do Next.js diferencia a saúde dos serviços por cores: verde para funcional, amarelo para parcial/em andamento/desconhecido e vermelho para indisponível ou não configurado, com legenda localizada explícita. Em telas estreitas, a conciliação fica abaixo do título de saúde; a navegação móvel ganha uma barra roxa fina que indica rolagem horizontal.
- O painel local Next.js agora identifica o canal Twitch conectado e informa claramente quando o segredo do aplicativo ainda não foi salvo. A troca de idioma valida a resposta da API e reconcilia com o estado persistido após uma resposta incerta.

### Corrigido

- A confirmação final de exclusão local agora identifica a fila no aviso, permitindo que o streamer confira qual fila está removendo.
- As páginas dos widgets OBS são servidas pelo Next.js em produção e desenvolvimento; o overlay continua consultando dados atuais de conta e fila no bot.
- Links de widgets OBS agora abrem a página local do overlay durante o desenvolvimento, e links locais criados anteriormente continuam funcionando.
- Falhas inesperadas nas ações de inclusão manual, atendimento, reenvio de aviso, chamada, reordenação, prioridade e limpeza de fila agora exibem uma referência diagnóstica segura. Se uma chamada puder ter sido aplicada sem uma resposta confiável, os dois controles de chamada ficam bloqueados até uma atualização bem-sucedida da fila; o alerta mantém a referência e oferece nova tentativa da atualização. Uma fila vazia confirmada mantém o resultado “ninguém aguardando”. Confirmações incertas de limpeza continuam exigindo atualização bem-sucedida antes de outra limpeza.
- A confirmação de exclusão local fica bloqueada enquanto o cancelamento estiver verificando a reward, preservando uma forma segura de retomar a operação.

## v0.1.2-beta

### Corrigido

- Ao excluir uma fila vinculada a reward após concluir um atendimento, a conclusão pendente na Twitch agora é preservada e a exclusão da reward aguarda a confirmação.

## v0.1.1-beta

### Corrigido

- Fontes de navegador do OBS mantêm a capacidade ativa do widget após recarregar, permitindo que o overlay de conta atual reconecte sem tela preta; a revogação continua desabilitando o widget.

## v0.1.0-beta

### Adicionado

- Primeira build do stage beta para avaliação conduzida pelo proprietário do bot de filas Twitch e do painel do streamer.
- Inclui fluxos de filas manuais, recuperação segura de filas convertidas e os caminhos de instalação para Windows, macOS e Linux.

### Alterado

- Todos os instaladores mostram a versão exata do produto derivada do commit; pulls negados no GHCR explicam que o pacote precisa ser público e preservam configurações/dados locais.
- Instalar/iniciar no Windows corrige uma tag Compose antiga após um pull bem-sucedido e inicia os serviços com a imagem exata da versão do instalador.
- A identidade runtime é materializada a partir do commit exato como `v0.1.0-HHHHHHH-beta`. As prereleases do GitHub só são publicadas quando o proprietário aciona manualmente o workflow de release.
- A operação das filas agora atualiza a conta atual e o overlay após chamadas individuais, salva corretamente permissões de comandos alteradas e permite que viewers chamados confirmem presença sem iniciar o atendimento.

### Corrigido

- Removido Ocultar/Arquivar dos controles normais; filas antigas podem voltar a aparecer para viewers e continuam pausadas até serem ativadas separadamente.
- Quando a sincronização com a Twitch estiver incerta, o streamer pode excluir a fila deste painel após duas confirmações. Isso não exclui a reward na Twitch; a incerteza remota e o histórico financeiro são preservados. A reconciliação também recupera rewards removidas e resgates tardios sem tratar falhas de consulta como prova de exclusão.
