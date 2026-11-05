# OPS-29 — Instalação limpa no CI: clone limpo e primeiro uso em Linux, macOS e Windows

[English](../../../stories/OPS-29/story.md)

**Status:** Draft (redigida pelo `@sm` em 2026-11-04; ainda não validada pelo `@po`). **Issue:** pendente (o `@devops` cria a partir de [improvement-issue-bodies-2026-11-04.md](../../process/improvement-issue-bodies-2026-11-04.md); sem comentários em issues).
**Origem:** ideia nº 10 do [levantamento de melhorias](../../process/improvement-ideas-2026-11-04.md) (pedido do proprietário, 2026-11-04). Evidência: o bug `create_host_path` do Compose só apareceu em um runner novo, porque toda execução anterior acontecia com a pasta já criada ([session-handoff](../../session-handoff.md), estado de 2026-10-30).
**Relacionadas:** OPS-30 e OPS-27 (também acrescentam ou mudam jobs de CI; as edições de workflow são em série); OPS-12 (UX do instalador para o `rc`, adiada); OPS-15 (a onda 4 do cutover reaponta o job `web`); [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (régua de 9,5, ideia nº 10, ações AÇ-43..AÇ-47).
**Itens registrados:** inventário ST-22 (esta story), FT-49 e FT-50 (fatias); ver [backlog-inventory](../../process/backlog-inventory.md).
**Coordenação necessária:** `$aiox-po` (validação), `$aiox-architect` (forma do job por sistema operacional, o que cada runner hospedado consegue provar de verdade, tempo de execução), `$aiox-devops` (issue; revisa o workflow), `$aiox-qa` independente (plano de testes, regressão plantada, atestado do 9,5), `$aiox-analyst` só para uma LACUNA (motor de contêineres nos runners hospedados de macOS e Windows; consulte antes [research-index.md](../../research-index.md)). `$aiox-ux-design-expert`: não se aplica (sem mudança de texto visível). `$aiox-data-engineer`: só para confirmar que "a atualização preserva os dados" não muda um schema.

## Problema

- Hoje o smoke do instalador roda em runners Linux, macOS e Windows com um Docker falso isolado (quality gates reutilizáveis), e a integração do Compose roda no Linux com a árvore de trabalho e pastas que já existem. Nenhum job parte de um **clone limpo sem nenhuma pasta preexistente** e percorre o fluxo de primeiro uso que uma pessoa nova segue: instalar, iniciar, abrir o painel, atualizar.
- A classe de bug "funciona porque a pasta já estava lá" é invisível a toda execução que reaproveita um checkout preparado. Ela só apareceu em um runner novo, depois do fato.
- Os runners diferem: contêineres Linux reais rodam no runner Linux; os runners hospedados de macOS e Windows podem não oferecer um motor de contêineres Linux (não verificado aqui). O que cada job prova deve ser dito, não insinuado.

## História

Como proprietário que entrega um instalador a pessoas que não têm nenhuma pasta preparada,
quero um job de CI que parta de um clone limpo e percorra o fluxo de primeiro uso em cada sistema operacional sem nada pré-criado,
para que um defeito que depende de estado preexistente falhe no CI e não em uma máquina nova.

## Escopo

**Dentro (duas fatias, nesta ordem):**

- **FT-49 — Linux, Docker real.** Clone limpo em um workspace vazio; um passo de asserção prova que as pastas de dados e de bind mount não existem no início; fluxo de primeiro uso documentado: instalar, iniciar, abrir (o painel e o `/health` respondem), atualizar (uma segunda execução para uma tag mais nova, dados preservados). Prova de regressão plantada (abaixo).
- **FT-50 — macOS e Windows.** O mesmo fluxo nos passos que cada runner hospedado consegue provar de verdade (empacotamento, execução do instalador a partir de um diretório de usuário limpo sem pasta da aplicação; passos com contêiner real só se o runner tiver um motor). Cada passo registra se rodou contra Docker real ou contra o falso isolado, de modo que a classe de evidência fica explícita; o que não pode ser provado no CI continua declarado e continua com os itens do proprietário (D-05 para macOS, OW-01 para Windows).

**Fora do escopo:**

- Uma máquina Windows ou macOS real (evidência do proprietário, OW-01 e D-05), OBS nativo e Twitch real (OW-03, OW-04, OW-16).
- Mudar o comportamento do instalador, arquivos do Compose ou código do produto, exceto por uma correção test-first de um defeito que o job novo encontrar.
- UX do instalador para o `rc` (OPS-12). Release, tag, bump.

## Critérios de aceite

As classes de evidência ficam separadas: unitário/contrato, CI em Docker real, CI com o falso isolado, proprietário. Todo comportamento começa com um teste que falha.

1. **Dado** que o job começa, **quando** o primeiro passo roda, **então** uma asserção prova que cada pasta de dados e cada origem de bind mount está ausente (listadas pelo `@architect` a partir dos arquivos do Compose e do instalador), e o job falha se alguma existir; o auxiliar da asserção tem teste unitário para os dois resultados.
2. **Dado** um clone limpo no runner Linux com Docker real, **quando** o fluxo roda, **então** instalar, iniciar, abrir (painel e `/health` respondem) e atualizar passam nessa ordem sem nenhuma pasta criada à mão.
3. **Dado** o passo de atualização, **quando** roda contra uma tag mais nova, **então** os dados criados antes da atualização continuam presentes depois dela, e a versão exibida muda.
4. **Dada** uma regressão plantada que faz o fluxo depender de uma pasta preexistente (o inverso da correção do `create_host_path`), **quando** o job roda, **então** ele falha; a mudança plantada é provada pelo `@qa` em uma branch descartável ou pelo equivalente local, e depois descartada.
5. **Dados** os jobs de macOS e Windows, **quando** rodam, **então** cada passo é rotulado "Docker real" ou "falso isolado", a asserção de diretório limpo passa e a documentação diz o que o falso não prova.
6. **Dado** o job existente installer-smoke, **então** ele é reaproveitado ou estendido, não duplicado; o `@architect` registra a decisão de sobreposição.
7. **Dado** o teste de contrato do workflow, **então** ele fixa os três sistemas operacionais, a asserção de estado limpo e a ordem dos passos.
8. **Dado** o tempo de execução medido do job, **então** ele é registrado na evidência e fica dentro do timeout que o `@architect` fixar.
9. **Dada** a documentação, **então** uma página em inglês e em pt-BR explica a verificação de instalação limpa, as classes de evidência e os limites; os testes de contrato de documentação passam.
10. **Dados** os quality gates, **então** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` e `npm run review:static` ficam verdes.

## Dependências

- **Depende de:** GO do `@po` e issue; o desenho do `@architect` (edição de workflow só com ele e a revisão do `@devops`); a evidência de CI precisa de um pull request ou de um disparo manual do workflow (delegado ao orquestrador).
- **Em série com** a FT-46 da OPS-27 e com a OPS-30 (mesmos arquivos de workflow, um conjunto de escrita por vez); ordem recomendada pelo levantamento: depois da OPS-27 e da OPS-30.
- **Onda 4 da OPS-15 (FT-42):** reaponta o job `web` (renomeado `frontend`); os nomes de job acrescentados aqui não podem colidir com essa mudança.
- **Capacidade do runner:** se os runners hospedados de macOS e Windows conseguem rodar contêineres Linux é uma verificação de LACUNA (research-index primeiro, `@analyst` só se for LACUNA). O resultado decide quanto a FT-50 consegue provar de verdade.

## Riscos

1. **Um job verde no Docker falso é lido como validação real.** Mitigação: o CA 5 rotula cada passo; a documentação declara o limite.
2. **Tempo de execução longo em três runners.** Mitigação: CA 8, um job por sistema operacional, nenhuma matriz nova além dos três.
3. **Conflitos de edição de workflow.** Mitigação: a serialização acima.
4. **O job encontra um defeito real e aumenta o escopo.** Mitigação: cada defeito é uma correção própria, test-first, registrada na evidência.
5. **Instabilidade de imagem ou de rede nos runners hospedados.** Mitigação: um passo instável é investigado e nunca repetido até passar.

## Complexidade (estimativa do `@sm`, a confirmar pelo `@architect`)

Escopo 3, integração 2, infraestrutura 4, conhecimento 3, risco 2 = **14 → STANDARD**. Dificuldade **M**, prioridade **P2**.

## Valor de negócio

A primeira instalação de uma pessoa nova é exercitada a cada mudança, e uma classe de bug de pasta ausente deixa de ser descoberta pela primeira pessoa usuária real.

## Plano de testes (teste primeiro)

1. **Unitário:** o auxiliar da asserção de estado limpo (ausente / presente).
2. **Contrato:** o teste de contrato do workflow fixa sistemas, asserção e ordem.
3. **CI Docker real (Linux):** o fluxo completo; **CI com falso isolado (macOS, Windows):** os passos que o runner consegue provar, rotulados.
4. **Regressão plantada:** o `@qa` reintroduz a dependência de pasta preexistente em uma branch descartável e confirma que o job falha.
5. **Gates:** os sete gates do projeto; o `@qa` emite o veredito antes de o `@devops` comitar.

## Meta 9,5 (levantamento de 2026-11-04)

Nota atual (estimativa do Orion): **6,0**. Meta: **9,5**. O `@qa` atesta a nota com a régua de [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (ideia nº 10). Critérios de saída: asserção de estado limpo em todo sistema operacional (CA 1, 5); fluxo com Docker real no Linux, com atualização e dados preservados (CA 2, 3); regressão plantada deixa o job vermelho (CA 4); cada passo rotulado pela classe de evidência (CA 5); teste de contrato e documentação (CA 7, 9). Parte depende da capacidade do runner e do proprietário: a evidência real de Windows e macOS continua com a OW-01 e a D-05, então a dimensão de cobertura é definida como "tudo que um runner hospedado consegue provar, o resíduo declarado"; os agentes nunca alegam a parte do proprietário.

## Gates de planejamento antes da implementação

- [ ] Validação do `@po` (10 pontos) e GO.
- [ ] O `@devops` cria a issue no GitHub.
- [ ] `@architect`: forma do job por sistema operacional, lista de asserções, sobreposição com o smoke do instalador existente, timeout.
- [ ] `@data-engineer`: confirmar que "a atualização preserva os dados" não implica mudança de schema (ou não se aplica).
- [ ] Plano de testes do `@qa` (regressão plantada, classes de evidência, rótulos).
- [ ] Nota do `@analyst` só se a pergunta do motor de contêineres for uma LACUNA; [research-index.md](../../research-index.md) consultado antes.
- [ ] Gate de UX: não se aplica; o `@po` confirma na validação.

## Definição de pronto

- CAs 1 a 10 com evidência Red-first por classe; a parte do CI é executada em PR ou disparo manual ou registrada como pendente.
- Quality gates verdes; veredito do `@qa` e atestado do 9,5 registrados; File List e checklists atualizados em inglês e pt-BR.

## Validação do rascunho pelo SM (story-draft-checklist, 2026-11-04)

1. Objetivo e contexto: claros (classe de bug, cobertura atual, lacuna). PASS.
2. Orientação técnica: jobs existentes nomeados, diferenças de runner declaradas, pontos em aberto atribuídos ao `@architect`. PASS.
3. Referências: ideia nº 10 do levantamento, session handoff, workflow dos quality gates. PASS.
4. Autossuficiência: classes de evidência e limites explícitos. PASS.
5. Testes: teste unitário da asserção, contrato, regressão plantada. PASS.
6. Análise estática: `npm run review:static` nos gates. PASS.
- Resultado: pronta para o `@po`. A pergunta sobre a capacidade do runner está marcada como não verificada, não presumida.

## File List

- `docs/stories/OPS-29/story.md` (novo)
- `docs/pt-BR/stories/OPS-29/story.md` (novo)
- `docs/stories.md` e `docs/pt-BR/stories.md` (entrada no índice)
- `docs/process/backlog-inventory.md` e `docs/process/kanban-board-design.md` e as versões pt-BR (itens ST-22, FT-49, FT-50)

Os arquivos de implementação serão listados aqui pelo `@dev` depois dos gates.

## Change Log

- 2026-11-04 — `@sm` (River): story redigida a partir da ideia nº 10 do levantamento de melhorias. Status Draft. Fatias FT-49 e FT-50 registradas.
