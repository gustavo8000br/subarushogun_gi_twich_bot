# Dados e consistência
[English](../../fullstack-architecture/data-and-consistency.md)


PostgreSQL mantém configuração de filas, chaves globais, entradas, resgates (inclusive rejeitados), outbox, auditoria, conta/configurações, credenciais OAuth e deduplicação de operações. IDs Twitch e UID são strings. Restrições PostgreSQL garantem unicidade de resgates/mensagens, namespace de chaves, integridade fonte/ID, usuário ativo por fila e idempotência financeira/operacional. Alterações da fila são serializadas em transações curtas; alterações globais de conta têm serialização transacional. Nenhuma transação de banco fica aberta durante I/O Twitch.

Para ações terminais, uma transação altera estado, ordem/propriedade de conta, auditoria, fotografia da política e intenção na outbox. O worker chama a Twitch após commit e registra confirmação/retry/conflito/desconhecido. A execução pela rede não é exatamente uma vez. Envio de chat é efeito separado; texto sensível a privacidade é criado no envio com as configurações atuais da fila.
