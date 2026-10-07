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
    header='SubaruShogun Twitch Queue Bot — Instalador'; stateInstalled='Instalação local detectada.'; stateMissing='Nenhuma instalação local detectada.'
    menu='1) Instalar / Iniciar   2) Atualizar   3) Desinstalar   0) Sair'; choice='Escolha uma opção: '
    language='Idioma do produto: 1) Português brasileiro  2) English  3) Español'; languagePrompt='Escolha o idioma (1-3): '
    inputUnavailable='Não foi possível ler a resposta. Execute o instalador em um terminal interativo.'
    port='Porta local do painel [3000]: '; portInvalid='Informe uma porta entre 1 e 65535.'
    portBusy='Essa porta parece ocupada. Escolha outra; o instalador não troca a porta sozinho.'
    callback='A URL de callback da Twitch será https://localhost:{0}/callback'
    missing="Docker Engine/Desktop com Compose v2 não está disponível.`nAbrir a documentação oficial para instalar Docker? (s/N)"
    manual='Instale Docker manualmente conforme a documentação oficial e abra novamente este arquivo.'
    update='1) Manter dados e atualizar (padrão)   2) Apagar dados e instalar do zero   0) Voltar'
    uninstall='1) Remover containers, redes e imagens exclusivas; manter dados/volumes   2) Remover recursos e apagar volumes/dados   0) Voltar'
    confirm='Isso apaga filas, histórico, autorização Twitch, segredos, certificado local e volumes do produto.`nDigite APAGAR para confirmar:'
    confirmUninstall='Digite APAGAR para confirmar a exclusão permanente:'; word='APAGAR'
    host='Docker, virtualização, gerenciadores de pacotes e outras dependências do computador permanecem instalados. Remova-as manualmente pelas instruções oficiais dos fornecedores, se desejar. O arquivo de instalador baixado continua com você.'
    updated='Atualização concluída. Banco, segredos e configurações foram preservados.'
    failure='A operação não terminou. Os dados existentes foram preservados. Consulte: docker compose logs -f bot'
    health='O painel ainda não respondeu. Verifique os logs do bot e tente novamente.'
    architectureUnavailable='Não foi possível detectar a arquitetura do Docker. Este produto requer amd64/x86_64 ou arm64/aarch64.'
    architectureUnsupported='A arquitetura Docker "{0}" não é compatível. Este produto requer amd64/x86_64 ou arm64/aarch64.'
    progressImages='Imagens necessárias para os serviços:'; progressPull='Baixando imagens. O Compose exibirá o progresso de cada serviço e camada.'
    progressStart='Criando/iniciando banco, migrations e bot...'; progressWait='Aguardando a verificação de saúde do painel...'
    inspect='Inspecionando containers, redes, imagens e volumes deste projeto...'; stop='Removendo containers e redes do projeto; o Compose mostrará cada recurso.'
    removeImages='Removendo imagens do produto que não são usadas por outros containers...'; checkVolumes='Verificando os volumes deste projeto...'
    noInstall='Nenhuma instalação ou recurso deste produto foi encontrado. Nada foi removido.'
    doneKeep='Desinstalação concluída: containers, redes e imagens exclusivas removidos; volumes e dados preservados.'
    doneErase='Desinstalação concluída: containers, redes, imagens exclusivas, volumes e arquivos locais do produto removidos.'
    imageShared='Imagem mantida porque outro container ainda a utiliza: {0}'; imageRemoved='Imagem removida: {0}'
    uninstallFailed='Desinstalação incompleta. Alguns recursos podem já ter sido removidos; execute novamente para verificar e concluir.'
  }
  en = @{
    header='SubaruShogun Twitch Queue Bot — Installer'; stateInstalled='Local installation detected.'; stateMissing='No local installation detected.'
    menu='1) Install / Start   2) Update   3) Uninstall   0) Exit'; choice='Choose an option: '
    language='Product language: 1) Português brasileiro  2) English  3) Español'; languagePrompt='Choose a language (1-3): '
    inputUnavailable='Input is unavailable. Run the installer from an interactive terminal.'
    port='Local panel port [3000]: '; portInvalid='Enter a port from 1 to 65535.'
    portBusy='That port appears busy. Choose another; the installer never changes it silently.'
    callback='The Twitch callback URL will be https://localhost:{0}/callback'
    missing="Docker Engine/Desktop with Compose v2 is unavailable.`nOpen the official Docker installation guide? (y/N)"
    manual='Install Docker manually using the official guide, then reopen this file.'
    update='1) Keep data and update (default)   2) Erase data and install cleanly   0) Back'
    uninstall='1) Remove containers, networks, and exclusive images; keep data/volumes   2) Remove resources and erase volumes/data   0) Back'
    confirm='This erases queues, history, Twitch authorization, secrets, local certificate, and product volumes.`nType DELETE to confirm:'
    confirmUninstall='Type DELETE to confirm permanent removal:'; word='DELETE'
    host='Docker, virtualization, package managers, and other computer dependencies remain installed. Remove them manually using official vendor instructions if desired. Your downloaded installer file remains under your control.'
    updated='Update complete. Database, secrets, and settings were preserved.'
    failure='The operation did not finish. Existing data was preserved. Check: docker compose logs -f bot'
    health='The panel did not respond yet. Check bot logs and try again.'
    architectureUnavailable='Could not detect the Docker architecture. This product requires amd64/x86_64 or arm64/aarch64.'
    architectureUnsupported='Docker architecture "{0}" is not supported. This product requires amd64/x86_64 or arm64/aarch64.'
    progressImages='Images required by the services:'; progressPull='Downloading images. Compose will show progress for each service and layer.'
    progressStart='Creating/starting database, migrations, and bot...'; progressWait='Waiting for the panel health check...'
    inspect='Inspecting this project’s containers, networks, images, and volumes...'; stop='Removing project containers and networks; Compose will show each resource.'
    removeImages='Removing product images not used by other containers...'; checkVolumes='Checking this project’s volumes...'
    noInstall='No installation or product resources were found. Nothing was removed.'
    doneKeep='Uninstall complete: containers, networks, and exclusive images removed; volumes and data preserved.'
    doneErase='Uninstall complete: containers, networks, exclusive images, volumes, and local product files removed.'
    imageShared='Image kept because another container still uses it: {0}'; imageRemoved='Image removed: {0}'
    uninstallFailed='Uninstall incomplete. Some resources may already be removed; run again to verify and finish.'
  }
  es = @{
    header='SubaruShogun Twitch Queue Bot — Instalador'; stateInstalled='Instalación local detectada.'; stateMissing='No se detectó una instalación local.'
    menu='1) Instalar / Iniciar   2) Actualizar   3) Desinstalar   0) Salir'; choice='Elige una opción: '
    language='Idioma del producto: 1) Português brasileño  2) English  3) Español'; languagePrompt='Elige un idioma (1-3): '
    inputUnavailable='No se pudo leer la respuesta. Ejecuta el instalador desde un terminal interactivo.'
    port='Puerto local del panel [3000]: '; portInvalid='Indica un puerto entre 1 y 65535.'
    portBusy='Ese puerto parece ocupado. Elige otro; el instalador no lo cambia sin avisar.'
    callback='La URL de callback de Twitch será https://localhost:{0}/callback'
    missing="Docker Engine/Desktop con Compose v2 no está disponible.`n¿Abrir la guía oficial de instalación de Docker? (s/N)"
    manual='Instala Docker manualmente con la guía oficial y vuelve a abrir este archivo.'
    update='1) Mantener datos y actualizar (predeterminado)   2) Borrar datos e instalar desde cero   0) Volver'
    uninstall='1) Quitar contenedores, redes e imágenes exclusivas; conservar datos/volúmenes   2) Quitar recursos y borrar volúmenes/datos   0) Volver'
    confirm='Esto elimina colas, historial, autorización de Twitch, secretos, certificado local y volúmenes del producto.`nEscribe ELIMINAR para confirmar:'
    confirmUninstall='Escribe ELIMINAR para confirmar la eliminación permanente:'; word='ELIMINAR'
    host='Docker, virtualización, gestores de paquetes y otras dependencias del equipo siguen instalados. Si quieres, elimínalos manualmente siguiendo las instrucciones oficiales. El instalador descargado permanece bajo tu control.'
    updated='Actualización completada. Se conservaron la base de datos, los secretos y la configuración.'
    failure='La operación no terminó. Se conservaron los datos existentes. Consulta: docker compose logs -f bot'
    health='El panel todavía no respondió. Revisa los registros del bot e inténtalo de nuevo.'
    architectureUnavailable='No se pudo detectar la arquitectura de Docker. Este producto requiere amd64/x86_64 o arm64/aarch64.'
    architectureUnsupported='La arquitectura Docker "{0}" no es compatible. Este producto requiere amd64/x86_64 o arm64/aarch64.'
    progressImages='Imágenes necesarias para los servicios:'; progressPull='Descargando imágenes. Compose mostrará el progreso de cada servicio y capa.'
    progressStart='Creando/iniciando base de datos, migraciones y bot...'; progressWait='Esperando la comprobación de salud del panel...'
    inspect='Inspeccionando contenedores, redes, imágenes y volúmenes de este proyecto...'; stop='Quitando contenedores y redes del proyecto; Compose mostrará cada recurso.'
    removeImages='Quitando imágenes del producto que no usan otros contenedores...'; checkVolumes='Comprobando los volúmenes de este proyecto...'
    noInstall='No se encontró una instalación ni recursos del producto. No se quitó nada.'
    doneKeep='Desinstalación completada: contenedores, redes e imágenes exclusivas quitados; volúmenes y datos conservados.'
    doneErase='Desinstalación completada: contenedores, redes, imágenes exclusivas, volúmenes y archivos locales quitados.'
    imageShared='Imagen conservada porque otro contenedor todavía la usa: {0}'; imageRemoved='Imagen quitada: {0}'
    uninstallFailed='Desinstalación incompleta. Es posible que algunos recursos ya se hayan quitado; vuelve a ejecutar para verificar y terminar.'
  }
}

$script:Locale = ''
$script:NonInteractive = $false
$script:Action = ''
$script:DataPolicy = 'keep'
$script:DataPolicyExplicit = $false
$script:EraseConfirmed = $false
$script:CliPort = $null
$script:CliLocale = $null
$script:OperationFailed = $false
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
function Parse-CommandLine {
  $tokens = @()
  if ($env:QUEUEBOT_INSTALLER_ARGS) { $tokens = @($env:QUEUEBOT_INSTALLER_ARGS -split '\s+' | Where-Object { $_ }) }
  for ($index=0; $index -lt $tokens.Count; $index++) {
    $token = $tokens[$index]
    switch -Exact ($token) {
      { $_ -in @('--silent','--non-interactive') } { $script:NonInteractive=$true; continue }
      { $_ -in @('install','update','uninstall') } {
        if ($script:Action) { Write-Host 'Choose only one action.'; return 2 }
        $script:Action=$token; $script:NonInteractive=$true; continue
      }
      '--locale' {
        if ($index + 1 -ge $tokens.Count -or $script:Action -and $script:Action -ne 'install') { Write-Host 'Invalid --locale usage.'; return 2 }
        $index++; $script:CliLocale=$tokens[$index]
        if ($script:CliLocale -notin @('pt-BR','en','es')) { Write-Host 'Locale must be pt-BR, en, or es.'; return 2 }
        continue
      }
      '--port' {
        if ($index + 1 -ge $tokens.Count -or $script:Action -and $script:Action -ne 'install') { Write-Host 'Invalid --port usage.'; return 2 }
        $index++; $number=0
        if (-not [int]::TryParse($tokens[$index],[ref]$number) -or $number -lt 1 -or $number -gt 65535) { Write-Host (T 'portInvalid'); return 2 }
        $script:CliPort=$number; continue
      }
      '--keep-data' { if ($script:DataPolicyExplicit -and $script:DataPolicy -ne 'keep') { Write-Host 'Choose either --keep-data or --erase-data.'; return 2 }; $script:DataPolicy='keep'; $script:DataPolicyExplicit=$true; continue }
      '--erase-data' { if ($script:DataPolicyExplicit -and $script:DataPolicy -ne 'erase') { Write-Host 'Choose either --keep-data or --erase-data.'; return 2 }; $script:DataPolicy='erase'; $script:DataPolicyExplicit=$true; continue }
      '--confirm-erase' { $script:EraseConfirmed=$true; continue }
      { $_ -in @('--help','-h') } {
        Write-Host 'Usage: installer.bat [--silent] [install|update|uninstall] [--locale pt-BR|en|es] [--port 1-65535] [--keep-data | --erase-data --confirm-erase]'
        return 3
      }
      default { Write-Host "Unknown installer option: $token"; return 2 }
    }
  }
  if ($script:NonInteractive -and -not $script:Action) { Write-Host 'A silent run requires install, update, or uninstall.'; return 2 }
  if ($script:EraseConfirmed -and $script:DataPolicy -ne 'erase') { Write-Host '--confirm-erase requires --erase-data.'; return 2 }
  if ($script:DataPolicy -eq 'erase' -and -not $script:EraseConfirmed) { Write-Host 'Erasing data requires both --erase-data and --confirm-erase.'; return 2 }
  if (($null -ne $script:CliPort -or $script:CliLocale) -and $script:Action -ne 'install') { Write-Host '--locale and --port are supported only for install.'; return 2 }
  if ($script:DataPolicy -eq 'erase' -and $script:Action -eq 'install') { Write-Host 'Use update or uninstall with --erase-data.'; return 2 }
  return 0
}
function Prompt-Language {
  if ($script:NonInteractive) {
    if ($script:CliLocale) { $script:Locale=$script:CliLocale }
    if (-not $script:Locale) { $script:Locale='pt-BR' }
    return $true
  }
  Write-Host (T 'language')
  while ($true) {
    $answer = Read-Answer (T 'languagePrompt')
    if ($null -eq $answer) { Write-Host (T 'inputUnavailable'); return $false }
    switch ($answer) { '1' { $script:Locale='pt-BR'; return $true } '2' { $script:Locale='en'; return $true } '3' { $script:Locale='es'; return $true } }
  }
}
function Open-Url([string]$Url) { if (-not $TestMode -and -not $script:NonInteractive) { Start-Process $Url } }
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
  if ($script:NonInteractive) { Write-Host (T 'manual'); return $false }
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
    return Invoke-Docker (@('compose','--progress','plain','--project-name',$ProjectName,'--project-directory',$InstallHome,'--file',$ComposeFile,'--env-file',$EnvFile) + $Arguments)
  } finally {
    if ($ImageTag) { [Environment]::SetEnvironmentVariable('IMAGE_TAG',$previousImageTag,'Process') }
  }
}
function Compose-Capture([string[]]$Arguments, [string]$ImageTag = '') {
  $previousImageTag = $env:IMAGE_TAG
  if ($ImageTag) { $env:IMAGE_TAG = $ImageTag }
  try {
    $result = @(& $Docker 'compose' '--progress' 'plain' '--project-name' $ProjectName '--project-directory' $InstallHome '--file' $ComposeFile '--env-file' $EnvFile @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'Compose inspection failed.' }
    return @($result | ForEach-Object { [string]$_ })
  } finally {
    if ($ImageTag) { [Environment]::SetEnvironmentVariable('IMAGE_TAG',$previousImageTag,'Process') }
  }
}
function Project-ResourceIds([ValidateSet('containers','networks','volumes')][string]$Kind) {
  $arguments = switch ($Kind) {
    'containers' { @('ps','--all','--quiet','--filter',"label=com.docker.compose.project=$ProjectName") }
    'networks' { @('network','ls','--quiet','--filter',"label=com.docker.compose.project=$ProjectName") }
    'volumes' { @('volume','ls','--quiet','--filter',"label=com.docker.compose.project=$ProjectName") }
  }
  $result = @(& $Docker @arguments 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect project $Kind." }
  return @($result | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
}
function Product-ImageIds {
  $ids = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $imageNames = @()
  if (Test-Path -LiteralPath $ComposeFile) {
    try { $imageNames += Compose-Capture @('config','--images') } catch { throw 'Could not inspect Compose image configuration.' }
    foreach ($id in (Compose-Capture @('images','--quiet'))) { if ($id) { [void]$ids.Add($id.Trim()) } }
  }
  $imageNames += $ImageName
  foreach ($imageName in ($imageNames | Where-Object { $_ } | Sort-Object -Unique)) {
    $matches = @(& $Docker 'image' 'ls' '--quiet' '--no-trunc' $imageName 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect product images.' }
    foreach ($id in $matches) { if ($id) { [void]$ids.Add(([string]$id).Trim()) } }
  }
  return @($ids | Sort-Object)
}
function Remove-UnusedProductImages([string[]]$ImageIds) {
  Write-Host (T 'removeImages')
  foreach ($imageId in $ImageIds) {
    $users = @(& $Docker 'ps' '--all' '--quiet' '--filter' "ancestor=$imageId" 2>&1)
    if ($LASTEXITCODE -ne 0) { return $false }
    if (@($users | Where-Object { ([string]$_).Trim() }).Count -gt 0) {
      Write-Host ([string]::Format((T 'imageShared'),$imageId))
      continue
    }
    if (Invoke-Docker @('image','rm',$imageId)) { Write-Host ([string]::Format((T 'imageRemoved'),$imageId)) } else { return $false }
  }
  return $true
}
function Verify-Uninstall([string[]]$OriginalVolumes,[string[]]$OriginalImages,[ValidateSet('keep','remove')][string]$VolumePolicy) {
  Write-Host (T 'checkVolumes')
  try {
    $containers = @(Project-ResourceIds 'containers')
    $networks = @(Project-ResourceIds 'networks')
    $volumes = @(Project-ResourceIds 'volumes')
  } catch { return $false }
  if ($containers.Count -gt 0 -or $networks.Count -gt 0) { return $false }
  if ($VolumePolicy -eq 'remove') { if ($volumes.Count -gt 0) { return $false } }
  elseif (@(Compare-Object @($OriginalVolumes | Sort-Object -Unique) @($volumes | Sort-Object -Unique)).Count -ne 0) { return $false }
  $allImages=@(& $Docker 'image' 'ls' '--quiet' '--no-trunc' 2>&1)
  if ($LASTEXITCODE -ne 0) { return $false }
  foreach ($imageId in $OriginalImages) {
    $users=@(& $Docker 'ps' '--all' '--quiet' '--filter' "ancestor=$imageId" 2>&1)
    if ($LASTEXITCODE -ne 0) { return $false }
    $exists=@($allImages | Where-Object { ([string]$_).Trim() -eq $imageId }).Count -gt 0
    $hasUsers=@($users | Where-Object { ([string]$_).Trim() }).Count -gt 0
    if ($exists -and -not $hasUsers) { return $false }
  }
  return $true
}
function Clear-InstallerScreen {
  if (-not $TestMode -and -not [Console]::IsOutputRedirected) { Clear-Host }
}
function Write-ComposeFile {
  New-Item -ItemType Directory -Force -Path (Join-Path $InstallHome '.local') | Out-Null
  [IO.File]::WriteAllBytes($ComposeFile, [Convert]::FromBase64String($ComposeBase64))
}
function Read-Port {
  if ($script:NonInteractive) {
    $number=if ($null -ne $script:CliPort) { [int]$script:CliPort } else { 3000 }
    $listener=$null
    try { $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$number); $listener.Start(); $listener.Stop(); return $number }
    catch { if ($listener) { $listener.Stop() }; Write-Host (T 'portBusy'); return $null }
  }
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
  Write-Host (T 'progressWait')
  for ($i=0; $i -lt 60; $i++) {
    try { & curl.exe --insecure --silent --fail --max-time 2 "https://localhost:$Port/health" *> $null; if ($LASTEXITCODE -eq 0) { Open-Url "https://localhost:$Port"; Write-Host "https://localhost:$Port"; Write-Host "https://localhost:$Port/callback"; Write-Host (Join-Path $InstallHome '.local\localhost-ca.crt'); return $true } } catch { }
    Start-Sleep -Seconds 2
  }
  Write-Host (T 'health'); Compose @('logs','--tail','80','bot'); return $false
}
function Setup-Product {
  if (-not (Ensure-Docker)) { $script:OperationFailed=$true; return }
  if (Test-Path -LiteralPath $EnvFile) {
    $portLine=Get-Content $EnvFile | Where-Object { $_ -match '^APP_PORT=\d+$' } | Select-Object -First 1
    $port=if ($portLine) { [int]($portLine -replace '^APP_PORT=','') } else { 3000 }
    $currentLocale=(Get-Content $EnvFile | Where-Object { $_ -match '^PRODUCT_INITIAL_LOCALE=(pt-BR|en|es)$' } | Select-Object -First 1) -replace '^PRODUCT_INITIAL_LOCALE=',''
    if ($currentLocale) { $script:Locale=$currentLocale }
    if ($script:NonInteractive) {
      if ($script:CliLocale) { $script:Locale=$script:CliLocale }
      if ($null -ne $script:CliPort) { $port=[int]$script:CliPort }
    } else {
      Write-Host "Current settings: locale=$script:Locale port=$port"
      $keepPrompt='Manter configurações? [S/n]'
      if ($script:Locale -eq 'en') { $keepPrompt='Keep settings? [Y/n]' } elseif ($script:Locale -eq 'es') { $keepPrompt='¿Mantener la configuración? [S/n]' }
      $keep=Read-Answer $keepPrompt
      if ($keep -match '^n') { Prompt-Language; $port=Read-Port; if (-not $port) { $script:OperationFailed=$true; return }; Save-Config $port }
    }
  } else {
    if (-not $script:Locale -and -not (Prompt-Language)) { $script:OperationFailed=$true; return }
    $port=Read-Port
    if (-not $port) { $script:OperationFailed=$true; return }
    Save-Config $port
  }
  Write-Host ([string]::Format((T 'callback'),$port))
  Write-ComposeFile
  Write-Host (T 'progressImages'); if (-not (Compose @('config','--images') $ReleaseImageTag)) { Write-Host (T 'failure'); $script:OperationFailed=$true; return }
  Write-Host (T 'progressPull')
  if ((Compose @('pull') $ReleaseImageTag)) { Write-Host (T 'progressStart'); if ((Compose @('up','-d')) -and (Wait-Panel $port)) { return } }
  Write-Host (T 'failure'); $script:OperationFailed=$true
}
function Update-Product {
  if (-not (Test-Path $EnvFile) -or -not (Ensure-Docker)) { Write-Host (T 'failure'); $script:OperationFailed=$true; return }
  $localeLine=Get-Content $EnvFile | Where-Object { $_ -match '^PRODUCT_INITIAL_LOCALE=(pt-BR|en|es)$' } | Select-Object -First 1
  if ($localeLine) { $script:Locale=$localeLine -replace '^PRODUCT_INITIAL_LOCALE=','' }
  $portLine=Get-Content $EnvFile | Where-Object { $_ -match '^APP_PORT=\d+$' } | Select-Object -First 1
  $port=if ($portLine) { [int]($portLine -replace '^APP_PORT=','') } else { 3000 }
  if ($script:NonInteractive) { $choice=if ($script:DataPolicy -eq 'erase') { '2' } else { '1' } }
  else { Write-Host (T 'update'); $choice=Read-Answer (T 'choice') }
  if (-not $choice -or $choice -eq '1') {
    Write-ComposeFile
     Write-Host (T 'progressImages'); if (-not (Compose @('config','--images') $ReleaseImageTag)) { Write-Host (T 'failure'); $script:OperationFailed=$true; return }
    Write-Host (T 'progressPull')
    if (Compose @('pull') $ReleaseImageTag) {
      Save-ImageTag
      Write-Host (T 'progressStart')
      if ((Compose @('up','-d')) -and (Wait-Panel $port)) { Write-Host (T 'updated') } else { Write-Host (T 'failure'); $script:OperationFailed=$true }
    } else { Write-Host (T 'failure'); $script:OperationFailed=$true }
    return
  }
  if ($choice -ne '2') { return }
  if (-not $script:NonInteractive) { Write-Host (T 'confirm'); $answer=Read-Answer; if ($answer -cne [string]$Copy[$script:Locale].word) { return } }
  if (-not (Compose @('pull') $ReleaseImageTag)) { Write-Host (T 'failure'); $script:OperationFailed=$true; return }
  if (-not (Compose @('down','--volumes','--remove-orphans'))) { Write-Host (T 'failure'); $script:OperationFailed=$true; return }
  Remove-Item -LiteralPath (Join-Path $InstallHome '.local'),$EnvFile -Recurse -Force -ErrorAction SilentlyContinue
  if ($script:NonInteractive) { $script:CliPort=$port; $newPort=$port } else { Prompt-Language; $newPort=Read-Port }
   if (-not $newPort) { $script:OperationFailed=$true; return }
  Save-Config $newPort
  if ((Compose @('up','-d'))) { if (-not (Wait-Panel $newPort)) { $script:OperationFailed=$true } } else { Write-Host (T 'failure'); $script:OperationFailed=$true }
}
function Uninstall-Product {
  $localeLine=Get-Content $EnvFile -ErrorAction SilentlyContinue | Where-Object { $_ -match '^PRODUCT_INITIAL_LOCALE=(pt-BR|en|es)$' } | Select-Object -First 1
  if ($localeLine) { $script:Locale=$localeLine -replace '^PRODUCT_INITIAL_LOCALE=','' }
  if (-not (Ensure-Docker)) { $script:OperationFailed=$true; return }
  Write-Host (T 'inspect')
  try {
    $originalContainers = @(Project-ResourceIds 'containers')
    $originalNetworks = @(Project-ResourceIds 'networks')
    $originalVolumes = @(Project-ResourceIds 'volumes')
    $knownImages = @(Product-ImageIds)
  } catch { Write-Host (T 'uninstallFailed'); $script:OperationFailed=$true; return }
  if (-not (Test-Path $ComposeFile) -and -not (Test-Path $EnvFile) -and $originalContainers.Count -eq 0 -and $originalNetworks.Count -eq 0 -and $originalVolumes.Count -eq 0 -and $knownImages.Count -eq 0) {
    Write-Host (T 'noInstall')
    return
  }
  if ($script:NonInteractive) { $choice=if ($script:DataPolicy -eq 'erase') { '2' } else { '1' } }
  else { Write-Host (T 'uninstall'); $choice=Read-Answer (T 'choice') }
  if ($choice -eq '1') {
    if (-not (Test-Path $EnvFile)) { Save-Config 3000 } elseif (-not (Test-Path $ComposeFile)) { Write-ComposeFile }
    Write-Host (T 'stop')
    if (-not (Compose @('down','--remove-orphans')) -or -not (Remove-UnusedProductImages $knownImages) -or -not (Verify-Uninstall $originalVolumes $knownImages 'keep')) { Write-Host (T 'uninstallFailed'); $script:OperationFailed=$true; return }
    Remove-Item -LiteralPath $ComposeFile -Force -ErrorAction SilentlyContinue
    Write-Host (T 'doneKeep'); Write-Host (T 'host')
    return
  }
  if ($choice -ne '2') { return }
  if (-not $script:NonInteractive) { Write-Host (T 'confirmUninstall'); $answer=Read-Answer; if ($answer -cne [string]$Copy[$script:Locale].word) { return } }
  if (-not (Test-Path $EnvFile)) { Save-Config 3000 } elseif (-not (Test-Path $ComposeFile)) { Write-ComposeFile }
  Write-Host (T 'stop')
  if (-not (Compose @('down','--volumes','--remove-orphans')) -or -not (Remove-UnusedProductImages $knownImages) -or -not (Verify-Uninstall $originalVolumes $knownImages 'remove')) { Write-Host (T 'uninstallFailed'); $script:OperationFailed=$true; return }
  Remove-Item -LiteralPath $InstallHome -Recurse -Force
  Write-Host (T 'doneErase'); Write-Host (T 'host')
}

$parseStatus=Parse-CommandLine
if ($parseStatus -eq 3) { exit 0 }
if ($parseStatus -ne 0) { exit $parseStatus }
if (-not (Test-Path $EnvFile) -and -not (Prompt-Language)) { exit 1 }
Clear-InstallerScreen
Write-Host (T 'header')
if ((Test-Path $EnvFile) -or (Test-Path $ComposeFile)) { Write-Host (T 'stateInstalled') } else { Write-Host (T 'stateMissing') }
if ($script:NonInteractive) {
  switch ($script:Action) { 'install' { Setup-Product } 'update' { Update-Product } 'uninstall' { Uninstall-Product } }
  if ($script:OperationFailed) { exit 1 }
  exit 0
}
while ($true) {
  Write-Host ''; Write-Host (T 'menu'); $action=Read-Answer (T 'choice')
  switch ($action) { '1' { Setup-Product } '2' { Update-Product } '3' { Uninstall-Product } '0' { exit 0 } default { exit 0 } }
}
