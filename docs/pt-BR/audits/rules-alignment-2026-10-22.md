# Auditoria de alinhamento das regras de governança — 2026-10-22

[English](../../audits/rules-alignment-2026-10-22.md)

## Escopo e método

Auditoria somente leitura feita por `@architect` (Aria) na branch `feat/ops-15-next-panel`. Foram revisados `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md`, `.github/copilot-instructions.md`, `.github/agents/*.md`, `docs/CONTRIBUTING.md`, `docs/VERSIONING.md`, tasks e definições de agentes AIOX selecionadas, `.aiox-core/core-config.yaml`, a memória pessoal do projeto (`~/.claude/projects/-home-gustavo-projects-subarushogun-gi-twich-bot/memory/`), `.claude/agent-memory/**`, os workflows de CI e os testes que fixam texto de regras, `tests/unit/documentation-contract.test.js` e `tests/unit/aiox-static-review.test.js`. Não foram executados testes, Docker nem pesquisa na internet (auditoria interna; regra de ouro). Os números de linha referem-se à árvore de trabalho no momento da auditoria. O provedor de revisão estática substituído não é nomeado aqui porque um teste bloqueia o nome dele em todos os arquivos do projeto.

## Achados

Severidade: Blocker = as regras não podem ser cumpridas ao mesmo tempo e uma delas é permanente do proprietário; High = provável causa de ação errada; Medium = ambiguidade ou desatualização; Low = higiene. DP = exige decisão do proprietário.

| ID | Sev. | Local | Conflito | Correção recomendada (não aplicada) | DP |
|----|------|-------|----------|-------------------------------------|----|
| G-01 | Blocker | `.claude/rules/agent-authority.md:45`; `.github/agents/dev.agent.md`; vs `AGENTS.md:73`, `CLAUDE.md:24`, memória `feedback-git-via-devops.md:10` | A matriz lista `git commit` (e `git add`, `git merge` local) como **permitido** ao `@dev`; regra permanente: só o `@devops` comita, após o veredito do `@qa`. | Trocar a linha por: "`git status`, `git diff`, `git log`, `git stash` (somente leitura/local) \| `git add`/`git commit`/`git merge`/`git push` → `@devops` após veredito do `@qa` (sobreposição do projeto, AGENTS.md)". Como o arquivo vem do framework, adicionar também em `AGENTS.md` uma seção de sobreposições que prevaleça sobre `.claude/rules/`. | Não (já decidido) |
| G-02 | Blocker | `AGENTS.md:83`, fixado por `tests/unit/documentation-contract.test.js:49-50`; vs `CLAUDE.md:37`, memória `feedback-issues-body-only.md:11` | O AGENTS.md permite comentários em issue "se forem necessários para registrar decisão ou bloqueio"; o proprietário disse **nunca**. O teste exige o texto mais fraco, então corrigir a prosa quebra a suíte. | `AGENTS.md:83` → "Nunca publique comentários em issues. Toda atualização (decisão, bloqueio, escopo) vai no corpo principal, editado somente pelo `@devops` com `gh issue edit --body-file`." Atualizar o teste para exigir essa frase e acrescentar `not.toContain('comentários só são publicados')`. | Sim (confirmar "nunca, sem exceção") |
| G-03 | High | `CLAUDE.md:30` vs scratchpad do harness em `/tmp`; `tests/unit/aiox-static-review.test.js:86` (`mkdtempSync(tmpdir())`) | "Nunca escreva em `/tmp`" é violado pelo scratchpad do harness, por agentes e pela própria suíte; a exceção do proprietário (instalações) não está escrita em lugar nenhum. | "Escopo de trabalho: artefatos do projeto ficam no repositório. Fora dele só são permitidos: (a) o scratchpad da sessão fornecido pelo harness, para arquivos temporários descartáveis; (b) diretórios temporários criados e removidos pelos próprios testes; (c) caches de instalação (`npm`, `opengrep`) autorizados pelo proprietário. Nada fora do repositório é evidência ou entrega." Espelhar no `AGENTS.md`. | Sim |
| G-04 | High | `AGENTS.md:79` vs `docs/stories/OPS-21/story.md:5` (e pt-BR) | "Não considerar story pronta para execução sem issue", mas a OPS-21 está `Ready`/`Pronta` com issue pendente. `story-lifecycle.md:19` define Ready = só GO do `@po`. Dois significados de "Ready". | Definir no `AGENTS.md`: "`Ready` = GO do `@po` + issue criada + todos os gates de planejamento aplicáveis (dados, UX ≥ 9,0, QA) registrados. Com GO mas gates/issue pendentes, use `Draft (GO do @po; gates pendentes: …)`." Voltar a OPS-21 para Draft, ou aceitar "Ready = GO do PO" e suavizar o `AGENTS.md:79`. | Sim |
| G-05 | High | `.claude/rules/story-lifecycle.md:22,30` vs `AGENTS.md:82` | No lifecycle, o `@qa` marca Done **antes** do push; no AGENTS.md, Done significa publicado por **PR mesclada**. Além disso, o `@devops` "não altera status da story" mas atualiza o status da issue. | Escolher um: "o `@qa` registra o veredito (InReview → QA-PASS); `Done` só após o merge da PR, marcado pelo `@devops` junto com o corpo da issue." Registrar como sobreposição do projeto. | Sim |
| G-06 | High | `CLAUDE.md:3` ("AGENTS.md prevalece") vs conteúdo só no CLAUDE.md (`:11` Node, `:28` OpenGrep, `:29` legacy, `:30` escopo, `:24/:35` etapa do analyst) | A fonte única declarada não contém várias regras do proprietário; agentes Codex/Copilot nunca as veem. | Mover toda regra do proprietário para o `AGENTS.md` (fora dos blocos gerenciados); reduzir o `CLAUDE.md` a diferenças específicas do Claude mais "ver AGENTS.md §X". | Não |
| G-07 | High | `AGENTS.md:17-25,100-108` (AIOX-MANAGED `core`, `quality`) | A regra de documentação bilíngue (`:24`, `:107`) está em blocos gerenciados que uma sincronização do framework pode sobrescrever; a lista gerenciada de gates omite `validate:localization`, `validate:version`, `validate:port-denylist` e `review:static` (só em `CLAUDE.md:51`). Não há procedimento de sincronização registrado além do `CLAUDE.md:28` (só OpenGrep). No repositório, só `grok-skills-sync/index.js:991-1025` reescreve seções gerenciadas; o comportamento do instalador não foi verificado. | Mover a regra bilíngue e a lista completa de gates para uma seção não gerenciada "Regras do projeto"; deixar os blocos gerenciados genéricos. Adicionar ao `AGENTS.md` um checklist "Atualização do framework AIOX": comparar blocos gerenciados, reaplicar customizações do OpenGrep, remover vestígios do provedor substituído, rodar `sync:ide:check`, reconferir as sobreposições G-01/G-05 e rodar os testes que fixam regras. | Não |
| G-08 | Medium | `AGENTS.md:36` ("sempre pesquisar"), `CLAUDE.md:35-36`, memória `feedback-always-research-web.md:11,19` vs regra de ouro `AGENTS.md:41` | Coerente na essência (a regra de ouro "refina"), mas a descrição da memória ainda diz "Always research" e a etapa do analyst antes de cada gate (`CLAUDE.md:24,35`) não está no AGENTS.md. | Uma frase no AGENTS.md: "Pesquisa obrigatória **quando** `docs/research-index.md` marcar LACUNA ou um gatilho REVISAR SE disparar; caso contrário reutilize a nota." Ajustar a descrição da memória. | Não |
| G-09 | Medium | `AGENTS.md` (maioria das linhas sem acento, ex.: `:3,:5,:9-14`) vs regra "pt-BR com acentuação correta"; `CONTRIBUTING.md:18` ("inglês é o principal") vs `AGENTS.md:24`/`CLAUDE.md:20` | Arquivos de instruções são só em pt-BR e parcialmente sem acento; as regras em `.claude/rules/` são só em inglês. Não está dito se arquivos de governança são isentos da regra bilíngue. | Declarar: "Arquivos de instruções de agentes (AGENTS.md, CLAUDE.md, .claude/rules) são monolíngues e isentos da regra bilíngue; pt-BR com acentuação correta." Depois reacentuar o AGENTS.md. | Sim (isenção) |
| G-10 | Medium | `.aiox-core/development/tasks/resolve-github-issue.md:64` ("GitHub Issue Comment"); `.aiox-core/development/agents/devops.md:363` (cobertura publicada em comentários de PR) | Tasks do framework publicam comentários, contrariando a G-02. | Sobreposição no AGENTS.md: "Tasks AIOX que publiquem comentários em issues devem gravar no corpo da issue." Opcional: verificação OpenGrep/teste para `gh issue comment` em scripts do projeto. | Não |
| G-11 | Medium | `.aiox-core/core-config.yaml:351` (`frameworkProtection: false`) vs `.claude/CLAUDE.md:128` (padrão true para projetos) | As deny rules L1/L2 estão desligadas; arquivos do framework não estão protegidos neste repositório de produto. | Definir `true`, salvo se o proprietário edita arquivos do framework de propósito (customizações do OpenGrep). Documentar o motivo em qualquer caso. | Sim |
| G-12 | Medium | `.claude/rules/story-lifecycle.md:128,138` (QA loop máx. 3) vs `.claude/rules/workflow-execution.md:47,59` (máx. 5) | Limite de iterações contraditório. | Escolher um valor e referenciar `autoClaude.qaLoop.maxIterations` nos dois. | Não |
| G-13 | Medium | memória `feedback-git-via-devops.md:14` vs `.claude/agent-memory/aiox-devops/feedback_pathspec_commits.md:10`; `CLAUDE.md:12` | Memória do projeto: reescrita de histórico autorizada uma vez e feita (branch `backup/ops-15-before-history-fix` existe); memória do devops: "history could not be rewritten" (o commit `5225fe5` ainda existe). O `CLAUDE.md:12` diz para nunca comitar sem autorização, mas a autorização vigente de commits existe só na memória. | Corrigir a nota do devops para "foi reescrito em 2026-10-22 com autorização do proprietário; branch de backup mantida". Adicionar ao AGENTS.md: "Autorização vigente: commits locais após veredito PASS do `@qa`; push/PR/tag/bump/release exigem autorização explícita." | Sim (confirmar autorização vigente no repositório) |
| G-14 | Medium | Memória `MEMORY.md` (5 entradas) vs 6 notas | `feedback-always-research-web.md` falta no índice e pode não ser carregada. | Adicionar: "- [Research before decisions](feedback-always-research-web.md) — research-index first; research only on GAP/REFRESH". | Não |
| G-15 | Medium | `.claude/agent-memory/` (não rastreado e fora do `.gitignore:36`) | Não está claro se a memória de agentes é conhecimento compartilhado; arquivos avulsos correm risco de commit acidental ou perda. As instruções do agente dizem que ela é "compartilhada via controle de versão". | Decidir: rastrear (commit pelo `@devops`) ou ignorar. Recomendado: rastrear; feedback durável (commits com pathspec, QA antes do commit) também copiado para a governança em `docs/`. | Sim |
| G-16 | Medium | Notas de feedback da memória pessoal (`feedback-*.md`) | Regras relevantes para a equipe (issues só no corpo, testes finais pelo QA, implementação só pelo dev, decisões em pop-up) ficam em diretório pessoal; a maioria está espelhada em AGENTS/CLAUDE, mas "decisões em pop-up" e a autorização vigente de commits não. | Documentos do repositório são donos das regras; a memória guarda só ponteiros ("ver AGENTS.md §…") e preferências pessoais. | Não |
| G-17 | Low | `.claude/rules/handoff-consolidation.md:33-34,114` | Referencia caminhos `business-ai-first/` de outro projeto. | Trocar por `docs/stories/<ID>/RUN-LOG.md` e `.aiox/run-logs/`. | Não |
| G-18 | Low | `.claude/CLAUDE.md:275` (Node 18+), `.claude/rules/tool-examples.md:16,35` (Supabase), `story-lifecycle.md:36` (`{epic}.{story}.story.md`), frontmatter `paths` sem `docs/pt-BR/stories/**` | Texto genérico do framework desatualizado para este projeto (Node 24.20.0, Prisma/PostgreSQL, `docs/stories/<ID>/story.md`). | Adicionar linhas de sobreposição no AGENTS.md; incluir `docs/pt-BR/stories/**` no filtro de caminhos. | Não |
| G-19 | Low | `.github/copilot-instructions.md` (sem regras do projeto) | O Copilot não vê nenhuma regra do proprietário (issues, commits, pesquisa, OpenGrep). | Uma linha: "Siga AGENTS.md; ele prevalece sobre este arquivo." | Não |
| G-20 | Low | `.claude/rules/agent-memory-imports.md:7-12` | Importa só 6 dos 10 `MEMORY.md` de agentes (faltam analyst, data-engineer, sm, ux). | Adicionar os quatro imports. | Não |
| G-21 | Low | `.github/workflows/quality-gates.yml` | `validate:port-denylist` (exigido pelo `CLAUDE.md:51`) não roda na CI. | Adicionar o passo. | Não |

Provedor substituído (item 8): a aplicação é forte. `tests/unit/aiox-static-review.test.js:142-150` varre todos os arquivos do repositório (rastreados e não rastreados, exceto diretórios gerados) em busca do nome; `CLAUDE.md:28` e `.claude/rules/opengrep-static-analysis.md` são coerentes; as tasks do framework citam só o OpenGrep. Nenhum resíduo foi encontrado por inspeção (o teste é a autoridade e não foi executado aqui).

## Mapa proposto de fontes da verdade

| Área | Arquivo dono | Demais |
|------|-------------|--------|
| Regras do proprietário (autoridade de git/commit, issues só no corpo, QA final, escopo//tmp, OpenGrep, legacy, regra de ouro da pesquisa, definição de Ready, idioma) | `AGENTS.md`, seção não gerenciada "Regras do proprietário" | `CLAUDE.md`, `copilot-instructions.md`, memória: só ponteiros |
| Sobreposições do projeto às regras do framework (G-01, G-05, G-10, G-12, G-18) | `AGENTS.md`, "Sobreposições ao framework AIOX" | `.claude/rules/*` ficam genéricas |
| Comportamento específico do Claude (scratchpad, skills, subagentes) | `CLAUDE.md` | — |
| Contribuição, formato de commits, segurança | `docs/CONTRIBUTING.md` | — |
| Versionamento, estágio, release | `docs/VERSIONING.md` | — |
| Fluxo de status da story | sobreposição no `AGENTS.md` + `.claude/rules/story-lifecycle.md` | — |
| Reuso de pesquisa | `docs/research-index.md` | — |
| Aprendizado de agentes (não normativo) | `.claude/agent-memory/**` (rastreado) | Memória pessoal: só preferências |
| Aplicação | testes que fixam regras + CI | — |

## Aplicação (item 10)

Com teste/CI: proibição do provedor substituído; OpenGrep no executor de workflow e na CI; textos de changelog/versionamento; frase do DevOps sobre o corpo da issue (mas fixa a exceção mais fraca, G-02); lint, typecheck, testes, localização e versão na CI. Só prosa: `@dev` não comita, QA antes do commit, nunca comentar, definição de Ready, sem `/tmp`, docs bilíngues, UX ≥ 9,0, regra de ouro da pesquisa, higiene Docker, evidência só com PostgreSQL. Não há hooks Git locais (sem `.husky`/`.githooks`).

## Checklist de governança profissional — 6,5/10

Coberto: fonte única declarada; autoridade de papéis explícita; decisões do proprietário escritas; gates de qualidade na CI; testes que fixam textos-chave; política de docs bilíngues; política de versão/release; índice de reuso de pesquisa. Não coberto: precedência entre `AGENTS.md` e regras do framework (G-01, G-05); uma regra do proprietário fixada na forma mais fraca (G-02); regras em blocos sobrescrevíveis sem procedimento de sincronização (G-07); exceções impossíveis ou não escritas (G-03); definições divididas de Ready/Done (G-04, G-05); deriva da memória e memória de agentes não rastreada (G-13–G-16); a maioria das regras de autoridade sem teste nem hook.

## Decisões necessárias do proprietário

1. G-02: comentários em issues — "nunca, sem exceção" (recomendado) e atualizar o teste que fixa o texto.
2. G-03: escrever as exceções de escopo (scratchpad, diretórios temporários de teste, instalações).
3. G-04/G-05: significado de Ready (recomendado: GO do PO + issue + gates) e de Done (recomendado: após PR mesclada).
4. G-09: isentar arquivos de instruções de agentes da regra bilíngue.
5. G-11: reativar `frameworkProtection`.
6. G-13/G-15: registrar no repositório a autorização vigente de commits; rastrear `.claude/agent-memory/`.

## Status da correção (autorização do proprietário, 2026-10-22)

O proprietário autorizou corrigir os achados sem decisão pendente. Itens de decisão do proprietário não foram aplicados. Correções cujo lugar ideal seria em caminhos protegidos do framework (L1/L2) ou em blocos `AIOX-MANAGED` foram aplicadas como **divergência documentada do projeto** na seção não gerenciada do `AGENTS.md` "Regras do proprietário e sobreposições ao framework AIOX"; uma sincronização futura do framework exige reconferi-las (procedimento registrado nessa seção).

| ID | Status | Nota |
|----|--------|------|
| G-01 | CORRIGIDO | Linha de `.claude/rules/agent-authority.md` reescrita; sobreposição no AGENTS.md. Correção: `.github/agents/dev.agent.md` não menciona commits. |
| G-02 | PENDENTE-DECISÃO | Texto e teste fixado inalterados; a sobreposição no AGENTS.md reforça a edição só pelo corpo sem tocar a linha 83. |
| G-03 | PENDENTE-DECISÃO | — |
| G-04 | PENDENTE-DECISÃO | Status da OPS-21 inalterado. |
| G-05 | PENDENTE-DECISÃO | — |
| G-06 | CORRIGIDO | OpenGrep, legacy, Node/stack, etapa do analyst e autoridade de git copiados para o AGENTS.md; a regra de escopo (/tmp) fica só no CLAUDE.md até a decisão da G-03. |
| G-07 | CORRIGIDO (divergência) | Cópia não gerenciada da regra bilíngue e da lista completa de gates, mais checklist de atualização do framework, no AGENTS.md; blocos gerenciados intocados. |
| G-08 | CORRIGIDO | Descrição da memória e linha de pesquisa no AGENTS.md; texto da regra de ouro inalterado. |
| G-09 | PENDENTE-DECISÃO | — |
| G-10 | CORRIGIDO (divergência) | Sobreposição no AGENTS.md; tasks do framework (L2) intocadas. |
| G-11 | PENDENTE-DECISÃO | — |
| G-12 | CORRIGIDO | `story-lifecycle.md` alinhado a 5 iterações. |
| G-13 | CORRIGIDO (memória) / PENDENTE-DECISÃO (repositório) | Nota do devops corrigida (`5225fe5` agora existe só na branch de backup); registrar no repositório a autorização vigente de commits aguarda o proprietário. |
| G-14 | CORRIGIDO | O índice lista as 6 notas; todos os links `[[...]]` resolvem. |
| G-15 | CORRIGIDO (decisão documentada) | Decisão: `.claude/agent-memory/**` é conhecimento da equipe e deve ser versionado (AGENTS.md); não comitado — o commit é do `@devops`. |
| G-16 | ACEITO-COM-RAZÃO | "Decisões em pop-up" é preferência pessoal de interação com o Claude, não regra de equipe; fica na memória pessoal. |
| G-17 | CORRIGIDO | Caminhos trocados pelos deste projeto. |
| G-18 | CORRIGIDO | Linha de Node em `.claude/CLAUDE.md` (fora do bloco gerenciado), nota de caminho de story e filtro `docs/pt-BR/stories/**`; exemplos Supabase cobertos pela sobreposição no AGENTS.md. |
| G-19 | CORRIGIDO | Ponteiro para o AGENTS.md no topo de `.github/copilot-instructions.md`. |
| G-20 | CORRIGIDO | Quatro imports adicionados. |
| G-21 | ACEITO-COM-RAZÃO | Mudanças de CI são do `@devops`; delegar a inclusão de `validate:port-denylist`. |

Arquivos alterados: `AGENTS.md`, `.claude/CLAUDE.md`, `.claude/rules/agent-authority.md`, `.claude/rules/story-lifecycle.md`, `.claude/rules/handoff-consolidation.md`, `.claude/rules/agent-memory-imports.md`, `.github/copilot-instructions.md`, `.claude/agent-memory/aiox-devops/feedback_pathspec_commits.md`, memória pessoal `MEMORY.md` e `feedback-always-research-web.md`, além deste relatório (en + pt-BR).
