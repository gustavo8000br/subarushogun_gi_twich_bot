import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const installer = readFileSync(new URL('../../apps/infra/installer/installer.ps1', import.meta.url), 'utf8');

describe('Windows installer first-run language prompt', () => {
  it('keeps the locale unset until a clean install asks the operator to choose it', () => {
    expect(installer).toMatch(/\$Locale\s*=\s*''/);
    expect(installer).toMatch(/if\s*\(-not\s*\(Test-Path\s+\$EnvFile\)\s+-and\s+-not\s+\(Prompt-Language\)\)\s*\{\s*exit 1\s*\}/);
    expect(installer).toContain("$script:Locale='pt-BR'");
    expect(installer).toContain("$script:Locale='en'");
    expect(installer).toContain("$script:Locale='es'");
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
    expect(installer).toMatch(/function T\(\[string\]\$Key\)\s*\{\s*\$copyLocale\s*=\s*if\s*\(\$Locale\)\s*\{\s*\$Locale\s*\}\s*else\s*\{\s*'pt-BR'\s*\}\s*;?\s*return \[string\]\$Copy\[\$copyLocale\]\[\$Key\]\s*\}/);
  });
});
