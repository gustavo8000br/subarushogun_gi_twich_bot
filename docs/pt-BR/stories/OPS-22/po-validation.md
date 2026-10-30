# OPS-22 — Validação do `@po` (`*validate-story-draft`, 10 pontos)

[English](../../../stories/OPS-22/po-validation.md)

**Validador:** `@po` (Pax) — **Data:** 2026-10-27 — **Modo:** YOLO (autônomo; decisões marcadas `[AUTO-DECISION]`)
**Story:** [story.md](story.md) — **Issue:** #80 (mãe); fatia 1 FT-24 = #82; issues de FT-25/FT-26 just-in-time.
**Fontes conferidas:** `.claude/rules/story-lifecycle.md` (10 pontos), `.aiox-core/development/tasks/validate-next-story.md`, [redemption-sync-research.md](../OPS-15/redemption-sync-research.md), [panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md) seções 5-7, [resultados da bateria ao vivo](../OPS-15/live-battery-2026-10-26-results.md), `docs/pt-BR/process/backlog-inventory.md` (FT-24..FT-26, OW-16). `architecture-decisions.md` e `data-review.md` estavam sendo escritos por outros agentes durante esta validação e não foram usados como entrada.

## Veredito

**GO — 9,5/10.** Status: **Ready** (GO + issue #80). Ready significa "validada para planejamento"; a implementação de cada fatia ainda segue os gates de fatia abaixo.

## Notas

| # | Ponto | Nota | Evidência / observação |
|---|---|---|---|
| 1 | Título claro e objetivo | 1,0 | Nomeia os dois resultados (recuperar `unknown`, exclusão segura de fila). |
| 2 | Descrição completa | 1,0 | Evidência de D-5/D-6, causa raiz VERIFICADA (~90%), defeitos colaterais, `unknown` terminal, bloqueio da exclusão. |
| 3 | CAs testáveis | 1,0 | 19 CAs Dado/Quando/Então, classe de evidência por CA, Red-first, asserções em PostgreSQL (CA 9, 17). |
| 4 | Escopo dentro/fora | 1,0 | Três fatias; fora: navegação da FT-23, regras de reembolso da OPS-20, laço periódico, migração do banco de dev. |
| 5 | Dependências | 1,0 | `@data-engineer` (CA 12), contrato OPS-21 (CA 18), OW-16, conflito de write set com as fatias 4-5 da OPS-21. |
| 6 | Complexidade | 1,0 | 19 → COMPLEX/GG, tamanhos por fatia; `@architect` confirma. |
| 7 | Valor de negócio | 1,0 | Pontos das pessoas espectadoras liquidados; bloqueio do cutover removido. |
| 8 | Riscos | 1,0 | Ação financeira dupla, cobrança sem atendimento, 90% de confiança, cegueira dos testes. |
| 9 | Definição de pronto | 1,0 | CAs 1-18 por classe; CA 19 executado ou dispensado pelo proprietário; "nenhum `unknown` vira confirmação". |
| 10 | Alinhamento com fontes/decisões do proprietário | 0,5 | Bate com as decisões (6 tentativas, resolução manual, estados de exclusão para a FT-23). Desconto: caso de borda do CA 13 abaixo e a questão da regra de UX (ponto 2 do `@sm`) ficaram em aberto. |

## Decisões sobre os pontos do `@sm`

1. **Revisão de UX dos textos visíveis novos (ponto 2 do `@sm`).** O proprietário dispensou a OPS-22 do gate obrigatório de 9,0, mas a regra do projeto (AGENTS.md / CLAUDE.md, "UX e pesquisa") exige plano e revisão para toda mudança que afete pessoas usuárias. `[AUTO-DECISION]` Recomendação → **sem gate de UX separado para a OPS-22; os textos e estados visíveis novos da FT-25/FT-26 ("exclusão pendente", "exclusão bloqueada: N operações precisam de revisão", a contagem de bloqueio em Operações e o texto da resolução manual) entram no escopo do plano do `@ux-design-expert` da FT-23 (nota ≥ 9,0) e precisam ser aprovados lá antes de a parte de interface da FT-25/FT-26 ir ao ar** (motivo: mesmas telas e mesmo canal de resultado da FT-23; uma revisão, nenhum gate novo; a revisão de arquitetura já listava "UX para o caminho manual" na S-F). A FT-24 não tem texto visível (só logs) e não é afetada. **Decisão do proprietário pendente** (confirmar ou dispensar explicitamente).
2. **"Cancelar exclusão" (ponto 3 do `@sm`, pergunta aberta 1).** `[AUTO-DECISION]` → **FORA da OPS-22** (motivo: não está nas decisões do proprietário; acrescenta uma transição reversa — despausar a recompensa, restaurar a fila — com casos de borda financeiros próprios; "tentar agora" e a resolução manual auditada já garantem uma saída). Se o proprietário quiser, o `@sm` cria um item de backlog ligado à OPS-22; nenhuma mudança na story agora.
3. **Cancelar (reembolsar), não atender, os resgates abertos na exclusão (ponto 4 do `@sm`, CA 13).** **Validado.** É o que o diálogo do painel promete, o que a rodada ao vivo esperava, e o comportamento documentado do Delete Custom Reward (FULFILLED implícito) ficaria com os pontos das pessoas sem atendê-las. **Esclarecimento exigido antes do início da FT-26 (não bloqueia FT-24/FT-25):** o CA 13 deve dizer que "resgate aberto" significa `UNFULFILLED` **sem tarefa financeira em andamento**; um resgate cujo `redemption.fulfill` (atendimento já iniciado) está pendente, em nova tentativa ou `unknown` é regido pelo CA 14 (bloqueia a exclusão) e **nunca** é cancelado pelo fluxo de exclusão, para que uma pessoa já atendida não seja reembolsada por engano. O `@sm` acrescenta essa frase ao CA 13 (en e pt-BR); o `@architect` confirma na máquina de estados.
4. **Contagem de tentativas (pergunta aberta 2).** "6 tentativas no total, incluindo a primeira" é coerente com a decisão do proprietário; o `@architect` fixa os tempos de espera (teto de 1 h).
5. **Done vs evidência ao vivo (pergunta aberta 3).** `[AUTO-DECISION]` → **Done com evidência de PostgreSQL e de classes reais; o CA 19 é um aceite separado do proprietário registrado na story** (motivo: a OW-16 depende da conta e da agenda do proprietário; a DoD já permite dispensa explícita).

## Prontidão das fatias

| Fatia | Issue | Pode ir ao `@dev` agora? | Gates restantes |
|---|---|---|---|
| FT-24 (fatia 1, CAs 1-5) | #82 | **SIM** — P0, ordem do proprietário "recuperação financeira primeiro" | Nenhum além de Red-first e `@qa`. Write set: `twitch/helix-adapter`, `twitch/reconciliation`, a função compartilhada de classificação de erro usada pelos workers. Não rodar em paralelo com outro `@dev` nos mesmos arquivos. |
| FT-25 (fatia 2, CAs 6-12) | a criar (just-in-time) | NÃO | Tempos de espera/nomes de estado do `@architect`; resposta do `@data-engineer` ao CA 12; textos de UX via plano da FT-23 (decisão acima); issue. |
| FT-26 (fatia 3, CAs 13-18) | a criar (just-in-time) | NÃO | FT-25 integrada; esclarecimento do CA 13; contrato de idempotência da OPS-21; issue. |

## Correções exigidas

1. (Antes da FT-26) CA 13: acrescentar o esclarecimento "sem tarefa financeira em andamento" acima — `@sm`, en e pt-BR.
2. (Registro) As caixas de gate "validação do `@po` (10 pontos) e GO" e "`@devops` cria a issue" podem ser marcadas pelo `@sm` (esta validação ficou restrita aos campos Status e Change Log).
3. (Registro) Inventário e quadro: issue da FT-24 = #82, mãe da OPS-22 = #80; cartão da FT-24 de "Bloqueado / Planejamento @po" para "Pronto / Implementação @dev" — `@sm` (inventário) e `@devops` (quadro).

## Decisões do proprietário (situação atualizada em 2026-10-27, ver o adendo abaixo)

- **OD-22-1 — DECIDIDA (proprietário, 2026-10-27):** os textos visíveis novos da OPS-22 entram no plano de UX da FT-23 (nota ≥ 9,0), sem gate próprio. Coincide com a recomendação.
- **OD-22-2 — DECIDIDA (proprietário, 2026-10-27):** "cancelar exclusão" **ENTRA** na OPS-22 como fatia FT-36. Revoga a recomendação do `@po` (a decisão 2 acima fica substituída).
- **OD-22-3 — DECIDIDA (proprietário, 2026-10-27):** a OPS-22 pode chegar a Done sem evidência ao vivo; o CA 19 é um aceite separado do proprietário. Coincide com a recomendação. *(Estava PENDENTE até 2026-10-27.)*
- **OW-16 — AUTORIZADA (proprietário, 2026-10-27):** a verificação ao vivo está autorizada; ela roda como validação ao vivo automatizada depois da entrega da FT-25 e da FT-26 (ainda sem data). *(Estava PENDENTE até 2026-10-27.)*

## Anexo — fatias FT-21 e FT-22 da OPS-15 (validadas na mesma sessão)

Estas fatias pertencem à OPS-15, não à OPS-22; ficam registradas aqui só porque esta validação foi limitada aos arquivos da OPS-22/23/24. Hoje seus CAs vivem na linha do inventário e na seção 4 da revisão de arquitetura — **não na story da OPS-15**.

| Fatia | Issue | Veredito | Pode ir ao `@dev` agora? | O que o `@sm` deve acrescentar |
|---|---|---|---|---|
| FT-21 (D-1, `!<fila> limpar CONFIRMAR`) | #89 | **GO** — testável, XS, sem gate de banco/UX | **SIM** | Uma seção de fatia "FT-21" na OPS-15 (en e pt-BR) com: (1) Dado `limpar`/`clear` seguido do rótulo de confirmação localizado em qualquer caixa ou acento (`CONFIRMAR`, `Confirmar`, `confirmár`, `confirm` em `en`), quando tratado, então `clearConfirmation.confirm` é chamado exatamente uma vez; (2) minúsculas continuam funcionando; (3) qualquer outra palavra continua `INVALID_SYNTAX` e nada é limpo; (4) o handler usa o resultado do parser (`confirm: true` ou `args.length === 1`), nunca comparação literal; testes Red de parser e handler; fonte LB-35. |
| FT-22 (D-2, `(posição ?)`) | #90 | **GO condicional** | **SIM, após a confirmação escrita do `@data-engineer`** de que o JSON `outbox.payload` guarda `{ previousPosition }` sem DDL (o arquiteto não espera nenhuma) | Uma seção de fatia "FT-22" na OPS-15 com: (1) chamar uma entrada em espera na posição N pelo painel ou pelo chat grava `{ previousPosition: N }` no payload da outbox e o aviso mostra `posição N` (a LB-29 esperava `1`); (2) o worker lê o valor da tarefa reivindicada, não `entry.callPosition`; (3) uma linha legada com `payload: {}` recorre ao `previousPosition` da auditoria; (4) evidência: teste unitário do worker mais integração em PostgreSQL com migrations reais. |

Nota de write set: FT-21 e FT-22 tocam `commands/chat-handler.mjs` (linhas 266 e 207-208) — serializar (FT-21 primeiro, é menor) ou entregar as duas a um único `@dev`. A FT-24 não compartilha arquivo com a FT-21; pode rodar em paralelo a ela. O inventário ainda mostra #69 para as duas: o `@sm` atualiza para #89 e #90.

## Status final

Rascunho → **Ready (Pronta)** (GO 9,5/10, issue #80). Registrado no Change Log da story (en e pt-BR).

## Adendo 2026-10-27 — revalidação do escopo ampliado ("cancelar exclusão", FT-36)

**Validador:** `@po` (Pax), YOLO. **Entradas:** decisões do proprietário de 2026-10-27 repassadas pelo `@aiox-master` (também em `docs/session-handoff.md`), [sm-pending-edits.md](sm-pending-edits.md) E16, a linha da FT-36 no inventário, [architecture-decisions.md](architecture-decisions.md) e [data-review.md](data-review.md) (ambos escritos para o escopo anterior; nenhum cobre a transição reversa). O texto da story está sendo editado pelo `@sm` (E1-E17) e não foi alterado pelo `@po`.

**Verificação de contagens:** este arquivo não contém contagem do backlog nem do quadro, então não havia número desatualizado a corrigir. Referência para os outros documentos: inventário com **93 itens**, quadro com **95 cards** (números repassados pelo `@aiox-master` em 2026-10-27; responsabilidade do `@sm`/`@devops`).

**A nota 9,5/10 vale apenas para o escopo anterior (fatias FT-24..FT-26).** Para o escopo ampliado o veredito é **GO provisório — 7,5/10** (o status continua **Ready**; a prontidão da FT-24..FT-26 não muda):

| # | Ponto | Provisório | Motivo do desconto |
|---|---|---|---|
| 1, 2, 7 | Título, descrição, valor | 1,0 cada | Sem mudança. |
| 3 | CAs testáveis | 0,5 | O CA da FT-36 existe só como proposta (E16), ainda não está na story; a corrida com um `reward.delete` em andamento não está especificada. |
| 4 | Escopo IN/OUT | 0,5 | Até a E16 ser aplicada, a story ainda trata "cancelar exclusão" como pergunta aberta / fora do escopo. |
| 5 | Dependências | 1,0 | FT-26 antes (mesmos arquivos, estados de exclusão); contrato da OPS-21; `@architect`, `@data-engineer` e plano de UX da FT-23 nomeados. |
| 6 | Complexidade | 0,5 | 19 COMPLEXA foi pontuada para três fatias; o `@architect` precisa repontuar com a quarta fatia. |
| 8 | Riscos | 0,5 | Os riscos da transição reversa (reabrir uma recompensa que a Twitch já excluiu, "desfazer" uma devolução, uma reversão de pausa que não pode ser verificada) ainda não estão na seção de Riscos. |
| 9 | Definição de pronto | 0,5 | A DoD ainda não nomeia a evidência da FT-36 (PostgreSQL por estado: pendente, bloqueada, `reward.delete` em andamento, excluída). |
| 10 | Alinhamento com as decisões do proprietário | 1,0 | OD-22-1 e OD-22-2 agora decididas e refletidas. |

**Texto do CA da E16 (responsabilidade do `@po`): aceito como base**, com dois acréscimos obrigatórios que o `@sm` inclui ao aplicar a E16 (en e pt-BR): (a) **Dado** um `reward.delete` reivindicado, em andamento, em `retry` ou `unknown`, **quando** a pessoa operadora pedir o cancelamento, **então** o cancelamento é recusado com um `code` enumerado (ou aguarda uma leitura remota positiva) e a fila nunca é reaberta enquanto a existência da recompensa na Twitch não estiver comprovada; (b) **Dado** que a reversão da pausa não pode ser verificada por leitura, **então** a fila fica em um estado bloqueado visível, com ação para a pessoa operadora, e nunca é reaberta como se a recompensa estivesse ativa. O `@architect` pode refinar o mecanismo; a regra "nada é presumido sem leitura remota positiva" não é negociável.

**Antes de a FT-36 poder ir ao `@dev` (e antes de o `@po` dar a nota final do escopo ampliado):**

1. `@architect` — desenhar a transição reversa (`deleting` → reaberta), a corrida com uma chamada `reward.delete`/DELETE em andamento, o destino das tarefas de cancelamento já `confirmed`/`pending`, os valores enumerados de `code`, e repontuar a complexidade da OPS-22.
2. `@data-engineer` — transições e plano de testes em PostgreSQL para cada estado; confirmar por escrito "sem DDL" (esperado); verificar o cancelamento sob lease das tarefas `reward.delete`/pausa pendentes e que resgates cancelados nunca voltam.
3. `@ux-design-expert` — a ação "cancelar exclusão", as mensagens de recusa/bloqueio e a confirmação entram no plano da FT-23 (≥ 9,0), conforme a OD-22-1.
4. `@sm` — aplicar a E16 com os acréscimos (a) e (b) e atualizar Escopo, Complexidade ("a reavaliar"), Riscos e DoD.
5. `@devops` — issue da FT-36 just-in-time (sub-issue da #80; só o corpo, sem comentários).
6. `@qa` — plano de testes da FT-36.

**Prontidão das fatias, atualizada:** a FT-24 (#82) foi **entregue** test-first e comitada localmente (`@qa` CONCERNS 8,6 código / 8,4 docs, sem bloqueios, [qa-gate-2026-10-27.md](qa-gate-2026-10-27.md); sem push). FT-25 e FT-26 sem mudança (gates na tabela acima; a FT-25 inclui a correção do 404 em `reward-worker.mjs:316` do achado C-1 do QA, conforme o handoff). **FT-36: NÃO PRONTA** (itens 1-6 acima). As fatias FT-21 e FT-22 do anexo da OPS-15 seguem a ordem do proprietário: FT-21 e depois FT-22, em sequência (mesmo arquivo). Nota para o `@dev`: com a FT-24 entregue, a transição `Ready → InProgress` pertence ao Change Log da OPS-22 (essa edição é do `@dev`/`@sm`, não desta validação).

## Adendo 2026-10-28 — decisões do proprietário de 2026-10-27 registradas (`@po`, Pax)

**Resolvidas (proprietário, 2026-10-27, repassadas pelo `@aiox-master`):**

- **OD-22-3 — RESOLVIDA:** a OPS-22 pode chegar a Done sem evidência ao vivo; o CA 19 passa a ser um aceite separado do proprietário.
- **OW-16 — RESOLVIDA (autorizada):** a verificação ao vivo está autorizada e vai rodar como validação ao vivo automatizada depois da entrega da FT-25 e da FT-26.

**Ainda pendente (não muda com essas decisões):**

- **Revalidação do escopo ampliado ("cancelar exclusão", FT-36): PENDENTE.** O texto da story já traz o CA 21 com os acréscimos (a) e (b), o risco da transição reversa, a complexidade "a reavaliar" e o CA 21 no plano de testes, então os pontos 3, 4 e 8 da tabela provisória devem subir; o `@po` **não** dá a nota final ainda porque a revisão e a repontuação de complexidade do `@architect`, a revisão do `@data-engineer` e o plano de testes do `@qa` para a FT-36 continuam abertos (caixas dos gates de planejamento ainda desmarcadas). **FT-36: NÃO PRONTA.** O GO provisório 7,5/10 continua valendo para o escopo ampliado; o 9,5/10 continua valendo para a FT-24..FT-26.
- **Edição exigida do `@sm` (dono da story), en e pt-BR:** a "Definição de pronto" ainda diz que o CA 19 "é executado com o proprietário ou dispensado explicitamente por ele". Alinhar com a OD-22-3: o Done não exige o CA 19; o CA 19 fica registrado como aceite separado do proprietário (execução ao vivo automatizada depois da FT-25/FT-26, OW-16). O `@po` não editou a story (write set desta sessão).

Sem mudança de status (a OPS-22 continua **Ready**; FT-24 entregue).

## Adendo 2026-10-30 — revalidação do pacote único (FT-25 + FT-26 + FT-36, com a FT-23) (`@po`, Pax)

**Validador:** `@po` (Pax), YOLO; o proprietário delegou ao Orion toda recomendação, e cada ponto abaixo é decidido com a razão (`[AUTO-DECISION]`). **Entradas:** [story.md](story.md) (ciclo único, proprietário 2026-10-30), [architecture-decisions.md](architecture-decisions.md), [data-review.md](data-review.md), [backlog-inventory](../../process/backlog-inventory.md) (linhas FT-23, FT-25, FT-26, FT-36), [story da OPS-23](../OPS-23/story.md) (dependência da FT-28). O status da story continua **Ready** ("validada para planejamento"); nada foi movido para InProgress nem mudou nos CAs.

### Veredito

- **Escopo e CAs: GO, 8,5/10** (era 7,5 provisório para o escopo ampliado). Os CAs 6-18 e 20-22 são testáveis e coerentes com as decisões do proprietário; o CA 21 traz os acréscimos (a) e (b); a decisão de ciclo único está registrada; a correção do 404 em `reward-worker.mjs:316` está explícita no CA 22 (FT-26). Deduções: complexidade sem reavaliação para a quarta fatia (-0,5), itens abertos 1, 2, 4 e 5 sem decisão (-0,5), FT-23 sem CAs em story e sem issue própria (-0,5).
- **Despacho do `@dev`: NO-GO.** Quatro gates de planejamento seguem abertos (abaixo). O pacote só começa quando todas as "Correções obrigatórias" estiverem fechadas, na ordem dada. O status fica Ready; não é alterado.

### Estado de cada gate de planejamento

| Gate | Estado | Cobre | O que falta / quem |
|---|---|---|---|
| Pesquisa do `@analyst` | FECHADO (SUFICIENTE) | causa raiz, comportamento do Delete Custom Reward | Nada. Não pesquisar de novo (regra de ouro). |
| `@architect` | **FECHADO (2026-10-30, [architect-review-ft36.md](architect-review-ft36.md))** — FT-36 revisada (F15-F24, D-36-1..8); itens abertos 1 (`attempts_exhausted`), 2 (`cycleStartAttempts`, ciclo novo de 6, `financial.operation_retry_requested`), 4 (`resolved_manual` não conta) e 5 (manter `twitch_reconciliation_degraded`) decididos; complexidade 20 COMPLEX (FT-36 M); ordem FT-25 → FT-26 → FT-36 → FT-23; FT-23 desacoplada da FT-28 (D-23-1). Era PARCIAL. | FT-24, FT-25, FT-26 (ARCH §1-§6, F1-F14); FT-36 e o pacote (architect-review-ft36) | Nada para o `@architect`. Pendências repassadas na nota: redação dos AC 21/AC 8/AC 20 pelo `@po`, complexidade e ACs da FT-23 pelo `@sm`, confirmação por escrito do `@data-engineer` (seção 6 da nota). |
| `@data-engineer` | **FECHADO (2026-10-30, [ft-36-data-engineer-confirmation.md](ft-36-data-engineer-confirmation.md))** — seção 6 da nota do arquiteto confirmada (2 CONFIRMADO, 5 CONFIRMADO COM CONDIÇÃO, 0 REFUTADO); **sem DDL** para a FT-36 e para `payload.cycleStartAttempts`; F18 confirmado (`queue-repository.mjs:1683-1687`) e corrigido reaproveitando a linha única de `reward.delete`; catálogo de auditoria final (`actorId` nos três eventos de cancelamento; `financial.operation_retry_requested`); DATA C3 (ciclo novo de 6, devolução no 401) e C6 (`resolved_manual` não contado) e teste 3 da DATA atualizados no [data-review.md](data-review.md). Estava PARCIAL. | FT-24 a FT-26 e FT-36, sem migração | Nada para o `@data-engineer`. Condições repassadas: o F21 muda duas fixtures testadas (`qra-postgres-fixtures.test.js:457-528`) e torna o cancelamento mais estrito para linhas existentes (`@po`/`@architect` devem reconhecer); testes T36-9b, T36-14, T36-15, T-C3 e um registro de `EXPLAIN` acrescentados para o `@qa`. |
| `@ux-design-expert` | ABERTO | nenhum | Não existe plano único FT-23 + FT-36. Um plano, score >= 9,0, cobrindo: navegação e `role="status"` persistente após criar/excluir (D-3/D-4), "exclusão pendente/bloqueada: N operações", a contagem de bloqueios em Operações, o texto da resolução manual, a confirmação destrutiva e as mensagens de recusa/bloqueio de "cancelar exclusão", e os textos da FT-25. Distinguir revisão estática de validação em navegador/tecnologia assistiva. |
| Plano de testes do `@qa` | ABERTO | nenhum | Plano com classes de teste separadas: unitário com instâncias reais do Twurple, PostgreSQL isolado com migrations reais (os 12 testes da DATA §4, ordem de exclusão por estado de resgate, cancelar exclusão por estado: pendente, bloqueada, `reward.delete` em voo, excluída), E2E só de navegador com fixtures (após o texto aprovado) e a lista de grupos para o gate único do `@qa` do pacote. |
| Issues no GitHub | FECHADO para FT-25/26/36 (#98, #99, #100); **ABERTO para a FT-23** | — | A FT-23 só referencia a #69 (mãe da OPS-15). Precedente (FT-21 = #89, FT-22 = #90, FT-24 = #82): cada fatia tem sua sub-issue. O `@devops` cria a issue da FT-23 (só o corpo, sem comentários) antes da implementação. |
| Proprietário (teste ao vivo OW-16) | AUTORIZADO, não agendado | CA 19 | Não bloqueia o Done (OD-22-3). |

### Correções obrigatórias (por agente)

1. `@ux-design-expert`: plano único FT-23 + FT-36, >= 9,0, registrado na story da OPS-15 (FT-23) e referenciado na OPS-22. Sem ele, as partes de UI não começam; o trabalho de API e worker de `@architect`/`@data-engineer`/`@dev` pode ser planejado nesse meio-tempo.
2. `@architect`: revisão da FT-36 e reavaliação da complexidade, registradas em `architecture-decisions.md` (en e pt-BR); decidir os itens abertos 1, 2 (mecanismo), 4 e 5. Recomendação do `@po` para o item 5 (não é decisão desta validação): manter a linha `twitch_reconciliation_degraded` entregue (códigos e contagens, já verificada pelo QA), salvo se o arquiteto mostrar lacuna no CA 5; para o item 4: `resolved_manual` não conta em `blockingOperations` quando o novo re-list pós-resolução é a guarda.
3. `@data-engineer`: confirmação por escrito da FT-36 (sem DDL esperado), atualização da DATA C3, nomes do catálogo de auditoria dos itens 1-2.
4. `@qa`: plano de testes do pacote inteiro (classes separadas, grupos listados), registrado como arquivo na pasta da story.
5. `@devops`: issue da FT-23 (sub-issue da #69) e os corpos de #98, #99, #100 citando o ciclo único (já é o plano).
6. `@architect` (ordem, bloqueante): o inventário diz que a FT-23 depende da **FT-28** (provider compartilhado, OPS-23) e da FT-26. A FT-28 não está neste pacote; portanto "FT-23 no mesmo ciclo" não é totalmente verdade até a FT-28 entrar. Decidir: ou a FT-28 vai primeiro, ou o ciclo entrega FT-25/26/36 (API, worker, Operações) e a FT-23 segue logo após a FT-28 na mesma janela do `@qa`. Até a decisão, tratar a FT-23 como "viaja com o pacote, condicionada à FT-28".
7. `@sm` (bookkeeping, sem mudar CA): levar os CAs da FT-23 para uma story (hoje só estão na linha do inventário, como FT-21/FT-22); corrigir as linhas FT-25/FT-26/FT-36 do inventário cuja coluna "issue" ainda diz "issue to create" (#98, #99, #100); marcar os gates acima só quando fechados. A caixa de revalidação do `@po` fica desmarcada até fechar os itens 1-4 e 6; depois o `@po` emite a nota final em um adendo curto.

## Adendo 2026-10-30 — outras decisões pedidas na mesma ordem (`@po`, Pax)

1. **A FT-07 (#87) é satisfeita pela FT-40 (#96): DOBRAR, confirmado.** Evidência (classes separadas): classe runtime/integração, `tests/integration/compose-runtime.test.js:464` ("discovers complete community catalogs after image build without restarting the API") roda em imagem descartável construída da árvore de trabalho: os catálogos do diretório de comunidade gerenciado pelo host são adicionados depois do build, a API não reinicia, o idioma `de` aparece em painel, setup, chat (inclusive uma chave de plural) e overlay, o idioma muda e a projeção do overlay atualiza dentro da janela de cache de 5 s. Resultado 7/7 em `cutover-wave-2.md` (80,3 s) e 7/7 em [qa-gate-2026-10-30.md](../OPS-15/qa-gate-2026-10-30.md) (71 s, commit da Onda 2 `ec12ae0`; `@qa` CONCERNS 9,3). As partes unitárias do texto da FT-07 (arquivos inválidos, chaves duplicadas) são cobertas por testes unitários (`localization-catalog.test.js`, `localization-byte-catalog.test.js`), não pelo Compose, e não são reivindicadas como prova de runtime. Limites: só Linux/Docker; sem OBS/CEF nativo, Windows ou macOS. Razão: o CA da FT-07 é "prova em runtime de catálogo instalado após o build", e é exatamente este teste; manter separado duplicaria a mesma evidência. Próximo passo: o `@devops` edita os corpos de #85 e #87 citando a #96 e não fecha nada; **fechar #85/#87 exige o OK do proprietário** após o merge.
2. **FT-44 (timeout e `AbortSignal` nas leituras): entra na OPS-23 como critério de aceite da fatia 3 (FT-29, o fallback de polling), entregue no ciclo FT-28 + FT-29; sem story própria.** Razão: o fallback não é "limitado" sem timeout de leitura, ambos tocam o mesmo cliente (`lib/api/client.mjs`, `loadPanelSnapshot`), a severidade é baixa a média e uma story nova adicionaria um ciclo inteiro de gates para uma função. Esboço para o `@sm` redigir (en e pt-BR, o `@po` aprova o texto): *Dado* que a API aceita a conexão e nunca responde, *quando* o painel lê um snapshot ou faz polling, *então* cada leitura termina em um timeout limitado via `AbortSignal` e o painel mostra um estado seguro, local e repetível em vez de um carregamento sem fim; *Dada* uma mutação, *então* o timeout nunca a transforma em falha nem em nova tentativa cega (o caminho de resultado incerto da OPS-21 permanece); *Dado* que uma das cinco leituras do snapshot expira, *então* o `loadPanelSnapshot` não espera sem limite pelas outras. O `@architect` fixa o valor do timeout e a política de fallback; o `@ux-design-expert` (>= 9,0) só se o texto visível mudar (muda: o texto do estado repetível entra no plano de UX da OPS-23). O status e os CAs existentes da OPS-23 ficam como estão até o `@sm` aplicar o CA.
3. **TS-17 (job de CI dos 12 scripts `*-browser-only`): rascunho de escopo APROVADO.** Escopo: todo script `*-browser-only` roda em um workflow de CI, um resultado vermelho falha o build, o teste de contrato do workflow fixa o job e ele é estável em execuções repetidas (o defeito de harness M-2 foi corrigido em `8bb05d8`). Condições: story própria redigida pelo `@sm`; o `@architect` decide o formato do job, o Chrome no CI e o tempo de execução (cerca de 10 s cada); sem segredos e sem Twitch; o arquivo de workflow é revisado e publicado pelo `@devops` (autoridade de CI/CD); `actionlint` continua verde; script instável é investigado, nunca repetido até passar; passa pelo `@qa`. Razão: a M-2 ficou quebrada em 4 de 4 execuções sem alerta, então a falta de alerta é o defeito.
4. **OPS-14 (#65): RECRIAR a story a partir do corpo da issue, sem inventar.** Razão: o proprietário ofereceu "localizar ou recriar"; o arquivo não está neste checkout, na `main` nem no remoto (inventário e handoff), o corpo da issue já traz os CAs e a fonte da verdade é a issue mais o roadmap, e sem o arquivo não há Ready (sem story, sem GO). O que o `@sm` deve escrever (en e pt-BR, `docs/stories/OPS-14/story.md`, status Draft; o `@po` valida depois; depois a absorção da OPS-16 / ST-08): (a) mensagem padrão de chamada para filas manuais e de pontos do canal criadas sem mensagem customizada, no idioma configurado, interpolando `queue.slug` e o subcomando correto (`!<slug> presente` em pt-BR/es, `!<slug> present` em en); (b) a chamada renderiza o login do viewer e o slug executável nos três idiomas, e textos customizados continuam funcionando e prevalecem; (c) iniciar atendimento pelo painel/API e pelo comando autorizado do chat gera exatamente um anúncio localizado, sem anúncio para falhas, no-ops ou repetições; (d) o anúncio usa o fluxo durável de chat existente, a falha da Twitch continua recuperável e não aparece como entrega confirmada; (e) testes de regressão, catálogos, validadores e documentação equivalentes em en, es e pt-BR; (f) relação com a OPS-15 (#69): a renderização do painel pode vir da nova UI, o comportamento de chat e os critérios ficam aqui; (g) as cinco variáveis da ST-08/OPS-16 (`{user}`, `{queue}`, `{position}`, `{uid}`, `{account}`) como item de UI incorporado; (h) status/sequência: depois do aceite nativo da OPS-13 no OBS, beta, sem bump de versão por planejamento; pai #94. As linhas CH-1, CH-3, CH-4 e CH-7 de [flow-and-chat-review](../OPS-15/flow-and-chat-review.md) são a evidência da seção Problema. O corpo da issue aponta para `docs/stories/OPS-14/story.md` na `main`; depois que o arquivo for comitado, o `@devops` confere esse link (só edição do corpo). Não esperar por um worktree inalcançável.
5. **HD-02: movida para concluídas como Superada** (en `docs/human_decisions/done/`, pt-BR `docs/decisoes_humanas/concluidas/`), nota de topo e status atualizados para o estado real (commit da Onda 3 `906fd5c`, `@qa` CONCERNS 9,0, PR #101), os dois índices de decisões da OPS-15, a lista de arquivos da story OPS-15, os handoffs de continuação do overlay e a nota do handoff de sessão atualizados. As linhas históricas do Change Log que citam o caminho antigo permanecem como registro.

## Adendo 2026-10-30 (c) — decisão do Orion sobre cancelar com DELETE possivelmente enviado, desacoplamento FT-23/FT-28 e reavaliação (`@po`, Pax)

**Decisão do Orion 2026-10-30.** [AUTO-DECISION] Cancelamento com `requestMayHaveReachedTwitch` verdadeiro → **permitido** quando uma leitura somente-leitura `cancel_verification` prova que a recompensa exata existe e está pausada; recusado com `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` apenas quando a leitura é inconclusiva ou negativa depois de uma tentativa de DELETE (razão: o mecanismo `cancel_verification` existe para isso; o risco residual é um DELETE tardio depois da leitura, coberto porque a recompensa continua pausada e a ação de abrir lê de novo e falha com segurança, nunca reabrindo uma fila sem recompensa; as fixtures `tests/integration/qra-postgres-fixtures.test.js` ~:457-488 e ~:497-528 permanecem válidas). Isto **supera o achado F21 e a D-36-6** de [architect-review-ft36.md](architect-review-ft36.md) e a condição de F21 de [ft-36-data-engineer-confirmation.md](ft-36-data-engineer-confirmation.md) somente nesse ponto. Origem: pendência P-1 de [qa-gate-2026-10-30c.md](../OPS-15/qa-gate-2026-10-30c.md). CA 21 alterado em [story.md](story.md); os CAs 8 e 20 não citam recusa nem reabertura e ficam como estão. Os códigos `QUEUE_DELETION_ALREADY_COMPLETED` e `QUEUE_DELETION_PAUSE_IN_PROGRESS` da D-36-6 permanecem. Adendos foram acrescentados às duas notas; os corpos não foram reescritos.

**FT-23 desacoplada da FT-28 (D-23-1, `@architect`).** Registrado: o item 6 das "Correções obrigatórias" está FECHADO. A FT-23 viaja neste ciclo sem provedor compartilhado; a dependência FT-23 → FT-28 do inventário é suave (a FT-28 depois troca a costura `navigateTo`); a atualização ao vivo de pendente → excluída fica com a OPS-23 (FT-28/FT-29).

**Reavaliação e gates.** `@architect`: FECHADO. `@data-engineer`: FECHADO. `@ux-design-expert`: ABERTO. Plano de testes do `@qa`: ABERTO (deve incluir o T36 "DELETE tardio depois de um cancelamento verificado" com a prova por mutação). A FT-23 tem critérios no inventário, mas ainda não tem story (`@sm`) nem issue (`@devops`).

- **Escopo e CAs: GO, 9,0/10** (era 8,5). Deduções removidas: complexidade reavaliada (20 COMPLEX), itens abertos 1, 2, 4, 5 resolvidos. Restam: FT-23 sem arquivo de story (-0,5), plano de UX e plano do `@qa` ainda não registrados (-0,5).
- **Despacho do `@dev`: NO-GO enquanto o plano de UX e o plano de testes do `@qa` estiverem abertos.** Status continua Ready.
