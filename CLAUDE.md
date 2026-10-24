# CLAUDE.md - Synkra AIOX (Claude Code)

Adaptação do `AGENTS.md` para o Claude Code. O `AGENTS.md` continua sendo a fonte única das regras do projeto; em caso de divergência, ele prevalece. As regras do framework carregadas de `.claude/CLAUDE.md` e `.claude/rules/` também valem.

Ao retomar uma sessão, leia primeiro `docs/session-handoff.md` e `docs/pt-BR/session-handoff.md`. O prompt de continuação da OPS-15 está em `docs/pt-BR/handoffs/claude-code-ops15-prompt.md`.

## Checkout e ambiente

- Antes de editar, confirme `pwd`, `git rev-parse --show-toplevel` e `git branch --show-current`. A branch de trabalho atual é `feat/ops-15-next-panel`.
- Dependências não são compartilhadas entre worktrees: `npm ci`, `npm ci --prefix .aiox-core`, `npm run sync:skills:codex`, `npm run sync:skills:claude`, `npm run sync:ide:check`.
- Node `24.20.0` (fixado em `package.json`). Não troque a versão.
- Fluxo Git aprovado: `main` -> branch Conventional Commits -> PR -> `main`. Nunca faça bump de versão, commit, push, cutover ou remoção do painel vanilla sem autorização explícita do proprietário. Push e PR pertencem ao `@devops`.

## Regras centrais

1. Siga a Constitution em `.aiox-core/constitution.md`; prioridade `CLI First -> Observability Second -> UI Third`.
2. Trabalhe por stories em `docs/stories/` (en) e `docs/pt-BR/stories/` (pt-BR); não invente requisitos.
3. Todo roadmap/story novo exige issue GitHub (e roadmap exige issue-mãe com sub-issues nativas), criada pelo `@devops` antes da implementação.
4. Changelogs de estágio: versão mais recente primeiro; atualize en e pt-BR juntos antes de qualquer commit.
5. Documentação, story e handoff sempre em inglês e português.

## Papéis AIOX

`@aiox-master` (Orion) orquestra e delega. `@dev` implementa; `@qa` valida de forma independente; `@architect` revisa arquitetura; `@data-engineer` coordena todo trabalho de banco de dados; `@analyst` pesquisa (internet, documentação oficial, blogs, fóruns) antes de cada gate de planejamento e de cada desenvolvimento e entrega a nota de pesquisa aos agentes sem acesso à internet; `@ux-design-expert` planeja toda mudança voltada à pessoa usuária; `@devops` cuida de Git remoto, PRs, CI/CD e release. Não alegue que uma persona validou algo sem executar seu fluxo. **Regra permanente (2026-10-22):** a execução final e independente de testes e gates antes de commit, PR ou release é do `@qa` (veredito PASS/CONCERNS/FAIL/WAIVED + lista de grupos prontos); o `@devops` só comita o que o `@qa` liberou. O `@dev` testa durante o desenvolvimento, sem substituir o `@qa`.

## Decisões do proprietário (invioláveis)

- **Revisão estática:** o único revisor é o OpenGrep (`npm run review:static`). Nunca use nem reintroduza o provedor de revisão antigo (não planejado no projeto; o nome dele é bloqueado por `tests/unit/aiox-static-review.test.js`). Ao atualizar o framework AIOX, reaplique as customizações de OpenGrep e remova qualquer arquivo ou trecho desse provedor.
- **`legacy`:** é apenas referência histórica; não é fallback nem alvo de rollback. Após a migração para o painel Next.js, o painel vanilla será removido por completo (com autorização explícita).
- **Escopo de trabalho:** trabalhe apenas dentro do diretório do projeto; não escreva em `/tmp` nem em outros locais.

## UX e pesquisa

- Mudança que afete a experiência de pessoas usuárias exige plano e revisão com `aiox-ux-design-expert`, registrados na story, com score mínimo **9,0/10** antes de implementar. O score vale só para o escopo revisado; diferencie revisão estática de validação visual, browser e tecnologia assistiva.
- Pesquise na internet antes de decisões técnicas (documentação oficial primeiro; comunidade como evidência complementar), cite links e registre limitações. Pesquisa não substitui teste no ambiente do projeto. A pesquisa é feita pelo `@analyst` (ou pelo `@architect`) como etapa explícita do fluxo pesquisa → planejamento → desenvolvimento, porque `@po`, `@data-engineer`, `@dev`, `@qa` e `@ux-design-expert` não têm ferramenta de internet.
- Regra de ouro (2026-10-22): se o `@analyst` já pesquisou um tema e julgou que não precisa de mais pesquisa, não gaste tokens com nova pesquisa; consulte primeiro `docs/research-index.md` (notas existentes, veredito SUFICIENTE / REVISAR SE / LACUNA) e peça pesquisa nova apenas para uma LACUNA ou um gatilho de revisão que ocorreu.
- Issues: nunca comente em issues; o `@devops` atualiza sempre o corpo principal (vale para todas as abertas).

## Evidências e banco de dados

- Não invente evidências. Separe fixtures/mocks, testes unitários, API/PostgreSQL descartável, serviços reais, Twitch/worker, navegador real e OBS/CEF nativo.
- Garantias de PostgreSQL exigem integração em PostgreSQL isolado com migrations reais; nunca SQLite ou mocks de Prisma. Testes usam instância e dados descartáveis, sem tocar volumes ativos.
- Preserve volumes, imagens e containers ativos; confira projeto Compose, labels e ownership antes de remover qualquer recurso e remova só o que for comprovadamente descartável.

## Erros e diagnóstico

Falhas inesperadas da API retornam texto genérico localizado com `referenceId`; nunca mensagem, stack ou dados internos. Logs JSON sem corpo de chat/resgate, UID, tokens, headers, segredos ou connection string. Erros Twitch permanecem na outbox com estado seguro; resposta ausente nunca vira confirmação.

## Quality gates

`npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static`. Atualize checklist e file list da story antes de concluir.
