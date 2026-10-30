# Modelo de corpo de issue

**Data:** 2026-10-30. **Autor:** `@sm` (River). **Escopo:** somente documentação; o `@devops` aplica a todo corpo de issue novo e existente.
**English:** [Issue body template](../../process/issue-body-template.md)

Regra normativa: `AGENTS.md`, bullet "Toda issue nasce com checklist". Os blocos preenchidos de cada issue aberta estão no [painel de decisões do proprietário](owner-decisions-panel.md). Só o `@devops` cria e edita corpos de issue, nunca por comentário.

## Estrutura

1. `## Português` e `## English`: a descrição bilíngue que as issues do projeto já usam (contexto, escopo, aceite, links). O espelho em inglês das decisões entra aqui, **sem caixas** (marcadores simples), para o proprietário ter um único conjunto de caixas.
2. `## Decisões do dono`: a checklist de decisões, em português (o que o proprietário lê e marca). Exatamente uma seção por issue.
3. `## Gates`: os gates da story, marcados só pelo `@devops` quando o gate passa e a evidência está registrada.

## Modelo

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

## Regras dos blocos

- Uma decisão por bloco `### D-NN`; 2 a 4 opções; a recomendada é sempre a primeira e leva "(recomendado)"; inclua "Adiar" quando adiar fizer sentido.
- `Por que importa` tem no máximo 2 linhas. `Contexto` usa só links do repositório; o repositório é público, então sem dados pessoais, segredos, URL de sessão ou outros projetos.
- Sem decisão e sem ação, a seção é a linha única `Nenhuma decisão pendente.`
- Gate que não se aplica é marcado com o motivo na mesma linha (por exemplo "não se aplica: a fatia não tem texto visível"). Gate sem evidência registrada fica desmarcado.
- Issues que só acompanham outra (por exemplo a #74 e o roadmap #94) mantêm a seção com uma linha dizendo que não têm gates próprios.
- Depois que o `@devops` registra uma decisão, o título `### D-NN` recebe ` ✅ registrado em AAAA-MM-DD (opção X), commit <hash>`; nenhuma caixa do proprietário é desmarcada. O protocolo de leitura está na seção 6 do [painel de decisões do proprietário](owner-decisions-panel.md).
