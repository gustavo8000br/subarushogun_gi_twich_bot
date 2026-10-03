# Arquitetura da informação
[English](../../front-end-spec/information-architecture.md)


1. **Configuração e reconexão:** URL exata do callback, instruções do console de desenvolvedor da Twitch, substituição do Client ID/Secret, validação, conectar/reconectar, identidade e elegibilidade do canal.
2. **Visão geral:** versões local do produto/API/estado, saúde do banco/bot/chat/EventSub, última reconciliação, aviso de quantidade de recompensas e problemas financeiros ativos.
3. **Filas:** estado aberta/fechada/arquivada/exclusão pendente; configurações; criar/editar/abrir/fechar/arquivar/desarquivar/apagar com confirmação explícita.
4. **Detalhe da fila:** ordem de espera, pessoas chamadas, atendimentos em andamento e histórico terminal; adicionar manualmente, chamar, iniciar, concluir, remover, mover e repetir chamada com segurança.
5. **Pontos e recuperação:** operações pendentes, confirmadas, conflitantes ou desconhecidas, com ações de retry/reconciliação que não alteram a intenção registrada.
6. **Conta:** rótulos de texto atual/padrão e comportamento de reset.
