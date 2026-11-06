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
