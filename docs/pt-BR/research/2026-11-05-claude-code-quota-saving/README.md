# Poupar a cota do Claude Code neste projeto (nota de pesquisa)

[English](../../../research/2026-11-05-claude-code-quota-saving/README.md)

- Autor: `@analyst` (Atlas). Data: 2026-11-05. Branch: `feat/ops-15-next-panel`.
- Rótulos: **VERIFICADO** (documentação oficial da Anthropic / Claude Code lida nesta sessão, ou medido no repositório), **PARCIAL** (fonte secundária), **NÃO VERIFICADO** (inferência).
- Escopo: só pesquisa e recomendações. Nenhum código, regra, configuração ou arquivo de agente foi alterado.
- Os números de tokens são estimativas: bytes / 4 (inglês) e bytes / 3,5 (português). São ordens de grandeza, não medições.

## Resumo

1. A cota é movida por **tamanho do contexto x número de requisições**, não pelo número de mensagens. O cache de prompt barateia a releitura, mas não a zera; cache frio (ocioso além do TTL, troca de modelo, subagente novo) reprocessa tudo a preço cheio.
2. As maiores alavancas para este projeto, em ordem: **(1)** parar de ler inteiro o par `session-handoff.md` de 220 KB / 239 KB e o `story.md` da OPS-15 de 277 KB; **(2)** alinhar os modelos dos agentes à regra do próprio dono (Sonnet 5.5): 9 das 10 definições fixam `model: opus`; **(3)** `/clear` e um arquivo curto de "estado atual" entre tarefas sem relação; **(4)** prompts de agente curtos que apontam para arquivo em vez de colar texto; **(5)** tirar texto sempre carregado do `.claude/CLAUDE.md` e das regras sem escopo.
3. Maior incógnita: a divisão real do uso recente por skill / subagente / MCP / `CLAUDE.md`. A tela oficial `/usage` mostra isso nas assinaturas e não estava disponível para esta nota. **Rode `/usage` primeiro** (R0).
4. Autoavaliação: **8,9 / 10** (rubrica no final). Veredito para o `docs/research-index.md`: **SUFICIENTE** para a decisão, com gatilho **REVISAR SE**.

## 1. Como o Claude Code consome cota (VERIFICADO, oficial)

| Fato | Fonte |
| - | - |
| Cada requisição reenvia o contexto inteiro (prompt do sistema, contexto do projeto, histórico, resultados de ferramentas). Leitura de cache custa a taxa de cache (0,1x da entrada base na API); escrita de 5 min custa 1,25x e a de 1 h custa 2x. | [Prompt caching no Claude Code](https://code.claude.com/docs/en/prompt-caching.md); [Prompt caching da API](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) |
| Camadas do cache, em ordem: prompt do sistema e ferramentas, contexto do projeto (CLAUDE.md, memória automática, regras sem escopo), conversa. Mudança no início do prefixo invalida tudo depois. | página de prompt caching, "How the cache is organized" |
| O cache é por modelo. `/model` relê todo o histórico sem cache. Skill com `model` diferente no frontmatter também é troca. Cada alternância do `opusplan` é troca. | mesma página, "Switching models" |
| Mudar o esforço mantém o cache no Opus 5.5, Sonnet 5.5, Haiku 5.5 e Fable 5.1 (chave de API ou assinatura). | mesma página, "Changing effort level" |
| TTL: em assinatura, dentro do uso do plano, a **conversa principal** tem 1 hora; **subagentes, compactação, teammates e forks têm 5 minutos**. Com créditos de uso ou chave de API o padrão é 5 minutos. As configurações `promptCacheTtl` e `subagentPromptCacheTtl` (v2.1.242+) alteram. | mesma página, "Which TTL each request gets" |
| O subagente abre um **cache separado** com prompt próprio; a primeira requisição não lê o cache do pai. O **fork** compartilha o cache do pai e custa menos que um subagente novo quando precisa do mesmo contexto. | mesma página, "Subagents and the cache"; [Subagents](https://code.claude.com/docs/en/sub-agents.md) |
| O `/compact` é uma requisição grande (lê o histórico para resumir). Barato com cache quente, caro depois de ociosidade. `/clear` não custa nada. A compactação ociosa pode rodar em sessão com TTL de 1 hora (`idleCompaction`). | [Manage costs](https://code.claude.com/docs/en/costs); página de prompt caching |
| O CLAUDE.md é lido uma vez no início; edições valem só após `/clear`, `/compact` ou reinício. Meta: menos de 200 linhas por arquivo. O `MEMORY.md` da memória automática carrega as primeiras 200 linhas ou 25 KB. Regras com `paths:` só carregam quando arquivos correspondentes são tocados. | [Memory](https://code.claude.com/docs/en/memory.md) |
| As definições de ferramentas MCP são adiadas por padrão (tool search); só os nomes entram no contexto. CLIs como `gh` ainda pesam menos que servidores MCP. | Manage costs, "Reduce MCP server overhead" |
| Sonnet é recomendado para a maioria das tarefas; Opus para raciocínio difícil. Trocar para Opus vale também para subagentes que herdam o modelo. O campo `model:` do subagente e `CLAUDE_CODE_SUBAGENT_MODEL` (+ `_FORCE=1`) controlam. Ordem: parâmetro da chamada, frontmatter, variável de ambiente, modelo do pai. | Manage costs; Subagents |
| O esforço padrão é `medium` no Opus 5.5, Sonnet 5.5 e Haiku 5.5; o raciocínio não pode ser desligado nesses modelos, então o esforço é a alavanca. `ultrathink` eleva um turno a `xhigh`. | [Model config](https://code.claude.com/docs/en/model-config.md) |
| Subagentes: contexto novo, só o resumo final volta; as requisições contam nos mesmos limites do plano. `maxTurns`, `effort` e `autoCompactWindow` (100k-1M) podem ser fixados no frontmatter. Um subagente concluído pode ser retomado com `SendMessage` e mantém o histórico. As descrições de todos os subagentes ficam em toda sessão (aviso acima de 15.000 tokens). | Subagents |
| Skills carregam sob demanda; `skills:` no frontmatter do subagente **injeta o conteúdo completo na partida**. | Subagents; Manage costs |
| Agent teams usam cerca de 7x os tokens de uma sessão comum no modo plano. Não usamos teams. | Manage costs |
| Hooks podem filtrar saídas antes de o Claude vê-las (exemplo: mostrar só as falhas de teste). | Manage costs, "Offload processing to hooks and skills" |
| Sessões longas sobem o uso porque cada requisição leva a conversa inteira; pausas causam cache miss; tarefas agendadas, check-ins de goal e mensagens entre sessões reenviam o contexto. | Manage costs, "Why usage climbs in a long session" |
| O `/usage` mostra, nas assinaturas, a atribuição por skill / subagente / plugin / servidor MCP e recomendações com a fatia do uso recente; a linha `Prompt cache (main)` exige v2.1.251+. | Manage costs, "Plan usage breakdown" |

## 2. O que medimos no repositório (VERIFICADO, 2026-11-05)

| Item | Tamanho | Tokens aprox. | Quando carrega |
| - | - | - | - |
| `docs/session-handoff.md` | 220.047 B, 862 linhas | ~55 mil | Lido primeiro em toda retomada (instrução do CLAUDE.md) |
| `docs/pt-BR/session-handoff.md` | 239.031 B | ~68 mil | Mesma instrução |
| `docs/stories/OPS-15/story.md` | 277.158 B | ~69 mil | Qualquer agente que abra a story inteira |
| `queue-route-action-inventory.md` / `ux-code-audit.md` / `test-suite-audit` | 74.885 / 51.686 / 42.904 B | ~19 mil / 13 mil / 11 mil | Quando consultados |
| `AGENTS.md` | 32.878 B, 212 linhas | ~8 mil | Instruções do projeto (modo de carga não verificado aqui) |
| `CLAUDE.md` + `.claude/CLAUDE.md` | 7.133 + 12.745 B (51 + 356 linhas) | ~5 mil | Toda sessão; o `.claude/CLAUDE.md` passa muito da meta de 200 linhas e é quase todo texto genérico do AIOX |
| `.claude/rules/*` sem `paths:` (5 arquivos) | ~20,3 KB | ~5 mil | Toda sessão |
| `.claude/rules/*` com `paths:` (6 arquivos) | ~19 KB | 0 até casar | Sob demanda |
| Índice `MEMORY.md` do dono | 5.127 B (cerca de 30 entradas) | ~1,3 mil | Toda sessão do orquestrador |
| Agentes `.claude/agents/*` | 36.443 B para 10 (2,7-5,3 KB cada) | ~0,7-1,5 mil cada | A cada criação; todas as descrições em toda sessão |
| Skills | 16 pastas, 840 KB em disco; 8 agentes pré-carregam `checklist-runner`, 10 pré-carregam `synapse:tasks:diagnose-synapse`, 3 `opengrep-static-analysis`, 1 `tech-search` (17 KB) | ~0,9 mil + outras | Injetadas inteiras na partida do subagente |
| `.mcp.json` | não existe no projeto | 0 | n/a. A sessão mostra conectores do claude.ai (Figma, Notion, Vercel, Descript, Claude Docs); com tool search só nomes e instruções do servidor custam contexto, mas os blocos longos de instrução estão presentes |
| `model:` nos agentes | **9 de 10 = `opus`**, só `aiox-sm` = `sonnet`; sem `effort`, sem `maxTurns` | n/a | A cada criação, salvo se o Orion passar o parâmetro `model` |
| Leituras de partida | Cada prompt manda ler: git status/log, `.aiox/gotchas.json`, `technical-preferences.md`, `core-config.yaml` (9.810 B), KB. `.aiox/gotchas.json`, `.aiox-core/data/technical-preferences.md` e `aiox-kb.md` **não existem** aqui; essas leituras falham e gastam turnos | ~2,5 mil + chamadas falhas | Toda criação |
| Atividade | 30 commits desde 2026-10-29; 51 arquivos em `docs/stories/OPS-15/` | n/a | n/a |

Não medido (limites honestos): os prompts reais que o Orion envia aos agentes (não ficam no repositório), o número de criações de agente por ciclo, quanto do AGENTS.md chega aos subagentes, a divisão real de tokens do `/usage` e a parcela semanal já consumida.

Observação sobre o handoff: o arquivo tem 8 seções e a mais nova (`Current objective`, linha 697) está perto do **fim**, enquanto a regra de retomada manda pôr a "chamada" no topo. Quem abre o arquivo inteiro paga ~120 mil tokens (os dois idiomas) antes de fazer qualquer coisa, e isso sozinho pode forçar um `/compact` cedo.

## 3. Recomendações priorizadas

Escala de ganho: Alto = provavelmente acima de 20% do uso semanal; Médio = 5-20%; Baixo = menos de 5%. São **estimativas pelos mecanismos acima, não medições**; a R0 as transforma em medições.

| # | Recomendação | Ganho (base) | Risco | Esforço | Quem | Como medir |
| - | - | - | - | - | - | - |
| R0 | Rodar `/usage` agora e registrar as linhas de atribuição e a linha `Prompt cache (main)`; repetir após cada mudança | Habilitador (mostra as fatias reais) | Nenhum | 5 min | Orion / dono | Texto copiado no handoff |
| R1 | Nunca ler o `session-handoff.md` (en + pt-BR) inteiro. Ler só as ~60 primeiras linhas e a seção citada na chamada; ler o pt-BR só ao editá-lo | **Alto**: ~120 mil tokens por retomada, mais releitura a frio após pausa | Baixo (pode faltar contexto se a "chamada" for incompleta) | Baixo | Orion | Tamanho do contexto no primeiro prompt (`/context`) antes/depois |
| R2 | Igual para o `story.md` (277 KB): `Grep` para o AC/seção e `Read` com `offset`/`limit`; passar aos agentes os intervalos de linhas no prompt | **Alto** (~69 mil por leitura inteira, por agente, repetida) | Baixo | Baixo | Orion nos prompts; agentes | Criações x tokens na linha de subagentes do `/usage` |
| R3 | Passar `model: sonnet` em toda criação, exceto a lista "MUITO complexa" do dono; Opus só nela | **Alto**: o modelo é o maior multiplicador por token; o dono já decidiu (AGENTS.md, 2026-10-29) e 9 de 10 definições contradizem | Baixo-Médio para qualidade de QA/arquiteto: manter a rubrica e repetir só em CONCERNS | Baixo | Orion agora; permanente via R10 | Linhas por modelo do `/usage` |
| R4 | Rodar as fases longas em esforço `medium` (padrão do Sonnet 5.5) e usar `ultrathink` ou `/effort high` só em turnos difíceis; não deixar `max`/`xhigh` como padrão | Médio-Alto (tokens de raciocínio são cobrados como saída) | Baixo-Médio (raciocínio mais raso em bugs difíceis) | Baixo | Orion; dono para o padrão | Linha de recomendação de esforço no `/usage` |
| R5 | `/clear` (após `/rename`) entre tarefas sem relação; `/compact <foco>` só em pausas naturais e com cache quente; evitar pausas acima de 1 hora em sessão grande (o `/compact` a frio é o mais caro) | Alto para a sessão do orquestrador | Baixo (o estado deve estar antes em arquivos: handoff, story) | Baixo | Orion | Misses e rebuilds de `Prompt cache (main)` |
| R6 | Prompts curtos para agentes: objetivo, arquivos/intervalos exatos, aceite, caminho do arquivo de saída; sem logs colados, sem repetir regras que estão no AGENTS.md | Médio (o prompt é reenviado a cada turno daquele agente) | Baixo | Baixo | Orion | Tamanho do prompt; fatia de subagentes no `/usage` |
| R7 | Agentes gravam o relatório completo em arquivo e devolvem 10-20 linhas com o caminho (padrão já usado aqui) | Médio (o texto devolvido fica no contexto do Orion pelo resto da sessão) | Baixo | Baixo | Orion nos prompts | Crescimento do contexto do Orion por delegação |
| R8 | Reaproveitar um agente com `SendMessage` em acompanhamentos da mesma story (histórico quente; a execução retomada pode ler o cache aquecido pela primeira), em vez de criar outro que relê a story | Médio | Médio: histórico longo também é reenviado; retomar só dentro da mesma tarefa, nunca entre stories | Baixo | Orion | Contagem de releituras nos transcritos |
| R9 | Menos ciclos: um `@qa` por pacote (já é regra), fundir validações do `@po` da mesma onda, pular o `@analyst` quando o `docs/research-index.md` diz SUFICIENTE, não repetir o `@ux-design-expert` para escopo inalterado | Médio-Alto (cada agente tem partida a frio: ~10 mil+ tokens antes do trabalho real) | Baixo se os gates atuais ficam | Baixo | Orion | Criações por pacote integrado |
| R10 | **Mudança de regras** (dono): (a) `model: sonnet` em `.claude/agents/*` (exceto uma variante `-opus` explícita); (b) `maxTurns` e `effort: medium`; (c) remover dos prompts as referências a arquivos inexistentes (`.aiox/gotchas.json`, `technical-preferences.md`, `aiox-kb.md`); (d) tirar o pré-carregamento de `synapse:tasks:diagnose-synapse` de 10 agentes (é tarefa de diagnóstico, não de trabalho) | Médio-Alto e permanente | Médio: mexe em arquivos do framework (a camada L2 é "só estender"; confirmar com o dono) | Médio | Dono decide; `@dev`/`@devops` aplicam | Linhas por subagente do `/usage` |
| R11 | Enxugar a camada sempre carregada: mover o texto padrão do AIOX do `.claude/CLAUDE.md` (356 linhas) e as 5 regras sem escopo para regras com `paths:` ou skills; manter o CLAUDE.md perto de 200 linhas | Médio (~10 mil tokens x toda requisição de toda sessão; o cache reduz o preço, não a janela) | Baixo-Médio (atualizações do framework podem recolocar) | Médio | Dono decide; `@dev` | `/context` no início da sessão |
| R12 | Dividir o `session-handoff.md` em "estado atual" curto (<200 linhas, en + pt-BR) e um arquivo; o mesmo para a story da OPS-15 (índice + arquivos por onda) | Alto, torna R1/R2 automáticos | Médio (testes de contrato e de paridade podem citar os arquivos) | Médio-Alto | Dono decide; `@sm`/`@dev`; testes pelo `@qa` | Tamanho da leitura de retomada |
| R13 | Hooks: `PreToolUse` que corta a saída de `npm test` / `npm run` para as falhas (e saída longa em arquivo dentro do projeto); orientar agentes a redirecionar saída longa para arquivo e dar `Read` só na fatia com falha | Médio (a suíte gera muita saída; o QA roda a bateria inteira) | Baixo-Médio (o corte pode esconder aviso; manter código de saída e resumo) | Médio | `@devops` configura | Tamanho dos resultados de ferramenta em um transcrito |
| R14 | Definir `subagentPromptCacheTtl` como `1h` só se os subagentes forem longos e ficarem ociosos entre mensagens; senão manter 5 minutos | Baixo-Médio; situacional, escrita mais cara | Baixo | Baixo | `@devops` | Divisão de `usage.cache_creation` |
| R15 | Revisar conectores: desligar os conectores do claude.ai sem uso neste projeto (Figma, Notion, Vercel, Descript, Claude Docs); cada um põe blocos de instrução em toda sessão | Baixo-Médio (~1-2 mil tokens por requisição; não medido) | Baixo | Baixo | Dono | Seção MCP do `/context` |

### (a) O que o Orion aplica já (sem mudar regra)
R0, R1, R2, R3 (pelo parâmetro `model` da chamada, que é o primeiro na ordem de resolução), R4 (`/effort` na sessão), R5, R6, R7, R8, R9. Mudam só a escrita dos prompts e quais arquivos se leem; as regras do dono (QA >= 9,0, paridade, segurança, agentes em série) ficam como estão.

### (b) O que depende de decisão do dono (regras / arquivos do framework)
R10, R11, R12 (e a forma permanente da R3). Motivo: `AGENTS.md` e `CLAUDE.md` são a fonte das regras, as definições de agente são arquivos do framework (L2) e testes de paridade podem citá-los. Texto de decisão sugerido: "agentes usam Sonnet 5.5 em `medium` por padrão; Opus só na lista de tarefas MUITO complexas já existente; handoff e story são lidos por intervalo".

### (c) O que o `@devops` configura
R13 (hook), R14 (TTL), as edições de `maxTurns`/`effort`/`model` por agente depois de aprovadas, e os comandos de sincronização do `CLAUDE.md` (`npm run sync:skills:claude`, `npm run sync:ide:check`) após editar arquivos de agente.

## 4. Armadilhas: o que parece poupar e custa mais (VERIFICADO, salvo marcação)

- **Trocar modelo ou esforço no meio da tarefa** (exceto esforço no Sonnet/Opus/Haiku 5.5): cache frio, releitura total. Escolha o modelo no início; crie um agente Sonnet em vez de alternar o modelo do Orion.
- **`opusplan` ou skill que nomeia outro modelo**: cada alternância é troca de modelo.
- **`/compact` depois de pausa**: reprocessa todo o histórico sem cache; `/clear` é grátis. Compacte com cache quente, ou limpe e recomece pelo handoff.
- **Muitos subagentes minúsculos**: cada um abre cache separado e frio (TTL de 5 min) e relê os mesmos arquivos; poucos bem delimitados vencem. Por outro lado, **um subagente para tudo** acumula contexto grande reenviado a cada turno.
- **Retomar um agente entre stories sem relação**: mantém o histórico antigo em toda requisição.
- **Reler arquivo que não mudou**: ele já está no contexto; um segundo `Read` o anexa de novo. Use `Grep` para um fato.
- **Enxugar o CLAUDE.md no meio da sessão**: sem efeito até `/clear`/reinício e não invalida nada; faça entre sessões.
- **Conectar/remover servidor MCP ou negar ferramenta com tool search desligado**: invalida o cache.
- **Começar sem plano e corrigir tarde**: retrabalho custa mais que plano (conselho oficial: modo plano, Escape cedo, `/rewind` em vez de compactar um caminho errado; `/rewind` acerta o cache anterior).
- **Cortar gates de qualidade para poupar cota**: as regras do dono (veredito do QA, testes de paridade) são o custo do produto; corte leituras e criações duplicadas, não gates. Um gate que falha custa um ciclo extra inteiro.
- **Promessas de terceiros de "poupe 80%"**: sem respaldo nos dados oficiais (PARCIAL/NÃO VERIFICADO); trate como marketing até a R0 mostrar a fatia real.

## 5. Limites da pesquisa

- O peso da cota semanal por modelo (quanto o Opus consome a mais que o Sonnet) **não aparece como número atual** nas páginas oficiais lidas; relatos de terceiros vão de cerca de 2x a cerca de 5x e datam do lançamento de 2025 (PARCIAL: [ClaudeLog](https://claudelog.com/claude-code-limits/), [InventiveHQ](https://inventivehq.com/blog/opus-vs-sonnet-claude-code), snapshots do reddit). O ganho da R3 é, portanto, direcional.
- Não testei como `AGENTS.md` e `.claude/CLAUDE.md` chegam aos subagentes (a página de memória diz que subagentes podem começar sem instruções do projeto em alguns casos). Não verificado aqui.
- O plano da assinatura, a porcentagem semanal atual e os prompts reais enviados aos agentes não estavam disponíveis. Os ganhos são estimativas até a R0.
- `docs.anthropic.com/.../claude-code/costs` redireciona para `code.claude.com/docs/en/costs`; as páginas foram lidas em 2026-11-05 e citam versões até a v2.1.314. A versão instalada do Claude Code não foi conferida.
- As páginas oficiais grandes (memory, best-practices, subagents, model config) foram lidas por um sumarizador que devolveu os primeiros ~100 mil caracteres; a cauda só foi lida em subagents.
- Nomes de ferramentas e opções (`idleCompaction`, `subagentPromptCacheTtl`, `autoCompactWindow`) dependem da versão instalada (v2.1.242 / v2.1.290 / v2.1.296 ou mais nova).

## 6. Autoavaliação (rubrica, 0-10 cada)

| Critério | Peso | Nota | Justificativa |
| - | - | - | - |
| Cobertura de fontes oficiais | 25% | 9,3 | Costs, prompt caching, model config, memory e subagents lidos em `code.claude.com`, mais a doc de cache da API; peso da cota semanal não é oficial |
| Evidência por recomendação | 20% | 8,8 | Cada linha cita um mecanismo; os ganhos são estimativas, sinalizadas |
| Aderência ao nosso contexto | 20% | 9,4 | Repositório medido: handoff 220/239 KB, story 277 KB, 9/10 agentes em Opus, arquivos citados inexistentes |
| Mensurabilidade | 15% | 9,0 | Atribuição do `/usage`, `Prompt cache (main)`, `/context`, `usage.cache_creation`; toda linha tem métrica |
| Tratamento de risco | 10% | 8,8 | Risco por linha e seção de armadilhas; sem teste A/B real |
| Honestidade sobre limites | 10% | 9,0 | Seção 5 |

Resultado ponderado: **9,1 / 10** na rubrica, informado de forma conservadora como **8,9 / 10** porque não houve dados reais de `/usage` nem execução das mudanças nesta sessão. A nota basta para agir em R0-R9 agora; R10-R15 devem esperar os números da R0.

## 7. Fontes (lidas em 2026-11-05)

- [Manage costs effectively (Claude Code)](https://code.claude.com/docs/en/costs)
- [How Claude Code uses prompt caching](https://code.claude.com/docs/en/prompt-caching.md)
- [Model configuration](https://code.claude.com/docs/en/model-config.md)
- [Subagents](https://code.claude.com/docs/en/sub-agents.md)
- [How Claude remembers your project](https://code.claude.com/docs/en/memory.md)
- [Best practices](https://code.claude.com/docs/en/best-practices)
- [Prompt caching da API](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- Secundárias (PARCIAL): [ClaudeLog limits](https://claudelog.com/claude-code-limits/), [InventiveHQ Opus vs Sonnet](https://inventivehq.com/blog/opus-vs-sonnet-claude-code)

## Próximos passos

1. Orion: aplicar R0-R9 no próximo ciclo e registrar as linhas do `/usage` no handoff.
2. Dono: decidir R10-R12 depois da primeira leitura do `/usage`.
3. `@devops`: preparar R13/R14 só após aprovação.
