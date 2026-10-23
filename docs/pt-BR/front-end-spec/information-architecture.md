# Arquitetura da informação
[English](../../front-end-spec/information-architecture.md)


1. **Configuração e reconexão:** URL exata do callback, instruções do console de desenvolvedor da Twitch, substituição do Client ID/Secret, validação, conectar/reconectar, identidade e elegibilidade do canal.
2. **Visão geral:** versões local do produto/API/estado, saúde do banco/bot/chat/EventSub, última reconciliação, aviso de quantidade de recompensas e problemas financeiros ativos.
3. **Filas:** estado aberta/fechada/arquivada/exclusão pendente; configurações; criar/editar/abrir/fechar/arquivar/desarquivar/apagar com confirmação explícita.
4. **Detalhe da fila:** ordem de espera, pessoas chamadas, atendimentos em andamento e histórico terminal; adicionar manualmente, chamar, iniciar, concluir, remover, mover e repetir chamada com segurança.
5. **Pontos e recuperação:** operações pendentes, confirmadas, conflitantes ou desconhecidas, com ações de retry/reconciliação que não alteram a intenção registrada.
6. **Comandos:** catálogo e políticas de comandos de chat.
7. **Widgets:** criar, estilizar e pré-visualizar widgets de overlay; gerar, regenerar e revogar os links de uso único para o OBS.
8. **Configurações:** idioma do produto (que também define o idioma do chat) e preferências locais, como os rótulos de texto atual/padrão da conta e o comportamento de reset. Qualquer novidade em Configurações exige story própria.
