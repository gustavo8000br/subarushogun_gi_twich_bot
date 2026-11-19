# CLAUDE.md - Synkra AIOX (Claude Code)

Adaptação do `AGENTS.md` para o Claude Code. O `AGENTS.md` continua sendo a fonte única das regras do projeto; em caso de divergência, ele prevalece. As regras do framework carregadas de `.claude/CLAUDE.md` e `.claude/rules/` também valem.

Ao retomar uma sessão, leia primeiro `docs/current-state.md` (arquivo curto de estado, par em `docs/pt-BR/current-state.md`; D-15, 2026-11-14), depois o ponto de parada em `docs/handoffs/resume-agents-2026-11-14.md`. `docs/session-handoff.md` é um registro histórico longo (cerca de 230 KB): **nunca o leia inteiro**, só trechos com `Grep` e `Read` com `offset`/`limit`; stories grandes (`docs/stories/OPS-15/story.md`, 277 KB) também (economia de cota, 2026-11-05). Handoffs e prompts vencidos (incluindo o prompt de continuação da OPS-15) estão arquivados em `docs/handoffs/_archive/` e `docs/pt-BR/handoffs/_archive/` e **não valem como instrução**.

## Checkout e ambiente

- Antes de editar, confirme `pwd`, `git rev-parse --show-toplevel` e `git branch --show-current`. A branch de trabalho vem de `docs/current-state.md`; não presuma nomes de branch de documentos antigos.
- Dependências não são compartilhadas entre worktrees: `npm ci`, `npm ci --prefix .aiox-core`, `npm run sync:skills:codex`, `npm run sync:skills:claude`, `npm run sync:ide:check`.
- Node `24.20.0` é a versão atual fixada em `package.json` (padrão do projeto, não regra imutável). Atualizar Node ou dependências é permitido pelo fluxo: pesquisa (`@analyst`) -> plano (`@architect`, `@data-engineer` se houver banco/Prisma) -> `@dev` em branch própria -> bateria completa do `@qa` -> PR do `@devops`; mantenha o pin consistente em `package.json`, Dockerfiles, CI e docs (en + pt-BR) e avise o proprietário em bumps de Node ou major.
- Fluxo Git aprovado: `main` -> branch Conventional Commits -> PR -> `main`. Commits, push e PR pertencem ao `@devops`, somente com o veredito do `@qa`; desde 2026-10-29 o proprietário delegou ao orquestrador o push da branch e a criação/atualização de PRs. Continuam exigindo autorização explícita do proprietário: merge na `main`, tag, release, bumps a partir de `rc`, cutover destrutivo fora do plano aprovado e remoção de dados. Bumps de versão seguem a política do `AGENTS.md` (alpha/beta: o Orion decide e o `@devops` executa, avisando o proprietário; rc/stable: OK expresso a cada bump). Execução por faixas, arquivos quentes, fila de gates, bloqueios primeiro e prioridade de cota estão em "Operação do orquestrador e dos agentes" no `AGENTS.md`; o guarda-corpo de Git é `.claude/hooks/git-authority-guard.cjs`, ligado em `.claude/settings.json`; a memória pessoal do orquestrador não é acessível aos demais agentes e não vale como regra. **Nunca exponha a URL da sessão do Claude** (commits, PRs, issues, docs; o repositório é público): regra em `AGENTS.md`. **Todos os testes rodam primeiro com o `@qa`** (veredito e nota antes do push; o CI do GitHub só confirma): regra em `AGENTS.md`. **O `@dev` testa durante a implementação e o `@qa` valida a bateria completa uma vez, ao fim da story** (sem commit de fatia antes do gate): regra em `AGENTS.md`. **Prompts aos agentes legíveis** (seções curtas, listas, português): regra em `AGENTS.md`. **Corpo de PR no modelo de 8 seções** (Resumo, Mudanças, Causa raiz, Evidência, Riscos e limites, Como verificar, Links, Checklist; pt-BR e en): regra em `AGENTS.md`. Modelos: Sonnet 5.5 padrão; Haiku 5.5 só nos três agentes de leitura; Opus 5.5 só para tarefas MUITO complexas; Fable 5.1 proibido (regra "Modelos dos agentes" em `AGENTS.md`).

## Regras de 2026-11-10 (detalhe no `AGENTS.md`)

- **Diretriz de engenharia:** pesquise antes de decidir, siga as convenções da tecnologia, meça antes de otimizar e termine com o relatório final de 11 itens.
- **Memória e handoff (2026-11-13):** o Orion sempre mantém atualizados a memória e o `handoff-current.md` no repositório privado de memória (`./sync.sh pull|push <projeto>`); o push é sempre do `@devops`. Regra completa no `AGENTS.md`.
- **Modelo visível:** toda resposta mostra o modelo de cada agente e se a sessão está com advisor. Sonnet 5.5 é o padrão; Haiku 5.5 só nos agentes `aiox-search`, `aiox-grep` e `aiox-audit`; Opus 5.5 só para tarefas MUITO complexas, com o motivo registrado ao proprietário; Fable 5.1 está proibido (regra "Modelos dos agentes" no `AGENTS.md`).
- **Meta do beta:** `v1.0.0-beta` sai com >= 80% das funcionalidades planejadas testadas e funcionais (ledger em `docs/process/open-acceptance-criteria-2026-11-10.md`); `rc` e `stable` seguem com OK expresso.

## Agentes de leitura, faixas e advisor (2026-11-14; detalhe no `AGENTS.md`)

1. Exploração estrutural ampla vai ao `aiox-search`; localização de símbolos, chamadas e pontos de impacto vai ao `aiox-grep`; triagem de um diff antes do gate vai ao `aiox-audit` (pacotes com 5 ou mais arquivos ou documentos bilíngues; dinheiro e segurança vão direto ao `@qa`). Só o orquestrador os despacha, sem o parâmetro `model`, agrupando as perguntas numa chamada.
2. Delegue só quando compensa: leitura acima de ~30 arquivos ou ~50 mil tokens com resposta de até ~2 mil. Um arquivo conhecido, poucas buscas, ou um arquivo que o próximo agente vai editar (e portanto ler) não justificam subagente.
3. Não traga ao contexto principal saídas extensas de investigação: peça o formato fixo do agente e, se o resultado for reutilizado, grave-o em `.local/` e cite o caminho.
4. Todo resumo de investigação traz evidência `arquivo:linha` e diz o que não foi lido.
5. Os agentes de leitura nunca recebem tarefa de escrita; o `aiox-audit` nunca corrige o que audita, não dá nota nem veredito. O `@qa` continua a autoridade final e roda a bateria completa; os critérios de teste e de arquitetura do projeto não mudam.
6. Permissões de cada agente valem como estão em `.claude/agents/` e no `AGENTS.md`; nenhum agente contorna o `git-authority-guard.cjs` ou o `read-only-bash-guard.cjs`.
7. Limites: até 3 faixas de leitura e 1 de escrita; uma segunda faixa de escrita só com conjuntos disjuntos declarados, nenhum arquivo quente, worktree própria se as duas mexem em código e nenhum recurso exclusivo fora da fila. Registre a faixa na tabela "Faixas abertas" do handoff. O interruptor do proprietário "multi-agents off" força a série; o padrão é "on".
8. Advisor Opus só por sessão (`claude --model sonnet --advisor opus`), em sessão dedicada a um pacote complexo; nunca `/advisor opus` nem `advisorModel` (gravam nas configurações do usuário). Nessa sessão não despache os agentes Haiku. Para desligar: `/advisor off` ou abrir a sessão com `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1`. O comportamento do advisor nesta instalação ainda não foi testado (V-ADV-1 e V-ADV-2).

## Regras centrais

1. Siga a Constitution em `.aiox-core/constitution.md`; prioridade `CLI First -> Observability Second -> UI Third`.
2. Trabalhe por stories em `docs/stories/` (en) e `docs/pt-BR/stories/` (pt-BR); não invente requisitos.
3. Todo roadmap/story novo exige issue GitHub (e roadmap exige issue-mãe com sub-issues nativas; exceção D-16: as sub-issues de fatias ainda não Ready são criadas quando a story ficar Ready, ver `AGENTS.md`), criada pelo `@devops` antes da implementação.
4. Changelogs de estágio: versão mais recente primeiro; atualize en e pt-BR juntos antes de qualquer commit; siga o formato público do `AGENTS.md` (título `## vX.Y.Z-<estágio>` exato, bloco `> [!WARNING]` para incompatibilidades, categorias com quadrado colorido).
5. Documentação, story e handoff sempre em inglês e português.

## Papéis AIOX

`@aiox-master` (Orion) orquestra e delega. `@dev` implementa; `@qa` valida de forma independente; `@architect` revisa arquitetura; `@data-engineer` coordena todo trabalho de banco de dados; `@analyst` pesquisa (internet, documentação oficial, blogs, fóruns) antes de cada gate de planejamento e de cada desenvolvimento e entrega a nota de pesquisa aos agentes sem acesso à internet; `@ux-design-expert` planeja toda mudança voltada à pessoa usuária; `@devops` cuida de Git remoto, PRs, CI/CD e release. Não alegue que uma persona validou algo sem executar seu fluxo. **Regra permanente (2026-10-22):** a execução final e independente de testes e gates antes de commit, PR ou release é do `@qa` (veredito PASS/CONCERNS/FAIL/WAIVED + lista de grupos prontos); o `@devops` só comita o que o `@qa` liberou. O `@dev` testa durante o desenvolvimento, sem substituir o `@qa`.

## Decisões do proprietário (invioláveis)

- **Revisão estática:** o único revisor é o OpenGrep (`npm run review:static`). Nunca use nem reintroduza o provedor de revisão antigo (não planejado no projeto; o nome dele é bloqueado por `tests/unit/aiox-static-review.test.js`). Ao atualizar o framework AIOX, reaplique as customizações de OpenGrep e remova qualquer arquivo ou trecho desse provedor.
- **`legacy`:** a branch `legacy` foi removida (2026-11-13, pelo proprietário e pelo Orion) e não existe mais; não é fallback nem alvo de rollback. O painel vanilla e o código legado já foram removidos por completo (ondas 1 a 4 do cutover da OPS-15, com autorização explícita do proprietário); o painel é o Next.js. Referências históricas a `legacy` em docs antigos descrevem o passado.
- **Escopo de trabalho:** trabalhe apenas dentro do diretório do projeto; não escreva em `/tmp` nem em outros locais.

## UX e pesquisa

- Mudança que afete a experiência de pessoas usuárias exige plano e revisão com `aiox-ux-design-expert`, registrados na story, com score mínimo **9,0/10** antes de implementar. O score vale só para o escopo revisado; diferencie revisão estática de validação visual, browser e tecnologia assistiva.
- Pesquise na internet antes de decisões técnicas (documentação oficial primeiro; comunidade como evidência complementar), cite links e registre limitações. Pesquisa não substitui teste no ambiente do projeto. A pesquisa é feita pelo `@analyst` (ou pelo `@architect`) como etapa explícita do fluxo pesquisa → planejamento → desenvolvimento, porque `@po`, `@data-engineer`, `@dev`, `@qa` e `@ux-design-expert` não têm ferramenta de internet.
- Regra de ouro (2026-10-22): se o `@analyst` já pesquisou um tema e julgou que não precisa de mais pesquisa, não gaste tokens com nova pesquisa; consulte primeiro `docs/research-index.md` (notas existentes, veredito SUFICIENTE / REVISAR SE / LACUNA) e peça pesquisa nova apenas para uma LACUNA ou um gatilho de revisão que ocorreu.
- Issues: comentários só em casos raros (uma decisão ou bloqueio que não caiba no corpo, com a confirmação do proprietário pedida pelo guarda-corpo, como no `AGENTS.md`); o `@devops` atualiza sempre o corpo principal (vale para todas as abertas).

## Evidências e banco de dados

- Não invente evidências. Separe fixtures/mocks, testes unitários, API/PostgreSQL descartável, serviços reais, Twitch/worker, navegador real e OBS/CEF nativo.
- Garantias de PostgreSQL exigem integração em PostgreSQL isolado com migrations reais; nunca SQLite ou mocks de Prisma. Testes usam instância e dados descartáveis, sem tocar volumes ativos.
- Preserve volumes, imagens e containers ativos; confira projeto Compose, labels e ownership antes de remover qualquer recurso e remova só o que for comprovadamente descartável.
- **Limpeza de disco (2026-11-18):** apagar containers, volumes e imagens que não são mais úteis é regra; confira `df -h /home` e `docker system df` no início da sessão e entre pacotes. Nunca remova containers ativos, a stack de preview nem volumes do proprietário sem OK; caches fora do Docker (npm, yarn) só com OK. Regra completa em "Higiene de recursos Docker" no `AGENTS.md`.

## Erros e diagnóstico

Falhas inesperadas da API retornam texto genérico localizado com `referenceId`; nunca mensagem, stack ou dados internos. Logs JSON sem corpo de chat/resgate, UID, tokens, headers, segredos ou connection string. Erros Twitch permanecem na outbox com estado seguro; resposta ausente nunca vira confirmação.

## Quality gates

`npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static`. Atualize checklist e file list da story antes de concluir.
