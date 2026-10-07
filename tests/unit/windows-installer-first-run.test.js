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
});
