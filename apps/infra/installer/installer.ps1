$ErrorActionPreference = 'Stop'
$ComposeBase64 = '__COMPOSE_B64__'
$ReleaseImageTag = '__IMAGE_TAG__'
$ProjectName = 'subarushogun-gi-twitch-queue-bot'
$ImageName = 'ghcr.io/gustavo8000br/subarushogun_gi_twich_bot'
$Docker = if ($env:QUEUEBOT_DOCKER_BIN) { $env:QUEUEBOT_DOCKER_BIN } else { 'docker' }
$TestMode = $env:QUEUEBOT_TEST_MODE -eq '1'
$InstallHome = if ($env:QUEUEBOT_INSTALL_HOME) { $env:QUEUEBOT_INSTALL_HOME } else { Join-Path $env:LOCALAPPDATA 'SubaruShogun\subarushogun-gi-twitch-bot' }
$EnvFile = Join-Path $InstallHome '.env'
$ComposeFile = Join-Path $InstallHome 'compose.yaml'

$Copy = @{
  'pt-BR' = @{
    menu='1) Instalar / Iniciar   2) Atualizar   3) Desinstalar   0) Sair'; choice='Escolha uma opção: '
    language='Idioma do produto: 1) Português brasileiro  2) English  3) Español'; languagePrompt='Escolha o idioma (1-3): '
    inputUnavailable='Não foi possível ler a resposta. Execute o instalador em um terminal interativo.'
    port='Porta local do painel [3000]: '; portInvalid='Informe uma porta entre 1 e 65535.'
    portBusy='Essa porta parece ocupada. Escolha outra; o instalador não troca a porta sozinho.'
    callback='A URL de callback da Twitch será https://localhost:{0}/callback'
    missing="Docker Engine/Desktop com Compose v2 não está disponível.`nAbrir a documentação oficial para instalar Docker? (s/N)"
    manual='Instale Docker manualmente conforme a documentação oficial e abra novamente este arquivo.'
    update='1) Manter dados e atualizar (padrão)   2) Apagar dados e instalar do zero   0) Voltar'
    uninstall='1) Desinstalar e manter dados   2) Apagar todos os dados do produto   0) Voltar'
    confirm='Isso apaga filas, histórico, autorização Twitch, segredos, certificado local e volumes do produto.`nDigite APAGAR para confirmar:'
    confirmUninstall='Digite APAGAR para confirmar a exclusão permanente:'; word='APAGAR'
    host='Docker, virtualização, gerenciadores de pacotes e outras dependências do computador permanecem instalados. Remova-as manualmente pelas instruções oficiais dos fornecedores, se desejar. O arquivo de instalador baixado continua com você.'
    updated='Atualização concluída. Banco, segredos e configurações foram preservados.'
    failure='A operação não terminou. Os dados existentes foram preservados. Consulte: docker compose logs -f bot'
    health='O painel ainda não respondeu. Verifique os logs do bot e tente novamente.'
    architectureUnavailable='Não foi possível detectar a arquitetura do Docker. Este produto requer amd64/x86_64 ou arm64/aarch64.'
    architectureUnsupported='A arquitetura Docker "{0}" não é compatível. Este produto requer amd64/x86_64 ou arm64/aarch64.'
  }
  en = @{
    menu='1) Install / Start   2) Update   3) Uninstall   0) Exit'; choice='Choose an option: '
    language='Product language: 1) Português brasileiro  2) English  3) Español'; languagePrompt='Choose a language (1-3): '
    inputUnavailable='Input is unavailable. Run the installer from an interactive terminal.'
    port='Local panel port [3000]: '; portInvalid='Enter a port from 1 to 65535.'
    portBusy='That port appears busy. Choose another; the installer never changes it silently.'
    callback='The Twitch callback URL will be https://localhost:{0}/callback'
    missing="Docker Engine/Desktop with Compose v2 is unavailable.`nOpen the official Docker installation guide? (y/N)"
    manual='Install Docker manually using the official guide, then reopen this file.'
    update='1) Keep data and update (default)   2) Erase data and install cleanly   0) Back'
    uninstall='1) Uninstall and keep data   2) Erase all product data   0) Back'
    confirm='This erases queues, history, Twitch authorization, secrets, local certificate, and product volumes.`nType DELETE to confirm:'
    confirmUninstall='Type DELETE to confirm permanent removal:'; word='DELETE'
    host='Docker, virtualization, package managers, and other computer dependencies remain installed. Remove them manually using official vendor instructions if desired. Your downloaded installer file remains under your control.'
    updated='Update complete. Database, secrets, and settings were preserved.'
    failure='The operation did not finish. Existing data was preserved. Check: docker compose logs -f bot'
    health='The panel did not respond yet. Check bot logs and try again.'
    architectureUnavailable='Could not detect the Docker architecture. This product requires amd64/x86_64 or arm64/aarch64.'
    architectureUnsupported='Docker architecture "{0}" is not supported. This product requires amd64/x86_64 or arm64/aarch64.'
  }
  es = @{
    menu='1) Instalar / Iniciar   2) Actualizar   3) Desinstalar   0) Salir'; choice='Elige una opción: '
    language='Idioma del producto: 1) Português brasileño  2) English  3) Español'; languagePrompt='Elige un idioma (1-3): '
    inputUnavailable='No se pudo leer la respuesta. Ejecuta el instalador desde un terminal interactivo.'
    port='Puerto local del panel [3000]: '; portInvalid='Indica un puerto entre 1 y 65535.'
    portBusy='Ese puerto parece ocupado. Elige otro; el instalador no lo cambia sin avisar.'
    callback='La URL de callback de Twitch será https://localhost:{0}/callback'
    missing="Docker Engine/Desktop con Compose v2 no está disponible.`n¿Abrir la guía oficial de instalación de Docker? (s/N)"
    manual='Instala Docker manualmente con la guía oficial y vuelve a abrir este archivo.'
    update='1) Mantener datos y actualizar (predeterminado)   2) Borrar datos e instalar desde cero   0) Volver'
    uninstall='1) Desinstalar y mantener datos   2) Borrar todos los datos del producto   0) Volver'
    confirm='Esto elimina colas, historial, autorización de Twitch, secretos, certificado local y volúmenes del producto.`nEscribe ELIMINAR para confirmar:'
    confirmUninstall='Escribe ELIMINAR para confirmar la eliminación permanente:'; word='ELIMINAR'
    host='Docker, virtualización, gestores de paquetes y otras dependencias del equipo siguen instalados. Si quieres, elimínalos manualmente siguiendo las instrucciones oficiales. El instalador descargado permanece bajo tu control.'
    updated='Actualización completada. Se conservaron la base de datos, los secretos y la configuración.'
    failure='La operación no terminó. Se conservaron los datos existentes. Consulta: docker compose logs -f bot'
    health='El panel todavía no respondió. Revisa los registros del bot e inténtalo de nuevo.'
    architectureUnavailable='No se pudo detectar la arquitectura de Docker. Este producto requiere amd64/x86_64 o arm64/aarch64.'
    architectureUnsupported='La arquitectura Docker "{0}" no es compatible. Este producto requiere amd64/x86_64 o arm64/aarch64.'
  }
}

$script:Locale = ''
$script:TestInputLines = @()
$script:TestInputIndex = 0
if ($TestMode -and $env:QUEUEBOT_TEST_INPUT_FILE -and (Test-Path -LiteralPath $env:QUEUEBOT_TEST_INPUT_FILE)) {
  $script:TestInputLines = [IO.File]::ReadAllLines($env:QUEUEBOT_TEST_INPUT_FILE)
}
if (Test-Path -LiteralPath $EnvFile) {
  $existing = (Get-Content -LiteralPath $EnvFile | Where-Object { $_ -match '^PRODUCT_INITIAL_LOCALE=(pt-BR|en|es)$' } | Select-Object -First 1) -replace '^PRODUCT_INITIAL_LOCALE=', ''
  if ($existing) { $script:Locale = $existing } else { $script:Locale = 'pt-BR' }
}
function T([string]$Key) {
  $copyLocale = if ($script:Locale) { $script:Locale } else { 'pt-BR' }
  return [string]$Copy[$copyLocale][$Key]
}
function Read-Answer([string]$Prompt = '') {
  if ($Prompt) { Write-Host -NoNewline $Prompt }
  if ($TestMode -and $env:QUEUEBOT_TEST_INPUT_FILE) {
    if ($script:TestInputIndex -ge $script:TestInputLines.Count) { return $null }
    $answer = $script:TestInputLines[$script:TestInputIndex]
    $script:TestInputIndex++
    return $answer
  }
  if ($TestMode) { return [Console]::In.ReadLine() }
  return Read-Host
}
function Prompt-Language {
  Write-Host (T 'language')
  while ($true) {
    $answer = Read-Answer (T 'languagePrompt')
    if ($null -eq $answer) { Write-Host (T 'inputUnavailable'); return $false }
    switch ($answer) { '1' { $script:Locale='pt-BR'; return $true } '2' { $script:Locale='en'; return $true } '3' { $script:Locale='es'; return $true } }
  }
}
function Open-Url([string]$Url) { if (-not $TestMode) { Start-Process $Url } }
function Ensure-Docker {
  try {
    & $Docker compose version *> $null
    if ($LASTEXITCODE -eq 0) {
      $architecture = (& $Docker info --format '{{.Architecture}}' 2>$null | Select-Object -First 1)
      if ($LASTEXITCODE -ne 0) { Write-Host (T 'architectureUnavailable'); return $false }
      $architecture = ([string]$architecture).Trim().ToLowerInvariant()
      if ($architecture -in @('amd64','x86_64','arm64','aarch64')) { return $true }
      Write-Host ([string]::Format((T 'architectureUnsupported'), $architecture))
      return $false
    }
  } catch { }
  $answer = Read-Answer (T 'missing')
  if (($script:Locale -eq 'en' -and $answer -match '^(y|yes)$') -or ($script:Locale -ne 'en' -and $answer -match '^(s|sim|sí|si)$')) { Open-Url 'https://docs.docker.com/desktop/setup/install/windows-install/' }
  Write-Host (T 'manual')
  return $false
}
function Invoke-Docker([string[]]$Arguments) {
  & $Docker @Arguments | ForEach-Object { Write-Host $_ }
  $exitCode=$LASTEXITCODE
  return ($exitCode -eq 0)
}
function Compose([string[]]$Arguments, [string]$ImageTag = '') {
  $previousImageTag = $env:IMAGE_TAG
  if ($ImageTag) { $env:IMAGE_TAG = $ImageTag }
  try {
    return Invoke-Docker (@('compose','--project-name',$ProjectName,'--project-directory',$InstallHome,'--file',$ComposeFile,'--env-file',$EnvFile) + $Arguments)
  } finally {
    if ($ImageTag) { [Environment]::SetEnvironmentVariable('IMAGE_TAG',$previousImageTag,'Process') }
  }
}
function Write-ComposeFile {
  New-Item -ItemType Directory -Force -Path (Join-Path $InstallHome '.local') | Out-Null
  [IO.File]::WriteAllBytes($ComposeFile, [Convert]::FromBase64String($ComposeBase64))
}
function Read-Port {
  while ($true) {
    $value = Read-Answer (T 'port')
    if (-not $value) { $value='3000' }
    $number=0
    if (-not [int]::TryParse($value,[ref]$number) -or $number -lt 1 -or $number -gt 65535) { Write-Host (T 'portInvalid'); continue }
    $listener=$null
    try { $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$number); $listener.Start(); $listener.Stop(); return $number }
    catch { if ($listener) { $listener.Stop() }; Write-Host (T 'portBusy') }
  }
}
function Save-Config([int]$Port) {
  New-Item -ItemType Directory -Force -Path $InstallHome | Out-Null
  Set-Content -LiteralPath $EnvFile -Encoding ascii -Value @("APP_PORT=$Port","IMAGE_TAG=$ReleaseImageTag","PRODUCT_INITIAL_LOCALE=$script:Locale")
  Write-ComposeFile
}
function Save-ImageTag {
  $lines = @(Get-Content -LiteralPath $EnvFile)
  $found = $false
  $updated = foreach ($line in $lines) {
    if ($line -match '^IMAGE_TAG=') {
      if (-not $found) { "IMAGE_TAG=$ReleaseImageTag"; $found = $true }
    } else { $line }
  }
  if (-not $found) { $updated += "IMAGE_TAG=$ReleaseImageTag" }
  Set-Content -LiteralPath $EnvFile -Encoding ascii -Value $updated
}
function Wait-Panel([int]$Port) {
  if ($TestMode) { return $true }
  for ($i=0; $i -lt 60; $i++) {
    try { & curl.exe --insecure --silent --fail --max-time 2 "https://localhost:$Port/health" *> $null; if ($LASTEXITCODE -eq 0) { Open-Url "https://localhost:$Port"; Write-Host "https://localhost:$Port"; Write-Host "https://localhost:$Port/callback"; Write-Host (Join-Path $InstallHome '.local\localhost-ca.crt'); return $true } } catch { }
    Start-Sleep -Seconds 2
  }
  Write-Host (T 'health'); Compose @('logs','--tail','80','bot'); return $false
}
function Setup-Product {
  if (-not (Ensure-Docker)) { return }
  if (Test-Path -LiteralPath $EnvFile) {
    $portLine=Get-Content $EnvFile | Where-Object { $_ -match '^APP_PORT=\d+$' } | Select-Object -First 1
    $port=if ($portLine) { [int]($portLine -replace '^APP_PORT=','') } else { 3000 }
    $currentLocale=(Get-Content $EnvFile | Where-Object { $_ -match '^PRODUCT_INITIAL_LOCALE=(pt-BR|en|es)$' } | Select-Object -First 1) -replace '^PRODUCT_INITIAL_LOCALE=',''
    if ($currentLocale) { $script:Locale=$currentLocale }
    Write-Host "Current settings: locale=$script:Locale port=$port"
    $keepPrompt='Manter configurações? [S/n]'
    if ($script:Locale -eq 'en') { $keepPrompt='Keep settings? [Y/n]' } elseif ($script:Locale -eq 'es') { $keepPrompt='¿Mantener la configuración? [S/n]' }
    $keep=Read-Answer $keepPrompt
    if ($keep -match '^n') { Prompt-Language; $port=Read-Port; Save-Config $port }
  } else {
  if (-not $script:Locale -and -not (Prompt-Language)) { return }
    $port=Read-Port
    Save-Config $port
  }
  Write-Host ([string]::Format((T 'callback'),$port))
  Write-ComposeFile
  if ((Compose @('pull') $ReleaseImageTag) -and (Compose @('up','-d')) -and (Wait-Panel $port)) { return }
  Write-Host (T 'failure')
}
function Remove-ImageIfUnused {
  $tag='main'; if (Test-Path $EnvFile) { $line=Get-Content $EnvFile | Where-Object { $_ -match '^IMAGE_TAG=' } | Select-Object -First 1; if ($line) { $tag=$line -replace '^IMAGE_TAG=','' } }
  $reference="$ImageName`:$tag"
  $containers=& $Docker ps -aq --filter "ancestor=$reference"
  if ($LASTEXITCODE -eq 0 -and -not $containers) { & $Docker image rm $reference *> $null }
}
function Update-Product {
  if (-not (Test-Path $EnvFile) -or -not (Ensure-Docker)) { Write-Host (T 'failure'); return }
  $localeLine=Get-Content $EnvFile | Where-Object { $_ -match '^PRODUCT_INITIAL_LOCALE=(pt-BR|en|es)$' } | Select-Object -First 1
  if ($localeLine) { $script:Locale=$localeLine -replace '^PRODUCT_INITIAL_LOCALE=','' }
  $portLine=Get-Content $EnvFile | Where-Object { $_ -match '^APP_PORT=\d+$' } | Select-Object -First 1
  $port=if ($portLine) { [int]($portLine -replace '^APP_PORT=','') } else { 3000 }
  Write-Host (T 'update'); $choice=Read-Answer (T 'choice')
  if (-not $choice -or $choice -eq '1') {
    Write-ComposeFile
    if (Compose @('pull') $ReleaseImageTag) {
      Save-ImageTag
      if ((Compose @('up','-d')) -and (Wait-Panel $port)) { Write-Host (T 'updated') } else { Write-Host (T 'failure') }
    } else { Write-Host (T 'failure') }
    return
  }
  if ($choice -ne '2') { return }
  Write-Host (T 'confirm'); $answer=Read-Answer
  if ($answer -cne [string]$Copy[$script:Locale].word) { return }
  if (-not (Compose @('pull') $ReleaseImageTag)) { Write-Host (T 'failure'); return }
  if (-not (Compose @('down','--volumes','--remove-orphans'))) { Write-Host (T 'failure'); return }
  Remove-Item -LiteralPath (Join-Path $InstallHome '.local'),$EnvFile -Recurse -Force -ErrorAction SilentlyContinue
  Prompt-Language; $newPort=Read-Port; Save-Config $newPort
  if ((Compose @('up','-d'))) { [void](Wait-Panel $newPort) } else { Write-Host (T 'failure') }
}
function Uninstall-Product {
  if (-not (Test-Path $ComposeFile)) { Write-Host (T 'host'); return }
  $localeLine=Get-Content $EnvFile | Where-Object { $_ -match '^PRODUCT_INITIAL_LOCALE=(pt-BR|en|es)$' } | Select-Object -First 1
  if ($localeLine) { $script:Locale=$localeLine -replace '^PRODUCT_INITIAL_LOCALE=','' }
  if (-not (Ensure-Docker)) { return }
  Write-Host (T 'uninstall'); $choice=Read-Answer (T 'choice')
  if ($choice -eq '1') {
    if (Compose @('down','--remove-orphans')) { Remove-ImageIfUnused; Remove-Item -LiteralPath $ComposeFile -Force; Write-Host (T 'host') } else { Write-Host (T 'failure') }
    return
  }
  if ($choice -ne '2') { return }
  Write-Host (T 'confirmUninstall'); $answer=Read-Answer
  if ($answer -cne [string]$Copy[$script:Locale].word) { return }
  if (-not (Compose @('down','--volumes','--remove-orphans'))) { Write-Host (T 'failure'); return }
  Remove-ImageIfUnused
  Remove-Item -LiteralPath $InstallHome -Recurse -Force
  Write-Host (T 'host')
}

if (-not (Test-Path $EnvFile) -and -not (Prompt-Language)) { exit 1 }
while ($true) {
  Write-Host ''; Write-Host (T 'menu'); $action=Read-Answer (T 'choice')
  switch ($action) { '1' { Setup-Product } '2' { Update-Product } '3' { Uninstall-Product } '0' { exit 0 } default { exit 0 } }
}
