import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const wrappers = [
  ['subarushogun_twich_bot_setup.sh', 'iniciar.sh'],
  ['subarushogun_twich_bot_update.sh', 'atualizar.sh'],
  ['subarushogun_twich_bot_uninstall.sh', 'desinstalar.sh'],
  ['subarushogun_twich_bot_setup.bat', 'host-lifecycle.ps1'],
  ['subarushogun_twich_bot_update.bat', 'host-lifecycle.ps1'],
  ['subarushogun_twich_bot_uninstall.bat', 'host-lifecycle.ps1'],
];

describe('international lifecycle entry points', () => {
  it.each(wrappers)('%s delegates to the existing platform implementation', async (wrapper, target) => {
    const contents = await readFile(new URL(wrapper, root), 'utf8');
    expect(contents).toContain(target);
    expect(contents).toMatch(wrapper.endsWith('.bat') ? /powershell\.exe/i : /exec/i);
    if (wrapper.endsWith('.sh')) expect((await stat(new URL(wrapper, root))).mode & 0o111).not.toBe(0);
  });
});
