# Guia de instalação

[Read in English](../INSTALLATION.md) · [Voltar ao README](../../README.pt-BR.md)

Este guia cobre requisitos do computador, primeira inicialização, confiança HTTPS local e configuração Twitch. Para ver rapidamente como baixar e abrir o instalador de cada sistema e usar seu menu, consulte [Baixar e usar os instaladores](INSTALADORES.md). Para operar filas e painel, consulte o [manual do usuário](../MANUAL_DE_USUARIO-pt_BR.md).

## Requisitos

- Computador de 64 bits com Docker Engine ou Docker Desktop no modo de containers Linux, plugin Docker Compose v2 (`docker compose`) e permissão para executar comandos Docker.
- Arquitetura de host 64 bits compatível: `amd64`/`x86_64` ou `arm64`/`aarch64`. A imagem publicada do aplicativo atualmente atende Linux `amd64` e `arm64`.
- Navegador atual no mesmo computador que possa confiar em uma autoridade certificadora local.
- Internet para baixar imagens do GHCR e conectar à Twitch.
- O repositório-fonte é público. O acesso à imagem GHCR é controlado separadamente; faça um pull anônimo para confirmar se o pacote é público. Se não for, o pull exige uma conta GitHub autorizada e um token clássico com `read:packages`. Nunca salve o token nos arquivos do projeto. O repositório público, por si só, não libera uma imagem privada.
- Node.js, PostgreSQL, Git e compilador não são necessários no host para executar pelo Compose. Node.js `24.20.0` roda no contêiner e só é necessário no host para desenvolvimento.

### Sistemas host

- **Ubuntu/Linux:** Ubuntu 24.04 LTS x86-64 com Docker Engine e Compose v2 é o ambiente Linux validado. Outras distribuições precisam de shell e instalação Docker compatíveis e nem todas foram testadas.
- **Windows:** Docker Desktop com backend WSL 2 e containers Linux. Confira os [requisitos atuais de Windows do Docker](https://docs.docker.com/desktop/setup/install/windows-install/) antes de instalar; Docker Desktop não oferece suporte ao Windows Server.
- **macOS:** Docker Desktop para Mac com containers Linux. O funcionamento no host macOS ainda não foi validado pelo projeto.

### Estimativas aproximadas de hardware

Estes são valores **aproximados para a alpha atual**, não mínimos garantidos. O uso real depende da versão do produto, sistema operacional, histórico de filas, logs e outros programas. Os requisitos podem mudar entre versões e serão revisados conforme o uso medido. Uma instalação normal baixa uma imagem pré-construída; o usuário não compila a imagem do aplicativo localmente.

- CPU: cerca de 2 núcleos lógicos disponíveis ao Docker para a operação normal.
- Memória: cerca de 4 GB disponíveis ao Docker; 8 GB de RAM total é uma meta prática. O Docker Desktop para Mac exige ao menos 4 GB de RAM.
- Disco: cerca de 10 GB livres para imagens baixadas, volumes de banco/segredos, logs e atualizações.
- Não é necessária GPU dedicada.

Compilar a imagem localmente é necessário apenas para desenvolvimento e pode exigir CPU, memória e disco adicionais para o cache; consulte o [guia de desenvolvimento](../DEVELOPMENT.md).

Os valores para Windows também refletem requisitos do Docker Desktop. Consulte os guias atuais de [Windows](https://docs.docker.com/desktop/setup/install/windows-install/), [Docker Engine no Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [pós-instalação Linux](https://docs.docker.com/engine/install/linux-postinstall/) e [plugin Compose](https://docs.docker.com/compose/install/linux/).

## Primeira inicialização

A OPS-5 entrega **um único instalador unificado por sistema operacional**. Cada arquivo abre um menu com **Instalar / Iniciar**, **Atualizar** e **Desinstalar**; não há downloads separados para atualização ou desinstalação. Quando estiver disponível, baixe o arquivo do seu sistema na página pública de [GitHub Releases](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/releases). Cada release terá um instalador para Windows, macOS e Linux, além de notas para usuários em inglês e pt-BR extraídas das seções correspondentes dos dois changelogs públicos. Ainda não há release pública do produto e a data da beta não está definida. O reteste nativo Windows da FND-1, a aceitação completa da FND-9, DOC-2, DOC-3, outras mudanças priorizadas pelo proprietário e seus gates de release continuam no plano pré-release; somente o proprietário pode aprovar explicitamente a prontidão para beta. Artefatos CI são builds temporários de engenharia/QA, não o caminho de download para usuários. O instalador inclui sua configuração Compose, portanto o usuário final não precisa clonar o código-fonte. O pacote da imagem GHCR precisa permitir pulls anônimos antes da distribuição pública; valide com um pull sem autenticação. No Linux, execute o arquivo `.sh` baixado conforme os passos na seção [Ubuntu/Linux](#ubuntulinux).

Na primeira abertura, ele pergunta idioma do produto (pt-BR, inglês ou espanhol) e porta local (3000 por padrão), e mostra os endereços exatos do painel e callback Twitch. Depois, o idioma pode ser alterado no painel. Se a porta 3000 estiver ocupada, escolha outra; o instalador não troca a porta silenciosamente.

Se Docker/Compose estiver ausente, o instalador pergunta antes de abrir as instruções oficiais do fornecedor para seu sistema. Instale Docker manualmente, aceite os termos, habilite WSL/virtualização e reinicie se necessário; depois abra o instalador novamente. Ele não eleva privilégios nem altera a virtualização sem sua ação.

### Windows

1. Instale e inicie Docker Desktop no modo Linux containers. O backend WSL 2 depende de pré-requisitos do Windows; siga o [guia oficial atual](https://docs.docker.com/desktop/setup/install/windows-install/). Docker Desktop não oferece suporte ao Windows Server.
   No PowerShell, `wsl --version` mostra a versão instalada do WSL. Se o WSL estiver ausente ou precisar de atualização, siga as instruções atuais da Microsoft e reinicie quando o Windows solicitar.
2. Se o GHCR ainda não permitir pulls anônimos, autentique no PowerShell com uma conta autorizada a ler o pacote:

   ```powershell
   docker login ghcr.io --username SEU_USUARIO_GITHUB
   ```

   Informe no prompt de senha um token clássico do GitHub com `read:packages`. Não o salve em arquivo. Pule esta etapa quando o pacote se tornar público.
3. Abra o arquivo de release `subarushogun_twich_bot_setup.bat` (clique duplo ou execute no Prompt de Comando/PowerShell). Escolha **Instalar / Iniciar**, idioma e porta. O arquivo é independente e funciona em caminhos com espaços.
4. O instalador inicia Compose, aguarda a saúde e abre o painel. A CA pública local fica em `%LOCALAPPDATA%\SubaruShogun\subarushogun-gi-twitch-bot\.local\localhost-ca.crt`. Para confiar nela para o usuário atual:

   ```powershell
   Import-Certificate -FilePath (Join-Path $env:LOCALAPPDATA 'SubaruShogun\subarushogun-gi-twitch-bot\.local\localhost-ca.crt') -CertStoreLocation Cert:\CurrentUser\Root
   ```

5. Abra a URL impressa pelo instalador. Se escolheu outra porta, use-a no endereço e cadastre na Twitch o callback exato com `/callback`.

### Ubuntu/Linux

1. Instale Docker Engine e o plugin Compose. Ubuntu 24.04 LTS é o ambiente Linux validado pelo projeto; confira os [procedimentos oficiais para Linux suportado](https://docs.docker.com/engine/install/).
2. Se um pull anônimo do GHCR falhar, execute `docker login ghcr.io --username SEU_USUARIO_GITHUB` com uma conta autorizada a ler o pacote e informe um token clássico do GitHub com `read:packages`. Nunca salve o token junto do instalador ou em `.env`. Pule esta etapa quando um pull anônimo funcionar.
3. Baixe `subarushogun_twich_bot_setup.sh` na página da release. Se salvou em `Downloads`, abra o terminal e execute:

   ```sh
   sh "$HOME/Downloads/subarushogun_twich_bot_setup.sh"
   ```

   Troque o caminho se salvou o arquivo em outra pasta. Isso funciona mesmo sem permissão executável. Para abrir depois, execute `chmod +x subarushogun_twich_bot_setup.sh` uma vez e então `./subarushogun_twich_bot_setup.sh`. Um lançador gráfico sem terminal interativo recebe uma mensagem clara de encerramento.
4. Confie na CA local gerada em `$HOME/.local/share/subarushogun-gi-twitch-bot/.local/localhost-ca.crt`:

   ```sh
   sudo install -Dm644 "$HOME/.local/share/subarushogun-gi-twitch-bot/.local/localhost-ca.crt" /usr/local/share/ca-certificates/queuebot-localhost-ca.crt
   sudo update-ca-certificates
   ```

5. Abra a URL do painel impressa pelo instalador. O callback exibido corresponde à porta escolhida.

### macOS

1. Instale e abra o [Docker Desktop para Mac](https://docs.docker.com/desktop/setup/install/mac-install/). O Docker oferece suporte à versão atual e às duas versões principais anteriores do macOS e exige ao menos 4 GB de RAM; consulte os requisitos atuais antes de instalar. O teste de smoke do instalador roda em runner macOS hospedado pelo GitHub; a aceitação em um Mac físico é uma etapa separada.
2. Se um pull anônimo do GHCR falhar, autentique com `docker login ghcr.io --username SEU_USUARIO_GITHUB` usando uma conta autorizada a ler o pacote e um token clássico do GitHub com `read:packages`. Pule esta etapa quando um pull anônimo funcionar.
3. Abra pelo Finder o arquivo de release `subarushogun_twich_bot_setup.command`. Se o Gatekeeper bloquear o arquivo sem assinatura, confira a origem e use o aviso de segurança/Privacidade e Segurança do macOS para permiti-lo, ou execute no Terminal com `chmod +x subarushogun_twich_bot_setup.command && ./subarushogun_twich_bot_setup.command`.
4. Confie na CA local pelo Acesso às Chaves em `~/Library/Application Support/SubaruShogun/subarushogun-gi-twitch-bot/.local/localhost-ca.crt`. O comando é:

   ```sh
   security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db "$HOME/Library/Application Support/SubaruShogun/subarushogun-gi-twitch-bot/.local/localhost-ca.crt"
   ```

5. Abra os endereços do painel e callback impressos pelo instalador.

## Conectar o canal Twitch

1. Abra `https://localhost:3000` e confira o callback exato, normalmente `https://localhost:3000/callback`.
2. No [Console de Desenvolvedor da Twitch](https://dev.twitch.tv/console/apps), crie um aplicativo confidencial e cadastre esse callback HTTPS exato. Protocolo, host, porta e caminho precisam coincidir. Ative as medidas de segurança de conta exigidas pela Twitch.
3. Informe Client ID e Client Secret no painel local, valide/salve, depois selecione **Conectar com a Twitch** e autorize os escopos solicitados. Não coloque credenciais em `.env`, YAML, chat, issues ou capturas de tela.
4. Confirme a identidade do canal no painel. Filas por recompensa exigem elegibilidade de Afiliado/Parceiro e Pontos do Canal. O painel explica a inelegibilidade; consulte o [manual do usuário](../MANUAL_DE_USUARIO-pt_BR.md) para os limites atuais.

A CA local é privada desta instalação, não uma autoridade certificadora pública. A chave privada fica no volume de segredos Docker; somente o certificado público é exportado. Se o volume for removido, o bootstrap cria outra CA. No Windows, remova a confiança antiga pelo `certmgr.msc`, em **Autoridades de Certificação Raiz Confiáveis > Certificados**.

## Porta avançada no host

A porta `3000` não muda automaticamente se estiver ocupada. Abra o instalador, escolha **Instalar / Iniciar** e recuse manter as configurações atuais quando solicitado. Selecione o idioma do produto e a nova porta; o instalador imprime as URLs correspondentes do painel e callback. Cadastre na Twitch exatamente esse callback. Para operação diária, atualização e desinstalação, consulte o [manual do usuário](../MANUAL_DE_USUARIO-pt_BR.md).
