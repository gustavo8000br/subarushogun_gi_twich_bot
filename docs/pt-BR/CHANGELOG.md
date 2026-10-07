# Histórico de mudanças

[English](../../CHANGELOG.md)

Este arquivo destaca mudanças importantes para streamers e viewers. Detalhes técnicos e operacionais estão no [CHANGELOG_INTERNAL.md](CHANGELOG_INTERNAL.md).

## v0.8.0-alpha

- Um instalador por sistema agora reúne instalação, atualização e remoção de dados.
- Atualizações preservam filas e configurações por padrão; apagar esses dados exige confirmação explícita.

## v0.7.2-alpha

- As orientações de início, operação diária e estado do projeto agora estão mais fáceis de encontrar em guias específicos.

## v0.7.0-alpha

- O painel mantém visíveis a versão em execução e o estado dos serviços, e orienta o streamer sobre a próxima ação de configuração ou fila.
- As páginas sem filas ou operações financeiras explicam o que será exibido e como continuar.
- A navegação do painel funciona em telas estreitas e destaca visivelmente o foco do teclado.

## v0.6.0-alpha

- A tela de confirmação e recuperação do login Twitch agora segue o idioma selecionado para o produto.

- Escolha português brasileiro, inglês, espanhol ou uma tradução comunitária completa para o painel e as mensagens do bot; a raiz dos comandos acompanha o idioma selecionado.

- Escolha o idioma do produto no painel. Respostas suportadas do chat, rótulos do OBS e ferramentas locais podem usar catálogos em português brasileiro, inglês ou espanhol.

## v0.5.2-alpha

- O painel Twitch agora identifica claramente canais conectados que não podem usar recompensas de Pontos do Canal.

## v0.5.1-alpha

- Esclarece as instruções de confiança do certificado local na primeira execução em Windows, Linux e macOS.

## v0.5.0-alpha

- Streamers podem criar widgets independentes do OBS para exibir dados selecionados das filas ou texto personalizado na transmissão.
- Os widgets se atualizam automaticamente e voltam a funcionar após uma reinicialização; links revogados ou substituídos deixam de exibir dados.
- Comandos de gestão de filas, incluindo controles da conta atual, ficam restritos ao streamer e aos moderadores.

## v0.4.1-alpha

- O projeto agora está disponível sob a licença MIT.

## v0.4.0-alpha

- Streamers podem consultar todos os comandos de chat no painel e escolher quais cargos podem usar os comandos configuráveis.
- Viewers podem pedir no chat a lista de comandos disponíveis para seu cargo; streamer e moderadores podem verificar se o bot responde.

## v0.3.1-alpha

- Atualizações de segurança corrigem uma vulnerabilidade reportada em dependência.

## v0.3.0-alpha

- Streamers podem configurar limites de resgate e intervalo das recompensas da fila no painel.
- As posições da fila pelo chat agora respeitam as faixas prioritária e normal quando moderadores reorganizam viewers.

- Páginas separadas organizam filas e conexão, mostram o estado dos serviços locais e o tempo de resposta Twitch mesmo para canais inelegíveis, permitem sincronizar novamente e retornam ao painel após conectar o canal.
- Streamers podem consultar resultados recentes e reorganizar as pessoas que aguardam pelo painel.
- Streamers podem marcar como prioritário quem aguarda após conferir um benefício externo; prioritários e normais são atendidos em faixas FIFO separadas.

## v0.2.0-alpha

- Streamers agora podem pausar, reabrir, arquivar e remover filas gerenciadas com segurança, mantendo tarefas inacabadas disponíveis para recuperação.
- Notificações de chamada podem ser reenviadas pelo painel, e as trocas de conta ficam vinculadas à pessoa cujo atendimento está em andamento.
- O bot acompanha reembolsos e consumos de pontos pendentes, mantendo operações interrompidas visíveis até a Twitch confirmar o resultado.
- Ações de fila dos viewers e avisos no chat são mais confiáveis após reinicializações, e IDs de jogo ocultos são removidos quando uma fila passa para o modo oculto.

## Primeira imagem alpha materializada — v0.1.0-3e0c935-alpha (2026-10-05)

- A primeira versão alpha permitiu executar o bot e o painel do streamer no computador da própria pessoa, com instruções para Windows e Linux.
- O painel apresentou a configuração da conta Twitch e as ferramentas iniciais para criar e gerenciar filas e recompensas.
- A configuração agora explica em português quando um canal não pode usar pontos de recompensa, em vez de mostrar uma mensagem técnica.
- O painel local e o login da Twitch usam uma conexão segura, com instruções para a configuração inicial.

Esta é uma versão alpha inicial. Algumas funções de gerenciamento de filas e recuperação ainda estão sendo concluídas.
