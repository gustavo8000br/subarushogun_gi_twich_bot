import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const english = readFileSync(new URL('../../README.md', import.meta.url), 'utf8').toLowerCase();
const portuguese = readFileSync(new URL('../../README.pt-BR.md', import.meta.url), 'utf8').toLowerCase();

describe('FND-7 operator documentation', () => {
  it('documents widget setup, one-time capability URLs, and verified OBS certificate guidance in both languages', () => {
    expect(english).toContain('obs browser source');
    expect(english).toContain('one-time');
    expect(english).toContain('page permissions');
    expect(english).toContain('https');
    expect(portuguese).toContain('fonte do navegador');
    expect(portuguese).toContain('uso único');
    expect(portuguese).toContain('page permissions');
    expect(portuguese).toContain('https');
  });

  it('reports FND-7 completion and independent QA without overstating Twitch validation', () => {
    expect(english).toContain('fnd-2 through fnd-7 are complete; fnd-7 passed independent qa at 9.2/10');
    expect(english).toContain('manual acceptance');
    expect(portuguese).toContain('fnd-2 a fnd-7 estão concluídas; a fnd-7 passou no qa independente com 9,2/10');
    expect(portuguese).toContain('após confiar no certificado local atual, a aceitação manual no chrome confirmou');
    expect(english).toContain('no live twitch reward or point write has been verified');
    expect(portuguese).toContain('nenhuma escrita de pontos/recompensas twitch foi verificada');
  });

  it('records that Chrome link copy and local queue-source selection succeeded without Twitch sync', () => {
    expect(english).toContain('successful one-time clipboard copy');
    expect(english).toContain('queue-source selection');
    expect(portuguese).toContain('cópia bem-sucedida do link de uso único');
    expect(portuguese).toContain('seleção da fonte de fila com fixture descartável local no postgresql');
  });

  it('keeps the README roadmap aligned with the merged FND-6 status in both languages', () => {
    expect(english).toMatch(/\| fnd-6 \|[^\n]+\| complete;/);
    expect(portuguese).toMatch(/\| fnd-6 \|[^\n]+\| concluída;/);
  });

  it('uses absolute certificate paths in platform trust instructions and marks untested hosts', () => {
    expect(english).toContain('sudo install -dm644 "$pwd/.local/localhost-ca.crt"');
    expect(english).toContain("import-certificate -filepath (resolve-path '.\\.local\\localhost-ca.crt').path -certstorelocation cert:\\currentuser\\root");
    expect(english).toContain('security add-trusted-cert -r trustroot');
    expect(english).toContain('(resolve-path');
    expect(english).toContain('macos has not yet been validated');
    expect(portuguese).toContain('sudo install -dm644 "$pwd/.local/localhost-ca.crt"');
    expect(portuguese).toContain("import-certificate -filepath (resolve-path '.\\.local\\localhost-ca.crt').path -certstorelocation cert:\\currentuser\\root");
    expect(portuguese).toContain('security add-trusted-cert -r trustroot');
    expect(portuguese).toContain('(resolve-path');
    expect(portuguese).toContain('macos ainda não foi validado');
  });

  it('keeps the macOS first-run step sequence aligned between both READMEs', () => {
    expect(english).toContain('\n5. trust the generated local ca in the macos login keychain');
    expect(portuguese).toContain('\n5. confie a ca local gerada no chaveiro de início de sessão do macos');
  });
});
