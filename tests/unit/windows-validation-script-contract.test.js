import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Contract tests for the owner's Windows validation script (static: the real run happens on the owner's Windows 10).
const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = 'apps/infra/scripts/windows/';
const IDS = ['OWN-01', 'OWN-02', 'OWN-03', 'OWN-04', 'LB-02-a', 'LB-02-b', 'LB-02-c', 'LB-04-a', 'LB-04-b', 'OWN-05', 'OWN-06'];

const raw = (name) => readFile(root + name);
const text = async (name) => (await raw(name)).toString('utf8');

describe('Windows validation script', () => {
  it('is UTF-8 with BOM and CRLF only', async () => {
    for (const name of [`${dir}Validar-SubaruShogun.ps1`, `${dir}LEIA-ME-ROTEIRO.txt`, `${dir}LEIA-ME.txt`]) {
      const buf = await raw(name);
      expect([...buf.subarray(0, 3)], name).toEqual([0xef, 0xbb, 0xbf]);
      expect(buf.toString('utf8').replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    }
  });

  it('has no external URL other than the release page and no secrets', async () => {
    const script = await text(`${dir}Validar-SubaruShogun.ps1`);
    const urls = [...new Set(script.match(/https?:\/\/[^\s"'`)]+/g) ?? [])]
      .filter((u) => !u.startsWith('https://localhost'));
    expect(urls.every((u) => u.startsWith('https://github.com/gustavo8000br/subarushogun_gi_twich_bot/releases/tag/v0.3.0-0d0b595-beta'))).toBe(true);
    expect(script).not.toMatch(/Invoke-WebRequest|Invoke-RestMethod|Start-BitsTransfer|WebClient|curl\.exe[^\n]*https?:\/\/(?!localhost)/);
    expect(script).not.toMatch(/ghp_|gho_|sk-[A-Za-z0-9]{20}/);
    expect(script).not.toMatch(/Get-Content[^\n]*\.env|Select-String[^\n]*\.env/);
  });

  it('asks for confirmation before destructive steps and masks secrets', async () => {
    const script = await text(`${dir}Validar-SubaruShogun.ps1`);
    for (const flag of ['-WhatIf', '-SemConfirmacao', '-Idioma', '-InstaladorPath', '-Parse', '-Somente']) expect(script).toContain(flag.slice(1));
    expect(script).toMatch(/function Confirmar/);
    expect(script).toMatch(/Pode-Rodar \(D '[^']*instala/);
    expect(script).toMatch(/Pode-Rodar \(D 'ATUALIZA/);
    expect(script).toMatch(/PERMANENTLY ERASES/);
    expect(script).toMatch(/\$w -cne \(T 'erase_word'\)/);
    expect(script).toContain('Set-StrictMode');
    expect(script).toMatch(/ErrorActionPreference = 'Stop'/);
    for (const mark of ['oauth:', 'authorization', 'client', 'secret', 'stream', 'password', 'Bearer'.toLowerCase()]) {
      expect(script.toLowerCase()).toContain(mark);
    }
    expect(script).toContain('Hide-Secrets');
    expect(script).toContain('Relatorio-SubaruShogun-');
    expect(script).toContain('Compress-Archive');
  });

  it('uses the same step IDs in the script, the roteiro and the kit', async () => {
    const script = await text(`${dir}Validar-SubaruShogun.ps1`);
    const scriptIds = [...script.matchAll(/Invoke-Passo '([A-Z]+-[0-9A-Za-z-]+)'/g)].map((m) => m[1]);
    expect(scriptIds).toEqual(IDS);
    const roteiro = await text(`${dir}LEIA-ME-ROTEIRO.md`);
    const txt = await text(`${dir}LEIA-ME-ROTEIRO.txt`);
    const kit = await text('docs/stories/OPS-15/windows-validation-kit.md');
    const kitPt = await text('docs/pt-BR/stories/OPS-15/windows-validation-kit.md');
    for (const id of IDS) {
      for (const [name, body] of [['roteiro.md', roteiro], ['roteiro.txt', txt], ['kit', kit], ['kit pt-BR', kitPt]]) {
        expect(body, `${id} in ${name}`).toContain(id);
      }
    }
    expect(roteiro).not.toMatch(/client[_ ]secret\s*[:=]/i);
  });
});
