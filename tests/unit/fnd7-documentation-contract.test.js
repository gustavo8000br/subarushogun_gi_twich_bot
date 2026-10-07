import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8').toLowerCase();
const englishGuide = read('docs/USER_GUIDE-en_US.md');
const portugueseGuide = read('docs/MANUAL_DE_USUARIO-pt_BR.md');
const englishInstall = read('docs/INSTALLATION.md');
const portugueseInstall = read('docs/pt-BR/INSTALACAO.md');
const englishRoadmap = read('docs/ROADMAP.md');
const portugueseRoadmap = read('docs/pt-BR/ROADMAP.md');
const englishValidation = read('docs/stories/FND-7/validation.md');
const portugueseValidation = read('docs/pt-BR/stories/FND-7/validation.md');
const englishIntegration = read('docs/integrations.md');

describe('FND-7 operator documentation', () => {
  it('documents widget setup, one-time capability URLs, and verified OBS certificate guidance in both languages', () => {
    expect(englishGuide).toContain('browser source widgets');
    expect(englishGuide).toContain('one-time');
    expect(englishValidation).toContain('page permissions');
    expect(englishInstall).toContain('https');
    expect(portugueseGuide).toContain('browser source');
    expect(portugueseGuide).toContain('uma única vez');
    expect(portugueseValidation).toContain('page permissions');
    expect(portugueseInstall).toContain('https');
  });

  it('reports FND-7 completion and independent QA without overstating Twitch validation', () => {
    expect(englishRoadmap).toContain('fnd-7 — local obs widgets');
    expect(englishRoadmap).toContain('qa pass 9.2/10');
    expect(englishValidation).toContain('chrome manual acceptance');
    expect(portugueseRoadmap).toContain('fnd-7 — widgets locais para obs');
    expect(portugueseRoadmap).toContain('qa pass 9,2/10');
    expect(portugueseValidation).toContain('a aceitação manual no chrome');
    expect(englishValidation).toContain('no live twitch operation is claimed');
    expect(portugueseValidation).toContain('nenhuma operação twitch ao vivo é alegada');
  });

  it('records that Chrome link copy and local queue-source selection succeeded without Twitch sync', () => {
    expect(englishIntegration).toContain('successful one-time clipboard copy');
    expect(englishValidation).toContain('queue-source selection');
    expect(portugueseValidation).toContain('cópia única');
    expect(portugueseValidation).toContain('seleção da fonte de fila foi verificada com fixture temporária local no postgresql');
  });

  it('keeps the focused roadmap aligned with the merged FND-6 status in both languages', () => {
    expect(englishRoadmap).toMatch(/\| fnd-6[^\n]+\| complete;/);
    expect(portugueseRoadmap).toMatch(/\| fnd-6[^\n]+\| concluída;/);
  });

  it('uses absolute certificate paths in platform trust instructions and marks untested hosts', () => {
    expect(englishInstall).toContain('sudo install -dm644 "$pwd/.local/localhost-ca.crt"');
    expect(englishInstall).toContain("import-certificate -filepath (resolve-path '.\\.local\\localhost-ca.crt').path -certstorelocation cert:\\currentuser\\root");
    expect(englishInstall).toContain('security add-trusted-cert -r trustroot');
    expect(englishInstall).toContain('(resolve-path');
    expect(englishInstall).toContain('macos host behavior has not been validated');
    expect(portugueseInstall).toContain('sudo install -dm644 "$pwd/.local/localhost-ca.crt"');
    expect(portugueseInstall).toContain("import-certificate -filepath (resolve-path '.\\.local\\localhost-ca.crt').path -certstorelocation cert:\\currentuser\\root");
    expect(portugueseInstall).toContain('security add-trusted-cert -r trustroot');
    expect(portugueseInstall).toContain('(resolve-path');
    expect(portugueseInstall).toContain('o funcionamento no host macos ainda não foi validado');
  });

  it('keeps the macOS first-run step sequence aligned between both READMEs', () => {
    expect(englishInstall).toContain('### macos');
    expect(englishInstall).toContain('security add-trusted-cert');
    expect(portugueseInstall).toContain('### macos');
    expect(portugueseInstall).toContain('security add-trusted-cert');
  });
});
