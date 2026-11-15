# Kit de validação no Windows (execução do dono) — lançamento beta, funcionalidades 28 a 30

[English](../../../stories/OPS-15/windows-validation-kit.md)

**Preparado em 2026-11-10 (ciclo C1, LA-24).** Ninguém executou isto no Windows ainda: **nenhum resultado do Windows é alegado.** Você executa; a tabela preenchida é o que muda as funcionalidades 28, 29 e 30 do [ledger](../../process/open-acceptance-criteria-2026-11-10.md) de N para Y. Base: [plano e checklist do Windows](windows-native-plan.md).

## 0. Antes de começar

**Você precisa de:** Windows 10 ou 11 (64 bits), Docker Desktop aberto com o backend WSL 2, OBS Studio, um navegador e um canal de **teste** da Twitch (nunca o canal principal na primeira execução). O ideal é um perfil de usuário limpo ou uma máquina descartável.

**Avisos de segurança (leia primeiro):**
- **Nunca cole nem tire print** de token da Twitch, segredo do cliente, chave de transmissão, link do widget, UID ou texto privado do chat. Borre ou corte. O link do widget carrega um segredo.
- A seção 4 apaga dados de propósito. Faça isso só nesta instalação de teste.
- Não rode `npm run dev:stop` sem `--keep-data`, a menos que o passo mande: ele apaga o banco de desenvolvimento descartável.

**Abra o PowerShell** (menu Iniciar, digite `PowerShell`). Todos os comandos abaixo vão nele. Crie uma pasta para as evidências, por exemplo `C:\Evidencias`, e salve as saídas nela com `| Tee-Object C:\Evidencias\nome.txt`.

### Passo 0.1: registrar o ambiente (capturar)

```powershell
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber, OsArchitecture | Tee-Object C:\Evidencias\00-windows.txt
docker version --format "{{.Server.Version}}" | Tee-Object -Append C:\Evidencias\00-windows.txt
docker compose version | Tee-Object -Append C:\Evidencias\00-windows.txt
docker info --format "{{.Architecture}} {{.OperatingSystem}}" | Tee-Object -Append C:\Evidencias\00-windows.txt
wsl --status | Tee-Object -Append C:\Evidencias\00-windows.txt
```

Anote também a versão do OBS (menu Ajuda, Sobre) e, se puder, a versão do navegador (CEF) que aparece no log do OBS.

### Passo 0.2: obter o instalador e conferi-lo

Baixe `subarushogun_twich_bot_setup.bat` da release (ou do artefato `beta-windows-installer-<sha>` da execução do Main CD) para `C:\Evidencias\instalador`. Depois:

```powershell
Get-FileHash C:\Evidencias\instalador\subarushogun_twich_bot_setup.bat -Algorithm SHA256 | Tee-Object C:\Evidencias\01-hash.txt
```

Se o seu instalador for a versão de teste só do dono (rascunho `test-windows-<run_id>`), ele pede a senha de teste na própria janela: veja `windows-owner-test-installer.md`.

Compare o hash com o da página da release, quando houver. Anote se o SmartScreen do Windows ou o antivírus avisou (print).

## 1. Instalar (OWN-01, funcionalidade 28)

1. Dê dois cliques no `.bat` (ou rode no PowerShell: `& C:\Evidencias\instalador\subarushogun_twich_bot_setup.bat`). Abre uma janela preta.
2. Escolha o idioma (1 Português, 2 English, 3 Español), depois `1) Instalar / Iniciar` e a porta (Enter mantém 3000). Teste uma porta ocupada de propósito (por exemplo, abra algo nela) e confirme que o instalador pede outra em vez de trocar sozinho.
3. A janela mostra a URL exata de callback da Twitch `https://localhost:<porta>/callback` e a versão do instalador. **Capture um print da janela inteira.**
4. Quando disser que o painel está pronto, o navegador abre `https://localhost:<porta>`. Um aviso de certificado é esperado na primeira vez (veja o guia de instalação para confiar no certificado local).
5. Confira a saúde e os recursos do produto:

```powershell
curl.exe --insecure --silent https://localhost:3000/health | Tee-Object C:\Evidencias\02-health.txt
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | Tee-Object C:\Evidencias\02-ps.txt
docker volume ls --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot | Tee-Object C:\Evidencias\02-volumes.txt
Get-Content "$env:LOCALAPPDATA\SubaruShogun\subarushogun-gi-twitch-bot\.env" | Select-String "APP_PORT|IMAGE_TAG|PRODUCT_INITIAL_LOCALE" | Tee-Object C:\Evidencias\02-env.txt
```

(Use a sua porta no lugar de 3000.) **PASS** quando: a saúde diz `ok`, o painel abre no idioma escolhido, há 2 containers (bot e banco), 2 volumes (`postgres_data`, `operational_secrets`) e o `.env` mostra a porta e o idioma.

Variante sem interação (opcional): `& .\subarushogun_twich_bot_setup.bat --silent install --locale en --port 3100` deve terminar com código de saída 0: `$LASTEXITCODE`.

## 2. Atualizar no lugar (OWN-02, funcionalidade 28)

1. No painel, crie uma fila manual e uma entrada (para haver dados a perder).
2. Salve de novo a lista de volumes (`docker volume ls ...` em `03-antes-da-atualizacao.txt`).
3. Rode o instalador **mais novo** (o antigo continua instalado do passo 1; se você só tem uma versão, rode o mesmo arquivo de novo), escolha `2) Atualizar` e depois `1) Manter dados e atualizar`.
4. **PASS** quando: a janela termina com "Atualização concluída" (banco, segredos e configurações preservados), a URL do painel não mudou, a fila e a entrada continuam lá, a lista de volumes é idêntica e o `docker ps` mostra a nova tag de imagem. Salve `03-depois-da-atualizacao.txt`.

## 3. Desinstalar mantendo dados e reinstalar (OWN-03, funcionalidade 28)

1. Rode o instalador, `3) Desinstalar`, opção `1` (remove containers, redes e imagens exclusivas; mantém dados/volumes).
2. Deve terminar com "volumes e dados preservados". Confira que os containers sumiram e os volumes ficaram:

```powershell
docker ps --all --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot | Tee-Object C:\Evidencias\04-depois-de-manter.txt
docker volume ls --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot | Tee-Object -Append C:\Evidencias\04-depois-de-manter.txt
```

3. Rode o instalador de novo (`1) Instalar / Iniciar`). **PASS** quando a fila e a entrada criadas no passo 2 voltam e o Docker Desktop em si não foi mexido (a mensagem diz que o Docker continua instalado).

## 4. Desinstalar apagando os dados (OWN-04, funcionalidade 28)

1. Antes: inicie um container qualquer sem relação (`docker run -d --name outro-teste alpine sleep 600`) para provar que outros projetos não são tocados.
2. Rode o instalador, `3) Desinstalar`, opção `2`, e digite a palavra de confirmação (`APAGAR` em português, `DELETE` em inglês, `ELIMINAR` em espanhol). Uma palavra errada deve cancelar.
3. Confira: containers, rede e os dois volumes do produto sumiram, a pasta `%LOCALAPPDATA%\SubaruShogun\subarushogun-gi-twitch-bot` sumiu e o `outro-teste` continua rodando:

```powershell
docker ps --all --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot | Tee-Object C:\Evidencias\05-depois-de-apagar.txt
docker volume ls --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot | Tee-Object -Append C:\Evidencias\05-depois-de-apagar.txt
Test-Path "$env:LOCALAPPDATA\SubaruShogun\subarushogun-gi-twitch-bot" | Tee-Object -Append C:\Evidencias\05-depois-de-apagar.txt
docker ps --filter name=outro-teste | Tee-Object -Append C:\Evidencias\05-depois-de-apagar.txt
docker rm -f outro-teste
```

**PASS** quando as listas do produto estão vazias, o `Test-Path` diz `False` e o `outro-teste` estava rodando. Depois instale de novo (passo 1) para as próximas seções.

## 5. Painel, persistência e canal de teste da Twitch (LB-02, funcionalidade 29)

1. **Smoke do painel.** Abra por URL direta e atualize cada uma: `/queues`, `/new-queue`, `/operations`, `/commands`, `/widgets`, `/settings`. Troque o idioma e atualize: deve persistir. Crie uma fila manual, adicione, chame e conclua uma entrada. (Prints: um por página basta.)
2. **Persistência.** Reinicie o Windows (ou o Docker Desktop). Espere o Docker ficar pronto, confira `https://localhost:<porta>/health` e que a fila e as entradas continuam lá.
3. **Canal de teste da Twitch.** Abra `/connection` e conecte o canal de **teste** pela autorização da Twitch (a URL de callback é a que o instalador mostrou e precisa estar cadastrada no seu aplicativo da Twitch). Crie uma fila e uma recompensa, resgate a recompensa uma vez pelo canal de teste, chame e conclua. Print do estado conectado e da fila sem token, UID nem texto do chat; oculte antes.
4. **PASS** quando as páginas do painel abrem, os dados sobrevivem ao reinício, a conexão aparece como conectada, a recompensa aparece e o resgate passa por chamada e conclusão.

## 6. OBS Browser Source no Windows (LB-04, funcionalidade 30)

1. No painel, em `/widgets`: crie ou abra o widget e copie o link (não o compartilhe).
2. OBS, Fontes, `+`, Navegador, cole o link; largura 1920, altura 1080 (ou o tamanho da sua cena). Deixe "Desligar fonte quando não visível" desligado no primeiro teste.
3. Confira: fundo transparente sobre uma fonte de vídeo, a fila atualiza em cerca de 2 segundos depois de adicionar ou chamar uma entrada, redimensione a fonte (deve reencaixar), oculte e mostre a fonte ou use "Atualizar cache da página atual" (deve se recuperar) e adicione uma **segunda** fonte Navegador com o mesmo link (as duas atualizam).
4. **Capturar:** a versão do OBS, a linha do log do OBS com a versão do navegador (CEF) e um print da cena com o widget (link oculto).
5. **PASS** quando as cinco conferências acima forem verdadeiras.

## 7. Caminho de desenvolvedor (OWN-05 e OWN-06, opcional, fora da fórmula do beta)

Precisa de Node.js 24.20.0, Git for Windows (OpenSSL) e Docker Desktop. Em um clone do repositório:

```powershell
node --version
npm ci
npm run dev
```

**OWN-05 PASS** quando o painel abre e o Ctrl+C não deixa `node.exe` solto (`Get-Process node` vazio depois).
**OWN-06:** `npm run dev:start` e depois `npm run dev:stop -- --keep-data` devem iniciar em segundo plano e parar limpo, com o volume do banco de desenvolvimento mantido. (O `npm run dev:stop` puro apaga o banco de desenvolvimento descartável: use só se quiser isso.)

## 8. Tabela de resultado (preencha e devolva)

Escreva PASS ou FAIL em cada linha, a data e o arquivo de evidência. Salve como `C:\Evidencias\resultado.md` e entregue ao Orion na sessão (sem segredos), junto com os arquivos de evidência; o `@devops` registra na story e no ledger (nunca como comentário em issue).

| ID | O quê | Funcionalidade | PASS / FAIL | Evidência (arquivo ou print) | Notas |
| --- | --- | --- | --- | --- | --- |
| OWN-01 | Instalação nova, idioma, porta, callback, saúde | 28 | | `00` a `02` | |
| OWN-02 | Atualizar no lugar mantém os dados | 28 | | `03-*` | |
| OWN-03 | Desinstalar mantendo dados; reinstalar traz os dados de volta | 28 | | `04-*` | |
| OWN-04 | Desinstalar apagando dados; outros projetos Docker intactos | 28 | | `05-*` | |
| LB-02-a | Páginas do painel por URL e atualização; idioma persiste | 29 | | prints | |
| LB-02-b | Persistência após reinício | 29 | | saúde + print | |
| LB-02-c | Canal de teste da Twitch: conectar, fila, recompensa, resgate | 29 | | prints (ocultos) | |
| LB-04-a | OBS Browser Source: transparência, atualização, redimensionar, recuperação | 30 | | log do OBS + print | |
| LB-04-b | Duas fontes ao mesmo tempo | 30 | | print | |
| OWN-05 | `npm ci` e `npm run dev`; Ctrl+C não deixa `node.exe` (opcional) | nenhuma | | saída | |
| OWN-06 | `dev:start` e `dev:stop -- --keep-data` (opcional) | nenhuma | | saída | |

Ambiente (preencha): build do Windows ____ ; Docker Desktop ____ ; OBS ____ ; CEF ____ ; versão do instalador ____ ; SHA-256 ____ .

## 9. Como o resultado vira crédito

- A **funcionalidade 28** conta quando OWN-01 a OWN-04 estão todas PASS (LB-01).
- A **funcionalidade 29** conta quando LB-02-a, -b e -c estão todas PASS (LB-02).
- A **funcionalidade 30** conta quando LB-04-a e -b estão PASS (LB-04).
- Qualquer FAIL reabre o critério correspondente da OPS-15; envie o arquivo de evidência e a mensagem exata na tela. OWN-05 e OWN-06 não entram na fórmula dos 80%.

## 10. Script automatico (adicionado em 2026-11-10)

`apps/infra/scripts/windows/Validar-SubaruShogun.ps1` (PowerShell 5.1, UTF-8 BOM, CRLF; pasta pronta para copiar em `.local/windows-test/`) executa os pre-requisitos (PRE-01..10; PRE-10 e informativo: relata acento, espaco ou apostrofo no caminho do usuario) e os passos **OWN-01, OWN-02, OWN-03, OWN-04, LB-02-a, LB-02-b, LB-02-c, LB-04-a, LB-04-b** (OWN-05 e OWN-06 com `-Opcionais`), com os mesmos IDs deste kit. Automatico: execucao do instalador, health, containers e volumes antes e depois, `other-check`; os passos manuais perguntam PASS/FAIL/PULAR. Pergunta S/N antes de instalar, atualizar e desinstalar, mascara segredos, nunca le o `.env`, nao envia nada pela internet e grava `Documentos\SubaruShogunTeste\Relatorio-SubaruShogun-<data>.md` e `.zip`. Parametros: `-InstaladorPath`, `-Idioma`, `-WhatIf`, `-SemConfirmacao`, `-Parse`, `-Somente`, `-Opcionais`. Roteiro: `LEIA-ME-ROTEIRO.md` na mesma pasta. Sintaxe conferida com o parser do PowerShell (pwsh 7.4 no Docker) e fumaca com `-WhatIf` no Linux; **o PowerShell 5.1 no Windows nao esta provado**: rode `-Parse` primeiro.

**C1c (2026-11-10):** o instalador foi corrigido para caminhos de usuario com acento, espaco ou apostrofo (`.env` gravado em UTF-8 sem BOM e lido com `-Encoding UTF8`; o `.bat` repassa o proprio caminho ao PowerShell pela variavel `QUEUEBOT_SELF`, em vez do literal `'%~f0'`). O `.bat` da release `v0.3.0-0d0b595-beta` e anterior a correcao: neste teste use o `.bat` gerado do codigo que esta em `.local/windows-test/`. Provado ate aqui: testes de contrato e pwsh 7 no Docker; Windows PowerShell 5.1 e cmd.exe em perfil real com acento/apostrofo seguem nao provados.
