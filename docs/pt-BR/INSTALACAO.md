# Guia de instalação

[Read in English](../INSTALLATION.md) · [Voltar ao README](../../README.pt-BR.md)

Este guia cobre requisitos do computador, primeira inicialização, confiança HTTPS local e configuração Twitch. Para ver rapidamente como baixar e abrir o instalador de cada sistema e usar seu menu, consulte [Baixar e usar os instaladores](INSTALADORES.md). Para operar filas e painel, consulte o [manual do usuário](../MANUAL_DE_USUARIO-pt_BR.md).

## Requisitos

- Computador de 64 bits com Docker Engine ou Docker Desktop no modo de containers Linux, plugin Docker Compose v2 (`docker compose`) e permissão para executar comandos Docker.
- Navegador atual no mesmo computador que possa confiar em uma autoridade certificadora local.
- Internet para baixar imagens do GHCR e conectar à Twitch.
- Durante este pré-lançamento privado, acesso ao repositório-fonte e ao pacote GHCR. Se o pacote for privado, autentique uma vez com um token clássico do GitHub com `read:packages`; nunca salve o token nos arquivos do projeto.
- Node.js, PostgreSQL, Git e compilador não são necessários no host para executar pelo Compose. Node.js `24.20.0` roda no contêiner e só é necessário no host para desenvolvimento.

### Sistemas host

- **Ubuntu/Linux:** Ubuntu 24.04 LTS x86-64 com Docker Engine e Compose v2 é o ambiente Linux validado. Outras distribuições precisam de shell e instalação Docker compatíveis e nem todas foram testadas.
- **Windows:** Docker Desktop com backend WSL 2 e containers Linux. Confira os [requisitos atuais de Windows do Docker](https://docs.docker.com/desktop/setup/install/windows-install/) antes de instalar; Docker Desktop não oferece suporte ao Windows Server.
- **macOS:** Docker Desktop para Mac com containers Linux. O funcionamento no host macOS ainda não foi validado pelo projeto.

### Estimativas aproximadas de hardware

Estes são valores **aproximados para a alpha atual**, não mínimos garantidos. O uso real depende da versão do produto, reconstrução de imagens, sistema operacional, histórico de filas, logs e outros programas. Os requisitos podem mudar entre versões e serão revisados conforme o uso medido.

- CPU: cerca de 2 núcleos lógicos disponíveis ao Docker; 4 são mais confortáveis no primeiro build.
- Memória: cerca de 4 GB disponíveis ao Docker para o app e o primeiro build; 8 GB de RAM total é uma meta prática.
- Disco: cerca de 10 GB livres antes do primeiro build para imagens, cache de build e volumes iniciais.
- Não é necessária GPU dedicada.

Os valores para Windows também refletem requisitos do Docker Desktop. Consulte os guias atuais de [Windows](https://docs.docker.com/desktop/setup/install/windows-install/), [Docker Engine no Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [pós-instalação Linux](https://docs.docker.com/engine/install/linux-postinstall/) e [plugin Compose](https://docs.docker.com/compose/install/linux/).

## Primeira inicialização

O instalador é um único arquivo abrível diretamente por sistema: `.bat` no Windows, `.command` no macOS e `.sh` no Linux. Baixe o correspondente na última execução bem-sucedida do [workflow de CI](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/workflows/ci.yml). O repositório é privado durante o pré-lançamento, portanto é necessário ter acesso a ele para baixar o artefato. O instalador já contém a configuração Compose; não clone o repositório.

Na primeira abertura, ele pergunta idioma do produto (pt-BR, inglês ou espanhol) e porta local (3000 por padrão), e mostra os endereços exatos do painel e callback Twitch. Depois, o idioma pode ser alterado no painel. Se a porta 3000 estiver ocupada, escolha outra; o instalador não troca a porta silenciosamente.

Se Docker/Compose estiver ausente, o instalador pergunta antes de abrir as instruções oficiais do fornecedor para seu sistema. Instale Docker manualmente, aceite os termos, habilite WSL/virtualização e reinicie se necessário; depois abra o instalador novamente. Ele não eleva privilégios nem altera a virtualização sem sua ação.

### Windows

1. Instale e inicie Docker Desktop no modo Linux containers. O backend WSL 2 depende de pré-requisitos do Windows; siga o [guia oficial atual](https://docs.docker.com/desktop/setup/install/windows-install/). Docker Desktop não oferece suporte ao Windows Server.
   No PowerShell, `wsl --version` mostra a versão instalada do WSL. Se o WSL estiver ausente ou precisar de atualização, siga as instruções atuais da Microsoft e reinicie quando o Windows solicitar.
2. Enquanto o pacote GHCR for privado, autentique uma vez no PowerShell, se necessário:

   ```powershell
   docker login ghcr.io --username SEU_USUARIO_GITHUB
   ```

   Informe no prompt de senha um token GitHub com `read:packages`. Não o salve em arquivo. Esta etapa deixa de ser necessária quando o pacote se tornar público.
3. Abra o arquivo baixado `subarushogun_twich_bot_installer.bat` (clique duplo ou execute no Prompt de Comando/PowerShell). Escolha **Instalar / Iniciar**, idioma e porta. O artefato é independente e funciona em caminhos com espaços.
4. O instalador inicia Compose, aguarda a saúde e abre o painel. A CA pública local fica em `%LOCALAPPDATA%\SubaruShogun\subarushogun-gi-twitch-bot\.local\localhost-ca.crt`. Para confiar nela para o usuário atual:

   ```powershell
   Import-Certificate -FilePath (Join-Path $env:LOCALAPPDATA 'SubaruShogun\subarushogun-gi-twitch-bot\.local\localhost-ca.crt') -CertStoreLocation Cert:\CurrentUser\Root
   ```

5. Abra a URL impressa pelo instalador. Se escolheu outra porta, use-a no endereço e cadastre na Twitch o callback exato com `/callback`.

### Ubuntu/Linux

1. Instale Docker Engine e o plugin Compose. Ubuntu 24.04 LTS é o ambiente Linux validado pelo projeto; confira os [procedimentos oficiais para Linux suportado](https://docs.docker.com/engine/install/).
2. Enquanto o GHCR for privado, execute `docker login ghcr.io --username SEU_USUARIO_GITHUB` e informe um token GitHub com `read:packages`. Nunca salve o token junto do instalador ou em `.env`.
3. Baixe e abra `subarushogun_twich_bot_installer.sh`. Se a ferramenta de download não preservou a permissão de execução, execute `chmod +x subarushogun_twich_bot_installer.sh` uma vez e depois `./subarushogun_twich_bot_installer.sh`.
4. Confie na CA local gerada em `$HOME/.local/share/subarushogun-gi-twitch-bot/.local/localhost-ca.crt`:

   ```sh
   sudo install -Dm644 "$HOME/.local/share/subarushogun-gi-twitch-bot/.local/localhost-ca.crt" /usr/local/share/ca-certificates/queuebot-localhost-ca.crt
   sudo update-ca-certificates
   ```

5. Abra a URL do painel impressa pelo instalador. O callback exibido corresponde à porta escolhida.

### macOS

1. Instale e abra o [Docker Desktop para Mac](https://docs.docker.com/desktop/setup/install/mac-install/). O Docker oferece suporte à versão atual e às duas versões principais anteriores do macOS e exige ao menos 4 GB de RAM; consulte os requisitos atuais antes de instalar. O teste de smoke do instalador roda em runner macOS hospedado pelo GitHub; a aceitação em um Mac físico é uma etapa separada.
2. Enquanto GHCR for privado, autentique com `docker login ghcr.io --username SEU_USUARIO_GITHUB` e token GitHub com `read:packages`.
3. Abra `subarushogun_twich_bot_installer.command` pelo Finder. Se o Gatekeeper bloquear um arquivo de comando baixado sem assinatura, use os controles de segurança/Privacidade e Segurança do macOS para permiti-lo, ou execute no Terminal com `chmod +x subarushogun_twich_bot_installer.command && ./subarushogun_twich_bot_installer.command`.
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
