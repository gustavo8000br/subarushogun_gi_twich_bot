# Manual do usuário

[Read in English](USER_GUIDE-en_US.md) · [Guia de instalação](pt-BR/INSTALACAO.md)

Este manual descreve o produto como ele existe na versão atual do projeto. O idioma do produto pode ser alterado em **Configurações**; há catálogos em português brasileiro, inglês e espanhol, além de locales comunitários completos descobertos em tempo de execução. O locale selecionado controla os textos próprios do painel, chat, OBS e ferramentas de ciclo de vida.

## O que é o bot

Este é um bot de chat da Twitch, com painel local, para organizar sessões de Genshin Impact. O streamer pode criar várias filas com nomes próprios, ligar cada fila a uma recompensa própria de Pontos do Canal, adicionar pessoas manualmente, chamar viewers, acompanhar os atendimentos e verificar o estado das operações de pontos.

O aplicativo foi feito para rodar no computador do streamer. A ordem das filas e o andamento ficam salvos nesse computador e podem ser recuperados depois de reiniciar. O bot não entra no jogo, não conversa em privado com viewers, não verifica contas de jogo, não recebe pagamentos e não pede senhas do jogo.

## Quem usa

| Pessoa | O que pode fazer |
| --- | --- |
| Streamer | Preparar o canal, criar e gerenciar filas, escolher quem pode usar comandos, operar o painel e usar todos os comandos. |
| Moderador | Usar comandos de gestão de filas e do rótulo de conta. O streamer pode liberar alguns comandos seguros para outros cargos. |
| Viewer | Resgatar a recompensa de uma fila, consultar a própria posição, sair da própria vaga e ver os comandos permitidos para seu cargo. Viewer não entra digitando um comando. |

O streamer é identificado pela conta Twitch conectada a esta instalação. O acesso de moderador vem do selo atual no chat da Twitch, não de um nome digitado. Comandos vindos de outro canal são ignorados.

## Antes do primeiro uso

Siga o [guia de instalação](pt-BR/INSTALACAO.md) para ver os requisitos do computador, o acesso atual ao pacote GHCR, a inicialização por sistema operacional e a confiança do certificado. O repositório-fonte é público, mas o pacote de imagem tem permissões separadas e atualmente exige uma conta autorizada e `read:packages`. Node.js e PostgreSQL não precisam ser instalados no host. Quando o painel abrir em `https://localhost:3000`, continue em **Como conectar a Twitch** abaixo.

## Como conectar a Twitch

No console de desenvolvedor da Twitch, crie um aplicativo confidencial e cadastre o endereço de retorno exato exibido pelo painel. Por padrão, é `https://localhost:3000/callback`; se a instalação usar outra porta, cadastre exatamente o endereço mostrado.

Informe o Client ID e o Client Secret do aplicativo no painel e escolha **Validar e salvar aplicativo**. O painel verifica o par antes de salvar. Depois, escolha **Conectar com a Twitch** e autorize:

- Gerenciar as recompensas próprias do canal e seus resgates.
- Ler mensagens do chat.
- Enviar mensagens usando a conta de streamer conectada.

Depois de salvo, o Secret fica oculto e não pode ser consultado novamente no painel. Para usar recompensas de fila, o canal precisa ser Afiliado ou Parceiro da Twitch e ter Pontos do Canal disponíveis. Se não for elegível, as filas por recompensa ficam indisponíveis; o painel explica o motivo em português. O modo somente manual para canais inelegíveis é uma funcionalidade planejada separadamente e ainda não está disponível.

Cada instalação fica vinculada a um canal Twitch e a um aplicativo Twitch. É permitido reconectar o mesmo canal. A troca de canal ou aplicativo quando há registros é bloqueada para que recompensas antigas não sejam atribuídas silenciosamente a outra conta.

## Como criar e preparar uma fila

Use **Nova fila** no painel. Cada fila tem um nome exclusivo para comandos, um título de exibição e uma recompensa própria criada para este bot. Ela não incorpora uma recompensa criada por outro aplicativo, mesmo que já exista no canal.

É possível configurar o nome e apelidos da fila, título e descrição da recompensa, custo em pontos, modo de UID, limites por live e por pessoa e intervalo que a própria Twitch aplica, texto de chamada, prazo de atendimento, troca de conta e políticas de pontos. O nome da fila aceita de 2 a 24 letras inglesas minúsculas, números e hífen. A fila começa fechada enquanto a recompensa é preparada. Abra-a somente depois que o painel mostrar que a recompensa está pronta.

- **Abrir:** pede à Twitch que aceite novos resgates. O painel mostra como pendente até a confirmação da Twitch.
- **Fechar:** pausa novos resgates da recompensa. As pessoas que já estão na fila ainda podem ser chamadas e atendidas; inclusão manual continua permitida.
- **Arquivar:** tira a fila de `!filas` e pausa a recompensa. As entradas existentes ficam disponíveis ao streamer no painel e ainda podem ser atendidas. Ao desarquivar, a fila continua fechada.
- **Apagar:** exige confirmação. O aplicativo pausa a recompensa, pede o cancelamento de todos os resgates pendentes, espera as confirmações e só então remove a recompensa da Twitch. Se uma operação falhar ou ficar incerta, a exclusão continua pendente para recuperação. O histórico da fila é preservado.

Atualmente, a Twitch permite até 50 recompensas próprias por canal; o painel avisa quando o total se aproxima desse limite. Recompensas arquivadas continuam contando até serem removidas da Twitch.

## Como uma pessoa entra na fila

Há duas formas:

1. **Resgate de recompensa:** a pessoa resgata a recompensa de Pontos do Canal exclusiva daquela fila. Os pontos mostrados são gastos enquanto o pedido está pendente.
2. **Inclusão manual:** o streamer ou um moderador adiciona um login Twitch pelo painel ou com `!<fila> add <usuario> [UID]`. Viewer não pode se adicionar pelo chat nem pelo painel.

Cada pessoa pode ter apenas uma entrada ativa na mesma fila, mas pode participar de outras filas. Uma nova entrada normal vai para o fim da espera normal. Uma vaga prioritária conferida manualmente vai para a faixa prioritária, atendida antes da normal; dentro de cada faixa, a ordem é primeiro a entrar, primeiro a ser chamado. A prioridade registra o operador e a categoria, como PIX/pagamento externo, Bits ou inscrição. O bot não verifica nem processa esse benefício. Entradas manuais nunca criam pedido de reembolso ou consumo de Pontos do Canal.

## O que acontece depois da entrada: ordem, UID e privacidade

O painel e o chat apresentam separadamente quem está aguardando, quem foi chamado e quem está em atendimento. A posição de espera é numerada continuamente. `!<fila> posicao` informa somente a posição ou estado de quem enviou o comando; `!<fila> sair` atua apenas sobre a própria entrada.

O UID é opcional ou obrigatório conforme a configuração:

- **Oculto:** a recompensa não pede UID, um UID enviado na inclusão manual é descartado e o bot não deve exibi-lo nem mantê-lo nessa fila.
- **Visível:** a recompensa pede UID. O formato aceito é exatamente nove dígitos ASCII, depois de remover espaços do início e do fim. Uma inclusão manual pode não informar UID.

Essa verificação de formato não comprova que a conta de jogo existe nem identifica o servidor. UID é um identificador público do jogo, não uma senha. Nunca envie senha do jogo, dados de login, e-mail, URL ou outro texto privado ao bot. Combine detalhes sensíveis por um canal privado, fora deste aplicativo. O streamer controla se um UID visível aparece na lista do chat, na chamada ou em um widget do OBS. Ao mudar a fila para UID oculto, os UIDs salvos e textos de chamada pendentes que possam conter UID são removidos.

## Como chamar e atender viewers

Use `!<fila> proximo [1-10]` para chamar uma pessoa ou um grupo. Se houver menos pessoas aguardando, o bot chama as disponíveis e informa a quantidade real. A mensagem de chamada usa os campos permitidos: `{user}`, `{queue}`, `{position}`, `{uid}` e `{account}`.

O prazo de ausência começa somente depois que a Twitch confirma o envio da primeira mensagem de chamada. Se a entrega falhar, o painel mostra que a chamada precisa de atenção; não há decisão de ausência até uma chamada ser confirmada. Uma nova tentativa não aumenta silenciosamente um prazo já existente.

Use `!<fila> atender [usuario]` para iniciar o atendimento. Isso encerra o prazo de ausência. Use `!<fila> concluir [usuario]` quando o atendimento terminar. Se a chamada vencer antes do início, a entrada passa para **Ausente**; a devolução de pontos depende da opção configurada na fila.

## Como funcionam os Pontos do Canal

“Solicitado” ou “pendente” significa que o bot pediu à Twitch uma mudança no resgate e aguarda confirmação. Não significa que os pontos já foram devolvidos ou consumidos. A página **Operações financeiras** mostra operações pendentes, confirmadas, incertas ou em conflito.

| Situação | Resultado solicitado para o resgate |
| --- | --- |
| Remover uma entrada aguardando que veio de recompensa, ou a própria pessoa sai enquanto aguarda | Cancelar o resgate; os pontos voltam após confirmação da Twitch. |
| Concluir uma entrada de recompensa depois do atendimento | Marcar o resgate como concluído; os pontos são consumidos após confirmação da Twitch. |
| Operador remove alguém já chamado ou em atendimento | Controlado por **Solicitar reembolso ao remover pessoa chamada/em atendimento**; padrão ligado. |
| A própria pessoa sai depois de chamada ou durante o atendimento | Controlado por **Solicitar reembolso se a pessoa chamada sair**; padrão desligado. |
| A pessoa chamada não inicia o atendimento a tempo | Controlado por **Solicitar reembolso quando houver ausência**; padrão desligado. |
| Limpar ou apagar uma fila | Pede o cancelamento de todas as entradas ativas com recompensa, independentemente das três opções acima. |
| Entrada adicionada manualmente | Não envolve Pontos do Canal da Twitch. |

Iniciar o atendimento não consome pontos; concluir é que faz isso. Um cancelamento ou uma conclusão confirmados externamente são registrados sem enviar um segundo pedido. Se o estado final na Twitch não puder ser confirmado ou contrariar o resultado solicitado, o painel mantém o problema visível para análise. A recompensa só é removida depois que os cancelamentos pendentes são confirmados, porque removê-la antes pode afetar esses resgates.

## Comandos disponíveis

Os comandos do produto estão atualmente em português. Substitua `<fila>` pelo nome ou apelido configurado para a fila, em letras minúsculas.

### Viewers

| Comando | Quem pode usar | O que faz |
| --- | --- | --- |
| `!<fila>` ou `!<fila> lista` | Cargos permitidos para o comando | Mostra até cinco pessoas aguardando, quantas faltam e as pessoas chamadas/em atendimento. |
| `!<fila> comandos` | Todos | Mostra os comandos permitidos para o cargo de quem enviou, naquela fila. |
| `!<fila> posicao` | Cargos permitidos para o comando | Mostra a própria posição ou estado. |
| `!<fila> sair` | Cargos permitidos para o comando | Sai da própria entrada ativa. |
| `!filas` | Cargos permitidos para o comando | Lista filas visíveis, inclusive fechadas; não inclui arquivadas/apagadas. |
| `!conta` | Cargos permitidos para o comando | Mostra o rótulo da conta atual. |
| `!queue comandos` | Todos | Lista comandos gerais e por fila permitidos para o cargo de quem enviou. |

### Streamer e moderadores

Estas ações de gestão são exclusivas do streamer e dos moderadores; não podem ser liberadas para outros cargos:

| Comando | O que faz |
| --- | --- |
| `!<fila> add <usuario> [UID]` | Adiciona uma pessoa pelo login Twitch. Uma entrada pelo chat fica na fila normal. |
| `!<fila> remover <usuario>` | Remove uma entrada ativa. |
| `!<fila> proximo [1-10]` | Chama até dez pessoas aguardando; o padrão é uma. |
| `!<fila> atender [usuario]` | Inicia o atendimento de uma pessoa chamada. |
| `!<fila> concluir [usuario]` | Conclui uma entrada chamada ou em atendimento. |
| `!<fila> mover <usuario> <posição>` | Muda a posição de quem aguarda dentro da faixa prioritária atual. |
| `!<fila> abrir` / `!<fila> fechar` | Abre ou pausa novos resgates da recompensa. |
| `!<fila> limpar` | Mostra quantas pessoas ativas e quantos cancelamentos de resgate seriam afetados. |
| `!<fila> limpar confirmar` | Confirma a prévia para o mesmo operador e fila, em até 15 segundos e se as entradas não mudaram. |
| `!conta <nome>` | Define o rótulo da conta atual. |
| `!conta reset` | Restaura o rótulo padrão. |
| `!queue ping` | Responde `Pong 🏓`, versão em execução e tempo de resposta da Twitch medido mais recentemente. Exclusivo de streamer/moderador. |

O streamer sempre tem acesso. Para os comandos compatíveis, o streamer escolhe uma lista explícita de cargos permitidos em **Comandos do chat**. Os cargos selecionados funcionam de forma independente, sem herança automática. Acesso VIP também depende da opção separada de gestão por VIP. Comandos de viewer têm espera de cinco segundos por pessoa; comandos de gestão não. As respostas respeitam o limite de 500 caracteres da Twitch. O parser aceita maiúsculas/minúsculas, espaços repetidos e as grafias `posicao`/`posição` e `proximo`/`próximo`.

## Conta atual

`!conta` mostra o rótulo, inicialmente **Streamer**. Streamer ou moderador pode defini-lo com `!conta <nome>` ou restaurar o rótulo inicial com `!conta reset`. O nome é apenas um rótulo exibido durante a live, não é login nem credencial de jogo.

Com **Trocar conta automaticamente ao chamar uma pessoa** ativado numa fila, chamar exatamente uma pessoa troca o rótulo para o nome de exibição dela. Chamar um grupo não troca. Quando termina a entrada que é dona da troca automática, o rótulo volta ao padrão. Concluir outra entrada não interfere. Um rótulo definido manualmente permanece até redefinir ou até uma próxima chamada individual elegível, conforme a entrada proprietária atual.

## O painel

O painel local abre em `https://localhost:3000` por padrão. Ele tem:

- Uma visão geral com estado local e conexão Twitch.
- **Filas e atendimentos** para acompanhar pessoas, chamar, atender, remover, reorganizar e consultar histórico recente.
- **Nova fila** para criar uma fila com recompensa própria.
- **Operações financeiras** para acompanhar e recuperar operações de pontos.
- **Comandos do chat** para ver o catálogo e escolher cargos permitidos.
- **Widgets do OBS** para mostrar rótulos e informações da fila na transmissão.
- **Configurações** para rótulos de conta.
- **Conexão do canal** durante a configuração ou quando for preciso reconectar; nos demais casos, mostra a conta conectada e opções de recuperação.

A página do OBS cria widgets locais de Browser Source para um único dado selecionado ou texto fixo. O link de cada widget aparece uma única vez ao criar ou gerar novamente. Mantenha-o privado; revogue ou substitua se for exposto. A configuração validada para OBS foi Ubuntu 24.04 com OBS Studio 32.2.2 e CEF 127. O comportamento do certificado OBS no Windows e macOS não foi verificado.

## Parar ou reiniciar o bot

Pare o produto pelo Docker Desktop ou pelos controles do Docker Engine no computador; isso pausa o aplicativo sem apagar os dados salvos. Para iniciar de novo, abra o instalador único e escolha **Instalar / Iniciar**. Reiniciar o computador ou aplicativo preserva filas e operações pendentes. Depois da reconexão, o aplicativo verifica a Twitch e retoma o trabalho recuperável. Se não for possível confirmar o estado final dos pontos, a operação continua visível para análise do streamer.

Para consultar os serviços, use o Docker Desktop ou as ferramentas do Docker Engine para inspecionar os contêineres do produto. Para investigar problemas, consulte os logs do bot no projeto Compose gerenciado pelo instalador. Parar ou reiniciar contêineres preserva os volumes; nunca os remova apenas para parar ou atualizar.

Para instalar, atualizar ou remover o produto, use o mesmo arquivo de instalador unificado do seu sistema: `subarushogun_twich_bot_setup.bat` no Windows, `subarushogun_twich_bot_setup.command` no macOS ou `subarushogun_twich_bot_setup.sh` no Linux. Quando a primeira release pública estiver disponível, baixe o arquivo na página [GitHub Releases](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/releases); as notas resumem a seção correspondente no `CHANGELOG.md`. A primeira beta canônica está planejada para depois da FND-9. No Linux, execute o arquivo baixado conforme o [guia do instalador](pt-BR/INSTALADORES.md). Escolha **Atualizar** ou **Desinstalar** no menu. A atualização normal preserva filas, histórico, autorização Twitch, segredos, idioma e porta. A desinstalação pergunta se você quer manter ou apagar os dados do produto; para apagar, digite a confirmação localizada mostrada pelo instalador. Docker, virtualização e outras dependências compartilhadas continuam instaladas e devem ser removidas manualmente pelas instruções dos fornecedores, se desejar. Não remova volumes Docker ao parar ou atualizar o produto.

## Problemas comuns

| O que aparece | O que fazer |
| --- | --- |
| O navegador alerta sobre o certificado local | Siga o passo de confiança do certificado para seu sistema no [guia de instalação](pt-BR/INSTALACAO.md), reinicie o navegador e abra novamente `https://localhost:3000`. Não troque por um endereço inseguro. |
| O painel pede reconexão com a Twitch | Abra **Conexão do canal**, reconecte o mesmo canal e autorize os acessos solicitados. O painel e os dados salvos continuam disponíveis durante a reconexão. |
| O canal aparece como inelegível ou sem Pontos do Canal | Nesta versão, somente Afiliados/Parceiros com Pontos do Canal podem usar filas por recompensa. O modo apenas manual para canal inelegível está planejado, mas ainda não disponível. |
| Uma recompensa está pendente ou incerta | Abra **Operações financeiras** ou **Conexão do canal**, leia a orientação e use a ação de tentar novamente/sincronizar/recuperar. Não presuma que os pontos mudaram antes da confirmação. |
| Um resgate não aparece na fila | Confirme que foi resgatada a recompensa própria deste bot e que a fila está aberta e conectada. Recompensas de outros aplicativos não são adotadas. Quando disponível, use **Sincronizar agora** na tela de conexão. |
| Um comando no chat é ignorado | Confira o nome da fila, veja os comandos com `!queue comandos` ou `!<fila> comandos` e confira se o cargo tem permissão. Comandos de gestão exigem streamer/moderador. |
| Viewer não consegue entrar | Não existe comando de autoinscrição. A pessoa precisa resgatar a recompensa da fila ou ser adicionada pelo streamer/moderador. |
| A fila está fechada | Novos resgates da recompensa estão pausados. Streamer/moderador pode usar `!<fila> abrir`; quem já está na fila ainda pode ser atendido. |
| A chamada não iniciou o prazo de ausência | O prazo só começa quando o envio da chamada ao chat é confirmado. Confira a chamada no painel e tente reenviar a notificação se essa opção aparecer. |

## Privacidade e segurança

Por padrão, o aplicativo foi feito para aceitar conexões somente neste computador. Filas e segredos de conexão ficam no armazenamento local do aplicativo. Quem tiver acesso ao computador ou aos arquivos salvos do app também poderá acessar essas informações; o armazenamento local não garante criptografia do disco.

O aplicativo usa identidade Twitch, selos de cargo no chat, entradas de fila, UID público opcional, estado das recompensas e os dados de conexão necessários para funcionar. Não deve receber senhas, Secret Twitch pelo chat, dados de acesso ao Genshin, comprovantes de pagamento ou mensagens privadas. Texto do chat é tratado como entrada não confiável; o texto rejeitado não deve ser repetido.

Em filas com UID visível, avise claramente que ele pode aparecer publicamente. Use as opções de visibilidade da lista, da chamada e do widget OBS. Se o link de uso único do OBS for exposto, revogue-o ou gere outro. Não compartilhe publicamente a pasta da instalação, os dados salvos ou arquivos de segredos locais.

## O que ainda não está disponível

**Disponível agora:** gestão local de filas, entrada por recompensa em canais elegíveis, inclusão manual, prioridade conferida e auditada pelo operador, permissões de comandos, acompanhamento de operações de pontos, rótulos de conta, recuperação da conexão Twitch e widgets locais de OBS na plataforma validada.

**Planejado, não disponível nesta versão:** operação de filas somente manual para canais inelegíveis a Pontos do Canal; vários canais por instalação; Discord/mensagens privadas; verificação ou processamento automático de PIX, Bits ou inscrições; e hospedagem pública do OBS.

Não existe comando para viewer se inscrever sozinho, verificação de conta de jogo, cobrança de pagamentos nem uma segunda conta de bot.

## Pontos a confirmar

- O projeto tem testes automatizados e evidências locais de integração. Ainda não foi validada uma sessão completa em canal elegível que crie/abra uma recompensa, receba um resgate e confirme cancelamento/conclusão real.
- Há registro de uma consulta de saúde somente para leitura na Twitch, mas ela não valida alterações reais de recompensa, envio de mensagens ou movimentação de pontos.
- Resgates com UID inválido são registrados para cancelamento sem criar entrada na fila. Não encontrei no handler atual o envio automático da mensagem explicativa específica prevista nos requisitos originais.
- Uma execução anterior no Windows registrou um aviso de redirecionamento de entrada no antigo auxiliar de inicialização, que foi removido. O novo instalador de arquivo único é testado no runner nativo Windows do CI; ainda é necessária uma execução do operador no Windows para confirmar o fluxo completo com Docker Desktop.
- Este projeto ainda não testou a instalação no macOS nem a confiança do certificado OBS nessa plataforma.
- A raiz global de chat segue o idioma: `!fila` (pt-BR), `!queue` (inglês) ou `!cola` (espanhol). Slugs e aliases das filas continuam sendo os identificadores escolhidos pelo streamer.
- Os testes do instalador usam um executável Docker falso e isolado. Eles não afirmam que uma atualização ou desinstalação real preservando dados foi executada no computador do operador.

## Como esta explicação foi conferida

Comparei este manual com o [README do projeto](../README.pt-BR.md), as [notas das integrações](pt-BR/integrations.md), o [progresso das stories](pt-BR/stories.md) e o comportamento atual de filas, comandos e recuperação. Funcionalidades planejadas não foram descritas como disponíveis.
