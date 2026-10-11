import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const installer = readFileSync(new URL('../../apps/infra/installer/installer.ps1', import.meta.url), 'utf8');

describe('Windows installer first-run language prompt', () => {
  it('keeps the locale unset until a clean install asks the operator to choose it', () => {
    expect(installer).toMatch(/\$script:Locale\s*=\s*''/);
    expect(installer).toMatch(/if\s*\(-not\s*\(Test-Path\s+\$EnvFile\)\s+-and\s+-not\s+\(Prompt-Language\)\)\s*\{\s*exit 1\s*\}/);
    expect(installer).toContain("$script:Locale='pt-BR'");
    expect(installer).toContain("$script:Locale='en'");
    expect(installer).toContain("$script:Locale='es'");
  });

  it('checks supported Docker daemon architectures before product operations', () => {
    expect(installer).toContain("info --format '{{.Architecture}}'");
    expect(installer).toContain('amd64');
    expect(installer).toContain('x86_64');
    expect(installer).toContain('arm64');
    expect(installer).toContain('aarch64');
    expect(installer).toContain('Docker architecture "{0}" is not supported');
  });

  it('prints the embedded product version and preflights GHCR before Compose image pulls', () => {
    expect(installer).toContain("$InstallerVersion = '__PRODUCT_VERSION__'");
    expect(installer).toContain("installerVersion='Installer version: {0}'");
    expect(installer).toContain("Write-Host ([string]::Format((T 'installerVersion'),$InstallerVersion))");
    expect(installer).toContain('function Pull-ProductImage');
    expect(installer).toContain("Invoke-Docker @('pull',$imageReference)");
    expect(installer).toContain('confirm the package is public');
    expect(installer).toContain('does not require GHCR login');
    expect(installer).toContain("if (-not (Pull-ProductImage)) { $script:OperationFailed=$true; return }");
  });

  it('repairs a stale saved IMAGE_TAG and explicitly starts Compose with the installer release tag', () => {
    const startSetup = installer.indexOf('function Setup-Product');
    const endSetup = installer.indexOf('function Update-Product', startSetup);
    const setup = installer.slice(startSetup, endSetup);
    expect(setup).toContain("Save-ImageTag");
    expect(setup).toContain("Compose @('up','-d') $ReleaseImageTag");
  });

  it('captures the Docker architecture command exit code before selecting its output', () => {
    expect(installer).toContain("$architectureOutput = @(& $Docker info --format '{{.Architecture}}' 2>$null)");
    expect(installer).toContain('$architectureExitCode = $LASTEXITCODE');
    expect(installer).toContain('if ($architectureExitCode -ne 0)');
  });

  it('reads a deterministic input file in native test mode and shows one prompt interactively', () => {
    expect(installer).toContain('$env:QUEUEBOT_TEST_INPUT_FILE');
    expect(installer).toContain('[IO.File]::ReadAllLines($env:QUEUEBOT_TEST_INPUT_FILE)');
    expect(installer).toMatch(/function Read-Answer\([\s\S]*?QUEUEBOT_TEST_INPUT_FILE[\s\S]*?return Read-Host\s*\n[\s\S]*?\}/);
    expect(installer.match(/Read-Host/g)).toHaveLength(1);
    expect(installer).toMatch(/return Read-Host\s*\n/);
    expect(installer).not.toMatch(/return Read-Host \$Prompt/);
    expect(installer).toContain("$answer = Read-Answer (T 'languagePrompt')");
  });

  it('uses Portuguese copy until a fresh install chooses its product locale', () => {
    expect(installer).toMatch(/function T\(\[string\]\$Key\)\s*\{\s*\$copyLocale\s*=\s*if\s*\(\$script:Locale\)\s*\{\s*\$script:Locale\s*\}\s*else\s*\{\s*'pt-BR'\s*\}\s*;?\s*return \[string\]\$Copy\[\$copyLocale\]\[\$Key\]\s*\}/);
    expect(installer).toMatch(/if \(-not \$script:Locale -and -not \(Prompt-Language\)\)/);
    expect(installer).not.toMatch(/(?<!script:)\$Locale\b/);
  });

  it('parses unattended lifecycle options without evaluating argument text', () => {
    expect(installer).toContain('function Parse-CommandLine');
    expect(installer).toContain("$env:QUEUEBOT_INSTALLER_ARGS -split '\\s+'");
    expect(installer).toContain("'--silent','--non-interactive'");
    expect(installer).toContain('--erase-data --confirm-erase');
    expect(installer).not.toMatch(/Invoke-Expression|iex\s/);
    const packager = readFileSync(new URL('../../apps/infra/scripts/package-installer.mjs', import.meta.url), 'utf8');
    expect(packager).toContain('set "QUEUEBOT_INSTALLER_ARGS=%*"');
  });

  it('does not place PowerShell smart quotes inside single-quoted localized strings', () => {
    expect(installer).not.toMatch(/=\s*'[^'\r\n]*[‘’]/u);
  });

  it('passes unattended actions as arguments to the packaged Windows batch file', () => {
    const harness = readFileSync(new URL('../platform/installer-native.mjs', import.meta.url), 'utf8');
    expect(harness).toContain('QUEUEBOT_TEST_INSTALLER_ARGS');
    expect(harness).toContain('& $env:QUEUEBOT_PREBUILT_INSTALLER @installerArgs; exit $LASTEXITCODE');
    expect(harness).toContain("'-Command', '& $env:QUEUEBOT_PREBUILT_INSTALLER; exit $LASTEXITCODE'");
  });

  it('makes the native Windows Docker fake answer architecture probes and preserves calls on failure', () => {
    const harness = readFileSync(new URL('../platform/installer-native.mjs', import.meta.url), 'utf8');
    expect(harness).toContain("'if /I \"%~1\"==\"info\" echo x86_64'");
    expect(harness).toContain("'if /I \"%~1\"==\"info\" exit /b 0'");
    expect(harness).toContain('Windows fake Docker architecture fixture failed');
    expect(harness).toContain('Docker calls:');
  });
});
