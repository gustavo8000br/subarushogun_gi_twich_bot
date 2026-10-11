# Histórico beta

[Todos os changelogs públicos](CHANGELOG.md) · [English](../../CHANGELOG-beta.md)

## v0.1.0-beta

- Primeira build do stage beta para avaliação conduzida pelo proprietário do bot de filas Twitch e do painel do streamer.
- Inclui fluxos de filas manuais, recuperação segura de filas convertidas e os caminhos de instalação para Windows, macOS e Linux.
- Todos os instaladores mostram a versão exata do produto derivada do commit; pulls negados no GHCR explicam que o pacote precisa ser público e preservam configurações/dados locais.
- A identidade runtime é materializada a partir do commit exato como `v0.1.0-HHHHHHH-beta`. As prereleases do GitHub só são publicadas quando o proprietário aciona manualmente o workflow de release.
