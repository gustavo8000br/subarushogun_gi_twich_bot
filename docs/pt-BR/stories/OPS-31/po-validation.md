# OPS-31 — validação do `@po` (`*validate-story-draft`, 10 pontos)

[English](../../../stories/OPS-31/po-validation.md)

**Validador:** `@po` (Pax) — **Data:** 2026-11-06 — **Modo:** YOLO (decisões marcadas `[AUTO-DECISION]`)
**Story:** [story.md](story.md) — **Issue:** ainda não existe. **Fontes conferidas:** a nota do `@analyst` ([2026-11-06-queue-group-refund](../../research/2026-11-06-queue-group-refund/README.md)), [issue-body-changes-2026-11-06b](../../process/issue-body-changes-2026-11-06b.md), as stories OPS-20 e OPS-22, o inventário (ST-24, FT-71..FT-78).

## Veredito

**GO — 8,7/10** (após as edições do `@po` abaixo, aplicadas à story em inglês e pt-BR). **O status continua Rascunho**: regra do projeto, Pronta = GO + issue existente. O `@devops` cria a issue; depois o `@po` (ou o `@sm`) passa Rascunho a Pronta. Pronta significa "validada para planejamento"; cada fatia ainda precisa dos gates do `@architect`, do `@data-engineer` e do `@ux-design-expert` (>= 9,0) antes do `@dev`.

## Notas

| # | Ponto | Nota | Observação |
|---|---|---|---|
| 1 | Título claro | 1,0 | Nomeia os dois resultados. |
| 2 | Descrição | 1,0 | Fila muda e cumprimento irreversível. |
| 3 | CAs testáveis | 0,9 | 25 CAs Dado/Quando/Então com classes de evidência; AC 26-28 acrescentados para as lacunas abaixo. |
| 4 | Escopo DENTRO/FORA | 0,9 | Claro; as letras de fatia do inventário (FT-77 "h", FT-78 "i") estavam fora de passo e foram corrigidas (g, h). |
| 5 | Dependências | 0,7 | Especialistas listados; a ordem da story punha a FT-77 antes da FT-76 (corrigido); a relação com a OPS-20 era só "unida ou substituída". Agora declarada (abaixo). |
| 6 | Complexidade | 0,9 | 17, COMPLEXA, GG; o `@architect` confirma. |
| 7 | Valor de negócio | 0,9 | Fila natural e recompensa de grupos; retenção de pontos aceita pelo proprietário. |
| 8 | Riscos | 0,8 | Sete riscos com mitigação; abuso não tinha AC (AC 27); faltava o fim do atendimento com entrada "verificar grupo" sem solução (AC 21 completado). |
| 9 | Definition of Done | 0,8 | Por classe; itens de teste real fechados ou pendentes; agora cobre os AC 1-28. |
| 10 | Alinhamento com as fontes | 0,8 | Cada AC rastreia a uma decisão do proprietário ou seção da nota. Lacuna: encerramentos em massa (limpar, excluir, a pessoa sai) não cobertos pela decisão (AC 26, AUTO-DECISION). |

## Correções aplicadas pelo `@po` (story, en e pt-BR)

1. Ordem: FT-76 antes da FT-77 (o inventário já tinha a FT-77 bloqueada pela FT-76); AC 20 fechado pela FT-76 sobre a FT-72.
2. AC 21: se o atendimento terminar com uma entrada "verificar grupo" sem solução, a conclusão não decide por ela.
3. AC 26 (encerramentos em massa: limpar, excluir, remoção de espera, a pessoa sai, removida durante a chamada): nada automático, uma escolha para o lote, consulta em lote. `[AUTO-DECISION]` estende a decisão do proprietário de 2026-11-06; o `@architect` confirma ou devolve como pergunta ao proprietário.
4. AC 27 (abuso): registrar os limites em vigor (FT-70); o item 2 do teste real fecha a restauração dos limites.
5. AC 28: a devolução de recusa de fila pausada ou fechada é um caso separado da devolução por grupo.
6. Inventário e quadro: FT-77 é a fatia g e FT-78 a fatia h (en e pt-BR).

## Coerência com a OPS-20 e a OPS-22

- **OPS-20 (#76, rascunho refinado, regra "só inscritos"):** muita sobreposição e dois conflitos reais. (a) A OPS-20 devolve em todo gatilho (removida durante a chamada, não compareceu, a pessoa sai, limpar, excluir); a OPS-31 tem um momento (fim do atendimento) e o streamer decide na hora nos encerramentos. (b) A audiência padrão da OPS-20 é inscritos (moderadores/VIPs/streamer opcionais, presenteado/nível configuráveis); a OPS-31 usa um conjunto explícito de grupos (vazio não devolve a ninguém). **Posição: união sob a OPS-31** (um serviço de decisão, uma decisão persistida, um modelo de `unknown`); a OPS-31 substitui a regra e as audiências da OPS-20; a OPS-20 fica só com a consulta em lote da limpeza da fila, o tratamento de não elegíveis e as opções de definição de inscrito até o `@architect` decidir. A OPS-20 não é implementada à parte e continua aberta até esse registro.
- **OPS-22 (#80):** reaproveitada sem mudança (outbox, releitura, resolução manual); o cancelamento do fim do atendimento e o cumprimento de "não devolver" são intenções do outbox; os dois estados `unknown` não se misturam no painel.
- **O que o `@architect` precisa decidir:** (1) confirmar a união com a OPS-20 e o que resta dela; (2) uma intenção terminal por resgate e o mapeamento exato de "não devolver" (cumprir ou outro desfecho); (3) lista própria por fila ou por canal (nota D-5); (4) resultado por gatilho e escolha em lote dos encerramentos em massa (AC 26); (5) fila de envio e prioridade dos avisos no chat; (6) opções de definição de inscrito (presenteado/nível) dentro ou fora; (7) confirmar a complexidade 17.
- **Para o proprietário (só se o `@architect` devolver):** a extensão do AC 26 aos encerramentos em massa. Nenhuma outra pergunta pendente.

## Plano de testes, riscos e metas

Plano aceito: unitário com Twurple falso, PostgreSQL isolado com migrations reais, widget no OBS nativo como classe separada, execução real no canal de testes autorizado pelo `@qa` com os seis itens em aberto (nota, seção 11), sete gates. Os riscos (corrida cumprir/cancelar, falha de consulta, retenção, abuso, UID em log, taxa do chat) são cobertos pelos AC 4, 13-15, 18-19, 21, 23, 27. Meta de UX >= 9,0 antes do `@dev`; veredito do `@qa` antes de o `@devops` comitar. Itens do proprietário: reautorização do canal (novos escopos), os resgates reais (Orion no Chrome), aceite da retenção de pontos (feito).

## Reconfirmação após o desenho do `@architect` (2026-11-11)

**Validador:** `@po` (Pax), YOLO. **Fontes:** [architect-design](architect-design.md) (D-31-1..D-31-11, redações da seção 9, itens do proprietário da seção 11). **Veredito: GO reconfirmado, 9,3/10** (anterior 8,7). O status continua **Pronta** (a issue #115 existe). Nenhuma ação de código, git ou GitHub foi feita.

| # | Ponto | Antes | Agora | Observação |
|---|---|---|---|---|
| 1 | Título claro | 1,0 | 1,0 | Inalterado. |
| 2 | Descrição | 1,0 | 1,0 | Inalterado. |
| 3 | CAs testáveis | 0,9 | 1,0 | 33 CAs; as questões de desenho em aberto nos CA 10, 20 e 26 agora são concretas (uma lista por canal, máx. 500; "não devolver" = cumprir na escolha; lote em dois passos com contagens). Os novos CA 29-33 são Dado/Quando/Então. |
| 4 | Escopo DENTRO/FORA | 0,9 | 0,9 | Opções presenteado/nível explicitamente fora; R1/R2 são backlog, não escopo. |
| 5 | Dependências | 0,7 | 0,9 | Ordem FT-71..FT-78 confirmada com dependências reais (FT-72 após FT-71; FT-76 após 72, 74, 75; FT-77 após 76; FT-73 independente); OPS-20 substituída. Em aberto: gates do `@data-engineer` e do `@ux-design-expert`. |
| 6 | Complexidade | 0,9 | 1,0 | 19, COMPLEX (escopo 5, integração 4, infraestrutura 2, conhecimento 3, risco 5); confirmada pelo `@architect`. |
| 7 | Valor de negócio | 0,9 | 0,9 | Inalterado. |
| 8 | Riscos | 0,8 | 0,8 | O desenho lista dez riscos com residuais (seção 5); a story mantém os sete e aponta para o desenho. Sem aumento: a lista da story não foi reescrita. |
| 9 | Definition of Done | 0,8 | 0,9 | Cobre os CA 1-33 por classe. |
| 10 | Alinhamento com as fontes | 0,8 | 0,9 | Cada CA novo rastreia a uma decisão D-31; a extensão do CA 26 foi confirmada pelo `@architect`. |

**Checklist de 10 pontos:** todos passam (>= 7 exigido; total 9,3).

**Decisões desta passagem (AUTO-DECISION, reversíveis):**
- OW-31-1: manter "nada automático para membros" (motivo: regra do proprietário de 2026-11-06; a alternativa contradiz o CA 31). O proprietário pode reverter; nada bloqueia.
- Máximo de 500 na lista própria: aceito (CA 10).
- Numeração: CAs novos acrescentados como 29-33, para que as referências do inventário, do quadro e do handoff aos CA 1-28 continuem válidas.

**O que muda para o plano de testes (para o `@qa`):** PostgreSQL isolado com **barreira de corrida** (pares concluir x remover-sem-devolver, duas escolhas opostas, iniciar x remover, duas "tentar agora", limpar x concluir; exatamente uma tarefa financeira; `settlement.contradictory_request` quando as escolhas diferem) e uma execução **sem o advisory lock** provando que só o índice único recusa a segunda tarefa; testes de migração (filas existentes ficam `fulfill_on_start`, cada restrição recusa a linha inválida; a API recusa `refund_on_end` antes da FT-76, CA 30); decisão imutável; contagens do lote por resultado, instantâneo vencido recusado, exclusão aguarda enquanto houver estado pendente (CA 32); mapeamento da consulta para 401/403/429/5xx/tempo esgotado/malformado/escopo ausente com Twurple falso, blocos de 100, espera no 429 e depois `unknown`; cancelamento duplo com a classe **real** do Twurple (CA 19); limitador com relógio injetado; logs sem ID, login ou rótulo; canal real em duas execuções (avisos após FT-71..73, dinheiro após FT-74..77) com os seis itens em aberto. Um gate do `@qa` ao final; FT-76 e FT-77 são validadas juntas.

**Pendências (não feitas aqui):**
- `@devops`: encerrar a issue #76 como substituída pela #115 (ou atualizar o corpo; nunca comentário) e atualizar a entrada da OPS-20 no inventário e no quadro; registrar R1 (sem trabalho) e R2 (sequência: cumprir um resgate normal após não comparecimento ou remoção durante a chamada com a chave desligada) no backlog.
- Gates de especialistas ainda abertos: `@data-engineer` (perguntas da seção 10 do desenho), `@ux-design-expert` (>= 9,0), plano de testes do `@qa`.
- Proprietário: nada bloqueia. Só para a FT-78: reconectar o canal de testes com os novos escopos e fazer os resgates reais.

## Revalidação após o desenho v2.4 (2026-11-15)

**Validador:** `@po` (Pax), YOLO. **Fontes:** [architect-design-v2](architect-design-v2.md) (seções 3.10-3.13, 14, 17), [ux-plan-v2](ux-plan-v2.md), [decisions-for-owner](decisions-for-owner.md), [data-engineer-review](data-engineer-review.md). **Veredito: GO, 9,1/10** (anterior 9,3; menor apenas porque três gates de especialistas continuam abertos e os CAs novos dependem de algumas HIPÓTESES). O status continua **Pronta** (a issue #115 existe). Nenhuma ação de código, git ou GitHub foi feita.

| # | Ponto | Nota | Observação |
|---|---|---|---|
| 1 | Título claro | 1,0 | Sem mudança. |
| 2 | Descrição | 1,0 | Sem mudança. |
| 3 | CAs testáveis | 0,9 | 41 CAs; os novos 34-41 trazem cada um uma linha *Evidência* por classe. Reduzida: faixa da janela de fusão, retenção de 90 dias e 48 h de sessão velha ainda são HIPÓTESES do desenho (a faixa 1-60, padrão 10, agora é decisão do proprietário). |
| 4 | Escopo DENTRO/FORA | 0,9 | Sessão de live e política entram pelos pacotes P5b/P6b/P7; a LIVE-1 diz o que nunca podem tocar. |
| 5 | Dependências | 0,8 | Pacotes P0..P8 com gates na story; `@data-engineer` (M2a/M3/M4), `@ux-design-expert` (nota) e plano do `@qa` ainda abertos. |
| 6 | Complexidade | 1,0 | 19, COMPLEXA; P7 muito alta. |
| 7 | Valor de negócio | 0,9 | Sem mudança. |
| 8 | Riscos | 0,8 | O desenho lista os riscos residuais (seção 6, 3.11 E); a lista da story mantém os sete (riscos do teto e da sessão de live estão no desenho). |
| 9 | Definição de pronto | 0,9 | Agora CAs 1-41. |
| 10 | Alinhamento com as fontes | 0,9 | Cada CA novo remete a O-1..O-10, Q-1..Q-4, DB-5 ou às decisões do proprietário de 2026-11-15. |

**Checklist de 10 pontos:** todos passam (>= 7 exigido; total 9,1).

**Decisões do proprietário aplicadas (2026-11-15):** (1) "Decidir pelas N em espera": sem pré-marcação, botão desabilitado até uma escolha explícita (CA 36; o texto "pré-marcada" do desenho 3.10 está superado, UX 3.13 E); (2) janela de fusão da live de 1 a 60 minutos, padrão 10 (CA 40); (3) Q-1: o `concluir` do próprio streamer no chat é igual ao painel (CA 41). Q-3, Q-4, DB-5 e O-1..O-10 já decididos e refletidos.

**Decisões desta passagem (AUTO-DECISION, reversíveis):** CAs novos acrescentados como 34-41 em vez de 13-17 (esses números existem; os CAs 1-33 são citados pelo inventário, quadro e handoff); id da fatia P6b proposto como FT-90 (próximo livre no inventário; `@devops`/`@sm` registram; o inventário não é editado aqui); CAs 3, 4, 5, 17, 27, 30 alterados com os itens 1-4 e 8 da seção 17 do desenho.

**Pendências para o `@qa` (plano de testes):** incluir os casos das linhas *Evidência* dos CAs 34-41: tabela-verdade da política (todo evento x valor, discordância => `wait`); invariantes de migração e corrida da versão otimista; teste de componente e API sem pré-marcação; `CHECK`s de estado e gatilho absorvente, corrida acerto externo x escolha local; formato da rota de pendências, limites 200/20 e índices; corrida de barreira do teto, relógio falso, devolução falha não devolve saldo, nenhuma escrita do worker em `redemptions`; casos do redutor de sessão (duplicata, fora de ordem, limite +/- 1 s, `rerun`, um único `null` velho, Helix fora, revogação, primeira instalação), teste estático da LIVE-1 e teste de mutação; `concluir` no chat por papel; verificação de logs sem id, login ou rótulo; a rodada C em canal real exige o proprietário transmitindo. Gates A/B/C e se a P5b acompanha o Gate C ficam com o `@qa`/Orion.

**Pendências para o `@data-engineer`:** confirmar as duas colunas da M2a `settlement_cause` (lista fechada de cinco, `CHECK`) e `settled_external_at` com os índices parciais (lista de pendentes e histórico das 20 últimas); regenerar o DDL da seção 2.2 a partir do desenho v2.4 quando a P5 começar; deltas de M3 e M4 (DB-1..DB-11 já respondidos na seção 9 da revisão do DE).

**Outras pendências (não feitas aqui):** nota >= 9,0 do `@ux-design-expert` sobre o plano v2; itens do `@devops` da passagem anterior (issue #76, inventário/quadro da OPS-20, R1/R2) e registro da FT-90.

## Reconfirmação após o desenho v2.6 (2026-11-15)

**Validador:** `@po` (Pax), YOLO. **Fontes:** [architect-design-v2](architect-design-v2.md) (3.15, seção 17 itens 19-23, seção 18, 3.14 E.1-E.2 para G-B3 e G-B6). **Veredito: GO reconfirmado, 9,1/10** (sem mudança). O status continua **Pronta** (a issue #115 existe). Nenhuma ação de código, git ou GitHub foi feita.

**Aplicado à story (en e pt-BR), sem CA novo e com a numeração intacta:**
- CA 27: o teto é escolha do streamer por fila; ele apenas faz uma devolução automática esperar; "no máximo N por pessoa por live" vale só para `after_n`.
- CA 35: `PUT` e `GET` levam `reentryCapHold`, `reentryCapCountsManual` e `effectiveBudget`; até a P7 uma mudança de qualquer um (como S2..S5 e a janela) é recusada com `policy_not_active`, de forma atômica; um corpo igual não grava nada (N-5); 400 para valores inválidos, sem coerção.
- CA 37: a lista fechada tem seis causas (acrescenta `batch_deferred`); a causa existe exatamente enquanto a linha está `awaiting_choice`.
- CA 39: semântica de `after_n` (passam N, a seguinte espera) e `at_n` (a N-ésima espera; `N = 1` segura toda devolução automática); igualdade no teto declarada (`count < saldo` passa); uma devolução que o streamer escolhe nunca é segurada e só conta quando `reentryCapCountsManual` é verdadeiro; origem gravada, então a mudança de opção vale para devoluções passadas; evidência trocada pela tabela-verdade das duas configurações mais a corrida com barreira nas duas ordens com a contagem ligada (automática contra manual da mesma pessoa; duas devoluções automáticas simultâneas da mesma pessoa não podem ocorrer). Isso fecha G-B3 e G-B6 do plano do `@qa`.
- Pacotes: a P5b leva as duas colunas da fila, `refund_origin` e seu `CHECK`, com a M3a sempre presente; a P7 aplica o limite e a opção de contar o manual e grava `refund_origin`. Nenhum gate nem ordem mudou.

| # | Ponto | Nota | Observação |
|---|---|---|---|
| 1-2 | Título, descrição | 1,0 | Sem mudança. |
| 3 | CAs testáveis | 0,9 | 41 CAs; os alterados mantêm uma linha *Evidência* por classe; o CA 39 agora é uma tabela-verdade fechada mais uma corrida com barreira, sem redação ambígua ("no máximo N" não fica mais sozinho). |
| 4 | Escopo DENTRO/FORA | 0,9 | Só duas opções; o desenho lista o que foi considerado e não oferecido (lista de exceções, tetos por papel, outro desfecho acima do teto, número separado para o manual). |
| 5 | Dependências | 0,8 | Sem mudança: `@data-engineer` (M2a/M3/M3a, perguntas do gatilho e do `INCLUDE`), nota do `@ux-design-expert`, atualização do plano do `@qa`. |
| 6 | Complexidade | 1,0 | 19, COMPLEXA; as duas opções acrescentam um par de colunas e uma origem gravada, sem pacote novo. |
| 7 | Valor de negócio | 0,9 | O streamer decide como a live se comporta (pedido do proprietário). |
| 8 | Riscos | 0,8 | Sem mudança; uma linha segurada pode mostrar contagem abaixo do saldo após afrouxar a opção (texto de UX, desenho 3.15 F e H). |
| 9 | Definição de Pronto | 0,9 | CAs 1-41. |
| 10 | Alinhamento com as fontes | 0,9 | Rastreia as decisões do proprietário de 2026-11-15 (G-B6 configurável, sexto código `batch_deferred`) e o desenho 3.15. |

**Checklist de 10 pontos:** todos passam (>= 7 exigido; total 9,1).

**Decisões desta passagem (AUTO-DECISION, reversíveis):** (1) nenhum CA novo para as duas opções; elas entram nos CAs 35 e 39 para manter válidas as referências aos CAs 1-41 (motivo: numeração estável). (2) A redação de auditoria e de logs do CA 39 continua `settlement.reentry_cap_hit` com `windowKind` (motivo: o desenho não a mudou).

**Pendências para o `@qa`:** incluir no plano o marcador v2.6 da seção 13 do desenho (tabela-verdade das duas configurações, a corrida nas duas ordens, devoluções passadas reavaliadas após mudar a opção, `batch_deferred`, recusa pré-P7 dos dois campos) e fechar G-B3 e G-B6 na tabela do plano. **Pendências para o `@data-engineer`:** o sexto código no `CHECK` da DB-12 (M2a); colunas da M3, `queues_reentry_cap_hold_check`, `redemptions_refund_origin_check` como `NOT VALID`; M3a sempre presente; se `refund_origin` é coluna `INCLUDE` do índice de devolvidos e se o gatilho de guarda a congela depois de gravada. **Pendências para o `@ux-design-expert`:** dois controles, texto do saldo efetivo, o aviso de `at_n` com `N = 1`, a linha "o limite mudou depois que isto foi segurado", a linha da sexta causa, o bloco oculto antes da P7 (a aparência de somente leitura foi descartada; ver a passagem v2.8 abaixo). **Outras pendências:** itens do `@devops` das passagens anteriores e o registro da FT-90.

## Reconfirmação após o desenho v2.8 e as decisões do proprietário sobre o painel (2026-11-15)

**Validador:** `@po` (Pax), YOLO. **Fontes:** [architect-design-v2](architect-design-v2.md) v2.8 (3.16 D e E), [ux-plan-v2](ux-plan-v2.md) (U-1, U-16, U-18, U-19, U-20), [qa-test-plan](qa-test-plan.md) (`K39-02`, `K39-05`). **Veredito: GO reconfirmado, 9,1/10** (sem mudança). Status continua **Pronta** (issue #115). Nenhuma ação de código, git ou GitHub foi feita.

**Decisões do proprietário registradas:**
- `at_n` com limite 1: um **diálogo de confirmação** antes de salvar (U-20); ele substitui a recomendação anterior de "sem diálogo".
- O bloco da política fica **oculto antes da P7** (`enforcementActive`); a **perda da pré-visualização das opções antes da P7 é aceita pelo proprietário**.
- Textos dos rádios (U-16, U-19): **confirmados pelo `@po`, sem mudança.** "Deixar passar N devoluções e reter a seguinte (padrão)" e "Reter já a devolução número N" concordam com o CA 39 (`after_n`: passam N, a seguinte espera; `at_n`: a N-ésima espera, passam N-1). Os exemplos com 3 (as 3 primeiras passam e a 4ª espera; as 2 primeiras passam e a 3ª espera) batem com a tabela-verdade (`count < saldo`, saldo N ou N-1). Os rótulos não levam ordinal; só os exemplos.

**Aplicado à story (en e pt-BR), sem CA novo e com a numeração intacta:**
- CA 27: salvar `at_n` com limite 1 pede confirmação.
- CA 35: o painel renderiza o bloco da política só quando `enforcementActive` é verdadeiro (ausente significa oculto); sem aparência de somente leitura; evidência: teste de componente.
- CA 37: a causa `reentry_cap` não pode aparecer antes da P7.
- CA 39: novo item 4 de evidência (textos dos rádios, comportamento do diálogo e os casos em que não abre, `K39-02`).
- Pacotes: a P5b registra o bloco oculto até `enforcementActive`; a P7 leva o diálogo. Nenhum gate nem ordem mudou.
- O plano de UX e o plano do `@qa` já seguem essas decisões; nada na story nem aqui ainda diz "sem diálogo" ou "somente leitura antes da P7".

| # | Ponto | Nota | Observação |
|---|---|---|---|
| 1-2 | Título, descrição | 1,0 | Sem mudança. |
| 3 | CAs testáveis | 0,9 | 41 CAs; o diálogo tem gatilhos e não gatilhos literais (`K39-02`); o bloco oculto tem teste de componente (`K39-05`). |
| 4 | Escopo DENTRO/FORA | 0,9 | O diálogo é só do cliente; o contrato do servidor não muda (desenho 3.16 E). |
| 5 | Dependências | 0,8 | Sem mudança: parecer do `@data-engineer` sobre M2a/M3/M3a. A nota de UX (9,1) e o plano do `@qa` já cobrem o diálogo. |
| 6 | Complexidade | 1,0 | 19, COMPLEXA; sem mudança. |
| 7 | Valor de negócio | 0,9 | Um ato deliberado para uma escolha que retém toda devolução automática (proprietário). |
| 8 | Riscos | 0,8 | O proprietário aceita que as opções não possam ser pré-visualizadas antes de existir a aplicação. |
| 9 | Definição de Pronto | 0,9 | CAs 1-41. |
| 10 | Alinhamento com as fontes | 0,9 | Rastreia as decisões do proprietário de 2026-11-15 e o desenho v2.8. |

**Checklist de 10 pontos:** todos passam (>= 7 exigido; total 9,1).

**Pendências:** `@data-engineer` (M2a/M3/M3a, perguntas do gatilho e do `INCLUDE`); os itens do `@devops` das passagens anteriores e o registro da FT-90.
