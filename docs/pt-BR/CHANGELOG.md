# Histórico de mudanças

[English](../../CHANGELOG.md)

## Unreleased

- Adiciona base de painel local do streamer para configuração Twitch, operações de fila, notificações de chamada, visibilidade financeira, revisão/confirmação de limpeza e rótulos de conta. Recompensas de resgate permanecem desvinculadas até concluir a gestão do ciclo de recompensas.
- Adiciona confirmação de limpeza no chat vinculada ao mesmo moderador/canal/fila e snapshot de entradas ativas válido por 15 segundos; reembolsos são enfileirados para confirmação remota.
- Adiciona propriedade automática da conta atual em chamadas individuais, com intervenção manual e retorno ao padrão configurado quando a entrada proprietária termina.
- Adiciona READMEs centrais bilíngues para operação, cobrindo primeira execução, atualização, operação Compose diária, contribuição, Conventional Commits e limites atuais da implementação.
- Adiciona decisões datadas de integração Twitch/SDK/infraestrutura com versões verificadas, escopos por operação, referências oficiais e distinção clara entre adaptadores planejados e validação real.
- Adiciona runtime local fixado em Docker Compose, segredo persistente de banco gerado uma única vez, PostgreSQL 18.6 e fundação Prisma 6.19.3.
- Adiciona tabelas versionadas do PostgreSQL e restrições de banco para chaves de fila, resgates, entradas ativas, integridade da origem e idempotência da outbox.
