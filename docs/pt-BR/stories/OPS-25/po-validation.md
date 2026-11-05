# OPS-25 — Validação do `@po` (`*validate-story-draft`, 10 pontos)

[English](../../../stories/OPS-25/po-validation.md)

**Validador:** `@po` (Pax) — **Data:** 2026-10-28 — **Modo:** YOLO (autônomo; decisões marcadas com `[AUTO-DECISION]`)
**Story:** [story.md](story.md) (pt-BR) e [en](../../../stories/OPS-25/story.md), como redigida pelo `@sm` em 2026-10-27 (completa: todas as seções presentes, com Change Log e verificação do rascunho pelo `@sm`). **Issue:** pendente (a #57 continua aberta).
**Fontes conferidas:** `.claude/rules/story-lifecycle.md`, `.aiox-core/development/tasks/validate-next-story.md`, [story OPS-13](../OPS-13/story.md) (status "Ready for Review", aceite no OBS nativo pendente), [story OPS-18](../OPS-18/story.md) (status In Progress; linha 44: o renderer consulta `GET /overlay/api/widget` uma vez por segundo com `cache: no-store`), CA 3 da [story OPS-15](../OPS-15/story.md) (leituras sem cache a cada segundo), `apps/api/src/http/overlay-routes.mjs` (cabeçalhos `no-store`), `apps/api/src/commands/catalog.mjs` (`!fila conta`, `!fila conta <nome>`, `!fila conta reset`), os três handoffs de plataforma (todos existem).

## Veredito

**GO — 9,0/10, com uma correção exigida antes da execução.** O status continua **Draft (Rascunho)**: vale a regra do projeto "Ready = GO do `@po` + issue existente" e a issue ainda não existe; além disso, a story só começa depois da ST-01 (migração completa) e da redução do quadro (decisão 2 do proprietário). O `@po` **não** marca Ready.

## Notas

| # | Ponto | Nota | Evidência / observação |
|---|---|---|---|
| 1 | Título claro e objetivo | 1,0 | Nomeia o alvo (overlay do Next), o assunto (widget da conta) e o que substitui (validação da OPS-13 / #57). |
| 2 | Descrição completa | 1,0 | Histórico da #57, por que o cenário vanilla não pode mais ser reexecutado depois da FT-39 e por que "parece não ocorrer" não é evidência. |
| 3 | CAs testáveis | 0,5 | Dez CAs Dado/Quando/Então com classes de evidência e linhas por plataforma. Desconto: **o CA 4 cita "a cadência de atualização do overlay documentada na OPS-15 (cache de 5 s)"**, que nenhuma fonte sustenta: o CA 3 da OPS-15 e a linha 44 da OPS-18 dizem polling a cada segundo com `no-store`, e as rotas do overlay enviam `no-store` (ver correção exigida 1). A meta de 5 s do CA 1 é proposta para o `@qa` confirmar; aceitável no nível da story. |
| 4 | Escopo IN/OUT | 0,5 | IN/OUT explícitos e "sem mudança de código" é a decisão certa. Desconto: o item 1 do plano de testes ("Navegador, fixtures") não diz se reaproveita o E2E existente do overlay (`tests/e2e/overlay-browser-only.mjs`) ou se precisa de código de teste novo; com "sem trabalho do `@dev`" declarado, código de teste novo ficaria fora do escopo (ajuste recomendado 1). |
| 5 | Dependências | 1,0 | ST-01, redução do quadro (proprietário), OPS-18 entregue, OBS nativo, handoffs de plataforma; bloqueia a #57 e o status final da OPS-13. |
| 6 | Complexidade | 1,0 | 9 → STANDARD, dificuldade M, P2. |
| 7 | Valor de negócio | 1,0 | Fecha a #57 com evidência e protege o overlay na live. |
| 8 | Riscos | 1,0 | Navegador vs CEF, Linux vs ambiente do proprietário, linha de base removida, espera longa. |
| 9 | Definição de pronto | 1,0 | Evidência por classe; linhas "plataforma pendente" exigem o aceite do proprietário; decisão do proprietário sobre a #57 registrada. |
| 10 | Alinhamento com fontes/decisões do proprietário | 1,0 | Coincide com as decisões do proprietário de 2026-10-27 (não fechar a #57, `@qa` executa, `@ux-design-expert` ≥ 9,0, depois da ST-01 e da redução do quadro) e com a regra anterior "não fechar a #57 só com evidência do Linux". |

**Template / campos de executor:** as stories deste projeto não usam os campos `executor` / `quality_gate` do `story-tmpl.yaml` (igual a todas as stories OPS validadas); não gera desconto. **Plano de análise estática:** `npm run review:static` listado; mudança só de documentação; achados bloqueiam; nenhuma edição automática prometida. **Segurança:** o CA 8 proíbe o segredo no registro (só o tipo do link de capability); o CA 6 exige o estado não autorizado seguro, sem detalhes internos. PASS.

## Correção exigida (dono da edição: `@sm`, en e pt-BR, antes de o `@qa` executar)

1. **CA 4:** trocar "dentro da cadência de atualização do overlay documentada na OPS-15 (cache de 5 s)" pela cadência documentada: o renderer lê `/overlay/api/widget` uma vez por segundo com `no-store` (CA 3 da OPS-15; OPS-18). `[AUTO-DECISION]` Limite esperado → **registrar o atraso observado e esperar o rótulo poucos segundos depois da mudança (o `@qa` fixa o limite exato no plano de execução, com o polling de 1 s como base)** (motivo: nenhuma fonte dá cache de 5 s; inventá-lo faria o CA falhar ou passar pelo motivo errado).

## Ajustes recomendados (não bloqueiam)

1. Item 1 do plano de testes: dizer "reaproveitar o E2E de navegador existente do overlay (`tests/e2e/overlay-browser-only.mjs`) como evidência de apoio; sem código de teste novo nesta story". Se código de teste novo for necessário, ele vira tarefa do `@dev` e a frase "sem trabalho do `@dev`" muda.
2. CA 1: o botão "atualizar o cache da página atual" é texto da interface do OBS; registrar na evidência o rótulo exato do OBS usado em cada plataforma (o rótulo em pt-BR do OBS é diferente).

## Status final

**GO 9,0/10 — Draft mantido** (sem issue; bloqueada pela ST-01 e pela redução do quadro). Próximo passo: o `@sm` aplica a correção exigida 1; o `@devops` cria a issue só quando a story estiver desbloqueada e pronta; então o `@po` registra a transição Draft → Ready no Change Log da story. O `@po` não editou o arquivo da story (write set desta sessão).
