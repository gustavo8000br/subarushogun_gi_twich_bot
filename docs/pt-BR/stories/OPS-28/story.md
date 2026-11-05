# OPS-28 — Regras de varredura estática: ampliar o OpenGrep além das duas regras atuais

[English](../../../stories/OPS-28/story.md)

**Status:** Draft (redigida pelo `@sm` em 2026-11-04; ainda não validada pelo `@po`). **Issue:** [#107](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/107) (criada pelo `@devops` antes de 2026-11-05 a partir de [improvement-issue-bodies-2026-11-04.md](../../process/improvement-issue-bodies-2026-11-04.md); sem comentários em issues).
**Origem:** ideia nº 4 do [levantamento de melhorias](../../process/improvement-ideas-2026-11-04.md) (pedido do proprietário, 2026-11-04). Evidência: `.opengrep/rules.yml` tem duas regras (`no-unsafe-html-sink`, `no-credential-logging`); a primeira já traz uma busca de texto simples por `dangerouslySetInnerHTML` que não é uma regra estruturada de JSX e não tem teste. Decisão permanente do proprietário: **o OpenGrep é o único revisor estático**; o provedor de revisão antigo não está planejado e o nome dele é bloqueado por `tests/unit/aiox-static-review.test.js`.
**Relacionadas:** OPS-27 (segredos em commits, arquivos e corpos; terreno comum), OPS-24 (o CA 7 faz as duas regras atuais varrerem `.ts`), [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (régua de 9,5, ideia nº 4, ações AÇ-16..AÇ-20).
**Itens registrados:** inventário ST-21 (esta story), FT-47 e FT-48 (fatias); ver [backlog-inventory](../../process/backlog-inventory.md).
**Coordenação necessária:** `$aiox-po` (validação), `$aiox-architect` (mecanismo de teste das regras, quais construções o produto realmente usa, divisão de responsabilidade com a OPS-27), `$aiox-qa` independente (plano de testes, mutações à mão, atestado do 9,5), `$aiox-devops` (issue). `$aiox-analyst` só para uma LACUNA em padrão de teste de regra ou de SSRF (consulte antes [research-index.md](../../research-index.md)). `$aiox-ux-design-expert` e `$aiox-data-engineer`: não se aplicam (sem texto visível à pessoa usuária, sem schema).

## Problema

- Duas regras não pegam as classes de defeito que importam para um bot que fala com a API da Twitch, um banco PostgreSQL e um navegador: SQL cru montado com strings, execução dinâmica de código, requisições a uma URL controlada por entrada (SSRF), credenciais escritas no código, injeção de HTML por JSX e cabeçalhos ou cookies de resposta inseguros.
- Uma regra sem teste é uma afirmação. Hoje nenhuma das duas tem um caso positivo e um negativo que prove o que ela casa.
- A varredura deve continuar sendo um único comando (`npm run review:static`), sem editar nada, com zero achados aceitos em silêncio.

## História

Como proprietário que revisa por um único scanner estático,
quero regras do OpenGrep para as principais classes de vulnerabilidade deste produto, cada uma provada por um teste positivo e um negativo,
para que uma construção perigosa reprove o gate em vez de depender da atenção de quem revisa.

## Escopo

**Dentro (duas fatias, nesta ordem):**

- **FT-47 — regras de injeção e execução.** SQL cru (chamadas cruas inseguras do Prisma e consultas montadas por concatenação ou template string), execução dinâmica de código (`eval`, `new Function`, argumentos em string para temporizadores) e SSRF (uma requisição no servidor cuja URL vem de entrada da requisição sem lista de permitidos). Inclui o mecanismo de teste das regras (abaixo) e a execução da varredura completa sobre a árvore atual.
- **FT-48 — regras de segredos, HTML e transporte.** Segredos em código (atribuições de credencial fixas no código e literais com formato de token; a lista de famílias é compartilhada com a OPS-27 e fica com quem o `@architect` nomear, nunca copiada duas vezes), `dangerouslySetInnerHTML` como regra estruturada de JSX (substituindo a busca de texto simples) e cabeçalhos e cookies (cookies definidos sem `httpOnly`, `secure` ou `sameSite`, CORS com curinga e credenciais, apenas para construções que existem no código).
- **Mecanismo de teste das regras** (fixado pelo `@architect`): o modo de teste do scanner com fixtures anotadas ou um teste do Vitest que roda o scanner sobre arquivos de fixture. As fixtures ficam onde a varredura real do projeto não as reporta como achados do projeto.

**Fora do escopo:**

- Varredura de dependências (`npm audit`, SCA), DAST, proteção em tempo de execução, um segundo scanner, regras de segurança do Biome, correções automáticas (o scanner nunca edita arquivos).
- Linguagens diferentes de JavaScript e TypeScript. O provedor de revisão antigo em qualquer forma.
- Mudar o comportamento do produto para satisfazer uma regra, exceto por uma correção test-first de um achado real.
- Bump de versão, commit, push, PR, release.

## Critérios de aceite

As classes de evidência ficam separadas: testes unitários/de regra, a varredura da árvore completa, CI. Toda regra começa com um teste que falha.

1. **Dada** cada regra nova, **quando** o caso positivo dela é varrido, **então** o scanner reporta o id da regra e `npm run review:static` sai com código diferente de zero; **dado** o caso negativo (a forma segura da mesma construção), **então** nada é reportado.
2. **Dada** cada regra, **então** pelo menos uma variante de evasão é um caso positivo (um alias, uma chamada desestruturada, uma template string ou um valor reatribuído, conforme a construção permitir).
3. **Dada** a árvore atual, **quando** `npm run review:static` roda com todas as regras, **então** sai com zero; todo achado real é corrigido test-first, todo achado aceito é listado na evidência da story com seu motivo, e nenhuma exceção ampla cobre código do produto.
4. **Dado** que cada regra declara `languages: [javascript, typescript]`, **quando** um caso positivo em `.ts` é varrido, **então** a regra dispara (não depende de a conversão da OPS-24 já ter acontecido).
5. **Dado** o padrão de uma regra enfraquecido à mão (uma mutação por regra, registrada pelo `@qa`), **quando** os testes das regras rodam, **então** pelo menos um falha.
6. **Dado** `dangerouslySetInnerHTML` usado como atributo de JSX, **então** a regra estruturada o reporta, a busca de texto simples é removida e as fixtures existentes do `no-unsafe-html-sink` continuam passando.
7. **Dados** os arquivos de teste das regras, **quando** `npm test` roda, **então** eles rodam na suíte normal, e o CI continua rodando `npm run review:static` no job de análise estática.
8. **Dado** `tests/unit/aiox-static-review.test.js`, **então** ele continua passando: o nome do provedor antigo segue bloqueado e o OpenGrep segue como único revisor.
9. **Dada** a documentação, **então** uma página em inglês e em pt-BR lista cada regra, o motivo, as fixtures, como acrescentar uma regra e como um achado aceito é registrado; os testes de contrato de documentação passam.
10. **Dados** os quality gates, **então** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` e `npm run review:static` ficam verdes.

## Dependências

- **Começa depois** de a FT-45 da OPS-27 estar desenhada (a divisão de responsabilidade sobre segredos é fixada antes); fora isso é independente. Ordem recomendada pelo levantamento: depois da OPS-27, da OPS-30 e da OPS-29.
- **OPS-24:** a FT-30 dela muda `languages` nas duas regras existentes; as regras novas desta story declaram as duas linguagens desde o início. A ordem de edição de `.opengrep/rules.yml` é serializada pelo `@architect` (um conjunto de escrita por vez).
- **CI:** o `review:static` já roda no job de análise estática dos quality gates reutilizáveis; não se espera mudança de workflow. Se uma for necessária, exige o desenho do `@architect` e a revisão do `@devops`.
- **Classes de achado a esperar:** o acesso a SQL passa pelo Prisma; o produto faz requisições no servidor para a API da Twitch. A varredura-base da primeira execução decide quantas correções a story absorve.

## Riscos

1. **Falsos positivos** bloqueiam o gate e convidam exceções amplas. Mitigação: CA 3 (sem exceção ampla), casos negativos (CA 1).
2. **Falsos negativos** se escondem em variantes de sintaxe. Mitigação: fixtures de evasão (CA 2) e mutação à mão (CA 5).
3. **Diferenças de sintaxe ou de modo de regra** na versão do scanner fixada no CI. Mitigação: os testes das regras rodam contra a versão fixada usada pelos quality gates.
4. **Escopo que escorrega para correções de produto.** Mitigação: um achado que exija mudança de comportamento vira uma mudança própria, test-first, registrada na evidência.
5. **Sobreposição com a OPS-27.** Mitigação: a divisão de responsabilidade é decidida antes da FT-48.

## Complexidade (estimativa do `@sm`, a confirmar pelo `@architect`)

Escopo 3, integração 1, infraestrutura 2, conhecimento 3, risco 2 = **11 → STANDARD**. Dificuldade **M**, prioridade **P2**.

## Valor de negócio

O scanner que é o único revisor passa a cobrir as classes de vulnerabilidade que machucariam um bot público, com regras cujo comportamento é provado em vez de presumido.

## Plano de testes (teste primeiro)

1. **Testes de regra:** caso positivo, negativo e de evasão por regra, executados no `npm test`.
2. **Varredura da árvore completa:** `npm run review:static` sobre a árvore real; achados corrigidos test-first ou registrados com motivo.
3. **Mutação à mão:** o `@qa` enfraquece cada padrão em sequência e confirma que um teste falha.
4. **Prova em `.ts`:** um caso positivo em `.ts` dispara cada regra.
5. **Gates:** os sete gates do projeto; o `@qa` emite o veredito antes de o `@devops` comitar.

## Meta 9,5 (levantamento de 2026-11-04)

Nota atual (estimativa do Orion): **4,0**. Meta: **9,5**. O `@qa` atesta a nota com a régua de [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (ideia nº 4): cobertura, automação, prova e operação precisam ter média 9,5, nenhuma abaixo de 9,0. Critérios de saída: as seis classes do levantamento têm pelo menos uma regra cada (cobertura); toda regra tem um teste positivo, um negativo e um de evasão e uma mutação à mão que falha (prova, CAs 1, 2, 5); a varredura da árvore completa sai com zero sem exceção ampla (CA 3); as regras rodam no `npm test` e no CI (CA 7); a página das regras existe nos dois idiomas (CA 9). Nenhuma parte depende do proprietário.

## Gates de planejamento antes da implementação

- [ ] Validação do `@po` (10 pontos) e GO.
- [ ] O `@devops` cria a issue no GitHub.
- [ ] `@architect`: mecanismo de teste das regras, lista de regras contra as construções que o produto realmente usa, divisão de responsabilidade sobre segredos (com a OPS-27), ordem em relação à FT-30 da OPS-24 em `.opengrep/rules.yml`.
- [ ] Plano de testes do `@qa` (fixtures, variantes de evasão, mutações à mão, tratamento da varredura-base).
- [ ] Nota do `@analyst` só se houver LACUNA; [research-index.md](../../research-index.md) consultado antes.
- [ ] Gate de UX: não se aplica; o `@po` confirma na validação.

## Definição de pronto

- CAs 1 a 10 com evidência Red-first por classe; achados aceitos listados com motivos.
- Quality gates verdes; veredito do `@qa` e atestado do 9,5 registrados; File List e checklists atualizados em inglês e pt-BR.

## Validação do rascunho pelo SM (story-draft-checklist, 2026-11-04)

1. Objetivo e contexto: claros (duas regras hoje, seis classes faltando, revisor único). PASS.
2. Orientação técnica: classes, linguagens, fixtures e o mecanismo de teste; pontos em aberto atribuídos ao `@architect`. PASS.
3. Referências: ideia nº 4 do levantamento, arquivo de regras, o teste de revisão estática, OPS-27 e OPS-24. PASS.
4. Autossuficiência: escopo, fora do escopo e sobreposições conhecidas declarados. PASS.
5. Testes: positivo, negativo, evasão, mutação, `.ts`. PASS.
6. Análise estática: `npm run review:static` é o assunto e um gate. PASS.
- Resultado: pronta para o `@po`. Nenhum texto de regra foi inventado; os padrões das regras são para o `@dev` escrever test-first.

## File List

- `docs/stories/OPS-28/story.md` (novo)
- `docs/pt-BR/stories/OPS-28/story.md` (novo)
- `docs/stories.md` e `docs/pt-BR/stories.md` (entrada no índice)
- `docs/process/backlog-inventory.md` e `docs/process/kanban-board-design.md` e as versões pt-BR (itens ST-21, FT-47, FT-48)

Os arquivos de implementação serão listados aqui pelo `@dev` depois dos gates.

## Change Log

- 2026-11-04 — `@sm` (River): story redigida a partir da ideia nº 4 do levantamento de melhorias. Status Draft. Fatias FT-47 e FT-48 registradas.
