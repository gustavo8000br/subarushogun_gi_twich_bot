# gh release create: --prerelease, --latest e --latest=false

[English](../../../research/2026-11-14-gh-release-flags/README.md)

- Data: 2026-11-14. Autoria: `@analyst`. Escopo: pesquisa documental (só documentação oficial). Veredito: **SUFICIENTE** (REVISAR SE a versão major do `gh` ou a semântica `make_latest` da API REST mudar).

## Respostas

1. **Flags (VERIFIED, manual da CLI):** `gh release create` aceita `-p/--prerelease` ("Mark the release as a prerelease") e `--latest` ("Mark this release as Latest (default [automatic based on date and version]). --latest=false to explicitly NOT set as latest"). O exemplo do próprio manual é `gh release create v1.2.3 --latest=false`. Logo, `--latest=false` é válido.
2. **Pré-release pode ser latest? (VERIFIED, docs REST):** não. `make_latest` aceita `true`, `false`, `legacy` (padrão `true` em releases novas) e diz "Drafts and prereleases cannot be set as latest". O endpoint de "latest release" também ignora pré-releases e rascunhos. Portanto `--latest=false` numa pré-release é **redundante, mas inofensivo**; só deixa a intenção explícita. O manual da CLI não descreve a interação entre as duas flags (PARTIAL: a garantia vem da página REST, não de uma frase da CLI nem de teste ao vivo).
3. **Forma recomendada:** alpha/beta/rc: `--prerelease --latest=false` (explícito, seguro mesmo se a regra mudar). stable: release comum (sem `--prerelease`) com `--latest`.
4. **Risco de `--latest` em stable (PARTIAL):** o padrão da CLI (flag omitida) é "automático por data e versão", equivalente ao modo REST `legacy` (data de criação mais recente e semver maior). `--latest` explícito pede "latest" sem condição (REST `true`); uma stable com semver menor que a latest atual (por exemplo, backport) **assumiria** o "Latest". É inofensivo numa linha linear em que cada stable é a mais nova. Para backport, use `--latest=false` ou omita a flag. Que a CLI mapeie `--latest` para `make_latest=true` e a flag omitida para `legacy` não foi confirmado no texto do manual (UNVERIFIED; consulte o código do `gh` ou um repositório de teste se um fluxo de backport surgir).

## Conclusão para o `case` do release.yml

`alpha|beta|rc` -> `--prerelease --latest=false` e `stable` -> `--latest` está correto para uma linha de releases linear. Nota: `.github/workflows/release.yml:302` hoje passa só `--prerelease`; o `case` ainda precisa ser escrito.

## Fontes

- https://cli.github.com/manual/gh_release_create
- https://docs.github.com/en/rest/releases/releases#create-a-release

## Limitações

Nenhuma criação real de release foi executada (publicaria no repositório de verdade). O comportamento vem só da documentação.
