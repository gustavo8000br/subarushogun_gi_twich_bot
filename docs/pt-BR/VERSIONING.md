# Versionamento

[English](../VERSIONING.md)

O produto segue SemVer. `package.json` guarda somente `MAJOR.MINOR.PATCH`; `.release-stage` é a única fonte do estágio (`alpha`, `beta`, `rc` ou `stable`); e `VERSION` guarda a identidade runtime `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`.

## Versão para cada build publicado de main

Uma pull request pronta para merge e distribuição na imagem `main` recebe versão antes do merge. Incremente `PATCH` para uma correção pequena ou mudança somente documental. Incremente `MINOR` para uma funcionalidade nova, implementação grande ou correção complexa. Incremente `MAJOR` somente para uma mudança significativa do produto, como uma release oficial autorizada explicitamente pelo proprietário. Atualize `package.json`, `package-lock.json` e o `VERSION` versionado de forma consistente. Somente o proprietário do produto decide quando avançar o estágio. Implementação e incrementos de versão nunca o alteram automaticamente.

Toda PR de distribuição recebe sua versão escolhida antes do merge. Registre as notas para usuários e os detalhes técnicos diretamente em seções da versão correspondente nos changelogs em inglês e pt-BR; não use uma seção `Unreleased`. Os títulos usam a base SemVer e o estágio (por exemplo `v0.2.0-alpha`). A identidade runtime completa inclui os sete caracteres exatos do SHA do commit de origem (por exemplo `v0.2.0-abcdef0-alpha`); o CI materializa esse valor no artefato depois de o commit existir, então o changelog não precisa conter o SHA do próprio commit.

## Plano atual de release

A versão base atual do produto é `0.13.0`, `.release-stage` é `alpha` e a identidade não materializada do checkout é `v0.13.0-0000000-alpha`. OPS-8 e OPS-9 foram concluídas; OPS-10 está em andamento; FND-9 e DOC-2 continuam pendentes antes da primeira beta pública canônica. O proprietário autorizou promover para beta somente depois de concluir a FND-9 e cumprir os gates de release registrados para OPS-8/DOC-2. A primeira identidade de release pública planejada é `v1.0.0-HHHHHHH-beta`; não promova o estágio, altere para `1.0.0`, crie tag nem publique release antes de cumprir esses gates.

## Conteúdo das GitHub Releases

A tag e o título da release usam a identidade materializada completa, por exemplo `v1.0.0-a1b2c3d-beta`. Anexe exatamente um instalador por sistema desktop suportado: `.bat` para Windows, `.command` para macOS e `.sh` para Linux. Monte as notas da release a partir da seção da versão correspondente em `CHANGELOG.md` e `docs/pt-BR/CHANGELOG.md`; o corpo apresenta mudanças para usuários em inglês e pt-BR. Não use `CHANGELOG_INTERNAL.md` como nota pública. Somente `@devops` cria tags e releases após o gate de release aprovado pelo proprietário.

Cada instalador anexado incorpora a identidade completa da release e o digest do manifest GHCR validado como `IMAGE_TAG` (`<versão>@sha256:<digest>`). A opção normal de atualização baixa essa imagem exata antes de atualizar e só grava a nova referência depois que o pull passa. `main` continua sendo o padrão de Compose/CI; instaladores já publicados não migram silenciosamente quando uma tag GHCR mutável é movida.

Enviar uma tag de versão formada corretamente executa `.github/workflows/release.yml`. O workflow confere se SemVer, estágio e SHA de sete caracteres da tag correspondem à origem, empacota e abre um instalador em cada runner nativo e só depois publica a GitHub Release com as duas seções dos changelogs públicos. Uma tradução ausente ou falha em qualquer plataforma impede a publicação. Push comum de branch ou documentação nunca publica release.

## Identidade runtime e artefatos

A identidade inicial de origem era `v0.1.0-0000000-alpha`. A primeira imagem alpha materializada foi `v0.1.0-3e0c935-alpha`, construída do commit `3e0c935dbf63dc3edef265394f6b9da5c78a33fd` e publicada como manifest AMD64/ARM64 após todos os gates do CI. Era uma imagem alpha versionada, não uma release de lançamento, GitHub Release, tag Git ou promoção de estágio.

Para cada imagem CI, materialize os primeiros sete caracteres hexadecimais do commit exato de origem e confira a identidade dentro da imagem. Não grave o SHA de volta no checkout de origem. Falhar ao descobrir Git é erro de build, nunca motivo para usar o marcador zero. O marcador zero é reservado para builds locais de fonte não materializados; um computador de destino sem Git mantém a identidade já gravada na imagem.

As tags GHCR seguem uma convenção por plataforma: `main` e uma versão completa, como `v0.2.0-abcdef0-alpha`, identificam manifests multi-plataforma; `main-linux-amd64`, `main-linux-arm64` e suas equivalentes versionadas identificam imagens de plataforma única. Tags do registry são referências mutáveis; o digest OCI identifica o conteúdo exato. Instaladores de release fixam o manifest versionado por digest. O Compose usa `IMAGE_TAG=main` por padrão. Tags de imagem não determinam `product_version`; a identidade runtime continua gravada na imagem.

Publicar uma imagem CI versionada não cria GitHub Release nem tag Git. Promoção de estágio exige aprovação humana explícita. Versão do produto, versão do contrato API e revisão do estado têm funções distintas.
