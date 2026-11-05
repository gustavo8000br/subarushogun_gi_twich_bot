# Ações de melhoria 2026-11-04 — a régua de 9,5, critérios de saída e ações numeradas

[English](../../process/improvement-actions-2026-11-04.md)

**Data:** 2026-11-04. **Autor:** `@sm` (River). **Branch:** `feat/ops-15-next-panel`. **Escopo:** somente documentação; nada foi criado nem editado no GitHub (o `@devops` faz isso em seguida). **Entrada:** [improvement-ideas-2026-11-04.md](improvement-ideas-2026-11-04.md) (10 ideias, as notas são estimativas do Orion). **Pedido do proprietário (2026-11-04):** registrar as ideias em cards e stories e organizá-las em ações que os agentes seguem; meta **9,5** para cada uma.

**Nota de escrita:** os padrões da guarda contra vazamento aparecem de forma desarmada (`claude\.ai/` como expressão regular; o nome `Claude-Session` sem os dois-pontos), para que a futura verificação da OPS-27 não acuse este documento.

## 1. Como ler este documento

- As notas "hoje" vêm do levantamento e são **estimativas, não medições**. O `@qa` é o único agente que atesta uma nota, com a régua abaixo, registrando evidência. Nenhum outro agente escreve "9,5" como resultado.
- Cada ideia tem um **veículo** (uma story, fatia ou item que já está no [inventário](backlog-inventory.md)), **critérios de saída** que um agente consegue verificar, **ações numeradas** (AÇ-NN) que um agente pega sem perguntar e uma **parte do proprietário** quando ela existe.
- As stories existentes (OPS-21, OPS-23, OPS-24) mantêm escopo e critérios de aceite; só ganharam uma seção curta "Meta 9,5 (levantamento de 2026-11-04)" que aponta para cá.
- Números marcados como "proposta" são para o `@architect` confirmar; nada aqui é fato medido.

## 2. A régua de 9,5 (comum às 10 ideias)

### 2.1 Quatro dimensões, peso igual

| Dim | Nome | Pergunta que responde |
|---|---|---|
| C | Cobertura | Cobre todo caso que a ideia nomeia, e a lista de casos está fixada de modo que um caso novo não fica de fora? |
| A | Automação | Roda sozinha no gate local e no CI, reprovando o build quando quebra? |
| P | Prova | Foi provada falhando quando deve (violação plantada) e resistindo a uma implementação enfraquecida (mutação à mão), com as classes de evidência separadas? |
| O | Operação | Está documentada em inglês e em pt-BR, declara seus limites e falsos positivos, e a próxima pessoa consegue estendê-la? |

### 2.2 Âncoras (0 a 10 por dimensão)

| Nota | Significado |
|---|---|
| 0 | Ausente. |
| 3 | Pretendida ou só manual; nada a prova. |
| 5 | Parcial: parte dos casos, ou manual, ou fora do CI. |
| 7 | Automatizada para os casos principais e verde, mas com uma lacuna sem teste ou sem prova no CI. |
| 9,5 | Completa para a ideia, automatizada localmente e no CI, provada por violação plantada e por mutações à mão, documentada nos dois idiomas, com todo limite restante escrito. |
| 10 | Reservada: 9,5 mais uma confirmação externa ao longo do tempo (por exemplo uma execução real do proprietário). Agentes nunca alegam 10. |

### 2.3 Cálculo e atestado

- **Nota = média simples de C, A, P e O.** Sem pesos escondidos.
- **O `@qa` atesta 9,5 somente se** a média for pelo menos 9,5, **nenhuma dimensão ficar abaixo de 9,0** e não houver achado ALTO em aberto. Caso contrário o `@qa` registra a média real e a dimensão que a segura.
- **Onde fica registrado:** o arquivo de gate do `@qa` da story (veredito PASS / CONCERNS / FAIL / WAIVED mais as quatro notas de dimensão com a evidência), e a seção "Meta 9,5" da story recebe um link para ele.
- **As classes de evidência ficam separadas** (fixtures, unitário, PostgreSQL isolado com migrations reais, serviços, navegador, OBS nativo, Twitch ao vivo). Uma nota nunca empresta evidência de uma classe mais forte do que a que rodou.

### 2.4 Definições usadas pelos critérios

- **Violação plantada:** um defeito acrescentado de propósito (em uma branch descartável ou em uma fixture temporária) para provar que o gate falha; é descartado depois e a prova é registrada.
- **Mutação à mão:** o `@qa` enfraquece uma regra, padrão ou guarda na implementação (por exemplo afrouxa uma expressão regular ou remove uma checagem) e roda os testes; pelo menos um teste precisa falhar. Nenhuma ferramenta de mutação entra como dependência sem aprovação do `@architect`.
- **Evidência de CI:** o CI roda em pull requests e em disparo manual, não em simples pushes de branch. O orquestrador tem a autoridade delegada (2026-10-29) de enviar a branch e criar ou atualizar pull requests; merge, tag e release continuam com o proprietário.

## 3. Resumo

| # | Ideia | Hoje | Veículo | Parte do proprietário | Teto só com agentes | Agente e modelo | Depende de |
|---|---|---|---|---|---|---|---|
| 5 | Guarda contra vazamento | 5,0 | OPS-27 (ST-20, FT-45, FT-46) | nenhuma | 9,5 | `@architect`, `@dev`, `@qa`; Sonnet 5.5 | Pacote da OPS-22 comitado; edições de workflow em série |
| 2 | Timeout nas leituras | 5,0 | FT-44 dentro da OPS-23 | nenhuma | 9,5 | `@po`, `@architect`, `@ux-design-expert` (se houver texto), `@dev`, `@qa`; Sonnet 5.5 | O `@po` posiciona a FT-44; caminho de resultado incerto da OPS-21; FT-13 (mesmo arquivo do cliente) |
| 1 | E2E de navegador no CI | 4,0 | OPS-30 (ST-23, TS-17, FT-51, FT-52) | nenhuma | 9,5 | `@architect`, `@dev`, `@qa`; Sonnet 5.5 | Estabilidade dos scripts (TS-15 concluída, M-2 corrigido); nome da FT-42; serialização de workflow |
| 10 | Instalação limpa | 6,0 | OPS-29 (ST-22, FT-49, FT-50) | evidência real de Windows e Mac | 9,5 no que os runners provam; resíduo declarado | `@architect`, `@dev`, `@qa`; Sonnet 5.5 | Serialização de workflow com a OPS-30; verificação da LACUNA de capacidade do runner |
| 4 | Varredura estática | 4,0 | OPS-28 (ST-21, FT-47, FT-48) | nenhuma | 9,5 | `@architect`, `@dev`, `@qa`; Sonnet 5.5 | Desenho da FT-45 da OPS-27 (dono dos segredos); ordem em `.opengrep/rules.yml` com a FT-30 da OPS-24 |
| 6 | Contrato da API do painel | 5,5 | OPS-21 (ST-09, FT-11..FT-17) | D-09 / OW-15 (fechar com a fatia 7 aberta) e o valor do timeout D-10 | 9,5 só com a fatia 7 feita depois do cutover; senão declarada na fatia aberta | `@architect` (ordem dos 3 ciclos), `@data-engineer`, `@dev`, `@ux-design-expert`, `@qa`; Sonnet 5.5, Opus 5.5 só para o desenho da máquina de estados de idempotência se o `@architect` justificar | Ordem do `@architect`; FT-02; GV-03; cutover para a FT-17 |
| 7 | Atualização ao vivo (SSE) | 5,5 | OPS-23 (ST-16, FT-27..FT-29) | texto OD-23-1 (decidido) | 9,5 | `@architect`, `@ux-design-expert`, `@dev`, `@qa`; Sonnet 5.5 | FT-30 e FT-32 (TS-0 e TS-2 da OPS-24); ordem em relação à FT-01 |
| 3 | Tipagem | 5,0 | TS-16 e OPS-24 (ST-17, FT-30..FT-35) | nenhuma para o código; evidência de CI por pull request | 9,5 só quando a OPS-24 fechar | `@architect`, `@data-engineer`, `@dev`, `@qa`; Sonnet 5.5, Opus 5.5 só para a divisão do `queue-repository` se justificado | FT-30 e FT-42; OPS-22 integrada nos mesmos arquivos |
| 9 | Acessibilidade provada | 6,0 | Existente: A-05 / OW-06 (dependência da FT-01) | leitor de tela, layout 390x844, foco: A-05 | cerca de 7,0 | `@ux-design-expert`, `@dev`, `@qa`; Sonnet 5.5 | FT-01; sessão do proprietário |
| 8 | Validação fora do Ubuntu | 3,0 | Existentes: A-02 / OW-03, D-05 / OW-07, OW-16, A-01 / OW-01 | todos os resultados nativos | cerca de 7,0 | `@architect`, `@dev`, `@qa`; Sonnet 5.5 | sessões do proprietário; aceite da FND-9 |

O "teto só com agentes" das ideias 8 e 9 é calculado com a régua, não chutado: #8 = C 7, A 8, P 5, O 8 (média 7,0) e #9 = C 8, A 9, P 3, O 8 (média 7,0), porque a dimensão Prova não pode passar do que nenhum humano executou. A parte do proprietário nunca é alegada por agentes.

## 4. Ordem recomendada

Um agente por vez enquanto a cota semanal está apertada (proprietário, 2026-10-29); um conjunto de escrita por vez em cada arquivo (os workflows são compartilhados pelas ideias 5, 1 e 10; `.opengrep/rules.yml` pelas ideias 4 e 3).

| Passo | Ideia | Por que aqui | Ordem no quadro |
|---|---|---|---|
| 0 | Pré-condição | O pacote da OPS-22 é comitado depois do veredito do `@qa` (Orion, 2026-11-04). | 8 |
| 1 | **#5** guarda contra vazamento (OPS-27) | A mais barata, de maior retorno, nada a bloqueia e protege os commits de tudo que vem depois (decisão do Orion). | 8.3 |
| 2 | **#2** timeout nas leituras (FT-44) | Pequena; o `@po` primeiro a posiciona na OPS-23 ou em story própria. | 8 (card existente) |
| 3 | **#1** E2E de navegador no CI (OPS-30) | Média; os scripts estão estáveis o bastante desde a TS-15 e o M-2; edita workflows (depois da edição de workflow da #5). | 8.4 |
| 4 | **#10** instalação limpa (OPS-29) | Média; edita os mesmos workflows, então segue a #1. | 8.5 |
| 5 | **#4** regras estáticas (OPS-28) | Média; precisa do desenho da OPS-27 sobre segredos e de uma ordem com a FT-30 da OPS-24 no arquivo de regras. | 8.6 |
| 6 | **#6** contrato da API do painel (OPS-21) | Grande; o `@architect` primeiro fixa a ordem dos 3 ciclos; a fatia 7 espera o cutover. | passos existentes 7, 9, 14 |
| 7 | **#7** atualização ao vivo (OPS-23) | Grande; espera a FT-30 e a FT-32 e a ordem em relação à FT-01. | passo existente 8 |
| 8 | **#3** tipagem (TS-16 e OPS-24) | Grande; a TS-16 depois da FT-30 e da FT-42; as pastas seguem a ordem de dependência da OPS-24. | passo existente 16 |
| Trilha paralela | **#9** e **#8** | A parte dos agentes (scripts, axe automatizado, checklists) é barata e cabe em qualquer intervalo; as partes do proprietário são agendadas nas sessões dele (seção 6). | passos existentes 10 e 19 |

## 5. Ideias, critérios de saída e ações

Formato da ação: **ID, agente (modelo), entrada, saída, pronto quando.** O modelo padrão é Sonnet 5.5; Opus 5.5 só aparece onde há justificativa registrada.

**AÇ-00 (todas as stories novas) — registro.** `@devops` (Sonnet 5.5). Entrada: [improvement-issue-bodies-2026-11-04.md](improvement-issue-bodies-2026-11-04.md), o inventário e o desenho do quadro. Saída: issues para OPS-27, OPS-28, OPS-29 e OPS-30; cards ST-20..ST-23 e FT-45..FT-52; a nota "Meta 9,5" nos corpos das #81, #91 e #79. Pronto quando: toda issue nova tem `## Decisões do dono` e `## Gates`, os cards carregam os números e as contagens do quadro igualam as do inventário (76 ativos, 48 arquivados).

### Ideia 1 — E2E de navegador no CI (OPS-30 / ST-23 / TS-17 / FT-51, FT-52). Hoje 4,0

| Dim | 9,5 significa | O que o `@qa` precisa ver |
|---|---|---|
| C | Todo script `*-browser-only` roda no job; a lista vem da pasta e um teste de divergência falha se um ficar de fora (13 arquivos em 2026-11-04; o levantamento dizia 12). | O teste de contrato e o log do job listando cada script. |
| A | Um script vermelho reprova o job; nenhuma repetição, reexecução ou falha tolerada em lugar nenhum. | O teste de contrato do workflow e uma quebra plantada que deixa o job vermelho. |
| P | Estável em execuções repetidas: proposta de 10 execuções locais em sequência e 5 de CI em commits distintos, sem falha e sem reexecução; cada falha inicial tem causa raiz registrada. | Os logs das execuções e as notas de causa raiz. |
| O | Política "investigar, nunca repetir até passar", tempo de execução e timeout, artefatos sem segredos, documentados nos dois idiomas. | A página de documentação e uma conferência dos artefatos. |

Critérios de saída: CAs 1 a 9 da [OPS-30](../stories/OPS-30/story.md). Parte do proprietário: nenhuma. Dependências: `@architect` e `@devops` antes de qualquer mudança de workflow; estabilidade dos scripts (TS-15, M-2).

| ID | Agente (modelo) | Entrada | Saída | Pronto quando |
|---|---|---|---|---|
| AÇ-01 | `@po` (Sonnet 5.5) | Story OPS-30, a listagem da pasta | `po-validation.md`; a contagem de scripts confirmada | GO com 7 ou mais de 10 pontos, status Ready, a contagem 12 contra 13 resolvida |
| AÇ-02 | `@architect` (Sonnet 5.5) | Story, `quality-gates.yml`, a preparação dos scripts (Next dev em HTTPS, Chrome) | Seção de desenho na story: forma do job, nome em relação à onda 4, timeout, números de estabilidade | Forma do job, timeout e os números 10 e 5 (ou outros) escritos |
| AÇ-03 | `@qa` (Sonnet 5.5) | Story e desenho | Plano de testes: quebra plantada, método de estabilidade, conferência dos artefatos | Plano arquivado; todo CA mapeado a um teste e a uma classe de evidência |
| AÇ-04 | `@dev` (Sonnet 5.5), `@devops` revisa o workflow | Plano, desenho | FT-51 (job e teste de contrato), depois FT-52 (execuções de estabilidade, correções, política) | Evidência Red-first por CA; os sete gates verdes |
| AÇ-05 | `@qa` (Sonnet 5.5) | Implementação, logs das execuções | Veredito do gate mais as quatro notas | Atestado em 9,5 ou a média real com a dimensão limitante |

### Ideia 2 — Timeout nas leituras do painel (FT-44 dentro da OPS-23). Hoje 5,0

| Dim | 9,5 significa | O que o `@qa` precisa ver |
|---|---|---|
| C | Toda leitura pelo cliente do painel e pelo `loadPanelSnapshot` carrega um timeout limitado; um teste falha se uma leitura nova o contornar. | A lista fixada e o teste dela. |
| A | O comportamento roda na suíte unitária (timers falsos) e em um script de navegador com API travada. | Os dois testes verdes no gate. |
| P | Mutações nunca são abortadas nem repetidas às cegas pelo timeout de leitura (o caminho de resultado incerto está intacto); uma API travada termina em um estado de erro localizado e com recuperação, não em um "carregando" sem fim. | O teste de mutação e o script de navegador. |
| O | Valor do timeout e motivo documentados; textos nos três catálogos com `validate:localization`; plano de UX com 9,0 ou mais se houver texto visível. | A conferência dos catálogos e o plano registrado. |

Critérios de saída: os critérios de aceite que o `@po` posicionar para a FT-44 (escopo e CA não mudam aqui). Parte do proprietário: nenhuma. Dependências: posicionamento pelo `@po` (OPS-23 ou story própria); caminho de resultado incerto da OPS-21; a FT-13 compartilha o arquivo do cliente.

| ID | Agente (modelo) | Entrada | Saída | Pronto quando |
|---|---|---|---|---|
| AÇ-06 | `@po` (Sonnet 5.5) | Inventário FT-44, story OPS-23 | Decisão: dentro da OPS-23 ou story própria; CAs escritos pelo `@po` | Decisão registrada na story |
| AÇ-07 | `@architect` (Sonnet 5.5) | `lib/api/client.mjs`, notas da OPS-21 | Política de timeout e de fallback, valor e motivo | Política escrita; exclusão das mutações declarada |
| AÇ-08 | `@ux-design-expert` (Sonnet 5.5) | Política, o estado de erro | Plano com 9,0 ou mais para o texto visível e a recuperação, ou "não se aplica" | Nota e escopo registrados |
| AÇ-09 | `@dev` (Sonnet 5.5) | CAs, política, plano | Testes Red-first, depois a correção | Testes unitário e de navegador verdes; sete gates verdes |
| AÇ-10 | `@qa` (Sonnet 5.5) | Implementação | Veredito do gate mais as quatro notas | Atestado em 9,5 ou a média real |

### Ideia 3 — Tipagem do painel e do backend (TS-16 e OPS-24). Hoje 5,0

| Dim | 9,5 significa | O que o `@qa` precisa ver |
|---|---|---|
| C | Erros de JSX de 59 para 0, com `apps/frontend/**/*.jsx` de volta ao `typecheck:web`; toda pasta de `apps/api` convertida e `strict: true` global. | A saída do type-check e a lista de pastas. |
| A | O `typecheck` roda as duas configurações no gate e no CI; `.ts` é lintado, testado e varrido. | O log do CI e a lista de gates. |
| P | Cada gate provado por uma violação plantada (erro de tipo, `.test.ts` falhando, violação de lint, import restrito, uma fixture `.ts` para o OpenGrep); zero `@ts-ignore`, `@ts-nocheck`, `any` sem justificativa ou cast nos arquivos tocados. | Os registros das violações plantadas e uma contagem por busca. |
| O | `AGENTS.md` e os documentos listados atualizados nos dois idiomas; tempos registrados (CA 27 da OPS-24). | O diff da documentação e os números. |

Critérios de saída: CAs 1 a 27 da [OPS-24](../stories/OPS-24/story.md) mais a TS-16 (59 erros corrigidos por tipagem, nunca por cast ou ignore; a contagem não pode crescer no meio tempo). Parte do proprietário: nenhuma para o código; evidência de CI por pull request ou disparo manual. O 9,5 só é atestável quando a OPS-24 fecha; antes disso o `@qa` registra uma nota parcial por dimensão.

| ID | Agente (modelo) | Entrada | Saída | Pronto quando |
|---|---|---|---|---|
| AÇ-11 | `@architect` (Sonnet 5.5) | Story OPS-24, [frontend-jsx-typecheck-backlog](../stories/OPS-24/frontend-jsx-typecheck-backlog.md) | Ordem da TS-16 em relação à FT-30 e à FT-42; layout do tsconfig | A ordem está escrita na story |
| AÇ-12 | `@qa` (Sonnet 5.5) | A árvore, `tsc --strict` somente leitura | Contagem de erros por pasta e o plano de testes | Contagens e plano arquivados |
| AÇ-13 | `@dev` (Sonnet 5.5) | Ordem da AÇ-11, os 59 erros | TS-16: JSX tipado, arquivo maior primeiro, sem cast nem ignore | `typecheck:web` verde com o JSX incluído; contagem 0 |
| AÇ-14 | `@dev` (Sonnet 5.5; Opus 5.5 só para a divisão do `queue-repository` se o `@architect` justificar na story) | Ordem de dependência da OPS-24 | FT-30..FT-35, uma pasta por fatia | CAs de cada fatia verdes; comportamento preservado |
| AÇ-15 | `@qa` (Sonnet 5.5) | A OPS-24 concluída | Veredito do gate mais as quatro notas | Atestado em 9,5 ou a média real |

### Ideia 4 — Varredura estática (OPS-28 / ST-21 / FT-47, FT-48). Hoje 4,0

| Dim | 9,5 significa | O que o `@qa` precisa ver |
|---|---|---|
| C | As seis classes (SQL cru, `eval`/`Function`, SSRF, segredos em código, `dangerouslySetInnerHTML`, cabeçalhos e cookies) têm pelo menos uma regra cada, para JavaScript e TypeScript. | A lista de regras contra o levantamento. |
| A | Os testes das regras rodam no `npm test`; o `npm run review:static` roda no CI; a árvore completa sai com zero. | A suíte e o log do CI. |
| P | Cada regra tem uma fixture positiva, uma negativa e uma de evasão; uma mutação à mão de cada regra faz um teste falhar; nenhuma exceção ampla em código de produto. | As fixtures, o registro das mutações e a lista de exceções. |
| O | Uma página nos dois idiomas lista cada regra, motivo, fixtures e como acrescentar uma; achados aceitos carregam motivos; o nome do provedor de revisão antigo segue bloqueado. | A página e o `aiox-static-review.test.js` verde. |

Critérios de saída: CAs 1 a 10 da [OPS-28](../stories/OPS-28/story.md). Parte do proprietário: nenhuma. Dependências: desenho da FT-45 da OPS-27 para segredos; ordem em `.opengrep/rules.yml` em relação à FT-30 da OPS-24.

| ID | Agente (modelo) | Entrada | Saída | Pronto quando |
|---|---|---|---|---|
| AÇ-16 | `@po` (Sonnet 5.5) | Story OPS-28 | `po-validation.md` | GO, status Ready |
| AÇ-17 | `@architect` (Sonnet 5.5) | Story, `.opengrep/rules.yml`, as construções em `apps/` | Mecanismo de teste das regras, lista de regras por construção, dono dos segredos com a OPS-27, ordem de edição em relação à OPS-24 | Escrito na story |
| AÇ-18 | `@qa` (Sonnet 5.5) | Story e desenho | Plano de testes: fixtures, variantes de evasão, mutações, tratamento da varredura-base | Plano arquivado |
| AÇ-19 | `@dev` (Sonnet 5.5) | Plano, desenho | FT-47 depois FT-48, regras test-first; achados reais corrigidos test-first | Toda regra com suas três fixtures; varredura da árvore completa com saída zero; sete gates verdes |
| AÇ-20 | `@qa` (Sonnet 5.5) | Implementação | Veredito do gate mais as quatro notas | Atestado em 9,5 ou a média real |

### Ideia 5 — Guarda contra vazamento (OPS-27 / ST-20 / FT-45, FT-46). Hoje 5,0

| Dim | 9,5 significa | O que o `@qa` precisa ver |
|---|---|---|
| C | Quatro superfícies (mensagens de commit, arquivos versionados, corpos de PR, corpos de issue) e toda família de padrão listada (o host de sessão, o nome do trailer de sessão, famílias de credenciais com formatos públicos), cada uma com um teste positivo e um negativo. | A lista de padrões com fontes e os testes. |
| A | Hook local ativo após um comando documentado; o mesmo script em um job de CI em pull requests; o rascunho do corpo de uma issue é conferido antes de o `@devops` enviá-lo; o CI não pode ser pulado com `--no-verify`. | Um teste conduzido por `git commit` real e uma execução de CI. |
| P | Um vazamento plantado em cada superfície falha; uma mutação à mão por regra faz um teste falhar; a saída nunca repete o valor encontrado; a verificação não acusa os próprios testes. | Os registros dos vazamentos plantados e das mutações. |
| O | Varredura-base com zero achados não aceitos (apenas hashes e caminhos); lista de exceções com um motivo por entrada (texto da regra no `AGENTS.md`, handoffs e gates que citam o padrão, documentos do framework); documentação nos dois idiomas. | O relatório da varredura-base e a lista de exceções. |

Critérios de saída: CAs 1 a 10 da [OPS-27](../stories/OPS-27/story.md). Parte do proprietário: nenhuma (reescrever histórico ou rotacionar credencial seria reservado ao proprietário e está fora do escopo). Dependências: o pacote da OPS-22 comitado; edições de workflow em série com as ideias 1 e 10.

| ID | Agente (modelo) | Entrada | Saída | Pronto quando |
|---|---|---|---|---|
| AÇ-21 | `@po` (Sonnet 5.5) | Story OPS-27 | `po-validation.md` | GO, status Ready |
| AÇ-22 | `@architect` (Sonnet 5.5) | Story, a lista de falsos positivos conhecidos, a documentação pública de tokens | Lista de padrões com fontes, mecanismo do hook, gatilho do CI, desenho do corpo como dado, formato da lista de exceções, limite de tamanho, dono da ferramenta em relação à OPS-28 | Escrito na story; cada padrão com um exemplo positivo e um negativo |
| AÇ-23 | `@qa` (Sonnet 5.5) | Story e desenho | Plano de testes: vazamentos plantados, mutações à mão, classes | Plano arquivado |
| AÇ-24 | `@dev` (Sonnet 5.5) | Plano, desenho | FT-45: script de verificação, testes, hook local, ativação documentada | CAs 1, 2, 3, 6, 7 verdes; gates verdes |
| AÇ-25 | `@dev` (Sonnet 5.5), `@devops` revisa o workflow | FT-45 integrada, desenho | FT-46: job de CI, verificação dos corpos, opção do evento `issues`, documentação | CAs 4, 5, 8, 9 verdes; execução de CI em pull request ou disparo manual |
| AÇ-26 | `@qa` (Sonnet 5.5) | Implementação | Veredito do gate mais as quatro notas | Atestado em 9,5 ou a média real |

### Ideia 6 — Contrato da API do painel (OPS-21 / ST-09 / FT-11..FT-17). Hoje 5,5

| Dim | 9,5 significa | O que o `@qa` precisa ver |
|---|---|---|
| C | Toda resposta não 2xx carrega um `code` enumerado (teste-guarda); as 7 fatias feitas; rotas viram `reexecutable` só com evidência em PostgreSQL; o campo legado `error` removido (fatia 7, depois do cutover). | O teste-guarda e a lista de fatias. |
| A | Os testes-guarda e de idempotência rodam no gate; a integração com PostgreSQL e migrations reais roda no CI. | A suíte e o log do CI. |
| P | A máquina de estados de idempotência (retomada de lease, retenção, repetição com a mesma chave) provada em PostgreSQL isolado; a repetição do cliente reusa a mesma chave; uma mutação à mão da checagem de lease faz um teste falhar. | Os testes de integração e o registro da mutação. |
| O | Contrato documentado nos dois idiomas; fechar com a fatia 7 aberta é decisão do proprietário (D-09 / OW-15). | A documentação e o registro da decisão. |

Critérios de saída: os critérios de aceite da [OPS-21](../stories/OPS-21/story.md) (não mudam aqui). Parte do proprietário: D-09 / OW-15 (a story pode fechar com a fatia 7 aberta) e o valor do timeout (D-10). Sem a fatia 7 o `@qa` registra a dimensão O na fatia aberta declarada, então a média fica abaixo de 9,5 até o cutover e a FT-17 estarem feitos.

| ID | Agente (modelo) | Entrada | Saída | Pronto quando |
|---|---|---|---|---|
| AÇ-27 | `@architect` (Sonnet 5.5; Opus 5.5 só para o desenho da máquina de estados de idempotência se justificado na story) | Story OPS-21, plano de ciclos fundidos | Ordem dos ciclos FT-11+12, FT-13+16, FT-14+15 e onde a FT-17 fica | Ordem escrita; a dependência da fatia 6 em relação às fatias 3-5 resolvida |
| AÇ-28 | `@data-engineer` (Sonnet 5.5) | Ciclo 3 (FT-14+15) | Condições para a persistência da máquina de estados (já GO com condições) confirmadas | Confirmação escrita |
| AÇ-29 | `@dev` (Sonnet 5.5) | Ordem da AÇ-27, plano do `@ux-design-expert` com 9,0 ou mais nos ciclos com texto visível | Os três ciclos test-first, depois a FT-17 após o cutover autorizado pelo proprietário | CAs de cada ciclo verdes com evidência em PostgreSQL |
| AÇ-30 | `@qa` (Sonnet 5.5) | A OPS-21 concluída | Veredito do gate mais as quatro notas | Atestado ou a média real com a dimensão limitante |

### Ideia 7 — Atualização ao vivo (OPS-23 / ST-16 / FT-27..FT-29). Hoje 5,5

| Dim | 9,5 significa | O que o `@qa` precisa ver |
|---|---|---|
| C | SSE autenticado com heartbeat de 15 s, invalidação por eventos nas visões do painel que a story nomeia, provider compartilhado e navegação com `<Link>`, fallback por polling. | Os CAs da OPS-23 mapeados a testes. |
| A | Testes sobre um listener HTTP real e em navegador real pelo rewrite do Next e pelo Compose (sem buffer); o caminho ao vivo medido por um script. | A lista de testes e o script de medição. |
| P | p95 do caminho ao vivo em até 2 s e polling de fallback a 2 s por uma janela de 60 s (OD-23-2, aprovado); limite de conexões; o desligamento fecha os streams; eventos não carregam dados de chat nem de pessoas; rascunhos e foco nunca são sobrescritos. | As medições e os testes negativos. |
| O | Modelo de eventos, flags e os números documentados nos dois idiomas. | A documentação. |

Critérios de saída: os CAs da [OPS-23](../stories/OPS-23/story.md) (não mudam aqui). Parte do proprietário: nada pendente (OD-23-1 e OD-23-2 estão decididas). Dependências: FT-30 e FT-32 (TS-0 e TS-2 da OPS-24); ordem em relação à FT-01.

| ID | Agente (modelo) | Entrada | Saída | Pronto quando |
|---|---|---|---|---|
| AÇ-31 | `@architect` (Sonnet 5.5) | Story OPS-23, nota de SSE | Modelo de eventos, fronteira de processo, proxy, ordem em relação à FT-01, FT-30, FT-32 | Escrito na story |
| AÇ-32 | `@ux-design-expert` (Sonnet 5.5) | Estados dos eventos, regras de rascunho e foco | Plano com 9,0 ou mais (escopo da revisão declarado) | Nota registrada |
| AÇ-33 | `@dev` (Sonnet 5.5) | Desenho, plano | FT-27, depois o ciclo FT-28 + FT-29, test-first | CAs verdes; sete gates verdes |
| AÇ-34 | `@qa` (Sonnet 5.5) | Implementação, script de medição | Veredito do gate mais as quatro notas | Atestado ou a média real |

### Ideia 8 — Validação fora do Ubuntu. Hoje 3,0. Teto só com agentes cerca de 7,0

| Dim | Agentes conseguem chegar a | O que fica com o proprietário |
|---|---|---|
| C | 7: matriz escrita, runners cobrem o que conseguem (smoke do instalador nos três sistemas) | Matriz do OBS nativo, instalador Windows em máquina real, um Mac, bateria Twitch real no canal de teste |
| A | 8: smoke automatizado nos runners; scripts de captura preparados | As próprias execuções nativas |
| P | 5: nenhum resultado nativo pode ser alegado | Todo resultado nativo (A-02, D-05, OW-16, A-01, A-03) |
| O | 8: limites e procedimentos escritos; nada alegado sem evidência | Registrar os resultados do proprietário |

Critérios de saída da parte dos agentes: uma matriz de validação escrita que declara, por célula, a classe de evidência e quem executa; smoke automatizado para o que um runner consegue provar; scripts e checklists preparados para que cada sessão do proprietário seja curta. A parte dos agentes é atestada em **7,0 no máximo**; o 9,5 precisa dos resultados do proprietário.

| ID | Agente (modelo) | Entrada | Saída | Pronto quando |
|---|---|---|---|---|
| AÇ-35 | `@architect` (Sonnet 5.5) | Smoke do instalador existente, [windows-native-plan](../stories/OPS-15/windows-native-plan.md) | A matriz: célula, classe de evidência, quem executa | Matriz arquivada |
| AÇ-36 | `@dev` (Sonnet 5.5) | Matriz | Scripts de captura e checklists preparados; nenhuma alegação nativa | Scripts e checklists revisados pelo `@qa` |
| AÇ-37 | Proprietário | Seção 6 | Os resultados nativos | Ver seção 6 |
| AÇ-38 | `@qa` (Sonnet 5.5) | A matriz e os resultados disponíveis | A nota honesta (7,0 no máximo sem o proprietário) e as células abertas | Nota e células abertas registradas |

### Ideia 9 — Acessibilidade realmente provada. Hoje 6,0. Teto só com agentes cerca de 7,0

| Dim | Agentes conseguem chegar a | O que fica com o proprietário |
|---|---|---|
| C | 8: axe automatizado nos fluxos principais, contraste medido, layout de 320 px, foco após navegação | Passagem com leitor de tela (NVDA ou VoiceOver) |
| A | 9: axe no gate e no CI | — |
| P | 3: nenhuma pessoa usou tecnologia assistiva | Resultados da A-05 |
| O | 8: roteiro do leitor de tela escrito; limites declarados | Registrar o resultado do proprietário |

Critérios de saída da parte dos agentes: testes axe automatizados nos fluxos principais no gate; resultados medidos de contraste e de 320 px registrados; um roteiro de leitor de tela (NVDA ou VoiceOver) que o proprietário consegue seguir em uma sessão. Atestada em **7,0 no máximo** sem a A-05.

| ID | Agente (modelo) | Entrada | Saída | Pronto quando |
|---|---|---|---|---|
| AÇ-39 | `@ux-design-expert` (Sonnet 5.5) | Planos de UX da OPS-15, A-05 | Roteiro do leitor de tela, método de medição de contraste e de 320 px, checklist de foco | Arquivado; escopo do que não cobre declarado |
| AÇ-40 | `@dev` (Sonnet 5.5) | AÇ-39, FT-01 estável | Testes axe automatizados nos fluxos principais, test-first | Testes verdes no gate |
| AÇ-41 | Proprietário | Seção 6 (A-05) | Resultados do leitor de tela e do layout | Ver seção 6 |
| AÇ-42 | `@qa` (Sonnet 5.5) | AÇ-39..AÇ-41 | A nota honesta (7,0 no máximo sem o proprietário) | Nota e itens abertos registrados |

### Ideia 10 — Instalação limpa (OPS-29 / ST-22 / FT-49, FT-50). Hoje 6,0

| Dim | 9,5 significa | O que o `@qa` precisa ver |
|---|---|---|
| C | Uma asserção de estado limpo e o fluxo de primeiro uso (instalar, iniciar, abrir, atualizar com dados preservados) no Linux com Docker real; macOS e Windows cobrem tudo que o runner hospedado prova, cada passo rotulado Docker real ou falso isolado, o resíduo declarado. | Os logs dos jobs e os rótulos. |
| A | Jobs no CI; o teste de contrato do workflow fixa sistemas, asserção e ordem. | O teste de contrato e uma execução de CI. |
| P | Uma regressão plantada que depende de uma pasta preexistente deixa o job vermelho; o auxiliar da asserção é testado nos dois sentidos. | O registro da branch descartável. |
| O | Tempo de execução dentro do timeout; a documentação declara as classes de evidência e os limites. | A documentação e a medição de tempo. |

Critérios de saída: CAs 1 a 10 da [OPS-29](../stories/OPS-29/story.md). Parte do proprietário: a evidência real de Windows e macOS (A-01 / OW-01, D-05 / OW-07) nunca é alegada pelo job de CI. Dependências: workflows em série com as ideias 5 e 1; a verificação da LACUNA de capacidade do runner.

| ID | Agente (modelo) | Entrada | Saída | Pronto quando |
|---|---|---|---|---|
| AÇ-43 | `@po` (Sonnet 5.5) | Story OPS-29 | `po-validation.md` | GO, status Ready |
| AÇ-44 | `@architect` (Sonnet 5.5; `@analyst` só para uma LACUNA depois do índice de pesquisas) | Story, `quality-gates.yml` | Forma do job por sistema, lista de asserções, sobreposição com o smoke do instalador, timeout, o que cada runner prova | Escrito na story |
| AÇ-45 | `@qa` (Sonnet 5.5) | Story e desenho | Plano de testes: regressão plantada, rótulos | Plano arquivado |
| AÇ-46 | `@dev` (Sonnet 5.5), `@devops` revisa o workflow | Plano, desenho | FT-49 depois FT-50 | CAs verdes; execução de CI em pull request ou disparo manual |
| AÇ-47 | `@qa` (Sonnet 5.5) | Implementação | Veredito do gate mais as quatro notas | Atestado em 9,5 sobre a cobertura declarada, ou a média real |

## 6. Parte do proprietário: o que os agentes não podem alegar

| Ação do proprietário | O que é | O que destrava | Ideias |
|---|---|---|---|
| **A-02** (OW-03, issue #57) | Retestar o OBS nativo: certificado, transparência, recarga | A matriz do overlay nativo; alimenta a HD-03 e a OPS-25 | 8 |
| **A-05** (OW-06, issue #83) | Verificações visuais e de tecnologia assistiva das peças novas de UX (NVDA ou VoiceOver, prazo da chamada, foco ao salvar, 390x844, diálogo do link do widget) | A dimensão Prova da acessibilidade; depende da FT-01 | 9 |
| **D-05** (OW-07, issue #69) | Decidir se o macOS fica sem validação manual | A opção A escreve a limitação e limita a célula do macOS como declarada; a opção B (conseguir um Mac) abre a célula do macOS | 8, 10 |
| **OW-16** (A-06, issue #80) | Autorizar e rodar a checagem ao vivo de resgate real | A bateria Twitch real no canal de teste; também o aceite da OPS-22 | 8 |
| A-01 (OW-01, issue #69) | Instalador Windows em Docker real e o fluxo `npm run dev` | A célula do Windows | 8, 10 |
| A-03 (OW-04, issue #19) | Aceite da FND-9 no Windows e na Twitch real | Necessário antes da OW-16; a célula da Twitch real | 8 |

Os agentes preparam scripts, checklists e registros; não escrevem resultado nativo nem ao vivo. Uma célula sem a evidência do proprietário continua aberta na matriz.

## 7. Política de modelos

Sonnet 5.5 é o padrão. Opus 5.5 só em tarefa muito complexa com justificativa escrita na story: o desenho da máquina de estados de idempotência da OPS-21 (AÇ-27) e a divisão do `queue-repository` na OPS-24 (AÇ-14) são os dois candidatos. Toda outra ação deste documento é Sonnet 5.5.

## 8. Rastreabilidade e contagens

| Ideia | Linha existente | Linha nova |
|---|---|---|
| 1 | TS-17 | ST-23 (OPS-30), FT-51, FT-52 |
| 2 | FT-44 (dentro da OPS-23, ST-16) | nenhuma (sem mudança de escopo) |
| 3 | TS-16 (dentro da OPS-24, ST-17), FT-30..FT-35 | nenhuma |
| 4 | — | ST-21 (OPS-28), FT-47, FT-48 |
| 5 | — | ST-20 (OPS-27), FT-45, FT-46 |
| 6 | ST-09 (OPS-21), FT-11..FT-17 | nenhuma |
| 7 | ST-16 (OPS-23), FT-27..FT-29 | nenhuma |
| 8 | OW-01, OW-03, OW-07, OW-16 | nenhuma |
| 9 | OW-06 | nenhuma |
| 10 | — | ST-22 (OPS-29), FT-49, FT-50 |

Itens novos: 4 stories (ST-20..ST-23) e 8 fatias (FT-45..FT-52) = 12. Inventário: de 110 para **122** itens (23 ST, 52 FT, 13 GV, 17 TS, 17 OW). Quadro: de 64 para **76** cards ativos (13 Backlog, 7 Rascunho, 2 Aguardando decisão, 13 Pronto, 4 Em andamento, 5 Em revisão, 30 Bloqueado, 2 Concluído), 48 arquivados, 124 cards no total.
