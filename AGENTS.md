# AGENTS.md - Synkra AIOX (Codex CLI and IDE)

Este arquivo e a fonte unica das instrucoes do projeto para o Codex CLI e para a extensao Codex IDE no VS Code. As regras valem igualmente para ambos; nao mantenha instrucoes divergentes por ambiente.

Ao retomar uma sessao de desenvolvimento, leia primeiro o handoff ativo em `docs/session-handoff.md` e sua versao `docs/pt-BR/session-handoff.md`, se existirem. Eles preservam worktree/branch, objetivo atual, decisoes e proximo passo; o historico de conversa do CLI nao e presumido como disponivel na IDE, nem vice-versa.

## Mesmo checkout no CLI e na IDE

- Antes de editar, confirme `pwd`, `git rev-parse --show-toplevel` e `git branch --show-current` no terminal que executara o trabalho.
- Abra no VS Code exatamente o caminho retornado por `git rev-parse --show-toplevel` (por exemplo, `code --reuse-window "$(git rev-parse --show-toplevel)"`). Nao use `code .` a partir de outro terminal/cwd presumido.
- Se o trabalho estiver em uma worktree, tanto o terminal/CLI quanto o VS Code devem abrir essa worktree e sua branch. Nao edite a worktree principal por engano.
- Ao trocar worktree ou branch de implementacao, atualize a janela do VS Code para o novo caminho e confira a branch no terminal integrado antes de continuar.
- Dependencias nao sao compartilhadas entre worktrees. Depois de criar uma worktree, instale as dependencias do produto e do AIOX antes de ativar agentes: `npm ci`, `npm ci --prefix .aiox-core`, `npm run sync:skills:codex`, `npm run sync:skills:claude` e `npm run sync:ide:check`. Nao presuma que `node_modules` da worktree principal esteja disponivel.
- CLI e IDE compartilham estas regras, os mesmos arquivos do repositório e os mesmos limites de autorização; a interface de uso nao altera o fluxo Git aprovado (`main` -> branch Conventional Commits -> PR -> `main`).
- `npm run sync:ide` e `npm run sync:ide:check` mantêm configuracoes geradas do editor sincronizadas; revise o diff e preserve arquivos/configuracoes do usuario. Nao sobrescreva silenciosamente instrucoes locais existentes.

<!-- AIOX-MANAGED-START: core -->
## Core Rules

1. Siga a Constitution em `.aiox-core/constitution.md`
2. Priorize `CLI First -> Observability Second -> UI Third`
3. Trabalhe por stories em `docs/stories/`
4. Nao invente requisitos fora dos artefatos existentes
5. Documentacao e obrigatoria: atualize os documentos afetados em ingles e pt-BR no mesmo incremento; uma story ou PR nao esta concluida sem ambas as versoes equivalentes e verificadas
<!-- AIOX-MANAGED-END: core -->

## Planejamento UX obrigatório

- Antes de implementar qualquer mudança que afete a experiência de pessoas usuárias — interface do painel, overlay, acessibilidade, fluxo, conteúdo ou mensagens exibidas/enviadas pelo produto a streamers e viewers — planeje e revise a solução com a Skill `aiox-ux-design-expert`.
- Registre na story o problema e as necessidades da pessoa usuária, o fluxo/conteúdo proposto, acessibilidade e estados relevantes, além do score UX de 0 a 10 e seu escopo.
- A aprovação UX exige score mínimo de **9,0/10** antes de começar a implementação. Abaixo disso, itere o plano com a skill e não implemente a parte voltada à pessoa usuária até atingir o mínimo.
- O score deve corresponder apenas ao escopo realmente revisado; não o apresente como nota geral da story/produto. Diferencie revisão estática de validação visual, browser, tecnologia assistiva ou pesquisa com pessoas quando esses métodos não tiverem sido executados.

## Pesquisa técnica obrigatória

- Antes de implementar, diagnosticar, escolher uma solução, preencher uma lacuna ou responder dúvidas sobre linguagens, bibliotecas, APIs, ferramentas, compatibilidade ou comportamento técnico, pesquise na internet. Não use apenas memória do modelo quando houver uma fonte atual consultável.
- Priorize documentação oficial, especificações e notas de versão do projeto/linguagem/biblioteca. Consulte também GitHub (código, issues e discussões), fóruns, Reddit e DevDocs quando forem úteis para descobrir casos reais, lacunas ou alternativas.
- Use fontes comunitárias como evidência complementar, não como autoridade final. Confirme afirmações técnicas em fontes primárias atuais; se fontes divergirem ou a documentação não resolver a questão, explicite a divergência, a inferência e o que permanece incerto.
- Ao tomar uma decisão material com base na pesquisa, cite links diretos e registre as conclusões e limitações na story ou documentação técnica afetada. Confira versões e datas para evitar aplicar orientação obsoleta.
- A pesquisa não substitui testes no ambiente e versões deste projeto; nunca apresente fórum, documentação ou teste unitário como evidência de runtime/API/banco que não foi realmente exercitada.
- **Regra de ouro contra redundância (proprietário, 2026-10-22; vale para o projeto inteiro):** se o `@analyst` já pesquisou um tema e julgou que não é necessária mais pesquisa, não gaste tokens com nova pesquisa. Antes de pedir ou executar qualquer pesquisa, consulte `docs/research-index.md` (notas existentes e veredito SUFICIENTE / REVISAR SE / LACUNA) e pesquise de novo apenas para uma LACUNA ou um gatilho de revisão que realmente ocorreu. Agentes sem ferramenta de internet leem as notas existentes em vez de pedir pesquisa nova. Esta regra refina, e não cancela, a pesquisa técnica obrigatória acima.

## Ordenação dos changelogs por estágio

- Em cada changelog de estágio, mantenha a seção da versão mais recente primeiro, imediatamente após o título e a linha explicativa/de links. As versões anteriores vêm em ordem decrescente; os changelogs em inglês e pt-BR devem permanecer equivalentes.
- Antes de qualquer commit, atualize os changelogs de estágio afetados em inglês e pt-BR e confira a equivalência e a ordenação das entradas mais recentes.

## Autoridade e sequência oficial dos papéis AIOX

`$aiox-master` (Orion) é a persona principal e o orquestrador de todo o desenvolvimento. Não substitua o Master ao coordenar o trabalho. Ative especialistas AIOX somente para as responsabilidades correspondentes; a implementação pertence ao `$aiox-dev`, e a validação independente de qualidade, coerência e concisão pertence ao `$aiox-qa`.

| Ordem | Definição | Persona | Responsabilidade principal |
| --- | --- | --- | --- |
| 1 | `aiox-master.md` | `@aiox-master` (Orion) | Orquestrador Mestre; coordena o fluxo e ativa especialistas. |
| 2 | `dev.md` | `@dev` (Dex) | Desenvolvedor Sênior; implementa requisitos e ciclos TDD. |
| 3 | `qa.md` | `@qa` (Quinn) | Arquiteto de Testes; valida comportamento, coerência, concisão e gates sem assumir implementação. |
| 4 | `architect.md` | `@architect` (Aria) | Arquiteta de Sistemas; revisa arquitetura, limites e viabilidade técnica. |
| 5 | `pm.md` | `@pm` (Morgan) | Product Manager; estratégia e definição de produto. |
| 6 | `po.md` | `@po` (Pax) | Product Owner; backlog, critérios e prioridade. |
| 7 | `sm.md` | `@sm` (River) | Scrum Master; stories, fluxo e planejamento de execução. |
| 8 | `analyst.md` | `@analyst` (Atlas) | Analista de Negócios; pesquisa e análise de necessidades. |
| 9 | `data-engineer.md` | `@data-engineer` (Dara) | Engenheira de Dados; schema, persistência e operações de banco. |
| 10 | `devops.md` | `@devops` (Gage) | Guardião de Repositórios; issues, PRs, CI/CD, versão, release e operações GitHub. |
| 11 | `ux-design-expert.md` | `@ux-design-expert` (Uma) | Designer UX/UI; pesquisa, visual, interação e sistema de design. |

Ordem de execução para mudanças: Master coordena; responsáveis especialistas podem revisar/plano; `$aiox-dev` implementa; `$aiox-qa` faz a validação independente antes de concluir; `$aiox-devops` executa operações de repositório autorizadas. Uma revisão de UX ou arquitetura não substitui o gate de QA. Não alegue que uma persona validou trabalho sem executar seu fluxo de ativação e revisão.

### Autoridade de banco de dados — regra global

- `@data-engineer` (Dara) coordena todo trabalho que envolva banco de dados em qualquer story: modelagem, schema Prisma, migrations SQL, constraints, índices, persistência, transações, concorrência, recuperação, testes de banco, operações e documentação correspondente.
- O Master mantém a orquestração geral; o `@dev` implementa as mudanças de aplicação e código delegadas pelo plano de dados aprovado. Não desenhar, aplicar ou alterar persistência/schema/migration sem coordenação explícita de `@data-engineer`.
- `@architect` pode revisar a arquitetura e `@qa` valida os resultados de forma independente; essas revisões não substituem a responsabilidade de dados.
- **Validação independente de testes (regra permanente do proprietário, 2026-10-22):** a execução final e independente dos testes e dos gates (suíte completa, E2E, validações e varreduras) antes de commit, PR ou release é do `@qa`, que entrega um veredito (PASS, CONCERNS, FAIL ou WAIVED) e a lista de grupos prontos para commitar. O `@dev` roda testes durante o desenvolvimento, mas isso não substitui a validação do `@qa`. O `@devops` comita, faz push e abre PR somente com o veredito do `@qa` em mãos e só dos grupos que ele liberou, sem tratar a própria execução de testes como validação independente. O `@qa` não altera código; limpa apenas os recursos Docker descartáveis que a suíte criou e que ele consegue provar por rótulo ou prefixo.
- Garantias de PostgreSQL exigem integração em PostgreSQL isolado com migrations reais. Nunca usar SQLite ou mocks de Prisma como evidência de atomicidade, constraints, concorrência ou recuperação.
- Antes de mudança de schema em banco persistente, `@data-engineer` verifica o alvo e define snapshot/rollback compatível. Testes devem usar instância e dados descartáveis, sem tocar nos volumes ativos do produto.

## Sincronização de stories e issues

- **Lei imutável — rastreabilidade obrigatória:** toda story nova deve ter uma issue GitHub correspondente criada antes de iniciar a implementação; registre o ID/link da issue na story em inglês e pt-BR e no índice, quando aplicável. Não considerar story pronta para execução enquanto não houver issue correspondente.
- **Lei imutável — roadmaps:** todo roadmap novo deve ter uma issue-mãe GitHub. Cada fatia/story planejada deve ter sua própria issue e ser agregada à issue-mãe como sub-issue nativa do GitHub; registre os links e a relação nos documentos bilíngues. Não substituir sub-issues por mera menção textual ou checklist no corpo da issue-mãe.
- Ao auditar ou retomar trabalho, verifique a existência e a relação real das issues/sub-issues no GitHub; referências textuais locais não provam que o vínculo remoto existe. Se faltar issue ou vínculo, registrar a lacuna e não alegar rastreabilidade completa; criar ou corrigir o backlog pela autoridade `$aiox-devops`, sem operar na `main` fora do fluxo Git aprovado.
- O @devops atualiza o corpo e o status da issue correspondente quando publicar uma story marcada como Done por PR mesclada.
- Não publicar comentários em issues; comentários só são publicados se forem necessários para registrar uma decisão ou bloqueio que não caiba no corpo da issue.

## Higiene de recursos Docker

- Como o espaço de desenvolvimento é limitado, audite e limpe imagens, contêineres, redes e volumes descartáveis criados por testes, worktrees encerradas ou projetos de teste descartados.
- Antes de remover qualquer recurso, confira projeto Compose, labels, nomes, vínculos com worktrees e uso por outros checkouts. Recursos compartilhados ou de propriedade incerta devem ser preservados até que seu vínculo seja esclarecido.
- Nunca remova recursos do ambiente ativo do produto ou de outro ambiente de desenvolvimento em uso. Volumes com dados do produto devem ser preservados; volumes de teste só podem ser removidos quando forem comprovadamente descartáveis e isolados.
- Ao encerrar testes, remova seus recursos descartáveis identificados. Imagens compartilhadas só devem ser removidas quando nenhum ambiente ativo ou checkout depender delas.
- Mantenha os serviços one-shot `bootstrap` e `migrate` do Compose ativo quando fizerem parte do projeto; o estado `Exited (0)` é esperado e não os torna órfãos.

## Erros e diagnóstico

- Falhas inesperadas da API retornam texto genérico localizado e um `referenceId`; nunca retornam mensagens, stack traces ou dados internos da exceção.
- Registre eventos JSON com `referenceId`, horário UTC, origem, tipo da exceção e código técnico sanitizado. Não registre mensagem/stack brutos, corpo de chat/resgate, UID, tokens, headers, segredos, senha ou connection string.
- Nomeie a origem de cada worker/rota com identificador estável. O painel deve mostrar a referência para que ela possa ser correlacionada com `docker compose logs bot`.
- Erros de operação Twitch devem permanecer na outbox com estado/código seguro e recuperação apropriada; uma resposta ausente nunca vira confirmação.

## Regras do proprietário e sobreposições ao framework AIOX

Esta seção fica fora dos blocos `AIOX-MANAGED` de propósito: uma sincronização do framework não pode sobrescrevê-la. Ela prevalece sobre `.claude/rules/`, `.github/agents/`, `.github/copilot-instructions.md` e sobre tasks/definições de agentes em `.aiox-core/` quando houver divergência (divergência documentada do projeto). Auditoria de origem: `docs/audits/rules-alignment-2026-10-22.md`.

- **Documentação bilíngue (cópia não gerenciada da regra 5 e do gate de documentação):** atualize os documentos afetados em inglês e pt-BR no mesmo incremento; uma story ou PR não está concluída sem ambas as versões equivalentes e verificadas.
- **Gates completos:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` e `npm run review:static`; atualize checklist e file list da story antes de concluir.
- **Git e commits:** o `@dev` não executa `git add`, `git commit`, `git merge` nem `git push`; ele implementa e testa. Commits, push, PR, deploy e release são do `@devops`, somente com o veredito do `@qa` e apenas dos grupos liberados, sempre com pathspec explícito (`git commit -- <caminhos>`). A matriz genérica de `.claude/rules/agent-authority.md` não amplia essa autoridade.
- **Issues:** somente o `@devops` edita issues, sempre pelo corpo principal (`gh issue edit --body-file`). Tasks AIOX que prevejam comentário em issue ou PR (por exemplo `resolve-github-issue`) devem gravar o conteúdo no corpo da issue ou na descrição da PR.
- **Pesquisa:** o `@analyst` (ou o `@architect`) pesquisa como etapa explícita do fluxo pesquisa → planejamento → desenvolvimento e entrega a nota aos agentes sem ferramenta de internet, sempre respeitando a regra de ouro e `docs/research-index.md`.
- **Revisão estática:** o único revisor é o OpenGrep (`npm run review:static`); nunca use nem reintroduza o provedor antigo (o nome é bloqueado por `tests/unit/aiox-static-review.test.js`).
- **`legacy`:** apenas referência histórica; não é fallback nem alvo de rollback.
- **Ambiente e stack:** Node `24.20.0` (fixado em `package.json`), JavaScript ESM com JSDoc, PostgreSQL com Prisma; stories em `docs/stories/<ID>/story.md` e `docs/pt-BR/stories/<ID>/story.md`. Exemplos genéricos do framework (Node 18+, Supabase, `{epic}.{story}.story.md`) não se aplicam.
- **Memória de agentes:** `.claude/agent-memory/**` é conhecimento compartilhado da equipe e deve ser versionado (commit pelo `@devops`); não guarde nela segredos nem dados pessoais. Regras normativas vivem neste arquivo; memórias só apontam para elas.

### Atualização do framework AIOX

Depois de qualquer sincronização ou atualização do AIOX: compare o diff dos blocos `AIOX-MANAGED` e de `.claude/rules/`; confirme que esta seção continua intacta; reaplique as customizações do OpenGrep e remova vestígios do provedor antigo; reaplique as correções de projeto em `.claude/rules/agent-authority.md`, `story-lifecycle.md`, `handoff-consolidation.md` e `agent-memory-imports.md`; rode `npm run sync:ide:check` e `npx vitest run tests/unit/documentation-contract.test.js tests/unit/aiox-static-review.test.js`.

<!-- AIOX-MANAGED-START: quality -->
## Quality Gates

- Rode `npm run lint`
- Rode `npm run typecheck`
- Rode `npm test`
- Atualize checklist e file list da story antes de concluir
- Confirme que README, stories, integracoes, changelog e demais documentos afetados estao sincronizados em ingles e pt-BR antes de concluir story ou PR
<!-- AIOX-MANAGED-END: quality -->

<!-- AIOX-MANAGED-START: codebase -->
## Project Map

- Core framework: `.aiox-core/`
- CLI entrypoints: `bin/`
- Shared packages: `packages/`
- Tests: `tests/`
- Docs: `docs/`
<!-- AIOX-MANAGED-END: codebase -->

<!-- AIOX-MANAGED-START: commands -->
## Common Commands

- `npm run sync:ide`
- `npm run sync:ide:check`
- `npm run sync:skills:codex`
- `npm run sync:skills:claude` (gera as skills e comandos dos agentes AIOX para o Claude Code em `.claude/`)
- `npm run sync:skills:codex:global` (opcional; neste repo o padrao e local-first)
- `npm run validate:structure`
- `npm run validate:agents`
<!-- AIOX-MANAGED-END: commands -->

<!-- AIOX-MANAGED-START: shortcuts -->
## Agent Shortcuts (CLI and IDE)

Use as mesmas personas no CLI e na IDE:
1. Use `/skills` e selecione `aiox-<agent-id>` vindo de `.codex/skills` (ex.: `aiox-architect`)
2. Se preferir, use os atalhos abaixo (`@architect`, `/architect`, etc.)

No CLI, os atalhos podem ser digitados como slash commands. Na IDE, selecione a skill correspondente ou mencione explicitamente a persona na conversa. Em ambos os casos, consulte a definicao local abaixo e preserve seu escopo de autorizacao.

Interprete os atalhos abaixo carregando o arquivo correspondente em `.aiox-core/development/agents/` (fallback: `.codex/agents/`), renderize o greeting via `generate-greeting.js` e assuma a persona ate `*exit`:

- `@architect`, `/architect`, `/architect.md` -> `.aiox-core/development/agents/architect.md`
- `@dev`, `/dev`, `/dev.md` -> `.aiox-core/development/agents/dev.md`
- `@qa`, `/qa`, `/qa.md` -> `.aiox-core/development/agents/qa.md`
- `@pm`, `/pm`, `/pm.md` -> `.aiox-core/development/agents/pm.md`
- `@po`, `/po`, `/po.md` -> `.aiox-core/development/agents/po.md`
- `@sm`, `/sm`, `/sm.md` -> `.aiox-core/development/agents/sm.md`
- `@analyst`, `/analyst`, `/analyst.md` -> `.aiox-core/development/agents/analyst.md`
- `@devops`, `/devops`, `/devops.md` -> `.aiox-core/development/agents/devops.md`
- `@data-engineer`, `/data-engineer`, `/data-engineer.md` -> `.aiox-core/development/agents/data-engineer.md`
- `@ux-design-expert`, `/ux-design-expert`, `/ux-design-expert.md` -> `.aiox-core/development/agents/ux-design-expert.md`
- `@squad-creator`, `/squad-creator`, `/squad-creator.md` -> `.aiox-core/development/agents/squad-creator.md`
- `@aiox-master`, `/aiox-master`, `/aiox-master.md` -> `.aiox-core/development/agents/aiox-master.md`
<!-- AIOX-MANAGED-END: shortcuts -->
