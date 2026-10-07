# Baixar e usar o instalador

[English](../INSTALLERS.md) · [Voltar ao README](../../README.pt-BR.md)

O projeto oferece um único arquivo de instalador por sistema operacional suportado. Ele reúne **Instalar / Iniciar**, **Atualizar** e **Desinstalar** em um menu. Você não precisa clonar o repositório-fonte. Um instalador de release instala e atualiza para a imagem GHCR correspondente à identidade da própria release; a imagem `main` continua sendo o padrão para builds de CI/desenvolvimento.

## Baixar uma release

Baixe o instalador na página pública de [GitHub Releases](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/releases). Escolha a versão desejada, leia as notas e baixe o único arquivo do seu sistema:

- Windows: `subarushogun_twich_bot_setup.bat`
- macOS: `subarushogun_twich_bot_setup.command`
- Linux: `subarushogun_twich_bot_setup.sh`

A descrição de cada release contém as mudanças para usuários das seções correspondentes à versão em `CHANGELOG.md` e `docs/pt-BR/CHANGELOG.md`. A tag e o título usam a identidade completa da versão. O workflow acionado pela tag valida versão/commit, empacota e abre um instalador em cada runner nativo e publica juntos os três arquivos e as notas bilíngues. Push comum de branch nunca cria release.

**Estado das releases:** ainda não há release pública do produto. A primeira beta canônica, `v1.0.0-HHHHHHH-beta`, está planejada para depois da FND-9 e de seus critérios de aceite. Artefatos do GitHub Actions são builds temporários de engenharia/QA, não o caminho de download para usuários.

**Estado do GHCR:** o repositório-fonte é público, mas o pacote da imagem ainda estava privado em 2026-10-07 (pull anônimo retornou HTTP 403). O pacote deve ser tornado público e o pull anônimo validado antes do teste Twitch planejado com streamer após a FND-9. Até lá, iniciar o app exige uma conta autorizada a ler o pacote e um token clássico do GitHub com `read:packages`; consulte o [guia de instalação](INSTALACAO.md). Quando o pacote for público, não será necessário login no registry.

## Abrir o instalador

### Windows

1. Instale e inicie o Docker Desktop com containers Linux.
2. Abra o arquivo `.bat` baixado com clique duplo ou pelo Prompt de Comando/PowerShell. Ele funciona em caminhos com espaços.
3. Escolha **Instalar / Iniciar**, **Atualizar** ou **Desinstalar**. Na primeira instalação, escolha o idioma do produto e a porta; os padrões são pt-BR e `3000`.

Se o Windows bloquear o arquivo, confirme que ele veio da página GitHub Releases do projeto antes de liberá-lo nos controles de segurança do arquivo.

### macOS

1. Instale e inicie o Docker Desktop para Mac.
2. Abra o arquivo `.command` baixado pelo Finder. Se o macOS bloquear, confirme a origem e permita em **Ajustes do Sistema → Privacidade e Segurança**. Você também pode abrir o Terminal na pasta do download e executar:

   ```sh
   chmod +x subarushogun_twich_bot_setup.command
   ./subarushogun_twich_bot_setup.command
   ```

3. Escolha **Instalar / Iniciar**, **Atualizar** ou **Desinstalar** no menu.

### Linux

1. Instale Docker Engine e o plugin Docker Compose v2.
2. Abra um terminal na pasta onde baixou o arquivo `.sh`. Se ele estiver em `Downloads`, execute:

   ```sh
   sh "$HOME/Downloads/subarushogun_twich_bot_setup.sh"
   ```

   Troque o caminho se salvou o arquivo em outra pasta. Isso funciona mesmo quando o download não preserva a permissão executável. Para abrir depois, execute `chmod +x subarushogun_twich_bot_setup.sh` uma vez e então `./subarushogun_twich_bot_setup.sh`.
3. Escolha **Instalar / Iniciar**, **Atualizar** ou **Desinstalar** no menu.

## Escolhas de dados

| Opção do menu | Resultado |
| --- | --- |
| **Instalar / Iniciar** | Cria ou inicia o app local. Instalações existentes podem manter ou alterar idioma e porta. |
| **Atualizar → Manter dados** | Atualiza o app preservando volumes de banco/segredos e configurações. |
| **Atualizar → Apagar dados e instalar do zero** | Exige confirmação digitada e então remove os dados deste produto antes de iniciar uma instalação limpa. |
| **Desinstalar → Manter dados** | Remove contêineres e arquivos Compose do produto, mas preserva volumes, configurações e certificado local. |
| **Desinstalar → Apagar todos os dados do produto** | Exige confirmação digitada e então remove contêineres, volumes, configurações, segredos e certificado local do produto. |

O instalador não remove Docker, WSL, virtualização, pacotes do sistema nem outras dependências compartilhadas do host. Se desejar, remova-as manualmente pelas instruções dos fornecedores. Não use `docker compose down -v` como comando normal para parar ou atualizar: ele apaga dados salvos.

Para confiança do certificado, configuração Twitch e requisitos completos, consulte o [guia de instalação](INSTALACAO.md). Para a operação diária, consulte o [manual do usuário](../MANUAL_DE_USUARIO-pt_BR.md).
