# Versionamento

[English](../VERSIONING.md)

O produto segue SemVer. `package.json` armazena somente `MAJOR.MINOR.PATCH`; `.release-stage` é a fonte única do estágio (`alpha`, `beta`, `rc` ou `stable`); `VERSION` armazena a identidade runtime `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`. O desenvolvimento permanece no major `0` e estágio `alpha` até a release de lançamento aprovada por uma pessoa. A identidade inicial de origem é `v0.1.0-0000000-alpha`.

A primeira imagem alpha materializada é `v0.1.0-3e0c935-alpha`, construída do commit de origem `3e0c935dbf63dc3edef265394f6b9da5c78a33fd` e publicada como manifest AMD64/ARM64 após aprovação de todos os gates do CI. Essa é uma identidade de imagem alpha versionada, não uma release de lançamento, tag Git ou promoção de estágio. Cada imagem CI posterior materializa os primeiros sete caracteres hexadecimais do commit exato de origem e verifica o valor dentro da imagem; o SHA nunca é gravado de volta no checkout. Falha ao descobrir Git é erro de build, nunca motivo para usar o marcador zero. Validação, inicialização, documentação e commits comuns de código não atualizam arquivos de versão. O marcador zero permanece em builds locais de código-fonte não materializados. Promoção de estágio exige aprovação humana explícita. Releases e tags são responsabilidade de `@devops`.

As tags de imagem no GHCR seguem uma convenção de plataforma: `main` e uma versão completa como `v0.1.0-abcdef0-alpha` identificam manifests multi-plataforma; `main-linux-amd64`, `main-linux-arm64` e suas versões equivalentes identificam imagens de plataforma única. O Compose usa `IMAGE_TAG=main` por padrão, permitindo ao Docker selecionar a arquitetura do host pelo manifest. `IMAGE_TAG` permite substituir a tag. As tags de imagem não determinam `product_version`; a identidade runtime permanece gravada na imagem.

A release de lançamento seguirá o fluxo completo de SemVer/release planejado, incluindo versão do produto e estágio aprovados; builds de desenvolvimento no CI não criam release nem tag.

Cada release atualiza os dois changelogs e passa pelos gates de qualidade do projeto. Mudanças visíveis ao usuário ficam em `CHANGELOG.md`; mudanças de implementação e operação ficam em `CHANGELOG_INTERNAL.md`. A identidade runtime é distinta da versão do contrato API e da revisão do estado.
