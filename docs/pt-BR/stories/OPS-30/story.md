# OPS-30 — Job de CI para os scripts E2E de navegador (`*-browser-only`)

[English](../../../stories/OPS-30/story.md)

**Status:** Draft (redigida pelo `@sm` em 2026-11-04; ainda não validada pelo `@po`). **Issue:** [#105](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/105) (criada pelo `@devops` antes de 2026-11-05 a partir de [improvement-issue-bodies-2026-11-04.md](../../process/improvement-issue-bodies-2026-11-04.md); sem comentários em issues).
**Origem:** ideia nº 1 do [levantamento de melhorias](../../process/improvement-ideas-2026-11-04.md) (pedido do proprietário, 2026-11-04); item **TS-17** do inventário, cuja story própria é esta (decisão do proprietário de 2026-10-30: story própria, passando pelo `@qa`). Evidência: nenhum workflow roda os scripts de navegador; o `queue-lifecycle` ficou quebrado em 4 de 4 execuções sem nenhum alerta (achado M-2, defeito do harness corrigido em `8bb05d8`).
**Relacionadas:** TS-15 (teste instável de exclusão de fila no Chromium, concluído), OPS-15 onda 4 / FT-42 (reaponta o job `web`, renomeado `frontend`), OPS-27 e OPS-29 (também mudam jobs de CI; as edições de workflow são em série), [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (régua de 9,5, ideia nº 1, ações AÇ-01..AÇ-05).
**Itens registrados:** inventário ST-23 (esta story), TS-17 (o item de teste que ela entrega), FT-51 e FT-52 (fatias); ver [backlog-inventory](../../process/backlog-inventory.md).
**Nota sobre a contagem:** o levantamento fala em 12 scripts; `tests/e2e/` tem **13** arquivos `*-browser-only` e o `package.json` tem 13 entradas correspondentes em 2026-11-04. A primeira ação confirma o número; a lista do job vem da pasta, então a contagem não volta a ficar desatualizada.
**Coordenação necessária:** `$aiox-po` (validação), `$aiox-architect` (forma do job, Chrome no CI, Next dev em HTTPS, tempo de execução e timeout), `$aiox-devops` (issue; revisa o workflow; **nenhuma mudança de workflow sem `@architect` e `@devops`**), `$aiox-qa` independente (plano de testes, evidência de estabilidade, atestado do 9,5). `$aiox-ux-design-expert` e `$aiox-data-engineer`: não se aplicam (sem texto visível, sem schema).

## Problema

- Os scripts que exercitam o painel real em um navegador real só rodam quando alguém se lembra de rodá-los. Uma quebra fica invisível: o `queue-lifecycle` esteve vermelho em 4 de 4 execuções e nada alertou ninguém.
- Um script instável também não é confiável, e o reflexo comum de repetir até passar esconde o defeito que o torna instável.

## História

Como proprietário que depende de evidência de navegador para cada mudança do painel,
quero que todo script E2E de navegador rode no CI e reprove o build quando um quebrar, com a instabilidade investigada em vez de repetida,
para que um fluxo quebrado do painel apareça no pull request e não durante uma live.

## Escopo

**Dentro (duas fatias, nesta ordem):**

- **FT-51 — o job de CI e o contrato dele.** Um job que sobe o painel Next em desenvolvimento em HTTPS, usa o Chrome e roda todo script `*-browser-only`; um script vermelho reprova o job. A lista de scripts vem da pasta (ou é fixada e conferida contra ela), de modo que um script novo não fica de fora. Artefatos de falha (logs, capturas de tela) são enviados sem segredos. Um teste de contrato do workflow fixa o job, a ausência de repetições e a conferência de divergência da lista.
- **FT-52 — prova de estabilidade e política de instabilidade.** Execuções repetidas mostram que todo script é estável; cada script instável recebe uma causa raiz registrada e uma correção (test-first quando a causa está no produto); a política "investigar, nunca repetir até passar" é escrita e imposta pelo teste de contrato (sem configuração de repetição, sem falha tolerada).

**Fora do escopo:**

- Cenários E2E novos (pertencem à FT-03/FT-06), OBS nativo e Twitch real, navegadores no Windows e no macOS.
- Mudar o comportamento do produto, exceto por uma correção test-first de um defeito real que o job expuser.
- Marcar o job como check obrigatório do repositório (uma configuração do repositório; registrada como acompanhamento para o orquestrador e o `@devops`, sem inventar decisão do proprietário).
- Release, tag, bump.

## Critérios de aceite

As classes de evidência ficam separadas: contrato, execuções locais, CI. Todo comportamento começa com um teste que falha.

1. **Dados** os arquivos `*-browser-only` em `tests/e2e/`, **quando** o job roda, **então** todos eles rodam; um teste de contrato falha se existir um arquivo que o job não rodaria.
2. **Dado** um script feito para falhar de propósito (quebra plantada, descartada depois), **quando** o job roda, **então** o job fica vermelho e nomeia o script.
3. **Dado** o job, **então** ele sobe o Next dev em HTTPS e usa o Chrome exatamente como os scripts esperam localmente; o tempo de execução medido é registrado e um timeout com margem é definido pelo `@architect`.
4. **Dada** uma falha, **então** logs e capturas de tela são enviados como artefatos e não contêm token, cabeçalho nem corpo de chat/resgate (conferido com a verificação da OPS-27 quando ela existir, à mão até lá).
5. **Dado** o workflow, **então** não existe repetição, ação de reexecução nem falha tolerada para esses scripts; o teste de contrato falha se alguma for acrescentada.
6. **Dado** o conjunto completo rodado em sequência em um checkout limpo, **então** ele passa sem nenhuma falha pelo número de execuções que o `@architect` fixar (proposta: 10 execuções locais); **dado** o job em commits distintos, **então** ele fica verde sem nenhuma reexecução pelo número de execuções que o `@architect` fixar (proposta: 5).
7. **Dado** um script que falha uma vez, **então** a causa raiz é registrada na evidência da story e corrigida; ele não é repetido até ficar verde.
8. **Dada** a documentação, **então** uma página em inglês e em pt-BR declara a política, como rodar um script localmente e como ler os artefatos; os testes de contrato de documentação passam.
9. **Dados** os quality gates, **então** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` e `npm run review:static` ficam verdes.

## Dependências

- **Depende de:** GO do `@po` e issue; o desenho do `@architect`; a revisão do workflow pelo `@devops`; estabilidade dos scripts (TS-15 concluída; M-2 corrigido em `8bb05d8`).
- **Em série com** a FT-46 da OPS-27 e com a OPS-29 (mesmos arquivos de workflow, um conjunto de escrita por vez). A ordem do levantamento é OPS-27, depois a ideia nº 2, depois esta story, depois a OPS-29.
- **Onda 4 da OPS-15 (FT-42):** reaponta o job `web` (renomeado `frontend`); o job novo recebe um nome distinto e é revisitado quando a onda 4 entrar.
- **Evidência de CI:** um pull request ou um disparo manual do workflow (delegado ao orquestrador); o CI não roda em simples pushes de branch.

## Riscos

1. **Um script instável bloqueia todo pull request.** Mitigação: a FT-52 antes de confiar no job; instabilidade é um defeito a corrigir, não a esconder.
2. **A preparação de Chrome ou HTTPS difere no CI.** Mitigação: o CA 3 declara a preparação exata; primeira execução em uma branch descartável.
3. **O tempo de execução alonga o pipeline.** Mitigação: o tempo medido é registrado; o `@architect` pode dividir o job.
4. **Artefatos vazam dados.** Mitigação: CA 4.
5. **Conflitos de edição de workflow.** Mitigação: a serialização acima.

## Complexidade (estimativa do `@sm`, a confirmar pelo `@architect`)

Escopo 2, integração 3, infraestrutura 3, conhecimento 2, risco 3 = **13 → STANDARD**. Dificuldade **M**, prioridade **P2**.

## Valor de negócio

A única evidência que exercita o painel real em um navegador real passa a ser automática e confiável; um fluxo que quebra é pego no pull request.

## Plano de testes (teste primeiro)

1. **Contrato:** o teste de contrato do workflow fixa o job, a conferência de divergência da lista e a ausência de repetições.
2. **Quebra plantada:** o `@qa` faz um script falhar em uma branch descartável e confirma o job vermelho.
3. **Estabilidade:** as execuções locais em sequência e as execuções de CI do CA 6, com toda falha investigada.
4. **Gates:** os sete gates do projeto; o `@qa` emite o veredito antes de o `@devops` comitar.

## Meta 9,5 (levantamento de 2026-11-04)

Nota atual (estimativa do Orion): **4,0**. Meta: **9,5**. O `@qa` atesta a nota com a régua de [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (ideia nº 1). Critérios de saída: todos os scripts de navegador no job com conferência de divergência (CA 1); uma quebra plantada deixa o job vermelho (CA 2); nenhuma repetição em lugar nenhum, fixada pelo contrato (CA 5); números de estabilidade atingidos sem reexecução (CA 6, 7); artefatos seguros (CA 4); política documentada nos dois idiomas (CA 8). Nenhuma parte depende do proprietário.

## Gates de planejamento antes da implementação

- [ ] Validação do `@po` (10 pontos) e GO.
- [ ] O `@devops` cria a issue no GitHub.
- [ ] `@architect`: forma do job, preparação de Chrome e HTTPS, timeout, números de estabilidade, nome em relação à onda 4.
- [ ] Plano de testes do `@qa` (quebra plantada, método de estabilidade, conferência dos artefatos).
- [ ] Gates de UX e de dados: não se aplicam; o `@po` confirma na validação.

## Definição de pronto

- CAs 1 a 9 com evidência registrada por classe; a parte do CI é executada em PR ou disparo manual ou registrada como pendente.
- Quality gates verdes; veredito do `@qa` e atestado do 9,5 registrados; File List e checklists atualizados em inglês e pt-BR.

## Validação do rascunho pelo SM (story-draft-checklist, 2026-11-04)

1. Objetivo e contexto: claros (quebras invisíveis, 4 de 4 falhas, reflexo de repetir). PASS.
2. Orientação técnica: forma do job nomeada, pontos em aberto atribuídos ao `@architect`; discrepância de contagem (12 contra 13) explicitada. PASS.
3. Referências: ideia nº 1 do levantamento, TS-17, TS-15, correção do M-2. PASS.
4. Autossuficiência: escopo, fora do escopo, serialização e caminho da evidência de CI declarados. PASS.
5. Testes: contrato, quebra plantada, execuções de estabilidade. PASS.
6. Análise estática: `npm run review:static` nos gates. PASS.
- Resultado: pronta para o `@po`. Os números de estabilidade estão marcados como propostas para o `@architect`.

## File List

- `docs/stories/OPS-30/story.md` (novo)
- `docs/pt-BR/stories/OPS-30/story.md` (novo)
- `docs/stories.md` e `docs/pt-BR/stories.md` (entrada no índice)
- `docs/process/backlog-inventory.md` e `docs/process/kanban-board-design.md` e as versões pt-BR (itens ST-23, FT-51, FT-52; a TS-17 aponta para cá)

Os arquivos de implementação serão listados aqui pelo `@dev` depois dos gates.

## Change Log

- 2026-11-04 — `@sm` (River): story redigida a partir da ideia nº 1 do levantamento de melhorias e do item TS-17 do inventário. Status Draft. Fatias FT-51 e FT-52 registradas.
