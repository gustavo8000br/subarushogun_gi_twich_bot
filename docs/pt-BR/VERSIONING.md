# Versionamento

[English](../VERSIONING.md)

O produto segue SemVer. `package.json` guarda somente `MAJOR.MINOR.PATCH`; `.release-stage` é a única fonte do estágio (`alpha`, `beta`, `rc` ou `stable`); e `VERSION` guarda a identidade runtime `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`.

## Versão para cada build publicado de main

Uma pull request pronta para merge e distribuição na imagem `main` recebe versão antes do merge. Incremente `PATCH` para uma correção pequena ou mudança somente documental. Incremente `MINOR` para uma funcionalidade nova, implementação grande ou correção complexa. Incremente `MAJOR` somente para uma mudança significativa do produto, como uma release oficial autorizada explicitamente pelo proprietário. Atualize `package.json`, `package-lock.json` e o `VERSION` versionado de forma consistente. Somente o proprietário do produto decide quando avançar o estágio. Implementação e incrementos de versão nunca o alteram automaticamente.

Use `Unreleased` somente enquanto as mudanças ainda não foram mescladas e incluídas na imagem `main`. Ao preparar uma PR que será distribuída, mova as notas de usuário e técnicas para seções da versão correspondente nos changelogs em inglês e pt-BR. Os títulos usam a base SemVer e o estágio (por exemplo `v0.2.0-alpha`). A identidade runtime completa inclui os sete caracteres exatos do SHA do commit de origem (por exemplo `v0.2.0-abcdef0-alpha`); o CI materializa esse valor no artefato depois de o commit existir, então o changelog não precisa conter o SHA do próprio commit.

A FND-7 foi distribuída como `0.5.0-alpha` (MINOR) após QA independente PASS 9,2/10. Os ajustes documentais e pequenas correções são `0.5.1-alpha` e `0.5.2-alpha` (PATCH); `.release-stage` continua `alpha`, e o marcador atual do checkout é `v0.5.2-0000000-alpha` até o CI construir um artefato a partir do commit exato. A condição autorizada pelo proprietário para promoção a `v1.0.0-HHHHHHH-beta` foi cumprida. O estágio permanece alpha enquanto a preparação de release está bloqueada: a tarefa AIOX `release-management` identifica `docs/guides/release-procedure.md` como SOP canônico obrigatório, mas esse arquivo não existe neste repositório. Nenhum beta ou tag foi criado. O baseline de planejamento v3 da FND-8 está concluído; a implementação segue em andamento e a primeira MINOR beta pretendida continua `v1.1.0-HHHHHHH-beta`, sem promoção de estágio autorizada.

## Identidade runtime e artefatos

A identidade inicial de origem era `v0.1.0-0000000-alpha`. A primeira imagem alpha materializada foi `v0.1.0-3e0c935-alpha`, construída do commit `3e0c935dbf63dc3edef265394f6b9da5c78a33fd` e publicada como manifest AMD64/ARM64 após todos os gates do CI. Era uma imagem alpha versionada, não uma release de lançamento, GitHub Release, tag Git ou promoção de estágio.

Para cada imagem CI, materialize os primeiros sete caracteres hexadecimais do commit exato de origem e confira a identidade dentro da imagem. Não grave o SHA de volta no checkout de origem. Falhar ao descobrir Git é erro de build, nunca motivo para usar o marcador zero. O marcador zero é reservado para builds locais de fonte não materializados; um computador de destino sem Git mantém a identidade já gravada na imagem.

As tags GHCR seguem uma convenção por plataforma: `main` e uma versão completa, como `v0.2.0-abcdef0-alpha`, identificam manifests multi-plataforma; `main-linux-amd64`, `main-linux-arm64` e suas equivalentes versionadas identificam imagens de plataforma única. O Compose usa `IMAGE_TAG=main` por padrão. Tags de imagem não determinam `product_version`; a identidade runtime continua gravada na imagem.

GitHub Releases e tags continuam sob responsabilidade exclusiva de `@devops`. Publicar uma imagem CI versionada não cria GitHub Release nem tag Git. Promoção de estágio exige aprovação humana explícita. Versão do produto, versão do contrato API e revisão do estado têm funções distintas.
