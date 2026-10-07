import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

describe('bilingual README structure', () => {
  it.each([
    ['README.md', 120],
    ['README.pt-BR.md', 120],
  ])('%s stays within the concise landing-page limit', async (file, maxLines) => {
    const content = await read(file);

    expect(content.trim().split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
  });

  it.each([
    ['README.md', 'README.pt-BR.md', 'docs/INSTALLATION.md', 'docs/USER_GUIDE-en_US.md', 'docs/CONTRIBUTING.md', 'docs/ROADMAP.md'],
    ['README.pt-BR.md', 'README.md', 'docs/pt-BR/INSTALACAO.md', 'docs/MANUAL_DE_USUARIO-pt_BR.md', 'docs/pt-BR/CONTRIBUICAO.md', 'docs/pt-BR/ROADMAP.md'],
  ])('%s links to its language pair and focused guides', async (file, languagePair, ...guides) => {
    const content = await read(file);

    expect(content).toContain(languagePair);
    for (const guide of guides) expect(content).toContain(guide);
  });

  it.each(['README.md', 'README.pt-BR.md'])('%s has no broken local links', async (file) => {
    const content = await read(file);
    const targets = [...content.matchAll(/\]\(([^)]+)\)/g)]
      .map(([, target]) => target)
      .filter((target) => !/^(?:https?:|mailto:|#)/i.test(target))
      .map((target) => path.resolve(root, target.split('#')[0]));

    for (const target of targets) await expect(access(target)).resolves.toBeUndefined();
  });

  it('documents the README length and navigation standard in both contribution guides', async () => {
    const [english, portuguese] = await Promise.all([
      read('docs/CONTRIBUTING.md'),
      read('docs/pt-BR/CONTRIBUICAO.md'),
    ]);

    expect(english).toContain('120 lines');
    expect(portuguese).toContain('120 linhas');
    expect(english).toContain('README.pt-BR.md');
    expect(portuguese).toContain('README.md');
  });
});
