# Gate de QA — correção do instalador Windows no release.yml (2026-11-06b)

[English](../../../stories/OPS-15/qa-gate-2026-11-06b-release-fix.md)

**Revisor:** @qa (Quinn). **Veredito: PASS. Nota: 9,3/10** (mínimo 9,0).
**Escopo:** `shell: bash` no passo "Package one installer" de `.github/workflows/release.yml` (a execução 42133470156 falhou com `--image-tag requires a value.`), o novo teste de contrato e as entradas de changelog. Não houve `git add`, commit nem push.

## Evidências

| Verificação | Resultado |
|-------------|-----------|
| Diff | Só uma linha adicionada (`shell: bash`) em `release.yml`; Linux e macOS já usavam bash, então nada muda para eles. |
| Caminho Windows no bash | `--output "D:\a\_temp/queuebot-installer"`: entre aspas duplas o bash mantém `\a` e `\_` (só `\$`, crase, `\"`, `\\` e nova linha são especiais). O `package-installer.mjs` usa `resolve()`, que aceita separadores mistos. Não há argumento com caminho Windows em aspas simples no passo. |
| Outros workflows | `main-cd.yml` (`beta-windows-installer`) usa `$env:` corretamente; `installer-smoke` do `quality-gates.yml` no Windows usa só `${{ }}`. Nenhum outro passo PowerShell com expansão estilo bash. |
| Teste de contrato | Regra correta: `${{ }}` é removido antes da busca; `$env:VAR` não é acusado (`env` minúsculo é filtrado); o shell padrão é `pwsh` em jobs de matriz Windows. |
| Testes direcionados | `release-workflow-shell-contract` + `ci-workflow-contract`: 15/15 passam. |
| `npm run lint`, `validate:version`, `validate:localization`, `review:static`, `git diff --check` | todos com saída 0. |
| `actionlint` | apenas o `queue: max` aceito em `main-cd.yml` e `release.yml`. |
| `npm test` (duas vezes) | 177 arquivos, 1972 testes, saída 0 nas duas. |
| Mutações próprias (em cópias, restauradas, `cmp` idêntico) | (a) remover `shell: bash`: 2 testes falham; (b) `shell: pwsh` mantendo `"$VAR"`: 2 falham; (c) passo `pwsh` extra com `"$SOME_VAR"` em `main-cd.yml`: 1 falha. As 3 mortas. |
| Segurança | `grep "claude.ai/"` no diff: nada; sem segredos. |

## Achados

- **Baixo (aceito):** a regra acusa qualquer `$NOME` em maiúsculas; uma variável automática do PowerShell como `$LASTEXITCODE` em um passo `pwsh` futuro seria falso positivo. Hoje não existe; a mensagem do teste aponta o passo, então é fácil corrigir.
- **Baixo (aceito):** o teste deduz o runner Windows por `matrix.include[].runner`; um workflow com outra expressão em `runs-on` não é deduzido.

## Limites honestos

- A prova real é disparar o `release.yml` no GitHub; aqui não há `pwsh` nem Windows. Não alegado.
- Riscos restantes: comportamento do Git Bash no `windows-latest` (esperado, vem pré-instalado) e `tests/platform/installer-native.mjs` rodando no Windows após o empacotamento (já passa no `installer-smoke` do `quality-gates.yml`).

## Grupo de commit (único)

Arquivos:
- `.github/workflows/release.yml`
- `tests/unit/release-workflow-shell-contract.test.js` (novo)
- `CHANGELOG_INTERNAL.md`
- `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/stories/OPS-15/qa-gate-2026-11-06b-release-fix.md`
- `docs/pt-BR/stories/OPS-15/qa-gate-2026-11-06b-release-fix.md`

Mensagem: `fix(release): run the shared installer packaging step in bash so Windows expands the image tag [OPS-15]` (o `@devops` acrescenta os trailers exigidos pelas regras do projeto, nunca a URL da sessão).
Um índice temporário (`GIT_INDEX_FILE`) reproduziu a árvore com exatamente esses seis caminhos.
