# Arquitetura do Serviço: `apps/api`

[English](../architecture.md) · Topologia detalhada do sistema: [arquitetura fullstack](../fullstack-architecture.md).

## Responsabilidades

A API é um único processo Fastify local. Serve `apps/web`, controla sessões locais e segurança HTTP, compõe domínio/persistência/adaptadores Twitch, consome eventos Twitch, agenda reconciliação/timers e executa workers duráveis pela outbox PostgreSQL. Não é API hospedada nem serviço multi-tenant.

## Fronteiras internas

```text
apps/api/src/
  bootstrap/       inicialização, saúde e encerramento gracioso
  domain/          filas, transições, conta e ciclo de vida da recompensa
  persistence/     repositórios Prisma e coordenação de transações curtas
  outbox/          workers duráveis de operações financeiras/chat/recompensa
  twitch/          OAuth, armazenamento de token, adaptadores Helix, normalização EventSub
  reconciliation/  recuperação paginada e comparação dos estados remoto/local
  commands/        parser puro em português e predicados de autorização
  chat/            entrada de mensagens, despacho de domínio e catálogo seguro de respostas
  http/            rotas Fastify, schemas, projeções e segurança local
```

São módulos dentro de um processo, não serviços implantáveis separados. Decisões do domínio ficam em serviços de domínio. Rotas, callbacks EventSub, handlers de chat, workers e timers chamam esses serviços, sem alterar status diretamente.

## Contrato de persistência

Prisma 6.19.3 e `prisma-client-js` ficam fixados para gerar JavaScript. `prisma.config.mjs` lê uma connection string montada em runtime com host do serviço Compose e arquivo de senha montado. Nunca a imprimir ou expor. Schema e migrations versionadas ficam em `apps/api/prisma`; SQL acrescenta índices parciais/checks. Testes de integração aplicam as mesmas migrations reais em PostgreSQL isolado.

Repositórios fornecem transações explícitas curtas. Mutações por fila usam coordenação de banco e restrições únicas; atualizações globais de conta são serializadas entre filas. Conflitos de unicidade por resgates ativos duplicados são resultados de domínio esperados e enfileiram cancelamento, sem derrubar ingestão de eventos. Nenhuma transação engloba I/O remoto.

## Contrato da outbox financeira

Uma intenção financeira estável por ID do resgate e chave de operação. A transação de domínio persiste estado terminal, auditoria, snapshot da política, efeitos de ordem/conta e linha da outbox. Worker obtém lease, chama Twitch fora da transação e persiste confirmação do estado esperado, agenda de retry, conflito ou resultado desconhecido. Resposta perdida exige consulta remota. Resgate ausente ou HTTP 404 não prova cancelamento. Credenciais/escopos inválidos por 401 suspendem tentativas automáticas até reconexão válida. Retry usa exponential backoff/jitter limitado e headers de rate limit.

## Ciclo Twitch

Rotas OAuth validam credenciais do app antes de substituir valores armazenados; leitura de Secret retorna somente presença. Callback OAuth valida Host, sessão, state e expiração de uso único. Provider de refresh persiste cada token atomicamente. Runtime valida token ao iniciar e por hora. EventSub WebSocket registra handlers de resgate add/update e mensagem de chat. Adaptadores normalizam enums/formas dos campos do SDK na fronteira. Reconciliação inicia observação de eventos, verifica configurações de recompensas do app, importa resgates não atendidos paginados, consulta individualmente IDs locais sem resolução, aplica status terminal externo confirmado via serviço de domínio e então retoma workers/timers aplicáveis.

## Superfície HTTP

Operações mutáveis usam POST/PATCH/DELETE, validação de schema, sessão local, CSRF, chave de idempotência e revisão de estado quando aplicável. GET `/api/state` exige sessão e retorna projeção explícita com `product_version`, `api_contract_version`, revisão e timestamp, conta, conectividade, filas e entradas filtradas por privacidade. Callback OAuth é exceção GET validada específica. Assets estáticos nunca recebem Prisma client ou segredos.

## Comportamento em falhas

Falha da Twitch mantém painel local e PostgreSQL disponíveis. Trabalho financeiro pendente continua durável e visivelmente pendente/conflitante/desconhecido. Reconciliação parcial não remove entradas. SIGTERM/SIGINT interrompe intake/novos trabalhos, deixa linhas pendentes persistidas, desconecta Twitch e fecha Prisma/Fastify com limpeza. Se houver advisory lock para instância única, deve manter conexão de sessão dedicada do PostgreSQL.
