# OPS-22 — Recuperar o estado financeiro `unknown` e concluir a exclusão de fila com segurança

[English](../../../stories/OPS-22/story.md)

**Status:** Ready (Pronta; GO do `@po` em 2026-10-27, ver [po-validation.md](po-validation.md)). Implementação somente após GO do `@po`, os gates de planejamento abaixo, issue criada pelo `@devops` e ordem explícita na sequência da OPS-15. **Issue:** #80; fatia 1 FT-24 = #82 (criada pelo `@devops`; sem comentários em issues).
**Origem:** Bateria ao vivo, rodada 1, defeitos D-5 e D-6 ([live-battery-2026-10-26-results.md](../OPS-15/live-battery-2026-10-26-results.md)); pesquisa de causa-raiz do `@analyst` ([redemption-sync-research.md](../OPS-15/redemption-sync-research.md), veredito SUFICIENTE); revisão do `@architect`, seção 5 e fatia S-F ([panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md)); decisões do proprietário de 2026-10-27 (abaixo).
**Relacionadas:** OPS-15 (migração do painel Next — esta story é dependência do cutover, decisão do proprietário de 2026-10-27); FND-3 (outbox durável e recuperação financeira); FND-9 (ciclo de fila/recompensa); OPS-21 (contrato da API do painel — idempotência de qualquer mutação nova); OPS-20 (elegibilidade de devolução — depois, ver riscos); OPS-23 (painel em tempo real — independente, sem conjunto de escrita em comum, salvo onde indicado).
**Coordenação necessária:** `$aiox-po` (validação), `$aiox-architect` (máquina de estados e ordem de exclusão), `$aiox-data-engineer` (persistência do contador de tentativas e toda migration), `$aiox-analyst` (plano de confirmação ao vivo, ver gates), `$aiox-qa` independente, `$aiox-devops` (issue). `$aiox-ux-design-expert`: não é gate obrigatório desta story por instrução do proprietário; ver "Nota de UX".

## Problema

Na sessão ao vivo de 2026-10-27 o proprietário resgatou uma recompensa de fila com recompensa e viu que o caminho financeiro não fecha:

- **D-5 — `redemption.fulfill` preso em `unknown`.** Iniciar o atendimento criou a tarefa de outbox `redemption.fulfill`, que foi para `unknown` / `remote_state_unavailable` após uma tentativa; o resgate continuou `UNFULFILLED` na Twitch. "Tentar de novo" em Operações fez a tentativa 2 com o mesmo resultado (falha consistente).
- **Causa-raiz mais provável (confiança ~90%, VERIFICADA no código-fonte, ainda não por log ao vivo):** o `helix-adapter.mjs` lê o status com `value.isFulfilled`, depois `value.isCanceled`, depois `value.status`. No `@twurple/api` 8.2.0 a classe `HelixCustomRewardRedemption` não tem getter `status`; assim um resgate `UNFULFILLED` (os dois booleanos falsos) vira `UNKNOWN`, que o worker grava como `unknown`. A classe do evento EventSub tem `status`, por isso o resgate chega, mas a checagem Helix falha. Os testes não pegaram porque os fakes são objetos simples ou strings, nunca a classe real (pesquisa, TL;DR).
- **Defeitos colaterais da mesma área (VERIFICADOS no código):** (a) `listUnfulfilledRedemptions` também devolve `UNKNOWN`, então a reconciliação nunca importa resgates perdidos e não registra nada; (b) toda checagem `error.status` ignora erros do Twurple, que expõem `statusCode`; assim 401/403/404 reais são tratados como transitórios e um 404 real nunca chega ao ramo "não encontrado".
- **`unknown` é terminal.** `claimNext` só pega `pending`/`retry`; não existe nova tentativa, espera crescente nem reverificação depois de `unknown` (revisão do arquiteto, seção 5).
- **A exclusão da fila fica bloqueada para sempre.** Excluir a fila prometia cancelamento no diálogo do painel, mas nenhum cancelamento foi criado; `reward.delete` virou `unknown` (`queue_deletion_financial_conflict`) por causa do resgate desconhecido, e "Sincronizar agora" não limpou. O painel da Twitch recusou excluir a recompensa com um resgate pendente; o proprietário limpou à mão. A API documentada de Delete Custom Reward, ao contrário, converte um resgate ainda `UNFULFILLED` em `FULFILLED` (pontos mantidos, sem devolução); por isso a ordem das operações importa (pesquisa, Q3).
- **D-6 — `/health` `twitch_integration: degraded`** desde o início da live, sem linha de log explicativa. O gatilho exato é NÃO VERIFICADO; o array `issues` da reconciliação só é publicado no objeto de status, não vai para o log.

## Decisões do proprietário (2026-10-27)

1. Duas stories separadas, ambas dependências do cutover da OPS-15: esta (recuperação financeira e exclusão de fila) e a OPS-23 (painel em tempo real e estado compartilhado).
2. Estado `unknown`: até **6 tentativas** com **espera crescente** e **reverificação somente de leitura**; depois, **resolução manual auditada em Operações**. Nunca confirmar sem leitura remota positiva.
3. Excluir uma fila termina com mensagem e redirecionamento automático. Mensagem e redirecionamento pertencem à fatia de navegação da OPS-15 (FT-23); esta story entrega os estados de que ela precisa (excluída, exclusão pendente, exclusão bloqueada).

## Story

Como streamer que opera uma fila com recompensa,
quero que um resgate seja confirmado ou devolvido na Twitch de forma confiável, que um estado preso seja tentado um número limitado de vezes e depois entregue a mim com um caminho manual claro e auditado, e que a exclusão da fila resolva todo resgate aberto antes de remover a recompensa,
para que os pontos dos espectadores nunca sejam retidos ou perdidos em silêncio e uma fila nunca fique presa em `deleting`.

## Escopo

**Dentro (em três fatias testáveis de forma independente):**

- Fatia 1 — leitura do status e classificação de erros (causa-raiz do D-5), mais `degraded` diagnosticável (visibilidade do D-6).
- Fatia 2 — nova tentativa limitada e reverificação somente de leitura do `unknown`, depois resolução manual auditada em Operações.
- Fatia 3 — ordem e estados da exclusão de fila.

**Fora do escopo:**

- Mensagem, redirecionamento e foco depois de excluir ou criar uma fila (fatia FT-23 da OPS-15) e qualquer atualização em tempo real (OPS-23).
- Laço periódico aberto de reverificação do `unknown` (o arquiteto propôs um a cada 15 min; o proprietário escolheu 6 tentativas limitadas e depois resolução manual).
- Mudar quem recebe devolução (elegibilidade da OPS-20) ou qualquer regra de produto de devolução.
- Corrigir a causa-raiz do D-6 além de torná-lo diagnosticável; a correção segue a evidência.
- Comportamento do painel da Twitch (uma UI, não a API) e qualquer alegação sobre a Twitch ao vivo antes da checagem ao vivo sob autorização do proprietário (OW-16).
- Migrar o banco de desenvolvimento descartável ou a fila que ficou em `deleting` nele (banco de desenvolvimento é descartável).
- Bump de versão, commit, push, PR, release, cutover, remoção do painel vanilla.

## Critérios de aceite

A evidência segue as regras do projeto: fixtures/mocks, testes unitários, PostgreSQL isolado (migrations reais), navegador real e Twitch ao vivo são registrados como classes separadas. Todo comportamento começa com um teste que falha (Red primeiro).

### Fatia 1 — Leitura do status, classificação de erros, `degraded` diagnosticável

1. **Dado** uma instância real de `HelixCustomRewardRedemption` construída a partir de JSON bruto da Helix com `status` `UNFULFILLED`, `FULFILLED` ou `CANCELED`, **quando** o adaptador lê o status, **então** devolve esse mesmo status e nunca `UNKNOWN`. O teste de contrato usa instâncias reais de classes do Twurple, não objetos simples (pesquisa, "Q5"). Hoje falha para `UNFULFILLED`.
2. **Dado** que `listUnfulfilledRedemptions` devolve instâncias reais da classe, **quando** a reconciliação roda, **então** cada item traz seu status real e `onRedemptionAdd` importa o resgate perdido pelo EventSub.
3. **Dado** um status não reconhecido, **quando** o worker o classifica, **então** o resultado continua `unknown` e nunca é tratado como confirmação (a invariante "unknown nunca vira confirmação" é preservada).
4. **Dado** um `HttpStatusCodeError` do Twurple com `statusCode` 401, 403, 404, 429 ou 5xx, **quando** o worker ou o reconciliador o classifica, **então** uma função compartilhada lê `error.statusCode ?? error.status`, e 401 vai para `blocked_auth`, 404 para o ramo "não encontrado", 429 respeita `Retry-After` e 5xx é transitório. Os testes existentes que usam `{ status }` continuam passando.
5. **Dado** uma reconciliação que termina `partial` ou falha, **quando** ela publica `degraded`, **então** uma linha de log estruturada registra os códigos e contagens das issues e o `reason`, sem corpo de resgate, id/login de espectador, tokens, cabeçalhos ou segredos, de modo que `degraded` seja explicável (visibilidade do D-6; pesquisa Q4/Q5).

### Fatia 2 — Nova tentativa limitada, reverificação de leitura, resolução manual auditada

6. **Dado** uma tarefa financeira cuja leitura remota não é conclusiva (status não reconhecido ou falha transitória de leitura), **quando** o worker a trata, **então** reagenda até **6 tentativas no total** com espera crescente usando o backoff exponencial com jitter existente, e cada reverificação é uma leitura **somente de leitura** (`getRedemptionStatus`). A escrita só é tentada pelo fluxo normal da tarefa quando a leitura mostra `UNFULFILLED` de forma positiva.
7. **Dado** que a leitura de reverificação mostra o estado final esperado já aplicado, **quando** ela é processada, **então** a tarefa é confirmada por essa leitura remota positiva; se mostrar o estado final oposto, vale o caminho `conflict` existente.
8. **Dado** que a sexta tentativa não é conclusiva, **quando** ela termina, **então** a tarefa vira `unknown` terminal ("precisa de revisão"), nenhuma tentativa automática adicional é alegada, e a projeção de saúde distingue itens com nova tentativa (`degraded`) de itens terminais (`needs_review`) (revisão do arquiteto, 5.5).
9. **Dado** qualquer sequência de leituras falhas ou esgotadas, **quando** os testes inspecionam o estado gravado, **então** nenhuma tarefa de outbox fica `confirmed` e nenhum resgate é marcado como atendido ou cancelado localmente sem leitura remota positiva (asserção em PostgreSQL, não só em mock).
10. **Dado** cada tentativa, **quando** é registrada em log, **então** a linha contém apenas `{ operationType, outboxId, attempt, httpStatus, twitchErrorCode (<= 64), nextAttemptAt }` e nada do resgate, do espectador, de tokens ou cabeçalhos.
11. **Dado** uma tarefa em `unknown` terminal, **quando** o operador abre Operações, **então** o item mostra seu efeito bloqueante (numa exclusão de fila: quantas operações a bloqueiam) e oferece as ações auditadas existentes: tentar agora e a resolução manual "verifiquei na Twitch". **Quando** o operador resolve manualmente, **então** a auditoria registra ator, data/hora e motivo com `remoteConfirmed: false`, o estado é `operator_resolved`, e nunca é automático (comportamento da FND-3 preservado).
12. **Dado** que o `@data-engineer` decide a persistência, **quando** o contador de tentativas, o `unknownSince` e a classe do motivo são gravados, **então** usam as colunas existentes `attempts`/`lastError`/`nextAttemptAt`/`payload` se bastarem; caso contrário, uma migration aditiva e reversível de responsabilidade do `@data-engineer`, provada em PostgreSQL isolado com migrations reais.

### Fatia 3 — Ordem e estados da exclusão de fila

13. **Dado** que uma fila com resgates abertos (`UNFULFILLED`) é excluída, **quando** a exclusão roda, **então** a ordem é: (a) pausar a recompensa; (b) cancelar (devolver) cada resgate aberto, criando uma tarefa `redemption.cancel` idempotente por resgate, e confirmar cada uma por leitura remota; (c) listar de novo para confirmar zero `UNFULFILLED`; (d) excluir a recompensa; (e) um 404 na exclusão significa "já não existe". [AUTO-DECISION] cancelar (não atender) → é o que o diálogo do painel já promete e o que a sessão ao vivo esperava (motivo: o FULFILLED implícito da exclusão pela API cobraria os espectadores sem atendê-los).
14. **Dado** que um resgate está em `unknown` ou ainda em novas tentativas, **quando** a exclusão da fila é pedida, **então** a recompensa **não** é excluída, a fila fica `deleting` com projeção "exclusão pendente/bloqueada: N operações precisam de revisão" que leva a Operações, e a exclusão **retoma sozinha** quando o bloqueio é confirmado por leitura remota ou resolvido manualmente (CA 11). Nunca congela sem motivo visível.
15. **Dado** que a exclusão termina, **quando** `reward.delete` é confirmado ou a recompensa já não existe, **então** a fila vira `deleted`; a projeção da API expõe estados distintos (excluída, exclusão pendente, exclusão bloqueada) que a mensagem do painel na FT-23 pode usar sem prometer sucesso numa exclusão pendente.
16. **Dado** um token não autorizado ou revogado (401) durante a exclusão, **quando** ocorre, **então** a exclusão fica bloqueada com o estado de autenticação visível e é rearmada após a reautorização (revisão do arquiteto, 5.1).
17. **Dado** o fluxo de exclusão exercitado em PostgreSQL isolado com migrations reais, **quando** um resgate está em cada estado (aberto, desconhecido, já cancelado, já atendido), **então** os estados finais da fila e do outbox correspondem aos CAs 13-15 e nenhum `reward.delete` é emitido enquanto existir um resgate `UNFULFILLED` não contabilizado.
18. **Dado** que as novas ações de cancelamento e exclusão são mutações do painel, **quando** forem adicionadas, **então** seguem o contrato de idempotência da OPS-21 (começam `terminal_unknown`, promovidas só com prova em PostgreSQL) e suas respostas não 2xx carregam um `code` enumerado.

### Confirmação ao vivo (sob autorização do proprietário)

19. **Dado** que o proprietário autoriza uma checagem ao vivo (OW-16), **quando** ela roda no canal de teste, **então** a evidência registra as quatro checagens do analista: `status` bruto da Helix e valor do adaptador para um resgate `UNFULFILLED`; `issues[].code` e `reason` de `degraded` de uma reconciliação; Delete Custom Reward com um resgate pendente seguido de leitura com `status=FULFILLED`; e o resultado HTTP da leitura de um resgate por `id` logo após o evento EventSub. Nada ao vivo é alegado antes de rodar, e o resultado é registrado como classe de evidência separada.

## Dependências

- **Depende de:** GO do `@po` e issue; resposta do `@data-engineer` sobre persistência (CA 12); outbox e semântica de lease da FND-3; contrato da OPS-21 para as novas mutações (CA 18); autorização do proprietário e um resgate real para o CA 19.
- **É dependência de:** cutover da OPS-15 (FT-10, OW-11); FT-23 (precisa dos estados de exclusão do CA 15).
- **Choque de conjunto de escrita:** toca `financial-worker.mjs`, `reward-worker.mjs`, `helix-adapter.mjs`, `reconciliation.mjs` e `queue-repository.mjs`; serializar com as fatias 4-5 da OPS-21 (mesmo arquivo de repositório) e não rodar dois agentes `@dev` neles em paralelo.
- **Interação com a OPS-20:** quando a elegibilidade de devolução sair, a regra de cancelar na exclusão (CA 13) deve ser reconferida contra ela.

## Riscos

- **Dupla ação financeira:** uma nova tentativa que escreve quando o estado remoto já mudou. Mitigação: ler antes de escrever, reverificação somente de leitura (CAs 6-7), prova em PostgreSQL.
- **Cobrar espectadores sem atendimento** se a recompensa for excluída com resgates abertos. Mitigação: CAs 13-14, 17.
- **Causa-raiz só ~90% certa:** outra causa pode estar atrás do CA 1 (por exemplo, o resgate pertence a outra recompensa ou Client ID, ou atraso de consistência, NÃO VERIFICADO). Mitigação: teste de contrato com instâncias reais agora, checagem ao vivo (CA 19) depois; a política de 6 tentativas ainda protege contra as outras causas.
- **Limite de tentativas × proposta do arquiteto:** o arquiteto sugeriu 8 tentativas / 24 h; o proprietário escolheu 6. Os valores de espera ficam portanto com o `@architect`, considerando o teto existente de 1 h.
- **Comportamento oculto da Twitch:** painel e API diferem ao excluir com resgates pendentes; só o comportamento documentado da API é projetado.
- **Cegueira dos testes:** o defeito original passou porque os fakes eram objetos simples. Testes de contrato devem usar classes reais do Twurple.

## Complexidade (estimativa do `@sm`, a confirmar pelo `@architect`)

Escopo 4, integração 4, infraestrutura 3, conhecimento 3, risco 5 = **19 → COMPLEXA (GG)**. Prioridade **P1** (bloqueia a exclusão de fila e um fluxo de resgate correto; a fatia 1 é P0 pequena e não tem gate de banco nem de UX). Dificuldade **GG** no total; fatia 1 **P**, fatia 2 **G**, fatia 3 **G**.

## Valor de negócio

Os pontos de canal dos espectadores são liquidados de forma confiável; uma leitura falha da Twitch deixa de congelar uma fila em silêncio; o operador ganha uma saída limitada e auditável em vez de limpeza manual no painel da Twitch. Remove um bloqueio do cutover.

## Plano de testes (teste primeiro)

1. **Unitário (Vitest):** contrato do adaptador com instâncias reais de classes do Twurple (CAs 1-2); classificação de erros por `statusCode` (CA 4); tentativas, backoff e reverificação somente de leitura do worker com timers falsos (CAs 6-8); formato do log (CAs 5, 10).
2. **PostgreSQL (descartável, migrations reais, nunca SQLite nem mocks de Prisma):** contador de tentativas e `nextAttemptAt` persistidos através da expiração de lease; nenhum `confirmed` sem leitura positiva (CA 9); auditoria da resolução manual (CA 11); ordem e estados da exclusão para cada estado de resgate (CAs 13-17); migration, se houver (CA 12).
3. **E2E somente de navegador (Chromium, fixtures, sem Twitch):** Operações mostra o item bloqueante e as ações auditadas; a fila mostra exclusão pendente/bloqueada com o link para Operações; a exclusão retoma após a resolução.
4. **Twitch ao vivo:** somente o CA 19, sob autorização do proprietário, registrado à parte.
5. **Gates antes de fechar:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static` (somente OpenGrep; registrar comando, resultado e achados aceitos). O `@qa` executa os gates finais independentes e emite o veredito antes de o `@devops` commitar.

## Gates de planejamento antes da implementação

- [x] Pesquisa do `@analyst`: causa-raiz e comportamento da Twitch ([redemption-sync-research.md](../OPS-15/redemption-sync-research.md), 2026-10-26; SUFICIENTE; as checagens ao vivo são confirmação, não mais pesquisa).
- [x] Revisão e proposta de política de recuperação do `@architect` ([panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md), 2026-10-26, fatia S-F).
- [x] Decisões do proprietário registradas (2026-10-27).
- [ ] Validação do `@po` (10 pontos) e GO.
- [ ] Confirmação do `@architect` sobre: valores de espera das 6 tentativas, nomes de estados, regra de cancelar na exclusão, interação com OPS-21 e OPS-20.
- [ ] Resposta do `@data-engineer` sobre a persistência do contador, do `unknownSince` e da classe do motivo (CA 12); coordena toda migration.
- [ ] Plano de testes do `@qa` (PostgreSQL isolado, instâncias reais do Twurple, separação de evidências).
- [ ] O `@devops` cria a issue no GitHub (issue-mãe desta story, com as fatias como sub-issues sob demanda; bloqueia o cutover da OPS-15 como dependência nativa); sem comentários em issues.
- [ ] Proprietário: autorizar e agendar a checagem ao vivo (OW-16).

## Nota de UX

Por instrução do proprietário (2026-10-27), a nota mínima 9,0 do `@ux-design-expert` é obrigatória para a story de tempo real (OPS-23) e para a fatia de navegação (FT-23), não para esta. Esta story reaproveita as ações e estados existentes de Operações. Se acrescentar ou mudar texto visível (por exemplo "exclusão bloqueada: N operações precisam de revisão"), o `@po` deve decidir na validação se a regra de UX do projeto exige revisão antes de o texto sair; isso não é decidido aqui.

## Perguntas abertas (para `@po` / `@architect` / proprietário)

1. A ação "cancelar exclusão" (terceira decisão do operador no desenho do arquiteto) é desejada? Não consta nas decisões do proprietário, por isso ficou de fora; o `@po` decide.
2. Valores exatos de espera e se "6 tentativas" conta a primeira (assumido que sim: 6 no total).
3. A story pode chegar a Done só com evidência de PostgreSQL e de classes reais, com o CA 19 como aceite separado do proprietário, ou a evidência ao vivo deve preceder o Done? Recomendado: aceite separado do proprietário, registrado.

## Definição de pronto

- CAs 1-18 com evidência Red-first registrada por classe; o CA 19 é executado com o proprietário ou dispensado explicitamente por ele.
- Todos os quality gates verdes; veredito do `@qa` registrado; File List e checklists atualizados em inglês e pt-BR.
- Nenhum `unknown` vira confirmação sem leitura remota positiva.

## Validação de rascunho do SM (story-draft-checklist, 2026-10-27)

1. Objetivo e contexto: claros (problema, decisões do proprietário, relação com a OPS-15). PASSA.
2. Orientação técnica: arquivos, comportamento da classe do Twurple e formato dos erros nomeados; persistência deixada ao `@data-engineer` por desenho. PASSA.
3. Referências: apontam seções específicas da pesquisa e da revisão do arquiteto. PASSA.
4. Autossuficiência: causa-raiz, casos de borda (404, 401, 429, já aplicado) e premissas declarados. PASSA.
5. Testes: classes separadas; testes de contrato com PostgreSQL e classes reais exigidos; checagem ao vivo isolada. PASSA.
6. Análise estática: `npm run review:static` registrado; dono dos achados = `@dev`, verificado pelo `@qa`. PASSA.
- Resultado: pronta para o `@po`. Nenhum requisito foi inventado; o que vai além das decisões do proprietário vem da revisão do arquiteto citada e está marcado como tal, com perguntas abertas listadas.

## File List

- `docs/stories/OPS-22/story.md` (novo)
- `docs/pt-BR/stories/OPS-22/story.md` (novo)
- `docs/stories.md` (entrada no índice)
- `docs/pt-BR/stories.md` (entrada no índice)

Os arquivos de implementação serão listados aqui pelo `@dev` após os gates.

### Fatia 1 — FT-24 (#82), `@dev` 2026-10-27

- `apps/api/src/twitch/http-error.mjs` (novo: `twitchHttpError` compartilhada, `statusCode ?? status` + `retryAfterSeconds`)
- `apps/api/src/twitch/helix-adapter.mjs` (status do resgate pelos dados brutos do Twurple via `getRawData`; a sondagem de elegibilidade usa a função compartilhada)
- `apps/api/src/outbox/financial-worker.mjs` (401/403/404/429/5xx classificados pela função compartilhada)
- `apps/api/src/twitch/reconciliation.mjs` (função compartilhada para 404; `httpStatus` nas issues remotas; `RECONCILIATION_ISSUE_CODES` exportado)
- `apps/api/src/twitch/integration.mjs` (linha de log estruturada `twitch_reconciliation_degraded`)
- `apps/api/src/observability/structured-logger.mjs` (detalhes seguros `trigger`, `reason`, `issueCount`, `issueCounts`, `httpStatusCounts`)
- `apps/api/src/runtime.mjs`, `apps/api/src/server.mjs` (repassam `logEvent` à integração)
- `package.json`, `package-lock.json` (`@twurple/common` 8.2.0 fixado como dependência direta; `@twurple/api-call` 8.2.0 fixado como dependência de desenvolvimento; ambos já estavam instalados de forma transitiva nessa versão)
- `tests/helpers/twurple-real-instances.mjs` (novo: o helper único que monta instâncias reais do Twurple)
- `tests/unit/twitch-redemption-contract.test.js` (novo), `tests/unit/twitch-http-error.test.js` (novo)
- `tests/unit/twitch-integration.test.js`, `tests/unit/structured-logger.test.js`, `tests/unit/runtime-composition.test.js` (casos novos)
- `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`

## Change Log

- 2026-10-27 — `@sm` (River): story redigida a partir da evidência D-5/D-6, da pesquisa do `@analyst`, da revisão do `@architect` e das decisões do proprietário de 2026-10-27. Status Rascunho.
- 2026-10-27 — `@po` (Pax): `*validate-story-draft` 10 pontos = 9,5/10, **GO**. Issue #80 (FT-24 = #82) registrada. Status Rascunho → Ready (Pronta). Condições e decisões em [po-validation.md](po-validation.md): "cancelar exclusão" fica fora; cancelar na exclusão (CA 13) validado; a FT-24 pode começar agora; FT-25/FT-26 só após os gates do `@architect` e do `@data-engineer`; UX dos textos visíveis novos pendente de decisão do proprietário.
- 2026-10-27 — `@dev` (Dex): fatia 1 FT-24 (#82) implementada com teste primeiro (CAs 1-5). Red: 15 casos novos falharam no código antigo (`UNFULFILLED` lido como `UNKNOWN`; 401/403/404/429 reais do Twurple tratados como transitórios; nenhuma linha de log para `degraded`), além da falha por módulo ausente da função compartilhada. Green: 136/136 nos 9 arquivos unitários afetados; `tests/integration/queue-repository.test.js` 156/156 em PostgreSQL descartável; suíte completa 165 arquivos / 1621 testes; lint, typecheck, `review:static` (0 achados) e `git diff --check` passam. Política de retentativa, estados de exclusão e schema inalterados. Status da story mantido por instrução do orquestrador (fatias 2-3 pendentes); o veredito final é do `@qa`.
