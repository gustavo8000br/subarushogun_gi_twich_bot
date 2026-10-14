# Histórico beta

[Todos os changelogs públicos](CHANGELOG.md) · [English](../../CHANGELOG-beta.md)

## v0.1.0-beta

- Primeira build do stage beta para avaliação conduzida pelo proprietário do bot de filas Twitch e do painel do streamer.
- Inclui fluxos de filas manuais, recuperação segura de filas convertidas e os caminhos de instalação para Windows, macOS e Linux.
- Todos os instaladores mostram a versão exata do produto derivada do commit; pulls negados no GHCR explicam que o pacote precisa ser público e preservam configurações/dados locais.
- Instalar/iniciar no Windows corrige uma tag Compose antiga após um pull bem-sucedido e inicia os serviços com a imagem exata da versão do instalador.
- A identidade runtime é materializada a partir do commit exato como `v0.1.0-HHHHHHH-beta`. As prereleases do GitHub só são publicadas quando o proprietário aciona manualmente o workflow de release.
- A operação das filas agora atualiza a conta atual e o overlay após chamadas individuais, salva corretamente permissões de comandos alteradas e permite que viewers chamados confirmem presença sem iniciar o atendimento.
- Removido Ocultar/Arquivar dos controles normais; filas antigas podem voltar a aparecer para viewers e continuam pausadas até serem ativadas separadamente.
- Quando a sincronização com a Twitch estiver incerta, o streamer pode excluir a fila deste painel após duas confirmações. Isso não exclui a reward na Twitch; a incerteza remota e o histórico financeiro são preservados. A reconciliação também recupera rewards removidas e resgates tardios sem tratar falhas de consulta como prova de exclusão.
