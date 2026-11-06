# Gate de QA — correção da identidade da tag no release.yml (2026-11-06c)

[English](../../../stories/OPS-15/qa-gate-2026-11-06c-release-tag.md)

**Revisor:** @qa (Quinn). **Veredito: PASS. Nota: 9,3/10** (mínimo 9,0).
**Escopo:** duas linhas no `release.yml` (`git config user.name` / `user.email` antes de `git tag -a`), novo `tests/unit/release-workflow-tag-contract.test.js`, entradas de changelog. Sem `git add`, commit nem push.

## Evidências

- Diff: só as 2 linhas, dentro do `else` (tag ainda não existe), antes do `git tag -a`; o ramo da tag existente não muda. Config local ao repositório em runner efêmero; identidade padrão `github-actions[bot]` noreply.
- Testes `*workflow*`: 19/19. `lint`, `validate:version`, `validate:localization`, `review:static`, `git diff --check`: saída 0. `actionlint`: só os 2 `queue: max` aceitos. `npm test`: 178 arquivos, 1976 testes, saída 0.
- Mutações próprias (restauradas, `cmp` idêntico): remover `user.name`, remover `user.email`, mover as duas configs para depois do `git tag -a`: cada uma derruba 1 teste (3 de 3 mortas).
- Segurança: `grep "claude.ai/"` no diff: nada.

## Verificação somente leitura dos riscos "prováveis" (2026-11-05)

- `git ls-remote --tags origin`: 0 tags. `gh release list`: 0 releases. Não existe tag nem release parcial agora.
- Rulesets (`gh api .../rulesets`): 2, ambos `target: branch` (`legacy-no-delete-no-force-push`, `main-pr-and-ci`); nenhum ruleset de tag, e o endpoint antigo de proteção de tags retorna 404. Logo, empurrar a tag com `GITHUB_TOKEN` (`contents: write`) não é barrado hoje.
- A permissão padrão do token no repositório é `read`, mas o job declara `contents: write`, suficiente.

## Proteção do @devops

1. Antes de reexecutar, repetir `git ls-remote --tags origin` e `gh release list`. Se surgiu um ruleset de tag, criar a tag por caminho autorizado em vez do token.
2. O passo da tag é idempotente (reaproveita a tag existente só se apontar para o commit da fonte), mas o `gh release create` não é: se uma execução falhar depois do push da tag e a release existir, a reexecução falha no `gh release create`. Conferir `gh release view <tag>`; tag sem release pode reexecutar; release/rascunho parcial deve ser removido pelo `@devops` (remoção exige OK do dono) antes de reexecutar. Nunca mover uma tag que aponte para outro commit.
3. Depois da execução: confirmar a tag e uma pré-release com exatamente 3 anexos.

## Achados

- Baixo (aceito): o teste confere a ordem do texto no passo, não o comportamento real do git; a prova real é disparar o `release.yml` (não alegada aqui).
- Baixo (aceito): `--verify-tag` depende de a tag empurrada estar visível; esperado no GitHub.

## Grupo de commit (único)

- `.github/workflows/release.yml`
- `tests/unit/release-workflow-tag-contract.test.js` (novo)
- `CHANGELOG_INTERNAL.md`
- `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/stories/OPS-15/qa-gate-2026-11-06c-release-tag.md`
- `docs/pt-BR/stories/OPS-15/qa-gate-2026-11-06c-release-tag.md`

Nota: a correção anterior (`shell: bash`, teste `release-workflow-shell-contract.test.js`, gate `2026-11-06b`) já está na `main` (PR #111); este commit leva apenas a correção da identidade do bot.
Mensagem: `fix(release): set the bot identity before the annotated tag [OPS-15]`.
