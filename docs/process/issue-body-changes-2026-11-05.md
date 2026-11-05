# Issue body changes after the QA gate of 2026-11-05

[Português (pt-BR)](../pt-BR/process/issue-body-changes-2026-11-05.md)

**Date:** 2026-11-05. **Author:** `@sm` (River). **For:** `@devops`, who applies the text below to the main body of each issue (never as a comment; never untick an owner box; re-read the body just before writing). Nothing was applied by `@sm`. The blocks are in Portuguese because they go to the issue bodies; the English mirror goes below the Portuguese text as the [issue body template](issue-body-template.md) says.

## #80 — OPS-22 (também #98, #99, #100 e #103 na seção Gates)

**Em `## Gates` de cada uma:** marcar "Gate `@qa`" com a nota: "PASS 9,1/10 em 2026-11-05 (`docs/stories/OPS-15/qa-gate-2026-11-05.md`); pacote comitado e enviado, HEAD `1767c24`, CI do PR #101 11/11". Nas issues #98, #99 e #100 a nota cita a fatia (FT-25, FT-26, FT-36); na #103, a FT-23.

**Na #80, acrescentar a seção "Acompanhamentos não bloqueantes (gate de 2026-11-05)"** (apenas texto; as caixas do dono não mudam):

- FT-53 — manter ou melhorar o 409 `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` depois de uma leitura 401 e escrever o limite da pausa restaurada (L-2; P3).
- FT-54 — reconhecimento de UX dos textos no singular `confirm.delete_local.one` e `confirm.delete_converted.one` e "recompensa" no pt-BR (L-3; P2).
- TS-18 — afirmar o `isOpen` local no PG36-16 depois de um DELETE tardio (L-1; P2).
- TS-19 — reproduzir as mutações M2, M3, M5, M7, M8, M11, M15, M16 e M19 (M-2; P2).
- TS-20 — sonda de deadlock para a ordem de locks (aceita; P3).

Cada item é um rascunho no quadro; o `@devops` cria a sub-issue da #80 só na hora de implementar. Nenhum deles bloqueia o cutover da OPS-15.

## #69 — OPS-15 (seção Decisões do dono)

Sem mudar nenhuma caixa do dono, conferir que o corpo traz, em cada bloco, a nota de registro de 2026-11-05: **D-04** registrada como A (adiar; o dono marcou B antes de testar e esclareceu); **D-05** = B (OW-07 vai a Bloqueado até haver um Mac; nenhum resultado de macOS é afirmado); **D-06** = A (esperar; sem merge do PR #101 agora); **D-07** = A (adiar; sem tag nem release agora). Fonte: `docs/human_decisions/done/recorded-project-decisions.md`. Se o corpo já tiver essas notas, nada a fazer.

## #104 — OPS-27 (seção Gates)

Acrescentar a nota ao gate de planejamento do `@sm` (sem marcar o gate do `@po`): "Revisão do `@sm` em 2026-11-05: story pronta para a validação do `@po` (CA 11 de falha clara, dependências do proprietário e tabela Red/Green acrescentados); dependência de início atendida (pacote da OPS-22 comitado e enviado)". Em `## Decisões do dono` continua "Nenhuma decisão pendente.".

## #105, #106, #107 — OPS-30, OPS-29, OPS-28

Sem mudança de corpo. A única alteração é o cabeçalho da story, que agora cita o número da issue.

## Quadro (não é corpo de issue)

O `@devops` move o card OW-07 de Aguardando decisão para Bloqueado ("Depende de": acesso a um Mac; "Próximo passo": D-05 = B), carrega os 5 rascunhos novos (FT-53, FT-54, TS-18, TS-19, TS-20, todos Backlog, Ordem 8.7) e confirma na próxima sincronização o motivo dos seis cards listados na seção 5.3 do desenho do quadro. Sem comentários em issues.
