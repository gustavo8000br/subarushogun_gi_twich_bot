# Issue body template

**Date:** 2026-10-30. **Author:** `@sm` (River). **Scope:** documentation only; `@devops` applies it to every new and existing issue body.
**Português:** [Modelo de corpo de issue](../pt-BR/process/issue-body-template.md)

Normative rule: `AGENTS.md`, bullet "Toda issue nasce com checklist". The filled blocks for every open issue are in the [owner decisions panel](owner-decisions-panel.md). Only `@devops` creates and edits issue bodies, never through comments.

## Layout

1. `## Português` and `## English`: the bilingual description the project issues already use (context, scope, acceptance, links). The English mirror of the decisions goes here, **without checkboxes** (plain bullets), so the owner has a single set of boxes to tick.
2. `## Decisões do dono`: the decision checklist, in Portuguese (what the owner reads and ticks). Exactly one section per issue.
3. `## Gates`: the story gates, ticked only by `@devops` when the gate passes and its evidence is recorded.

## Template

````markdown
## Português

<contexto, escopo e critérios de aceite da issue>

## English

<context, scope and acceptance criteria of the issue>

### Owner decisions (read-only mirror, no checkboxes)

- D-NN — <short question>. Options: A — <label> (recommended); B — <label>.

## Decisões do dono

### D-NN — <pergunta curta>
**Por que importa:** <no máximo 2 linhas>
**Contexto:** <links relativos ao repositório; nunca URL de sessão>
- [ ] **A — <rótulo> (recomendado)**: <consequência em 1 linha>
- [ ] **B — <rótulo>**: <consequência em 1 linha>
- [ ] **C — Adiar**: <consequência em 1 linha>
Observação (opcional):
Quem executa depois: <agente>
Efeito no quadro: <mudança de Situação ou de card>
Tipo: <Reservada (sem marca, espera o dono) | Padrão (sem marca, aplica-se a opção recomendada)>

### A-NN — <ação do proprietário, sem decisão>
**Contexto:** <o que fazer e onde>
- [ ] **Feito**: marque quando concluir a ação.
Observação (opcional):
Quem executa depois: <agente>
Efeito no quadro: <mudança>

## Gates
- [ ] Story Ready (`@po`)
- [ ] Parecer do `@architect`
- [ ] Parecer do `@data-engineer`
- [ ] Plano de UX (`@ux-design-expert`, nota mínima 9,0)
- [ ] Plano de testes do `@qa`
- [ ] Veredito do `@qa`
- [ ] Commit (`@devops`)
- [ ] CI verde
````

## Rules for the blocks

- One decision per `### D-NN` block; 2 to 4 options; the recommended option is always the first and carries "(recomendado)"; include "Adiar" when postponing makes sense.
- `Por que importa` has at most 2 lines. `Contexto` uses repository links only; the repository is public, so no personal data, secrets, session URLs or other projects.
- With no decision and no action, the section is the single line `Nenhuma decisão pendente.`
- A gate that does not apply is ticked with the reason on the same line (for example "não se aplica: a fatia não tem texto visível"). A gate that has no recorded evidence stays unticked.
- Issues that only follow another issue (for example #74 and the roadmap #94) keep the section with one line saying they have no gates of their own.
- After `@devops` records a decision, the `### D-NN` heading gets ` ✅ registrado em AAAA-MM-DD (opção X), commit <hash>`; no owner box is ever unticked. The reading protocol is in section 6 of the [owner decisions panel](owner-decisions-panel.md).
