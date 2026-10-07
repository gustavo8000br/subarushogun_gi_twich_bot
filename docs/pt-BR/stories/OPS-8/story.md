# Story OPS-8: Recuperação automática da Twitch após interrupções de rede

[Read in English](../../../stories/OPS-8/story.md)

**Issue:** [#41](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/41)
**Complexidade:** COMPLEX (19/25)
**Status:** Done
**Executor:** @dev
**Gate de qualidade:** @qa
**Epic/capacidade:** Resiliência Twitch e recuperação da integração

## Story

**Como** streamer usando o chatbot local,
**quero** que credenciais Twitch salvas se reconectem automaticamente após queda temporária de rede, suspensão, desligamento ou reinício,
**para que** eu não precise repetir OAuth enquanto minha autorização ainda puder ser recuperada.

## Critérios de aceite

1. [x] O startup não espera a rede Twitch para servir o painel local e a rota de saúde.
2. [x] Timeout, erro de rede, HTTP 429 ou erro de servidor transitório durante validação/inicialização preserva credenciais salvas e tenta novamente com backoff exponencial limitado e jitter (atraso inicial de 5 segundos; máximo de 300 segundos).
3. [x] Um 401 do access token expirado/inválido tenta primeiro refresh com o refresh token Authorization Code salvo; refresh bem-sucedido é persistido e identidade/escopos são validados novamente sem novo OAuth.
4. [x] Refresh comprovadamente inutilizável/revogado, identidade de app/broadcaster incorreta ou escopo obrigatório ausente entra em `reconnect_required` e interrompe operações Twitch autorizadas com segurança.
5. [x] Falha transitória de elegibilidade/API é tentada novamente automaticamente; recuperação restaura um adaptador/listener e só publica `connected` depois que a reconciliação necessária conclui.
6. [x] Perda real do socket EventSub seguida de nova sessão ready dispara uma reconciliação existente. `session_reconnect` Twitch é tratado pelo Twurple 8.2.0 sem socket concorrente.
7. [x] Gatilhos de recuperação e reconciliação são single-flight; notificações repetidas/fora de ordem preservam deduplicação de redemption e garantias de estado terminal existentes.
8. [x] Intenções outbox financeiras, de recompensa, chat e chamada permanecem intactas durante queda/reinício e retomam somente quando o adaptador Twitch estiver disponível; nenhuma operação remota é confirmada falsamente.
9. [x] `/health` e painel de configuração distinguem retry/degradação transitória de reconexão confirmada como necessária, nos idiomas suportados, sem erros brutos/segredos.
10. [x] SIGTERM/SIGINT cancela retries pendentes e impede inicialização/listener tardios; encerramento gracioso existente continua intacto.
11. [x] Testes usam relógio controlado e fakes Twitch/EventSub para matriz de falhas, além de migrations PostgreSQL isoladas para persistência da outbox após reinício. Comportamento Twitch real só é alegado se executado separadamente com acesso autorizado.
12. [x] Story, guia de integrações, changelogs e índices centrais em inglês e pt-BR estão sincronizados; testes e gates de qualidade passam.

## Registro do planejamento

- Spec Pipeline concluído como COMPLEX (19/25); pesquisa e crítica em duas passagens ficam na pasta `spec/`.
- A primeira crítica encontrou e corrigiu quatro lacunas: access token expirado ainda pode ser renovado; servidor local aguardava validação remota; migração contínua de sessão Twitch não deve ser tratada como evento perdido; conexão inicial do Twurple tem limite de retry.
- A segunda crítica aprovou a especificação revisada com score 10/10. O escopo amplia o startup/ciclo de vida da FND-4 e reutiliza OAuth/reconciliação da FND-4 e outbox da FND-5.
- Consulte [especificação](spec/spec.md), [pesquisa](spec/research.json), [complexidade](spec/complexity.json), [crítica](spec/critique.json) e [plano de implementação](spec/plan.json).

## Evidências TDD

As evidências Red/Green de P1–P13 estão em [`tdd-log.md`](tdd-log.md). A execução direcionada de autenticação/integração/adaptador passou 44 testes em três arquivos; a suíte final passou 87 arquivos / 728 testes.

## Lista de arquivos

Artefatos do planejamento ficam nas pastas `spec/` em inglês e pt-BR. Arquivos de implementação: `apps/api/src/twitch/auth-runtime.mjs`, `apps/api/src/twitch/integration.mjs`, `apps/api/src/twitch/eventsub-runtime.mjs`, `apps/api/src/twitch/helix-adapter.mjs`, `apps/api/src/health-route.mjs`, `apps/web/health-status.mjs`, `apps/web/setup-messages.mjs`, catálogos de localização do painel/configuração e testes direcionados em `tests/unit/twitch-auth-runtime.test.js`, `tests/unit/twitch-integration.test.js`, `tests/unit/eventsub-runtime.test.js`, `tests/unit/twitch-adapter.test.js`, `tests/unit/health-route.test.js`, `tests/unit/health-status.test.js` e `tests/unit/setup-messages.test.js`. Os documentos bilíngues de integração e TDD são atualizados junto do código.

## Checklist de implementação

- [x] Comparar escopo com FND-4/FND-5; documentar sobreposição e comportamentos ausentes.
- [x] Concluir requisitos, complexidade, pesquisa Twitch/Twurple, duas críticas e plano do Spec Pipeline.
- [x] Classificar falhas de autenticação e recuperar com refresh salvo, test-first.
- [x] Supervisor de integração não bloqueante, retry limitado e cancelamento, test-first.
- [x] Exaustão inicial EventSub e recuperação após desconexão real, test-first.
- [x] Estado localizado de retry nas projeções de saúde/configuração, test-first.
- [x] Verificar persistência/recuperação de lease da outbox com os testes reais de PostgreSQL isolado; verificar nova build/reinício Compose da instalação conectada preservando volumes de dados e segredos.
- [x] Atualizar documentação de integração/story e changelogs bilíngues.
- [x] Passar `npm run lint`, `npm run typecheck`, `npm test`, `npm run review:static`, validação de versão, Compose e `git diff --check`.
- [x] Registrar revisão independente e gate QA da story.
- [ ] PR mesclado e corpo/status da issue atualizado por @devops; sem comentários em issue salvo decisão/bloqueio que os exija.
- [ ] Manter `.release-stage` inalterado; promoção beta aguarda conclusão de OPS-8, FND-9 e DOC-2.

## Histórico de alterações

| Data | Versão | Alteração | Responsável |
| --- | --- | --- | --- |
| 2026-10-07 | 0.11.0 | Gate QA PASS (9,5/10) — Status: InReview → Done. | @qa |

## Resultados de QA

**Gate: PASS (9,5/10)** — [gate de qualidade OPS-8](../../../qa/gates/OPS-8-automatic-twitch-recovery.yml). Os 12 critérios de aceite têm evidências em testes automatizados, integração PostgreSQL ou aceite Compose conforme aplicável. A conta Twitch ativa foi verificada somente pelo probe de saúde somente leitura existente; não houve simulação de queda real nem operação de escrita na Twitch. A confiança global de certificados do host ainda aponta para uma CA local anterior, enquanto as duas instâncias passam na verificação HTTPS quando recebem o certificado CA exportado atual.
