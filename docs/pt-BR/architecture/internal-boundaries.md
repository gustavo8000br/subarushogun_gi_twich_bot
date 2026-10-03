# Fronteiras internas
[English](../../architecture/internal-boundaries.md)


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
