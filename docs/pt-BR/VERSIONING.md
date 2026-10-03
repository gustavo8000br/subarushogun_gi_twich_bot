# Versionamento

[English](../VERSIONING.md)

O produto segue SemVer. `package.json` armazena somente `MAJOR.MINOR.PATCH`; `.release-stage` é a fonte única do estágio (`alpha`, `beta`, `rc` ou `stable`); `VERSION` armazena a identidade runtime `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`. Antes da existência de um commit Git de origem, a identidade da fundação é `v0.1.0-0000000-alpha`.

A materialização de build usa os primeiros sete caracteres hexadecimais do commit exato de origem, após validar os metadados Git e a consistência das fontes. Falha ao descobrir Git é erro de build, nunca motivo para usar o marcador zero. A materialização grava somente na cópia do artefato. Validação, inicialização, documentação e commits comuns de código não atualizam arquivos de versão. Promoção de estágio exige aprovação humana explícita. Releases e tags são responsabilidade de `@devops`.

Cada release atualiza os dois changelogs e passa pelos gates de qualidade do projeto. Mudanças visíveis ao usuário ficam em `CHANGELOG.md`; mudanças de implementação e operação ficam em `CHANGELOG_INTERNAL.md`. A identidade runtime é distinta da versão do contrato API e da revisão do estado.
