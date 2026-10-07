# Guia de instalação

[Read in English](../INSTALLATION.md) · [Voltar ao README](../../README.pt-BR.md)

Este guia cobre requisitos do computador, primeira inicialização, confiança HTTPS local e configuração Twitch. Para operar filas e painel, consulte o [manual do usuário](../MANUAL_DE_USUARIO-pt_BR.md).

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

### Windows

O operador já validou no Windows a inicialização Compose, o painel HTTPS/health, a atualização preservando dados e as duas opções de desinstalação. Essa execução também registrou um aviso de redirecionamento de entrada no helper de inicialização. Ainda falta repetir manualmente no Windows após a correção do helper.

1. Instale/atualize WSL 2 e reinicie se solicitado. No PowerShell elevado, use `wsl --install` somente se WSL não estiver instalado; caso contrário, use `wsl --update`. Confira `wsl --version` e habilite virtualização da CPU no BIOS/UEFI se necessário.
2. Instale e inicie Docker Desktop com backend WSL 2. Mantenha o modo **Linux containers**. No PowerShell, confira `docker --version` e `docker compose version`.
3. Clone o repositório ou extraia o arquivo do projeto e abra o PowerShell nessa pasta. O instalador aceita caminhos com espaços.
4. Enquanto o pacote GHCR de pré-lançamento for privado, autentique se necessário:

   ```powershell
   docker login ghcr.io --username SEU_USUARIO_GITHUB
   ```

   Informe no prompt de senha um token clássico do GitHub com `read:packages`. Pule esta etapa quando o pacote se tornar público.

5. Inicie o aplicativo:

   ```powershell
   .\subarushogun_twich_bot_setup.bat
   ```

   Ou execute `docker compose pull` e depois `docker compose up -d`.
6. Aguarde o bootstrap e as verificações de saúde. O certificado público local é gravado em `.local\localhost-ca.crt`.
7. Confie nesse certificado para o usuário atual e reinicie o navegador:

   ```powershell
   Import-Certificate -FilePath (Resolve-Path '.\.local\localhost-ca.crt').Path -CertStoreLocation Cert:\CurrentUser\Root
   ```

   Abra `https://localhost:3000`. Importe somente a CA gerada por esta instalação. Remover o volume de segredos Docker cria uma nova CA e exige repetir esta etapa.

### Ubuntu/Linux

1. Instale Docker Engine e o plugin Compose da sua distribuição. No Ubuntu, siga o [guia oficial de instalação](https://docs.docker.com/engine/install/ubuntu/).
2. Clone o repositório ou extraia o arquivo e abra um terminal na pasta do projeto. Se faltar permissão de execução, rode uma vez:

   ```sh
   chmod +x subarushogun_twich_bot_setup.sh
   ```

3. Se o pacote de pré-lançamento GHCR for privado, execute `docker login ghcr.io --username SEU_USUARIO_GITHUB` e informe um token clássico do GitHub com `read:packages`. Nunca grave o token no projeto.
4. Inicie:

   ```sh
   ./subarushogun_twich_bot_setup.sh
   ```

   O helper baixa a imagem multi-plataforma `main`, inicia Compose, aguarda HTTPS/health e abre o navegador quando possível. Caso contrário, exibe o endereço.
5. Depois que o bootstrap criar `.local/localhost-ca.crt`, confie na CA para todo o sistema:

   ```sh
   sudo install -Dm644 "$PWD/.local/localhost-ca.crt" /usr/local/share/ca-certificates/queuebot-localhost-ca.crt
   sudo update-ca-certificates
   ```

   Reinicie o navegador e abra `https://localhost:3000`. `$PWD` fornece caminho absoluto e funciona mesmo se a pasta do projeto tiver espaços.

### macOS

O funcionamento do host macOS ainda não foi validado pelo projeto.

1. Instale e inicie o [Docker Desktop para Mac](https://docs.docker.com/desktop/setup/install/mac-install/) e confira `docker compose version` no Terminal.
2. Clone/extraia o projeto e abra o Terminal na pasta. Se necessário, execute `chmod +x subarushogun_twich_bot_setup.sh` uma vez.
3. Enquanto o GHCR for privado, autentique com `docker login ghcr.io --username SEU_USUARIO_GITHUB` e token clássico do GitHub com `read:packages`.
4. Inicie com `./subarushogun_twich_bot_setup.sh`.
5. Depois que o bootstrap criar o certificado, adicione-o às chaves de login do usuário atual:

   ```sh
   security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db "$PWD/.local/localhost-ca.crt"
   ```

   Reinicie o navegador e abra `https://localhost:3000`. O comando usa o caminho absoluto; o comportamento macOS ainda não foi verificado.

## Conectar o canal Twitch

1. Abra `https://localhost:3000` e confira o callback exato, normalmente `https://localhost:3000/callback`.
2. No [Console de Desenvolvedor da Twitch](https://dev.twitch.tv/console/apps), crie um aplicativo confidencial e cadastre esse callback HTTPS exato. Protocolo, host, porta e caminho precisam coincidir. Ative as medidas de segurança de conta exigidas pela Twitch.
3. Informe Client ID e Client Secret no painel local, valide/salve, depois selecione **Conectar com a Twitch** e autorize os escopos solicitados. Não coloque credenciais em `.env`, YAML, chat, issues ou capturas de tela.
4. Confirme a identidade do canal no painel. Filas por recompensa exigem elegibilidade de Afiliado/Parceiro e Pontos do Canal. O painel explica a inelegibilidade; consulte o [manual do usuário](../MANUAL_DE_USUARIO-pt_BR.md) para os limites atuais.

A CA local é privada desta instalação, não uma autoridade certificadora pública. A chave privada fica no volume de segredos Docker; somente o certificado público é exportado. Se o volume for removido, o bootstrap cria outra CA. No Windows, remova a confiança antiga pelo `certmgr.msc`, em **Autoridades de Certificação Raiz Confiáveis > Certificados**.

## Porta avançada no host

A porta `3000` não muda automaticamente se estiver ocupada. Configure explicitamente outra porta publicada e cadastre na Twitch o callback exibido pelo painel.

Linux/macOS:

```sh
APP_PORT=3217 docker compose up -d
```

PowerShell:

```powershell
$env:APP_PORT = "3217"
docker compose up -d
```

O painel passa a usar `https://localhost:3217` e mostra o callback OAuth correspondente. Para operação diária, atualização e desinstalação, consulte o [manual do usuário](../MANUAL_DE_USUARIO-pt_BR.md).
