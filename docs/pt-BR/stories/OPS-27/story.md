# OPS-27 — Guarda automática contra vazamento de dados sensíveis (commits, arquivos, corpos de PR e de issue)

[English](../../../stories/OPS-27/story.md)

**Status:** Draft (redigida pelo `@sm` em 2026-11-04; ainda não validada pelo `@po`). **Issue:** pendente (o `@devops` cria a partir de [improvement-issue-bodies-2026-11-04.md](../../process/improvement-issue-bodies-2026-11-04.md); sem comentários em issues).
**Origem:** ideia nº 5 do [levantamento de melhorias](../../process/improvement-ideas-2026-11-04.md) (pedido do proprietário, 2026-11-04). Evidência: a URL de uma sessão do Claude chegou a 45 commits deste repositório público; a proteção existente era só um texto no `AGENTS.md` (regra "nunca expor a URL da sessão"). Uma regra em texto não impede um agente cuja ferramenta acrescenta uma linha de atribuição por padrão. Decisão do Orion (2026-11-04): esta ideia começa primeiro, logo depois do pacote da OPS-22.
**Relacionadas:** OPS-28 (regras do OpenGrep para código; segredo em código é terreno comum, ver "Dependências"); OPS-24 (linguagem do script e Biome); OPS-30 e OPS-29 (também acrescentam jobs de CI; as edições de workflow são em série); [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (régua de 9,5, ideia nº 5, ações AÇ-21..AÇ-26).
**Itens registrados:** inventário ST-20 (esta story), FT-45 e FT-46 (fatias); ver [backlog-inventory](../../process/backlog-inventory.md).
**Coordenação necessária:** `$aiox-po` (validação), `$aiox-architect` (lista de padrões, mecanismo do hook, gatilho do CI e como os corpos são passados como dado), `$aiox-devops` (issue; revisa o workflow antes do commit), `$aiox-qa` independente (plano de testes com vazamentos plantados e mutações à mão, atestado do 9,5), `$aiox-analyst` só se surgir uma LACUNA de formato de token (consulte antes [research-index.md](../../research-index.md)). `$aiox-ux-design-expert` e `$aiox-data-engineer`: não se aplicam (sem texto visível à pessoa usuária, sem banco).

**Nota de escrita:** nesta story os padrões aparecem de forma desarmada (`claude\.ai/` como expressão regular, e o nome `Claude-Session` sem os dois-pontos), para que a futura verificação não acuse a própria story.

## Problema

- A única barreira contra a exposição de uma URL de sessão, de um token ou de uma chave em um repositório público é uma frase no `AGENTS.md`. Não há verificação automática nos quatro lugares por onde um vazamento viaja: mensagens de commit (incluindo trailers), arquivos versionados, corpos de pull request e corpos de issue.
- Recuperar um vazamento que já chegou a um remoto público exige reescrever o histórico e fazer force push, o que é caro e reservado ao proprietário. Prevenir é barato.
- Uma verificação ingênua também acusaria os lugares que legitimamente *citam* o padrão: o texto da regra no `AGENTS.md`, handoffs e gates do QA que o citam e documentos do framework sobre roteamento de LLM. A verificação precisa de uma lista de exceções documentada e testada, para não ensinar as pessoas a contorná-la.

## História

Como proprietário de um repositório público mantido com agentes de IA,
quero um hook local e uma verificação de CI que rejeitem o host de sessão, o trailer de sessão e textos com formato de credencial antes que cheguem a um commit, a um arquivo, ao corpo de um PR ou ao corpo de uma issue,
para que a proteção deixe de depender de um agente lembrar de uma frase.

## Escopo

**Dentro (duas fatias, nesta ordem):**

- **FT-45 — núcleo da verificação e hook local.** Um script de verificação (caminho fixado pelo `@architect`) construído em torno de uma função pura que recebe texto e devolve achados (id da regra, local, nunca o valor encontrado). Regras: (a) o host de sessão `claude\.ai/`; (b) o nome de trailer `Claude-Session` seguido de dois-pontos; (c) famílias de credenciais com formatos públicos (cabeçalhos de bloco de chave privada, prefixos de token de provedores, strings de conexão com senha embutida, atribuições no estilo `client_secret`) listadas pelo `@architect` a partir da documentação pública dos provedores, nenhuma inventada pelo `@dev`. Hook local: `commit-msg` (mensagem), `pre-commit` (arquivos em stage) e um `pre-push` opcional (intervalo), ativados por um único comando documentado (um diretório de hooks versionado mais `git config core.hooksPath`). Uma entrada `npm run` executa a mesma verificação à mão, inclusive sobre um arquivo de corpo. Lista de exceções por caminho, com um motivo por entrada.
- **FT-46 — verificação no CI e dos corpos.** Um job de CI em pull requests que roda o mesmo script sobre as mensagens de commit do intervalo, os arquivos versionados e o corpo do PR; o corpo é passado como dado (variável de ambiente ou arquivo), nunca interpolado em um comando de shell. O mesmo script roda sobre o rascunho do corpo de uma issue **antes** de o `@devops` criar ou editar a issue (passo documentado). Opcionalmente o job também roda no evento `issues`; ele só reprova a execução, **nunca comenta** na issue (regra do projeto). Uma varredura-base da árvore atual e do intervalo de commits informa apenas hashes e caminhos.

**Fora do escopo:**

- Reescrever o histórico, force push, rotacionar uma credencial real (reservado ao proprietário; se a varredura-base achar uma credencial real, a story para e avisa o orquestrador).
- Serviços de terceiros de varredura de segredos e configurações do repositório (push protection, checks obrigatórios, regras de branch): opções complementares do proprietário, não exigidas aqui.
- Regras do OpenGrep para padrões de código (OPS-28). Mudar o texto do `AGENTS.md` (proprietário; os agentes só podem propor redação).
- Bump de versão, commit, push, PR, release.

## Critérios de aceite

As classes de evidência ficam separadas: unitária (função pura), hook local (Git real em um repositório temporário dentro do projeto), CI. Todo comportamento começa com um teste que falha. A saída da verificação nomeia a regra e o local e nunca imprime o valor encontrado.

1. **Dado** uma mensagem de commit que contém o nome de trailer `Claude-Session` seguido de dois-pontos, **quando** o hook `commit-msg` roda, **então** o commit é rejeitado, a saída nomeia a regra e a linha, e a saída não repete o valor.
2. **Dado** um arquivo em stage que contém `claude\.ai/` fora da lista de exceções, **quando** o `pre-commit` roda, **então** o commit é rejeitado; **dado** o mesmo texto em um caminho da lista de exceções, **então** ele passa.
3. **Dado** um caso positivo e um caso negativo parecido para cada família de credencial listada pelo `@architect`, **quando** a função pura roda, **então** todo positivo é achado e nenhum negativo é.
4. **Dado** um pull request cujo intervalo, arquivos ou corpo carregam um vazamento plantado, **quando** o job de CI roda, **então** ele falha; **dado** um pull request limpo, **então** ele passa. O job lê o corpo como dado, nunca como texto de shell. (Os casos locais provam a lógica; a execução no CI precisa de um PR ou de um disparo manual do workflow, delegado ao orquestrador.)
5. **Dado** o rascunho de um corpo de issue com um vazamento plantado, **quando** a verificação documentada antes do envio roda, **então** ela sai com código diferente de zero; **dada** a execução no evento `issues` (se adotada), **então** a execução falha e nenhum comentário é postado.
6. **Dado** a árvore atual e o intervalo de commits da branch, **quando** a varredura-base roda, **então** ela informa zero achados não aceitos; todo achado aceito é listado na evidência da story com seu motivo, e a saída lista apenas hashes e caminhos.
7. **Dado** os testes da própria verificação, **quando** cada padrão é enfraquecido à mão (uma mutação por regra, registrada pelo `@qa`), **então** pelo menos um teste falha para cada mutação; os arquivos de teste montam as strings proibidas em tempo de execução para que a verificação não acuse os próprios testes.
8. **Dado** `git commit --no-verify`, **quando** o commit chega a um pull request, **então** o job de CI ainda o reprova: o CI é a camada que não pode ser pulada, e isso está escrito na documentação.
9. **Dada** a documentação, **então** ela explica em inglês e em pt-BR como ativar o hook, como acrescentar um padrão e como acrescentar uma exceção com seu motivo; os testes de contrato de documentação passam; o `AGENTS.md` não é editado por agentes.
10. **Dados** os quality gates, **quando** rodam, **então** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` e `npm run review:static` ficam verdes.

## Dependências

- **Começa depois** do commit do pacote da OPS-22 (Orion, 2026-11-04). Nenhuma outra story a bloqueia.
- **Edição de workflow** (FT-46): nenhum arquivo de workflow muda sem o desenho do `@architect` e a revisão do `@devops`; em série com a OPS-29 e a OPS-30, que editam os mesmos workflows (um conjunto de escrita por vez).
- **OPS-28:** as duas stories tratam de segredos. O `@architect` fixa quem é dono de quê: esta verificação cobre commits, corpos e todos os arquivos versionados; o OpenGrep cobre construções do código-fonte. Sem lista de padrões duplicada.
- **OPS-24:** o script começa como `.mjs`; se `apps/` for convertido depois, o script segue a regra de pasta que o `@architect` fixar.
- **Falsos positivos conhecidos (semente da lista de exceções, a confirmar pela varredura-base):** o texto da regra no `AGENTS.md`; handoffs e gates do QA que citam o padrão; o levantamento de melhorias que enuncia o padrão; documentos do framework em `.aiox-core/` sobre roteamento de LLM. A semente é dado na lista de exceções, com um motivo cada, não uma exceção escondida no código.

## Riscos

1. **Falsos positivos bloqueiam commits legítimos.** Mitigação: varredura-base (CA 6), lista de exceções testada (CA 2), motivos registrados.
2. **Contorno com `--no-verify` ou hook não instalado.** Mitigação: a camada de CI (CA 8).
3. **A mensagem de erro vaza o valor que bloqueia.** Mitigação: o CA 1 afirma que a saída nunca repete o achado.
4. **Injeção em workflow pelo corpo de um PR ou de uma issue.** Mitigação: corpo como dado (CA 4), revisado pelo `@architect` e pelo `@devops`.
5. **Custo da regex em arquivos grandes.** Mitigação: padrões limitados e um limite de tamanho decidido pelo `@architect`, testado com um arquivo grande.
6. **Conflito de edição em workflows compartilhados.** Mitigação: a serialização acima.

## Complexidade (estimativa do `@sm`, a confirmar pelo `@architect`)

Escopo 2, integração 2, infraestrutura 3, conhecimento 2, risco 3 = **12 → STANDARD**. Dificuldade **M** (o levantamento estimou P; duas fatias e um job de CI tornam M). Prioridade **P1** `[AUTO-DECISION] prioridade → P1 (motivo: Orion, 2026-11-04, começa primeiro; um vazamento em repositório público é caro e a verificação é barata)`.

## Valor de negócio

Um vazamento para no commit ou no pull request em vez de terminar em uma reescrita de histórico público. A regra passa a ser executável e testável.

## Plano de testes (teste primeiro)

1. **Unitário:** a função pura sobre casos montados em tempo de execução (positivos, parecidos, lista de exceções, limite de tamanho, saída que nunca repete o achado).
2. **Hook:** um repositório Git temporário criado dentro da árvore do projeto, com os hooks ativados pelo comando documentado, conduzido por chamadas reais de `git commit` (mensagem, arquivo em stage, `--no-verify` documentado).
3. **Mutação à mão:** o `@qa` enfraquece cada padrão em sequência e confirma que um teste falha (sem dependência nova; uma ferramenta automática de mutação só se o `@architect` aprovar).
4. **CI:** o teste de contrato do workflow fixa o job; uma execução em PR ou disparo manual com um vazamento plantado em uma branch descartável falha, uma execução limpa passa.
5. **Gates:** os sete gates do projeto; o `@qa` emite o veredito antes de o `@devops` comitar.

## Meta 9,5 (levantamento de 2026-11-04)

Nota atual (estimativa do Orion): **5,0**. Meta: **9,5**. O `@qa` atesta a nota com a régua de [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (ideia nº 5): as quatro dimensões (cobertura, automação, prova, operação) precisam ter média 9,5, nenhuma abaixo de 9,0. Critérios de saída: as quatro superfícies cobertas pelo hook e pelo CI (CAs 1, 2, 4, 5); todo padrão com um teste positivo e um negativo (CA 3); uma mutação à mão por regra faz um teste falhar (CA 7); zero achados-base não aceitos (CA 6); documentação nos dois idiomas (CA 9). Nenhuma parte depende do proprietário, então os agentes podem chegar a 9,5.

## Gates de planejamento antes da implementação

- [ ] Validação do `@po` (10 pontos) e GO.
- [ ] O `@devops` cria a issue no GitHub (corpo de [improvement-issue-bodies-2026-11-04.md](../../process/improvement-issue-bodies-2026-11-04.md)).
- [ ] `@architect`: lista de padrões com fontes, mecanismo do hook, gatilho do CI, desenho do corpo como dado, formato da lista de exceções, limite de tamanho, divisão de responsabilidade com a OPS-28.
- [ ] Plano de testes do `@qa` (vazamentos plantados, mutações à mão, classes de evidência).
- [ ] Nota do `@analyst` só se houver LACUNA de formato de token; [research-index.md](../../research-index.md) consultado antes.
- [ ] Gate de UX: não se aplica (voltado a quem desenvolve); o `@po` confirma na validação.

## Definição de pronto

- CAs 1 a 10 com evidência Red-first por classe; a parte do CI é executada em PR ou disparo manual ou registrada explicitamente como pendente.
- Quality gates verdes; veredito do `@qa` e atestado do 9,5 registrados; File List e checklists atualizados em inglês e pt-BR.

## Validação do rascunho pelo SM (story-draft-checklist, 2026-11-04)

1. Objetivo e contexto: claros (incidente, proteção só em texto, quatro superfícies). PASS.
2. Orientação técnica: superfícies, padrões por família, forma do hook e do CI; pontos de desenho em aberto atribuídos ao `@architect`; nenhum formato de token inventado. PASS.
3. Referências: ideia nº 5 do levantamento, régua de 9,5, OPS-28, OPS-24. PASS.
4. Autossuficiência: falsos positivos e semente da lista de exceções declarados; reescrita de histórico explicitamente fora. PASS.
5. Testes: classes separadas; mutação à mão; auto-acusação evitada. PASS.
6. Análise estática: `npm run review:static` nos gates. PASS.
- Resultado: pronta para o `@po`. Nada foi inventado além do levantamento; a mudança de estimativa de P para M está registrada acima.

## File List

- `docs/stories/OPS-27/story.md` (novo)
- `docs/pt-BR/stories/OPS-27/story.md` (novo)
- `docs/stories.md` e `docs/pt-BR/stories.md` (entrada no índice)
- `docs/process/improvement-actions-2026-11-04.md`, `docs/process/improvement-issue-bodies-2026-11-04.md` e as versões pt-BR (novos)
- `docs/process/backlog-inventory.md` e `docs/process/kanban-board-design.md` e as versões pt-BR (itens ST-20, FT-45, FT-46)

Os arquivos de implementação serão listados aqui pelo `@dev` depois dos gates.

## Change Log

- 2026-11-04 — `@sm` (River): story redigida a partir da ideia nº 5 do levantamento de melhorias. Status Draft. Fatias FT-45 e FT-46 registradas.
