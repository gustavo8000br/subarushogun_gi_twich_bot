# Contrato da outbox financeira
[English](../../architecture/financial-outbox-contract.md)


Uma intenção financeira estável por ID do resgate e chave de operação. A transação de domínio persiste estado terminal, auditoria, snapshot da política, efeitos de ordem/conta e linha da outbox. Worker obtém lease, chama Twitch fora da transação e persiste confirmação do estado esperado, agenda de retry, conflito ou resultado desconhecido. Resposta perdida exige consulta remota. Resgate ausente ou HTTP 404 não prova cancelamento. Credenciais/escopos inválidos por 401 suspendem tentativas automáticas até reconexão válida. Retry usa exponential backoff/jitter limitado e headers de rate limit.
