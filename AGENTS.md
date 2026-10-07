# AGENTS.md - Synkra AIOX (Codex CLI and IDE)

Este arquivo e a fonte unica das instrucoes do projeto para o Codex CLI e para a extensao Codex IDE no VS Code. As regras valem igualmente para ambos; nao mantenha instrucoes divergentes por ambiente.

Ao retomar uma sessao de desenvolvimento, leia primeiro o handoff ativo em `docs/session-handoff.md` e sua versao `docs/pt-BR/session-handoff.md`, se existirem. Eles preservam worktree/branch, objetivo atual, decisoes e proximo passo; o historico de conversa do CLI nao e presumido como disponivel na IDE, nem vice-versa.

## Mesmo checkout no CLI e na IDE

- Antes de editar, confirme `pwd`, `git rev-parse --show-toplevel` e `git branch --show-current` no terminal que executara o trabalho.
- Abra no VS Code exatamente o caminho retornado por `git rev-parse --show-toplevel` (por exemplo, `code --reuse-window "$(git rev-parse --show-toplevel)"`). Nao use `code .` a partir de outro terminal/cwd presumido.
- Se o trabalho estiver em uma worktree, tanto o terminal/CLI quanto o VS Code devem abrir essa worktree e sua branch. Nao edite a worktree principal por engano.
- Ao trocar worktree ou branch de implementacao, atualize a janela do VS Code para o novo caminho e confira a branch no terminal integrado antes de continuar.
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

## Sincronização de stories e issues

- O @devops atualiza o corpo e o status da issue correspondente quando publicar uma story marcada como Done por PR mesclada.
- Não publicar comentários em issues; comentários só são publicados se forem necessários para registrar uma decisão ou bloqueio que não caiba no corpo da issue.

## Higiene de instâncias Docker

- Em auditorias e após encerrar testes, identificar e remover contêineres órfãos criados por worktrees, branches já mescladas ou projetos de teste descartados; não deixá-los ocupando disco.
- Antes da remoção, conferir projeto/labels e vínculo com worktree para proteger a instalação ativa e os serviços do trabalho atual.
- Para instâncias comprovadamente órfãs, remover também os volumes associados quando autorizado pelo usuário ou quando forem artefatos descartáveis de teste sem dados do produto. Nunca remover volumes da instalação ativa.
- Manter os serviços one-shot `bootstrap` e `migrate` do Compose atual quando fazem parte do projeto ativo; seu estado `Exited (0)` é esperado, não órfão.

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
