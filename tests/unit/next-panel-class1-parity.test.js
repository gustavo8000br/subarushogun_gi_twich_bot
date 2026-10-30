import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../../apps/frontend/', import.meta.url);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    if (entry.name === 'node_modules' || entry.name === '.next') return [];
    const path = join(directory.pathname ?? directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(new URL(`${entry.name}/`, directory));
    return /\.(jsx|mjs|js)$/.test(entry.name) ? [path] : [];
  }));
  return files.flat();
}

describe('Next panel parity with vanilla class-1 contracts', () => {
  it('never uses browser-native confirmation prompts', async () => {
    const offenders = [];
    const files = await sourceFiles(new URL('features/', root));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      if (/\b(window\.)?confirm\s*\(/.test(await readFile(file, 'utf8'))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it.each(['queue-reward-resolution-dialog.jsx', 'queue-reward-settings-dialog.jsx'])('%s close and cancel controls cannot submit their form', async (name) => {
    const source = await readFile(new URL(`features/queues/${name}`, root), 'utf8');
    const buttons = source.match(/<button\b[^>]*>/g) ?? [];
    const dismissals = buttons.filter((tag) => /panel\.dialog\.(close|cancel)|setOpen\(false\)/.test(tag));
    expect(dismissals.length).toBeGreaterThan(0);
    for (const tag of dismissals) expect(tag).toContain('type="button"');
  });

  it('keeps hide/archive wording out of the shipped catalogs', async () => {
    for (const locale of ['en', 'es', 'pt-BR']) {
      const catalog = await readFile(new URL(`../../apps/shared/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8');
      expect(catalog).not.toMatch(/^panel\.queue\.(action|confirm)\.archive\t/m);
    }
  });
});
