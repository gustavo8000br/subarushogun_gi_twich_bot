<#
.SYNOPSIS
  Roteiro de validacao do SubaruShogun Twitch Bot no Windows 10/11 (PowerShell 5.1) com relatorio automatico.

.DESCRIPTION
  O que faz: verifica os pre-requisitos (Windows, Docker Desktop/WSL2, portas, Node, OBS, disco, internet), executa
  os passos do roteiro (OWN-01..04, LB-02-a/b/c, LB-04-a/b; OWN-05/06 com -Opcionais), registra comando, saida
  resumida, codigo de saida e tempo, e pergunta PASS/FAIL/PULAR nos passos manuais. No fim grava, em
  Documents\SubaruShogunTeste, o relatorio Relatorio-SubaruShogun-AAAAMMDD-HHMMSS.md e um .zip.
  Pede confirmacao (S/N) antes de qualquer passo que instale, atualize ou desinstale, dizendo o efeito nos dados.
  Segredos (tokens, Client Secret, chave de transmissao, Authorization, oauth:, senhas) sao mascarados; o script
  NUNCA le o arquivo .env nem envia nada para a internet. NAO cole credenciais nas observacoes.

.PARAMETER InstaladorPath
  Caminho do subarushogun_twich_bot_setup.bat baixado da pagina da release v0.3.0-0d0b595-beta.
.PARAMETER Idioma
  pt-BR (padrao), en ou es.
.PARAMETER SemConfirmacao
  Pula as perguntas S/N de instalar/atualizar/desinstalar (uso conscientemente). O apagamento de dados (OWN-04)
  continua exigindo digitar a palavra de confirmacao.
.PARAMETER WhatIf
  Simulacao: roda so as verificacoes de leitura e mostra o que cada passo faria, sem executar nada que altere o PC.
.PARAMETER Parse
  Apenas confere a sintaxe deste script e sai.
.PARAMETER Opcionais
  Inclui OWN-05 e OWN-06 (caminho de desenvolvedor, fora da formula do beta).
.PARAMETER Porta
  Porta do painel (padrao 3000).
.PARAMETER Somente
  Executa so os IDs informados, por exemplo -Somente LB-02-b (use depois de reiniciar o Windows).
.PARAMETER PastaRelatorio
  Pasta de saida (padrao Documents\SubaruShogunTeste).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Validar-SubaruShogun.ps1 -InstaladorPath C:\Evidence\subarushogun_twich_bot_setup.bat
#>
param(
  [string]$InstaladorPath = '',
  [ValidateSet('pt-BR', 'en', 'es')][string]$Idioma = 'pt-BR',
  [switch]$SemConfirmacao,
  [switch]$WhatIf,
  [switch]$Parse,
  [switch]$Opcionais,
  [int]$Porta = 3000,
  [string[]]$Somente = @(),
  [string]$PastaRelatorio = ''
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

if ($Parse) {
  $errs = $null; $tokens = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($PSCommandPath, [ref]$tokens, [ref]$errs)
  if ($errs -and $errs.Count -gt 0) { $errs | ForEach-Object { Write-Host $_.Message }; exit 1 }
  Write-Host 'Parse OK'; exit 0
}

$ReleaseUrl = 'https://github.com/gustavo8000br/subarushogun_gi_twich_bot/releases/tag/v0.3.0-0d0b595-beta'
$ReleaseTag = 'v0.3.0-0d0b595-beta'
$ComposeProject = 'subarushogun-gi-twitch-queue-bot'
$InstallDir = Join-Path $env:LOCALAPPDATA 'SubaruShogun\subarushogun-gi-twitch-bot'
$script:Results = New-Object System.Collections.ArrayList
$script:Log = New-Object System.Text.StringBuilder
$script:Cur = $null
$script:Env = [ordered]@{}
$script:Bat = $null
$script:Start = Get-Date
$script:Interactive = $true

# ---------------------------------------------------------------- textos
$Txt = @{
  'pt-BR' = @{
    confirm_q = 'Confirma? (S/N)'; effect = 'Efeito nos dados'; verdict_q = 'Resultado deste passo: P = PASS, F = FAIL, S = PULAR'
    suggest = 'Sugestao automatica'; note_q = 'Observacao (NAO cole credenciais; Enter para nenhuma)'; cancelled = 'Cancelado por voce: passo PULADO.'
    whatif = 'SIMULACAO (-WhatIf): nada foi executado neste passo.'; word_q = 'Digite a palavra de confirmacao para apagar'; erase_word = 'APAGAR'
    done = 'Concluido. Relatorio'; send = 'O que enviar de volta ao Orion: o arquivo .zip abaixo (nao contem segredos). Nao envie prints com tokens, link do widget ou chave de transmissao.'
  }
  'en' = @{
    confirm_q = 'Confirm? (Y/N)'; effect = 'Effect on data'; verdict_q = 'Result of this step: P = PASS, F = FAIL, S = SKIP'
    suggest = 'Automatic suggestion'; note_q = 'Note (do NOT paste credentials; Enter for none)'; cancelled = 'Cancelled by you: step SKIPPED.'
    whatif = 'DRY RUN (-WhatIf): nothing was executed in this step.'; word_q = 'Type the confirmation word to erase'; erase_word = 'DELETE'
    done = 'Done. Report'; send = 'What to send back to Orion: the .zip file below (it holds no secrets). Do not send screenshots with tokens, the widget link or the stream key.'
  }
  'es' = @{
    confirm_q = 'Confirmas? (S/N)'; effect = 'Efecto en los datos'; verdict_q = 'Resultado de este paso: P = PASS, F = FAIL, S = OMITIR'
    suggest = 'Sugerencia automatica'; note_q = 'Nota (NO pegues credenciales; Enter para ninguna)'; cancelled = 'Cancelado por ti: paso OMITIDO.'
    whatif = 'SIMULACION (-WhatIf): no se ejecuto nada en este paso.'; word_q = 'Escribe la palabra de confirmacion para borrar'; erase_word = 'ELIMINAR'
    done = 'Listo. Informe'; send = 'Que enviar de vuelta a Orion: el archivo .zip de abajo (sin secretos). No envies capturas con tokens, el enlace del widget o la clave de transmision.'
  }
}
function T([string]$Key) { $Txt[$Idioma][$Key] }
function D([string]$Pt, [string]$En) { if ($Idioma -eq 'pt-BR') { $Pt } else { $En } }

# ---------------------------------------------------------------- mascara de segredos
function Hide-Secrets([string]$Text) {
  if ([string]::IsNullOrEmpty($Text)) { return $Text }
  $t = $Text
  $t = [regex]::Replace($t, '(?i)oauth:[A-Za-z0-9]+', 'oauth:***')
  $t = [regex]::Replace($t, '(?i)(authorization\s*[:=]\s*)(bearer\s+|basic\s+)?\S+', '$1***')
  $t = [regex]::Replace($t, '(?i)(bearer\s+)[A-Za-z0-9\-\._~\+/]+=*', '$1***')
  $t = [regex]::Replace($t, '(?i)((?:client[_\s-]?secret|secret|(?:access[_\s-]?|refresh[_\s-]?)?token|password|passwd|senha|stream[_\s-]?key|chave|api[_\s-]?key)\s*["'']?\s*[:=]\s*["'']?)[^\s"'',;]+', '$1***')
  $t = [regex]::Replace($t, '(?i)([?&](?:token|key|secret|access_token|code|state|sig|signature)=)[^&\s]+', '$1***')
  $t = [regex]::Replace($t, '(?i)(https?://[^\s/]+/widgets?/)\S+', '$1***')
  $ev = [System.Text.RegularExpressions.MatchEvaluator] { param($m) if ($m.Value -match '^[0-9a-fA-F]{64}$') { $m.Value } else { '***' } }
  $t = [regex]::Replace($t, '\b[A-Za-z0-9_\-]{40,}\b', $ev)
  return $t
}

function Say([string]$Msg, [string]$Color = 'Gray') {
  Write-Host $Msg -ForegroundColor $Color
  [void]$script:Log.AppendLine((Hide-Secrets $Msg))
}

function Ask([string]$Prompt, [string]$Default = '') {
  if (-not $script:Interactive) { return $Default }
  try { $r = Read-Host $Prompt; if ([string]::IsNullOrWhiteSpace($r)) { return $Default }; return $r.Trim() }
  catch { $script:Interactive = $false; return $Default }
}

# ---------------------------------------------------------------- confirmacao e veredito
function Confirmar([string]$Efeito) {
  Say ('  ' + (T 'effect') + ': ' + $Efeito) 'Yellow'
  if ($SemConfirmacao) { Say '  (-SemConfirmacao)' 'DarkYellow'; return $true }
  $r = Ask (T 'confirm_q') 'N'
  return ($r -match '^(s|sim|y|yes|si)$')
}

function Pedir-Veredito([string]$Sugestao) {
  Say ('  ' + (T 'suggest') + ': ' + $Sugestao) 'Cyan'
  $def = 'S'; if ($Sugestao -eq 'PASS') { $def = 'P' } elseif ($Sugestao -eq 'FAIL') { $def = 'F' }
  $r = (Ask ((T 'verdict_q') + " [$def]") $def).ToUpper()
  $st = 'PULAR'
  if ($r -match '^(P|PASS)$') { $st = 'PASS' } elseif ($r -match '^(F|FAIL)$') { $st = 'FAIL' }
  $n = Hide-Secrets (Ask (T 'note_q') '')
  $script:Cur.Status = $st
  $script:Cur.Nota = $n
}

# ---------------------------------------------------------------- execucao registrada
function Invoke-Registrado {
  param([string]$Rotulo, [scriptblock]$Bloco)
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $code = 0; $out = ''
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $global:LASTEXITCODE = 0
  try { $out = (& $Bloco 2>&1 | Out-String); $code = $global:LASTEXITCODE }
  catch { $out = $_.Exception.Message; $code = -1 }
  finally { $ErrorActionPreference = $old }
  $sw.Stop()
  $out = (($out -replace "`0", '') -split "`r?`n" | Select-Object -First 40) -join "`n"
  if ($out.Length -gt 2500) { $out = $out.Substring(0, 2500) + ' ...[cortado]' }
  $out = Hide-Secrets $out
  if ($null -ne $script:Cur) {
    [void]$script:Cur.Cmds.Add([pscustomobject]@{ Rotulo = $Rotulo; Codigo = $code; Segundos = [math]::Round($sw.Elapsed.TotalSeconds, 1); Saida = $out })
  }
  Say ("    > $Rotulo (codigo $code, " + [math]::Round($sw.Elapsed.TotalSeconds, 1) + 's)') 'DarkGray'
  return [pscustomobject]@{ Code = $code; Out = $out }
}

function Invoke-Passo {
  param([string]$Id, [string]$Titulo, [scriptblock]$Corpo, [switch]$Opcional)
  if ($Somente.Count -gt 0 -and ($Somente -notcontains $Id)) { return }
  if ($Opcional -and -not $Opcionais -and $Somente -notcontains $Id) { return }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $script:Cur = @{ Id = $Id; Titulo = $Titulo; Status = 'PULAR'; Nota = ''; Cmds = (New-Object System.Collections.ArrayList) }
  Say ''
  Say ("=== $Id - $Titulo ===") 'Green'
  try { $ErrorActionPreference = 'Stop'; & $Corpo }
  catch { $script:Cur.Status = 'ERRO'; $script:Cur.Nota = Hide-Secrets $_.Exception.Message; Say ('  ERRO: ' + $script:Cur.Nota) 'Red' }
  finally { $ErrorActionPreference = 'Stop' }
  $sw.Stop()
  $script:Cur.Segundos = [math]::Round($sw.Elapsed.TotalSeconds, 1)
  [void]$script:Results.Add([pscustomobject]$script:Cur)
  Say ("  -> $($script:Cur.Status)") 'White'
  $script:Cur = $null
}

# ---------------------------------------------------------------- utilitarios
function Add-Pre([string]$Id, [string]$Titulo, [string]$Status, [string]$Nota) {
  [void]$script:Results.Add([pscustomobject]@{ Id = $Id; Titulo = $Titulo; Status = $Status; Nota = ((Hide-Secrets $Nota) -replace '\s+', ' '); Cmds = @(); Segundos = 0 })
  $c = 'Green'; if ($Status -eq 'FAIL') { $c = 'Red' } elseif ($Status -eq 'WARN') { $c = 'Yellow' }
  Say ("  [$Status] $Id $Titulo - $Nota") $c
}

function Get-Cmd([string]$Name) { Get-Command $Name -ErrorAction SilentlyContinue }

function Test-Saude {
  $r = Invoke-Registrado "curl.exe https://localhost:$Porta/health" { curl.exe --insecure --silent --max-time 15 "https://localhost:$Porta/health" }
  return @{ Ok = ($r.Out -match '(?i)\bok\b'); Out = $r.Out }
}

function Get-Containers { (Invoke-Registrado 'docker ps (projeto do produto)' { docker ps --all --filter "label=com.docker.compose.project=$ComposeProject" --format '{{.Names}} {{.Image}} {{.Status}}' }).Out.Trim() }
function Get-Volumes { (Invoke-Registrado 'docker volume ls (projeto do produto)' { docker volume ls --filter "label=com.docker.compose.project=$ComposeProject" --format '{{.Name}}' }).Out.Trim() }
function Count-Lines([string]$s) { if ([string]::IsNullOrWhiteSpace($s)) { 0 } else { @($s -split "`n" | Where-Object { $_.Trim() -ne '' }).Count } }

function Resolve-Instalador {
  if ($script:Bat) { return $true }
  $cands = @()
  if ($InstaladorPath) { $cands += $InstaladorPath }
  $cands += (Join-Path $PSScriptRoot 'subarushogun_twich_bot_setup.bat')
  $cands += (Join-Path $env:USERPROFILE 'Downloads\subarushogun_twich_bot_setup.bat')
  $cands += (Join-Path $env:USERPROFILE 'Desktop\subarushogun_twich_bot_setup.bat')
  foreach ($c in $cands) { if ($c -and (Test-Path -LiteralPath $c)) { $script:Bat = (Resolve-Path -LiteralPath $c).Path; return $true } }
  Say (D "  Instalador nao encontrado. Baixe subarushogun_twich_bot_setup.bat em $ReleaseUrl (secao Assets), salve em Downloads e rode de novo, ou use -InstaladorPath <caminho>." "  Installer not found. Download subarushogun_twich_bot_setup.bat from $ReleaseUrl (Assets section), save it in Downloads and run again, or use -InstaladorPath <path>.") 'Yellow'
  return $false
}

function Invoke-Instalador([string]$Rotulo) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  Say (D '  Uma janela preta do instalador vai abrir. Siga as opcoes indicadas e FACA UM PRINT da janela (sem dados privados). O script espera a janela fechar.' '  The installer black window will open. Follow the listed options and take a screenshot of it (no private data). The script waits for it to close.') 'Cyan'
  $p = Start-Process -FilePath $script:Bat -Wait -PassThru
  $sw.Stop()
  [void]$script:Cur.Cmds.Add([pscustomobject]@{ Rotulo = $Rotulo; Codigo = $p.ExitCode; Segundos = [math]::Round($sw.Elapsed.TotalSeconds, 1); Saida = '(janela interativa do instalador; saida nao capturada)' })
  return $p.ExitCode
}

function Pode-Rodar([string]$Efeito) {
  if ($WhatIf) { Say ('  ' + (T 'whatif')) 'Yellow'; Say ('  ' + (T 'effect') + ': ' + $Efeito) 'Yellow'; $script:Cur.Nota = 'WhatIf'; return $false }
  if (-not (Confirmar $Efeito)) { Say ('  ' + (T 'cancelled')) 'Yellow'; $script:Cur.Nota = 'cancelado'; return $false }
  return $true
}

# ---------------------------------------------------------------- cabecalho
Say '============================================================' 'Green'
Say ' SubaruShogun Twitch Bot - Validacao Windows (v1)' 'Green'
Say " Release alvo: $ReleaseTag  |  Idioma: $Idioma  |  WhatIf: $($WhatIf.IsPresent)" 'Green'
Say '============================================================' 'Green'
Say (D 'AVISO: nao cole tokens, Client Secret, chave de transmissao nem o link do widget em lugar nenhum. O script mascara o que parecer segredo e nunca le o .env.' 'WARNING: never paste tokens, Client Secret, stream key or the widget link anywhere. The script masks anything that looks like a secret and never reads .env.') 'Yellow'

# ---------------------------------------------------------------- pre-requisitos (somente leitura)
if ($Somente.Count -eq 0) {
  Say ''; Say '=== PRE - Pre-requisitos / Prerequisites ===' 'Green'
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    $script:Env['Windows'] = "$($os.Caption) build $($os.BuildNumber) $($os.OSArchitecture)"
    $okOs = ([int]$os.BuildNumber -ge 17763)
    Add-Pre 'PRE-01' 'Windows' $(if ($okOs) { 'PASS' } else { 'FAIL' }) $script:Env['Windows']
  } catch { Add-Pre 'PRE-01' 'Windows' 'WARN' $_.Exception.Message }
  $script:Env['PowerShell'] = $PSVersionTable.PSVersion.ToString()
  Add-Pre 'PRE-02' 'PowerShell' $(if ($PSVersionTable.PSVersion.Major -ge 5) { 'PASS' } else { 'FAIL' }) $script:Env['PowerShell']

  if (Get-Cmd 'docker') {
    $dv = Invoke-Registrado 'docker version' { docker version --format '{{.Server.Version}}' }
    $di = Invoke-Registrado 'docker info' { docker info --format '{{.Architecture}} {{.OperatingSystem}}' }
    $dc = Invoke-Registrado 'docker compose version' { docker compose version }
    $script:Env['Docker'] = ($dv.Out.Trim() + ' | ' + $di.Out.Trim() + ' | ' + $dc.Out.Trim())
    Add-Pre 'PRE-03' 'Docker Desktop' $(if ($dv.Code -eq 0 -and $di.Code -eq 0) { 'PASS' } else { 'FAIL' }) $script:Env['Docker']
  } else { Add-Pre 'PRE-03' 'Docker Desktop' 'FAIL' (D 'comando docker nao encontrado: instale/abra o Docker Desktop (backend WSL 2).' 'docker command not found: install/start Docker Desktop (WSL 2 backend).') }
  $ws = Invoke-Registrado 'wsl --status' { wsl --status }
  Add-Pre 'PRE-04' 'WSL 2' $(if ($ws.Code -eq 0) { 'PASS' } else { 'WARN' }) (($ws.Out -replace '\s+', ' ').Trim())

  try {
    $busy = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | ForEach-Object { $_.Port }
    $rep = @(); foreach ($p in @($Porta, 3109, 55432)) { if ($busy -contains $p) { $rep += "$p ocupada/busy" } else { $rep += "$p livre/free" } }
    Add-Pre 'PRE-05' (D 'Portas' 'Ports') 'PASS' ($rep -join '; ')
  } catch { Add-Pre 'PRE-05' 'Ports' 'WARN' $_.Exception.Message }

  if (Get-Cmd 'node') { $nv = (Invoke-Registrado 'node -v' { node -v }).Out.Trim(); $script:Env['Node'] = $nv; Add-Pre 'PRE-06' 'Node' 'PASS' $nv }
  else { Add-Pre 'PRE-06' 'Node' 'PASS' (D 'nao instalado (so e preciso para OWN-05/06)' 'not installed (only needed for OWN-05/06)') }

  $obs = $null
  foreach ($c in @("$env:ProgramFiles\obs-studio\bin\64bit\obs64.exe", "${env:ProgramFiles(x86)}\obs-studio\bin\64bit\obs64.exe")) { if ($c -and (Test-Path -LiteralPath $c)) { $obs = $c; break } }
  if ($obs) { $ov = (Get-Item -LiteralPath $obs).VersionInfo.ProductVersion; $script:Env['OBS'] = "$ov ($obs)"; Add-Pre 'PRE-07' 'OBS Studio' 'PASS' $script:Env['OBS'] }
  else { Add-Pre 'PRE-07' 'OBS Studio' 'WARN' (D 'nao encontrado nos caminhos padrao (necessario para LB-04)' 'not found in default paths (needed for LB-04)') }

  try {
    $dr = Get-PSDrive -Name ($env:SystemDrive.TrimEnd(':'))
    $gb = [math]::Round($dr.Free / 1GB, 1)
    Add-Pre 'PRE-08' (D 'Espaco em disco' 'Disk space') $(if ($gb -ge 10) { 'PASS' } else { 'WARN' }) "$gb GB livres/free em $($env:SystemDrive)"
  } catch { Add-Pre 'PRE-08' 'Disk' 'WARN' $_.Exception.Message }

  try {
    $tc = New-Object System.Net.Sockets.TcpClient
    $iar = $tc.BeginConnect('github.com', 443, $null, $null)
    $okNet = $iar.AsyncWaitHandle.WaitOne(4000) -and $tc.Connected
    $tc.Close()
    Add-Pre 'PRE-09' 'Internet' $(if ($okNet) { 'PASS' } else { 'WARN' }) $(if ($okNet) { 'github.com:443 ok' } else { 'sem conexao/no connection' })
  } catch { Add-Pre 'PRE-09' 'Internet' 'WARN' $_.Exception.Message }

  try {
    $paths = @($env:USERPROFILE, $env:LOCALAPPDATA, $PSScriptRoot) | Where-Object { $_ }
    $found = New-Object System.Collections.Generic.List[string]
    foreach ($pth in $paths) {
      if ($pth -match '[^\x00-\x7F]') { $found.Add((D 'acento' 'accent')) }
      if ($pth -match '\s') { $found.Add((D 'espaco' 'space')) }
      if ($pth -match "['\u2019]") { $found.Add((D 'apostrofo' 'apostrophe')) }
    }
    $kinds = @($found | Select-Object -Unique)
    if ($kinds.Count -gt 0) {
      Add-Pre 'PRE-10' (D 'Caminho do usuario' 'User path') 'WARN' ((D 'o perfil/caminho tem: ' 'the profile/path has: ') + ($kinds -join ', ') + (D '. Informativo: o instalador foi corrigido para isso (.env em UTF-8 sem BOM e caminho do .bat por variavel de ambiente); use o .bat novo desta pasta, nao o da release v0.3.0-0d0b595-beta. Confira se a instalacao conclui e o .env mostra o caminho certo (sem ?).' '. Informational: the installer was fixed for this (UTF-8 .env without BOM, .bat path through an environment variable); use the new .bat from this folder, not the v0.3.0-0d0b595-beta release one. Check that the install finishes and the path is right (no ?).'))
    } else {
      Add-Pre 'PRE-10' (D 'Caminho do usuario' 'User path') 'PASS' (D 'sem acento, espaco ou apostrofo no perfil/caminho (informativo; o instalador novo trata esses casos)' 'no accent, space or apostrophe in the profile/path (informational; the new installer handles those cases)')
    }
  } catch { Add-Pre 'PRE-10' 'User path' 'WARN' $_.Exception.Message }
}

# ---------------------------------------------------------------- passos do roteiro
$installNeeded = @('OWN-01', 'OWN-02', 'OWN-03', 'OWN-04')
if (-not $WhatIf -and ($Somente.Count -eq 0 -or @($Somente | Where-Object { $installNeeded -contains $_ }).Count -gt 0)) { [void](Resolve-Instalador) }
if ($script:Bat) {
  $h = (Get-FileHash -LiteralPath $script:Bat -Algorithm SHA256).Hash
  $script:Env['Instalador'] = "$script:Bat SHA-256 $h"
  Say ("  SHA-256: $h  (compare com a pagina da release / compare with the release page)") 'Cyan'
}

Invoke-Passo 'OWN-01' (D 'Instalacao nova: idioma, porta, callback, health' 'Fresh install: language, port, callback, health') {
  Say (D '  No instalador: escolha o idioma, 1) Instalar/Iniciar, e a porta (Enter = 3000). Teste uma porta ocupada: ele deve pedir outra. Anote a URL de callback https://localhost:<porta>/callback. Se o SmartScreen/antivirus avisar, anote.' '  In the installer: pick the language, 1) Install/Start, and the port (Enter = 3000). Try a busy port: it must ask for another. Note the callback URL. Note any SmartScreen/antivirus warning.')
  if (-not (Pode-Rodar (D 'instala o produto (2 containers e 2 volumes novos); nao apaga dados existentes.' 'installs the product (2 new containers and 2 volumes); does not delete existing data.'))) { return }
  if (-not (Resolve-Instalador)) { $script:Cur.Nota = 'instalador ausente'; return }
  $code = Invoke-Instalador 'instalador: 1) Instalar/Iniciar'
  $h = Test-Saude
  $c = Get-Containers; $v = Get-Volumes
  $sug = 'FAIL'; if ($code -eq 0 -and $h.Ok -and (Count-Lines $c) -ge 2 -and (Count-Lines $v) -ge 2) { $sug = 'PASS' }
  Say ("  health ok=$($h.Ok); containers=$(Count-Lines $c); volumes=$(Count-Lines $v); codigo instalador=$code")
  Say (D '  Confira tambem: o painel abre no idioma escolhido e a janela mostrou a URL de callback.' '  Also check: the panel opens in the chosen language and the window showed the callback URL.')
  Pedir-Veredito $sug
}

Invoke-Passo 'OWN-02' (D 'Atualizar no lugar mantem os dados' 'Update in place keeps data') {
  Say (D '  Antes: no painel crie uma fila manual e uma entrada. Depois rode o instalador (mais novo, ou o mesmo), 2) Atualizar, 1) Manter dados e atualizar.' '  Before: in the panel create a manual queue and one entry. Then run the installer (newer, or the same), 2) Update, 1) Keep data and update.')
  if (-not (Pode-Rodar (D 'ATUALIZA o produto mantendo banco, segredos e configuracoes (volumes preservados).' 'UPDATES the product keeping database, secrets and settings (volumes preserved).'))) { return }
  if (-not (Resolve-Instalador)) { $script:Cur.Nota = 'instalador ausente'; return }
  [void](Ask (D 'Crie a fila e a entrada no painel e aperte Enter' 'Create the queue and entry in the panel and press Enter') '')
  $before = Get-Volumes
  $code = Invoke-Instalador 'instalador: 2) Atualizar / 1) Manter dados'
  $after = Get-Volumes; $h = Test-Saude
  $sug = 'FAIL'; if ($code -eq 0 -and $h.Ok -and $before -eq $after -and (Count-Lines $after) -ge 2) { $sug = 'PASS' }
  Say ("  volumes iguais/identical: $($before -eq $after); health ok=$($h.Ok)")
  Say (D '  Confira: mensagem "Update complete", mesma URL, fila e entrada ainda presentes.' '  Check: "Update complete" message, same URL, queue and entry still there.')
  Pedir-Veredito $sug
}

Invoke-Passo 'OWN-03' (D 'Desinstalar mantendo dados e reinstalar' 'Uninstall keeping data, then reinstall') {
  Say (D '  Rode o instalador: 3) Desinstalar, opcao 1 (remove containers/redes/imagens; MANTEM os volumes). Depois rode de novo 1) Instalar/Iniciar.' '  Run the installer: 3) Uninstall, option 1 (removes containers/networks/images; KEEPS volumes). Then run 1) Install/Start again.')
  if (-not (Pode-Rodar (D 'remove containers, redes e imagens do produto; os volumes (banco e segredos) sao PRESERVADOS e a reinstalacao os reaproveita.' 'removes product containers, networks and images; volumes (database and secrets) are PRESERVED and the reinstall reuses them.'))) { return }
  if (-not (Resolve-Instalador)) { $script:Cur.Nota = 'instalador ausente'; return }
  $vBefore = Get-Volumes
  [void](Invoke-Instalador 'instalador: 3) Desinstalar / 1) manter dados')
  $cMid = Get-Containers; $vMid = Get-Volumes
  Say ("  apos desinstalar: containers=$(Count-Lines $cMid) (esperado 0); volumes=$(Count-Lines $vMid) (esperado $(Count-Lines $vBefore))")
  [void](Invoke-Instalador 'instalador: 1) Instalar/Iniciar (reinstalacao)')
  $h = Test-Saude
  $sug = 'FAIL'; if ((Count-Lines $cMid) -eq 0 -and $vMid -eq $vBefore -and (Count-Lines $vMid) -ge 2 -and $h.Ok) { $sug = 'PASS' }
  Say (D '  Confira: a fila e a entrada do OWN-02 voltaram e o Docker Desktop continua instalado.' '  Check: the queue and entry from OWN-02 are back and Docker Desktop is untouched.')
  Pedir-Veredito $sug
}

Invoke-Passo 'OWN-04' (D 'Desinstalar apagando dados; outros projetos Docker intactos' 'Uninstall erasing data; other Docker projects untouched') {
  Say (D '  Cria um container de prova (other-check), roda 3) Desinstalar, opcao 2 e digita a palavra de confirmacao. Uma palavra errada deve cancelar.' '  Creates a probe container (other-check), runs 3) Uninstall, option 2 and types the confirmation word. A wrong word must cancel.')
  $efeito = D 'APAGA DEFINITIVAMENTE o banco e os segredos deste teste (2 volumes) e a pasta do produto em %LOCALAPPDATA%. Use so numa instalacao de teste.' 'PERMANENTLY ERASES this test installation database and secrets (2 volumes) and the product folder in %LOCALAPPDATA%. Use only on a test installation.'
  if ($WhatIf) { Say ('  ' + (T 'whatif')) 'Yellow'; Say ('  ' + (T 'effect') + ': ' + $efeito) 'Yellow'; $script:Cur.Nota = 'WhatIf'; return }
  Say ('  ' + (T 'effect') + ': ' + $efeito) 'Red'
  $w = Ask ((T 'word_q') + ' (' + (T 'erase_word') + ')') ''
  if ($w -cne (T 'erase_word')) { Say ('  ' + (T 'cancelled')) 'Yellow'; $script:Cur.Nota = 'cancelado'; return }
  if (-not (Resolve-Instalador)) { $script:Cur.Nota = 'instalador ausente'; return }
  $started = $false
  try {
    $r = Invoke-Registrado 'docker run other-check' { docker run -d --name other-check alpine sleep 600 }
    $started = ($r.Code -eq 0)
    [void](Invoke-Instalador 'instalador: 3) Desinstalar / 2) apagar dados')
    $c = Get-Containers; $v = Get-Volumes
    $dirGone = -not (Test-Path -LiteralPath $InstallDir)
    $oc = (Invoke-Registrado 'docker ps other-check' { docker ps --filter name=other-check --format '{{.Names}}' }).Out.Trim()
    $sug = 'FAIL'; if ($started -and (Count-Lines $c) -eq 0 -and (Count-Lines $v) -eq 0 -and $dirGone -and $oc -match 'other-check') { $sug = 'PASS' }
    Say ("  produto: containers=$(Count-Lines $c) volumes=$(Count-Lines $v) pasta removida=$dirGone; other-check rodando=$($oc -match 'other-check')")
    Pedir-Veredito $sug
  } finally {
    if ($started) { [void](Invoke-Registrado 'docker rm -f other-check' { docker rm -f other-check }) }
  }
  Say (D '  Depois, instale de novo (OWN-01) para as proximas secoes.' '  Then install again (OWN-01) for the next sections.') 'Cyan'
}

Invoke-Passo 'LB-02-a' (D 'Paginas do painel por URL e refresh; idioma persiste' 'Panel pages by URL and refresh; language persists') {
  Say (D "  Abra e atualize (F5) cada uma: https://localhost:$Porta/queues, /new-queue, /operations, /commands, /widgets, /settings. Troque o idioma e atualize: deve persistir. Crie uma fila manual, adicione, chame e conclua uma entrada. (Aviso de certificado na 1a vez e esperado.)" "  Open and refresh (F5): https://localhost:$Porta/queues, /new-queue, /operations, /commands, /widgets, /settings. Switch language and refresh: it must persist. Create a manual queue, add, call and complete an entry. (A certificate warning on first run is expected.)")
  if ($WhatIf) { Say ('  ' + (T 'whatif')) 'Yellow'; $script:Cur.Nota = 'WhatIf'; return }
  $h = Test-Saude
  Pedir-Veredito $(if ($h.Ok) { 'PASS' } else { 'FAIL' })
}

Invoke-Passo 'LB-02-b' (D 'Persistencia apos reiniciar' 'Persistence after restart') {
  Say (D "  Reinicie o Windows (ou o Docker Desktop), espere o Docker ficar pronto e rode de novo: .\Validar-SubaruShogun.ps1 -Somente LB-02-b. O script confere https://localhost:$Porta/health; voce confere que a fila e as entradas continuam la." "  Restart Windows (or Docker Desktop), wait for Docker, then run again: .\Validar-SubaruShogun.ps1 -Somente LB-02-b. The script checks https://localhost:$Porta/health; you check the queue and entries are still there.")
  if ($WhatIf) { Say ('  ' + (T 'whatif')) 'Yellow'; $script:Cur.Nota = 'WhatIf'; return }
  $h = Test-Saude
  Pedir-Veredito $(if ($h.Ok) { 'PASS' } else { 'FAIL' })
}

Invoke-Passo 'LB-02-c' (D 'Canal de teste da Twitch: conectar, fila, recompensa, resgate' 'Twitch test channel: connect, queue, reward, redemption') {
  Say (D "  Abra https://localhost:$Porta/connection e conecte o canal de TESTE (nunca o principal). A URL de callback precisa estar cadastrada no seu app da Twitch. Crie uma fila e uma recompensa, resgate uma vez no canal de teste, chame e conclua. NAO cole nem fotografe tokens, Client Secret, UID ou chat privado." "  Open https://localhost:$Porta/connection and connect the TEST channel (never your main one). The callback URL must be registered in your Twitch app. Create a queue and a reward, redeem once, call and complete it. Do NOT paste or screenshot tokens, Client Secret, UID or private chat.")
  if ($WhatIf) { Say ('  ' + (T 'whatif')) 'Yellow'; $script:Cur.Nota = 'WhatIf'; return }
  $h = Test-Saude
  Pedir-Veredito 'PULAR'
}

Invoke-Passo 'LB-04-a' (D 'OBS Browser Source: transparencia, atualizacao, resize, recuperacao' 'OBS Browser Source: transparency, updates, resize, recovery') {
  Say (D '  No painel, /widgets: abra o widget e copie o link (NAO compartilhe). No OBS: Fontes > + > Navegador, cole o link, 1920x1080, "Desligar fonte quando nao visivel" DESLIGADO. Confira: fundo transparente sobre um video; a fila atualiza em ~2 s ao adicionar/chamar; redimensionar re-encaixa; ocultar/mostrar ou "Atualizar cache da pagina" recupera. Anote a versao do OBS e a linha do log com a versao do navegador (CEF).' '  In the panel, /widgets: open the widget and copy the link (do NOT share it). In OBS: Sources > + > Browser, paste the link, 1920x1080, "Shutdown source when not visible" OFF. Check: transparent background over video; the queue updates in ~2 s; resize re-fits; hide/show or "Refresh cache" recovers. Note the OBS version and the log line with the browser (CEF) version.')
  if ($WhatIf) { Say ('  ' + (T 'whatif')) 'Yellow'; $script:Cur.Nota = 'WhatIf'; return }
  Pedir-Veredito 'PULAR'
}

Invoke-Passo 'LB-04-b' (D 'Duas Browser Sources ao mesmo tempo' 'Two Browser Sources at once') {
  Say (D '  Adicione uma SEGUNDA fonte Navegador com o mesmo link: as duas devem atualizar juntas.' '  Add a SECOND Browser Source with the same link: both must update together.')
  if ($WhatIf) { Say ('  ' + (T 'whatif')) 'Yellow'; $script:Cur.Nota = 'WhatIf'; return }
  Pedir-Veredito 'PULAR'
}

Invoke-Passo 'OWN-05' (D 'Opcional: npm ci e npm run dev; Ctrl+C sem node.exe sobrando' 'Optional: npm ci and npm run dev; Ctrl+C leaves no node.exe') -Opcional {
  Say (D '  Num clone do repositorio com Node 24.22.3, Git for Windows e Docker: node --version; npm ci; npm run dev. PASS quando o painel abre e, apos Ctrl+C, "Get-Process node" fica vazio.' '  In a repository clone with Node 24.22.3, Git for Windows and Docker: node --version; npm ci; npm run dev. PASS when the panel opens and after Ctrl+C "Get-Process node" is empty.')
  if ($WhatIf) { Say ('  ' + (T 'whatif')) 'Yellow'; $script:Cur.Nota = 'WhatIf'; return }
  Pedir-Veredito 'PULAR'
}

Invoke-Passo 'OWN-06' (D 'Opcional: dev:start e dev:stop -- --keep-data' 'Optional: dev:start and dev:stop -- --keep-data') -Opcional {
  Say (D '  npm run dev:start e depois npm run dev:stop -- --keep-data: inicia em segundo plano e para limpo mantendo o volume do banco. (dev:stop SEM --keep-data apaga o banco de dev.)' '  npm run dev:start then npm run dev:stop -- --keep-data: starts in the background and stops cleanly keeping the database volume. (dev:stop WITHOUT --keep-data deletes the dev database.)')
  if ($WhatIf) { Say ('  ' + (T 'whatif')) 'Yellow'; $script:Cur.Nota = 'WhatIf'; return }
  Pedir-Veredito 'PULAR'
}

# ---------------------------------------------------------------- relatorio
$end = Get-Date
$dur = [math]::Round(($end - $script:Start).TotalMinutes, 1)
$stamp = $end.ToString('yyyyMMdd-HHmmss')
if ([string]::IsNullOrWhiteSpace($PastaRelatorio)) { $PastaRelatorio = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'SubaruShogunTeste' }
if (-not (Test-Path -LiteralPath $PastaRelatorio)) { [void](New-Item -ItemType Directory -Path $PastaRelatorio -Force) }
$mdPath = Join-Path $PastaRelatorio "Relatorio-SubaruShogun-$stamp.md"
$zipPath = Join-Path $PastaRelatorio "Relatorio-SubaruShogun-$stamp.zip"

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("# Relatorio de validacao Windows - SubaruShogun ($stamp)")
[void]$sb.AppendLine('')
[void]$sb.AppendLine("Release alvo: $ReleaseTag | Duracao: $dur min | Idioma: $Idioma | WhatIf: $($WhatIf.IsPresent) | Somente: $($Somente -join ',')")
[void]$sb.AppendLine('')
[void]$sb.AppendLine('## Ambiente')
foreach ($k in $script:Env.Keys) { [void]$sb.AppendLine("- **$k**: $(Hide-Secrets ([string]$script:Env[$k]))") }
[void]$sb.AppendLine('')
[void]$sb.AppendLine('## Resultado por ID')
[void]$sb.AppendLine('| ID | Passo | Resultado | Tempo (s) | Observacao |')
[void]$sb.AppendLine('| --- | --- | --- | --- | --- |')
foreach ($r in $script:Results) { [void]$sb.AppendLine("| $($r.Id) | $($r.Titulo) | $($r.Status) | $($r.Segundos) | $((([string]$r.Nota) -replace '\s+', ' ') -replace '\|', '/') |") }
[void]$sb.AppendLine('')
[void]$sb.AppendLine('## Saidas registradas (mascaradas)')
foreach ($r in $script:Results) {
  if (@($r.Cmds).Count -eq 0) { continue }
  [void]$sb.AppendLine("### $($r.Id)")
  foreach ($c in $r.Cmds) {
    [void]$sb.AppendLine("- ``$($c.Rotulo)`` codigo $($c.Codigo), $($c.Segundos) s")
    [void]$sb.AppendLine('```text'); [void]$sb.AppendLine([string]$c.Saida); [void]$sb.AppendLine('```')
  }
}
[void]$sb.AppendLine('')
[void]$sb.AppendLine('## O que enviar de volta')
[void]$sb.AppendLine('Envie ao Orion o arquivo .zip desta pasta. Ele nao contem segredos (tokens, Client Secret, chave de transmissao, Authorization, oauth: e senhas sao mascarados e o .env nunca e lido). Nao envie prints com tokens, link do widget ou chave de transmissao.')
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($mdPath, (Hide-Secrets $sb.ToString()), $utf8Bom)
$jsonPath = Join-Path $PastaRelatorio "Relatorio-SubaruShogun-$stamp.json"
[System.IO.File]::WriteAllText($jsonPath, (Hide-Secrets (($script:Results | Select-Object Id, Titulo, Status, Segundos, Nota | ConvertTo-Json))), $utf8Bom)
try { Compress-Archive -LiteralPath @($mdPath, $jsonPath) -DestinationPath $zipPath -Force } catch { Say ('Falha ao zipar: ' + $_.Exception.Message) 'Red' }
Say ''
Say ((T 'done') + ": $mdPath") 'Green'
Say "ZIP: $zipPath" 'Green'
Say (T 'send') 'Yellow'
