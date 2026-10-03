# Contrato de persistência
[English](../../architecture/persistence-contract.md)


Prisma 6.19.3 e `prisma-client-js` ficam fixados para gerar JavaScript. `prisma.config.mjs` lê uma connection string montada em runtime com host do serviço Compose e arquivo de senha montado. Nunca a imprimir ou expor. Schema e migrations versionadas ficam em `apps/api/prisma`; SQL acrescenta índices parciais/checks. Testes de integração aplicam as mesmas migrations reais em PostgreSQL isolado.

Repositórios fornecem transações explícitas curtas. Mutações por fila usam coordenação de banco e restrições únicas; atualizações globais de conta são serializadas entre filas. Conflitos de unicidade por resgates ativos duplicados são resultados de domínio esperados e enfileiram cancelamento, sem derrubar ingestão de eventos. Nenhuma transação engloba I/O remoto.
