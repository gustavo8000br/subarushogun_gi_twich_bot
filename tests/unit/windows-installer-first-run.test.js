import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const installer = readFileSync(new URL('../../apps/infra/installer/installer.ps1', import.meta.url), 'utf8');

describe('Windows installer first-run language prompt', () => {
  it('keeps the locale unset until a clean install asks the operator to choose it', () => {
    expect(installer).toMatch(/\$Locale\s*=\s*''/);
    expect(installer).toMatch(/if\s*\(-not\s*\(Test-Path\s+\$EnvFile\)\)\s*\{\s*Prompt-Language\s*\}/);
    expect(installer).toContain("$script:Locale='pt-BR'");
    expect(installer).toContain("$script:Locale='en'");
    expect(installer).toContain("$script:Locale='es'");
  });
});
