# Versionamento

[English](../VERSIONING.md)

O produto segue SemVer. `package.json` guarda somente `MAJOR.MINOR.PATCH`; `.release-stage` é a única fonte do estágio (`alpha`, `beta`, `rc` ou `stable`); e `VERSION` guarda a identidade runtime `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`.

## Versão para cada build publicado de main

Uma pull request pronta para merge e distribuição na imagem `main` recebe versão antes do merge. Incremente `PATCH` para uma correção pequena ou mudança somente documental. Incremente `MINOR` para uma funcionalidade nova, implementação grande ou correção complexa. Incremente `MAJOR` somente para uma mudança significativa do produto, como uma release oficial autorizada explicitamente pelo proprietário. Atualize `package.json`, `package-lock.json` e o `VERSION` versionado de forma consistente. Somente o proprietário do produto decide quando avançar o estágio. Implementação e incrementos de versão nunca o alteram automaticamente.

Toda PR de distribuição recebe sua versão escolhida antes do merge. Registre as notas para usuários e os detalhes técnicos diretamente em seções da versão correspondente nos changelogs em inglês e pt-BR; não use uma seção `Unreleased`. Os títulos usam a base SemVer e o estágio (por exemplo `v0.2.0-alpha`). A identidade runtime completa inclui os sete caracteres exatos do SHA do commit de origem (por exemplo `v0.2.0-abcdef0-alpha`); o CI materializa esse valor no artefato depois de o commit existir, então o changelog não precisa conter o SHA do próprio commit.

A FND-7 foi distribuída como `0.5.0-alpha` (MINOR) após QA independente PASS 9,2/10. Ajustes documentais e pequenas correções são `0.5.1-alpha` e `0.5.2-alpha` (PATCH). A implementação da FND-8 começa como `0.6.0-alpha` (MINOR); o marcador do checkout é `v0.6.0-0000000-alpha` até o CI materializar um artefato a partir do commit exato. `.release-stage` continua `alpha`. A condição autorizada pelo proprietário para promoção a `v1.0.0-HHHHHHH-beta` foi atendida. A preparação da release segue bloqueada porque a tarefa AIOX `release-management` exige `docs/guides/release-procedure.md` como SOP canônico e esse arquivo não existe. Nenhum beta ou tag foi criado. A primeira MINOR beta pretendida da FND-8 permanece `v1.1.0-HHHHHHH-beta`; esta PR de implementação não promove o estágio.
OPS-6 está preparada como a próxima MINOR do produto, `v0.7.0-alpha`, mantendo `.release-stage` em `alpha`. O marcador do checkout é `v0.7.0-0000000-alpha` até o CI materializar o artefato a partir do commit exato. Essa atualização de versão não promove o estágio, não é uma release e não cria uma tag.

## Identidade runtime e artefatos

A identidade inicial de origem era `v0.1.0-0000000-alpha`. A primeira imagem alpha materializada foi `v0.1.0-3e0c935-alpha`, construída do commit `3e0c935dbf63dc3edef265394f6b9da5c78a33fd` e publicada como manifest AMD64/ARM64 após todos os gates do CI. Era uma imagem alpha versionada, não uma release de lançamento, GitHub Release, tag Git ou promoção de estágio.

Para cada imagem CI, materialize os primeiros sete caracteres hexadecimais do commit exato de origem e confira a identidade dentro da imagem. Não grave o SHA de volta no checkout de origem. Falhar ao descobrir Git é erro de build, nunca motivo para usar o marcador zero. O marcador zero é reservado para builds locais de fonte não materializados; um computador de destino sem Git mantém a identidade já gravada na imagem.

As tags GHCR seguem uma convenção por plataforma: `main` e uma versão completa, como `v0.2.0-abcdef0-alpha`, identificam manifests multi-plataforma; `main-linux-amd64`, `main-linux-arm64` e suas equivalentes versionadas identificam imagens de plataforma única. O Compose usa `IMAGE_TAG=main` por padrão. Tags de imagem não determinam `product_version`; a identidade runtime continua gravada na imagem.

GitHub Releases e tags continuam sob responsabilidade exclusiva de `@devops`. Publicar uma imagem CI versionada não cria GitHub Release nem tag Git. Promoção de estágio exige aprovação humana explícita. Versão do produto, versão do contrato API e revisão do estado têm funções distintas.
