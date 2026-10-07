param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('setup', 'update', 'uninstall')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$StateFile = Join-Path $Root '.local\product-locale.state'
$Locale = 'pt-BR'
if (Test-Path -LiteralPath $StateFile) {
  $LocaleLine = Get-Content -LiteralPath $StateFile -TotalCount 1
  if ($LocaleLine -match '^locale=([A-Za-z0-9-]+)$') {
    $Candidate = $Matches[1]
    $CandidateFile = Join-Path $Root "apps\web\localization\catalogs\lifecycle\$Candidate.tsv"
    if (Test-Path -LiteralPath $CandidateFile) { $Locale = $Candidate }
  }
}

function Get-ProductCopy([string]$Key, [string]$Fallback) {
  foreach ($CandidateLocale in @($Locale, 'pt-BR')) {
    $Catalog = Join-Path $Root "apps\web\localization\catalogs\lifecycle\$CandidateLocale.tsv"
    if (-not (Test-Path -LiteralPath $Catalog)) { continue }
    foreach ($Line in Get-Content -LiteralPath $Catalog) {
      $Parts = $Line -split "`t", 2
      if ($Parts.Count -eq 2 -and $Parts[0] -ceq $Key -and $Parts[1].Length -gt 0) { return $Parts[1] }
    }
  }
  return $Fallback
}

function Invoke-Checked([string]$Program, [string[]]$Arguments) {
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Set-Location -LiteralPath $Root
switch ($Action) {
  'setup' {
    New-Item -ItemType Directory -Force -Path (Join-Path $Root '.local') | Out-Null
    Invoke-Checked 'docker' @('compose', 'pull')
    Invoke-Checked 'docker' @('compose', 'up', '-d')
    $Port = if ($env:APP_PORT) { $env:APP_PORT } else { '3000' }
    $Address = "https://localhost:$Port"
    Write-Host "$(Get-ProductCopy 'lifecycle.setup.certificate' 'Local HTTPS certificate'): $(Join-Path $Root '.local\localhost-ca.crt')"
    Write-Host (Get-ProductCopy 'lifecycle.setup.trust' 'Trust this certificate in your operating system before connecting to Twitch.')
    for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
      & curl.exe --insecure --silent --fail "$Address/health" *> $null
      if ($LASTEXITCODE -eq 0) { Start-Process $Address; exit 0 }
      Start-Sleep -Seconds 2
    }
    Write-Host (Get-ProductCopy 'lifecycle.setup.timeout' 'Panel is still unavailable. Check the bot service logs.')
    Write-Host "$(Get-ProductCopy 'lifecycle.setup.address' 'Panel address'): $Address"
    Write-Host 'docker compose logs -f bot'
    exit 1
  }
  'update' {
    & git rev-parse --is-inside-work-tree *> $null
    if ($LASTEXITCODE -ne 0) { Write-Error (Get-ProductCopy 'lifecycle.update.git_required' 'The updater requires a Git checkout and access to GHCR.'); exit 1 }
    $Branch = (& git branch --show-current).Trim()
    if ($Branch -ne 'main') { Write-Error "$(Get-ProductCopy 'lifecycle.update.main_only' 'Update only from the main branch.') ($(Get-ProductCopy 'lifecycle.update.current_branch' 'Current branch'): $Branch)"; exit 1 }
    if ((& git status --porcelain).Trim()) { Write-Error (Get-ProductCopy 'lifecycle.update.dirty' 'Local changes are present. Save or discard them before updating.'); exit 1 }
    Invoke-Checked 'git' @('fetch', 'origin', 'main')
    Invoke-Checked 'git' @('pull', '--ff-only', 'origin', 'main')
    Invoke-Checked 'docker' @('compose', 'pull')
    Invoke-Checked 'docker' @('compose', 'up', '-d')
    Write-Host (Get-ProductCopy 'lifecycle.update.done' 'Update complete. Data and secret volumes were preserved.')
  }
  'uninstall' {
    $Answer = Read-Host "$(Get-ProductCopy 'lifecycle.uninstall.ask' 'Delete this project database and local secrets?') [y/N]"
    if ($Answer -match '^(s|sim|y|yes)$') {
      Write-Host (Get-ProductCopy 'lifecycle.uninstall.warning' 'This deletes queues, history, Twitch credentials, the database password, and private certificates.')
      $ConfirmWord = Get-ProductCopy 'lifecycle.uninstall.confirm_word' 'DELETE'
      $Prompt = (Get-ProductCopy 'lifecycle.uninstall.confirm_prompt' 'Type {word} to confirm permanent deletion:').Replace('{word}', $ConfirmWord)
      if ((Read-Host $Prompt) -cne $ConfirmWord) { Write-Host (Get-ProductCopy 'lifecycle.uninstall.cancelled' 'Cancelled; nothing was removed.'); exit 0 }
      Invoke-Checked 'docker' @('compose', 'down', '--volumes', '--rmi', 'local')
      $Tag = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { 'main' }
      & docker image rm "ghcr.io/gustavo8000br/subarushogun_gi_twich_bot:$Tag" *> $null
      Remove-Item -LiteralPath (Join-Path $Root '.local') -Recurse -Force -ErrorAction SilentlyContinue
      Write-Host (Get-ProductCopy 'lifecycle.uninstall.removed' 'Application and local data removed.')
    } else {
      Invoke-Checked 'docker' @('compose', 'down', '--rmi', 'local')
      $Tag = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { 'main' }
      & docker image rm "ghcr.io/gustavo8000br/subarushogun_gi_twich_bot:$Tag" *> $null
      Write-Host (Get-ProductCopy 'lifecycle.uninstall.preserved' 'Application removed; database, secrets, and public certificate were preserved.')
    }
  }
}
