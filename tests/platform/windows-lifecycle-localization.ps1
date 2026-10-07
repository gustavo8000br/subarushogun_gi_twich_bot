$ErrorActionPreference = 'Stop'
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("queuebot lifecycle test " + [guid]::NewGuid().ToString('N'))
$ProjectRoot = Join-Path $TempRoot 'project path with spaces'
$FakeBin = Join-Path $TempRoot 'fake-bin'
$DockerLog = Join-Path $TempRoot 'docker-invocations.log'

try {
  $InfraScripts = Join-Path $ProjectRoot 'apps\infra\scripts'
  $LifecycleCatalogs = Join-Path $ProjectRoot 'apps\web\localization\catalogs\lifecycle'
  $LocalDirectory = Join-Path $ProjectRoot '.local'
  New-Item -ItemType Directory -Force -Path $InfraScripts, $LifecycleCatalogs, $LocalDirectory, $FakeBin | Out-Null

  Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\..\apps\infra\scripts\host-lifecycle.ps1') -Destination $InfraScripts
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\..\apps\web\localization\catalogs\lifecycle\en.tsv') -Destination $LifecycleCatalogs
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\..\apps\web\localization\catalogs\lifecycle\pt-BR.tsv') -Destination $LifecycleCatalogs
  Set-Content -LiteralPath (Join-Path $LocalDirectory 'product-locale.state') -Value "locale=en`nrevision=7" -Encoding utf8

  @'
@echo off
if "%~1"=="rev-parse" (
  echo true
  exit /b 0
)
if "%~1"=="branch" (
  echo feature
  exit /b 0
)
if "%~1"=="status" exit /b 0
exit /b 91
'@ | Set-Content -LiteralPath (Join-Path $FakeBin 'git.cmd') -Encoding ascii

  @'
@echo off
echo invoked>>"%QUEUEBOT_DOCKER_LOG%"
exit /b 0
'@ | Set-Content -LiteralPath (Join-Path $FakeBin 'docker.cmd') -Encoding ascii

  $OriginalPath = $env:PATH
  $OriginalDockerLog = $env:QUEUEBOT_DOCKER_LOG
  try {
    $env:PATH = "$FakeBin;$OriginalPath"
    $env:QUEUEBOT_DOCKER_LOG = $DockerLog
    $Output = & pwsh -NoProfile -File (Join-Path $InfraScripts 'host-lifecycle.ps1') -Action update 2>&1 | Out-String
    $ExitCode = $LASTEXITCODE
  } finally {
    $env:PATH = $OriginalPath
    if ($null -eq $OriginalDockerLog) { Remove-Item Env:QUEUEBOT_DOCKER_LOG -ErrorAction SilentlyContinue }
    else { $env:QUEUEBOT_DOCKER_LOG = $OriginalDockerLog }
  }

  if ($ExitCode -eq 0) { throw 'Updater unexpectedly accepted a non-main branch.' }
  if ($Output -notmatch 'Update only from the main branch\.') { throw "Expected localized English branch protection message. Actual output: $Output" }
  if ($Output -notmatch 'Current branch: feature') { throw "Expected current branch to be included. Actual output: $Output" }
  if (Test-Path -LiteralPath $DockerLog) { throw 'Docker was invoked before the updater rejected the non-main branch.' }

  Write-Host 'Windows lifecycle localization and updater precondition check passed.'
} finally {
  Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
