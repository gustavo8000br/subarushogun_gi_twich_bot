# Versionamento

[English](../VERSIONING.md)

O produto segue SemVer. `package.json` armazena somente `MAJOR.MINOR.PATCH`; `.release-stage` é a fonte única do estágio (`alpha`, `beta`, `rc` ou `stable`); `VERSION` armazena a identidade runtime `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`. O desenvolvimento permanece no major `0` e estágio `alpha` até a release de lançamento aprovada por uma pessoa. A identidade inicial de origem é `v0.1.0-0000000-alpha`.

A partir da próxima pull request, o CI materializa os primeiros sete caracteres hexadecimais do commit exato conferido na imagem Docker e verifica o valor dentro dela. Isso produz identidades como `v0.1.0-a1b2c3d-alpha`; o SHA nunca é gravado de volta no checkout. Falha ao descobrir Git é erro de build, nunca motivo para usar o marcador zero. Validação, inicialização, documentação e commits comuns de código não atualizam arquivos de versão. O marcador zero permanece em builds locais de código-fonte não materializados. Promoção de estágio exige aprovação humana explícita. Releases e tags são responsabilidade de `@devops`.

As tags de imagem no GHCR seguem uma convenção de plataforma: `main` e uma versão completa como `v0.1.0-abcdef0-alpha` identificam manifests multi-plataforma; `main-linux-amd64`, `main-linux-arm64` e suas versões equivalentes identificam imagens de plataforma única. O Compose usa `IMAGE_TAG=main` por padrão, permitindo ao Docker selecionar a arquitetura do host pelo manifest. `IMAGE_TAG` permite substituir a tag. As tags de imagem não determinam `product_version`; a identidade runtime permanece gravada na imagem.

A release de lançamento seguirá o fluxo completo de SemVer/release planejado, incluindo versão do produto e estágio aprovados; builds de desenvolvimento no CI não criam release nem tag.

Cada release atualiza os dois changelogs e passa pelos gates de qualidade do projeto. Mudanças visíveis ao usuário ficam em `CHANGELOG.md`; mudanças de implementação e operação ficam em `CHANGELOG_INTERNAL.md`. A identidade runtime é distinta da versão do contrato API e da revisão do estado.
