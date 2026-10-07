import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('native Windows lifecycle validation contract', () => {
  it('runs the PowerShell locale and updater precondition check on Windows CI', async () => {
    const workflow = await readFile(fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)), 'utf8');

    expect(workflow).toContain('windows-lifecycle');
    expect(workflow).toContain('windows-latest');
    expect(workflow).toContain('tests/platform/windows-lifecycle-localization.ps1');
  });
});
