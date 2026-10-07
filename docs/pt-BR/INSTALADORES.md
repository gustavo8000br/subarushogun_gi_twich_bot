# Baixar e usar o instalador

[English](../INSTALLERS.md) · [Voltar ao README](../../README.pt-BR.md)

Há um artefato de instalador diretamente abrível para cada sistema desktop suportado. O artefato já contém o arquivo Compose do produto; não baixe scripts separados de instalação, atualização ou desinstalação e não clone o repositório para usá-lo.

## Baixar pelo GitHub Actions

1. Entre no repositório privado: [SubaruShogun Twitch Queue Bot](https://github.com/gustavo8000br/subarushogun_gi_twich_bot).
2. Abra **Actions** → **CI** → escolha a execução bem-sucedida mais recente da branch `main`.
3. No resumo dessa execução, procure **Artifacts** no fim da página e baixe o artefato do seu sistema:
   - `subarushogun-twitch-queue-bot-installer-windows`
   - `subarushogun-twitch-queue-bot-installer-macos`
   - `subarushogun-twitch-queue-bot-installer-linux`
4. Extraia o arquivo baixado. Ele contém um único instalador. Siga abaixo o passo do seu sistema.

## Windows

1. Instale e inicie o Docker Desktop com containers Linux. Se o Docker estiver ausente, o instalador pode abrir o [guia oficial de instalação do Docker no Windows](https://docs.docker.com/desktop/setup/install/windows-install/) depois que você autorizar.
2. Abra `subarushogun_twich_bot_installer.bat` com clique duplo ou execute-o pelo Prompt de Comando/PowerShell. Ele funciona mesmo em uma pasta cujo caminho tenha espaços.
3. Na primeira instalação, escolha o idioma do produto e depois a porta; pressione Enter para usar `3000`. Confira os endereços HTTPS do painel e callback Twitch exibidos.
4. Em uma instalação existente, escolha **Instalar / Iniciar**. Mantenha idioma/porta atuais ou responda **Não** para reconfigurar.
5. Para atualizar, escolha **Atualizar**. A opção padrão preserva os dados. Para apagar filas, histórico, autorização, segredos e certificado local antes de uma instalação limpa, escolha a opção de apagar e digite exatamente a confirmação exibida no idioma escolhido.
6. Para remover o produto, escolha **Desinstalar** e depois **Manter dados** ou **Apagar todos os dados do produto**. Docker Desktop, WSL, virtualização e outras dependências compartilhadas do Windows continuam instaladas.

Se o Windows bloquear o arquivo, confirme que ele veio do artefato de CI deste repositório e então use os controles de segurança/propriedades do Windows. Não execute um script substituto baixado de outra origem.

## macOS

1. Instale e abra o Docker Desktop para Mac. Se o Docker estiver ausente, o instalador pode abrir o [guia oficial de instalação Docker para Mac](https://docs.docker.com/desktop/setup/install/mac-install/) depois que você autorizar.
2. Abra `subarushogun_twich_bot_installer.command` pelo Finder. Se o macOS bloquear o arquivo baixado, confira a origem e permita-o em **Ajustes do Sistema → Privacidade e Segurança**, ou abra o Terminal na pasta extraída e execute:

   ```sh
   chmod +x subarushogun_twich_bot_installer.command
   ./subarushogun_twich_bot_installer.command
   ```

3. No menu, escolha **Instalar / Iniciar**, **Atualizar** ou **Desinstalar**. A primeira instalação pergunta idioma e porta. Instalações existentes podem manter ou mudar essas opções.
4. A atualização normal preserva os dados. Atualização limpa e desinstalação completa só apagam dados do produto depois que você digitar exatamente a confirmação localizada. Docker Desktop e outras dependências compartilhadas continuam instalados.

## Linux

1. Instale Docker Engine e o plugin Docker Compose v2. Se o Docker estiver ausente, o instalador pode abrir as [instruções oficiais de instalação do Docker Engine](https://docs.docker.com/engine/install/) depois que você autorizar.
2. No terminal, acesse a pasta com o artefato extraído. Se o download removeu a permissão de execução, execute:

   ```sh
   chmod +x subarushogun_twich_bot_installer.sh
   ./subarushogun_twich_bot_installer.sh
   ```

3. Escolha **Instalar / Iniciar**, **Atualizar** ou **Desinstalar**. Na primeira execução, o menu pergunta idioma/porta e mostra o callback HTTPS exato.
4. A atualização normal preserva os dados. Atualização limpa ou desinstalação com exclusão exige a confirmação localizada exata. Docker Engine e outros pacotes compartilhados do host continuam instalados.

## Opções do menu e dados

| Opção | Resultado |
| --- | --- |
| **Instalar / Iniciar** | Cria ou inicia o aplicativo local. Instalações existentes podem manter ou mudar idioma/porta. |
| **Atualizar → Manter dados** | Baixa a imagem selecionada e atualiza o app, preservando volumes de banco/segredos e configurações atuais. |
| **Atualizar → Apagar dados e instalar do zero** | Baixa a imagem primeiro; após confirmação, remove os volumes do produto e o certificado local e pergunta idioma/porta novamente. |
| **Desinstalar → Manter dados** | Para/remove os contêineres e o arquivo Compose do produto, mantendo volumes, configurações e certificado local. |
| **Desinstalar → Apagar todos os dados do produto** | Após confirmação, remove contêineres, volumes, configurações, segredos e certificado local do produto. |

Para cancelar uma confirmação, digite qualquer coisa diferente da palavra mostrada. O instalador nunca remove Docker Engine/Desktop, WSL, recursos de virtualização, pacotes do sistema nem o próprio arquivo baixado. Se quiser remover dependências do host, faça isso manualmente com as instruções oficiais dos fornecedores.

## Onde ficam os arquivos do instalador no repositório

Estes são arquivos-fonte para desenvolvimento; usuários devem baixar o artefato único empacotado pelo Actions:

| Artefato por sistema | Fonte | Empacotador/workflow |
| --- | --- | --- |
| `subarushogun_twich_bot_installer.bat` | `apps/infra/installer/installer.ps1` | `apps/infra/scripts/package-installer.mjs` e `.github/workflows/ci.yml` |
| `subarushogun_twich_bot_installer.command` | `apps/infra/installer/installer.sh` | `apps/infra/scripts/package-installer.mjs` e `.github/workflows/ci.yml` |
| `subarushogun_twich_bot_installer.sh` | `apps/infra/installer/installer.sh` | `apps/infra/scripts/package-installer.mjs` e `.github/workflows/ci.yml` |

O workflow testa e envia um artefato por runner nativo. O artefato do Actions é um pacote de teste/download, não uma release do produto.
