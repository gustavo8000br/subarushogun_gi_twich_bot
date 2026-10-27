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
- **OD-22-3 — PENDENTE:** confirmar Done sem evidência ao vivo, com o CA 19 como aceite separado do proprietário (recomendado).
- **OW-16 — PENDENTE:** autorizar e agendar a verificação ao vivo.

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
