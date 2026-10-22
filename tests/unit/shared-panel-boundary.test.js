import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const sourceExtensions = ['.jsx', '.mjs', '.js'];
const importPattern = /^(?:\s*(?:import|export)\b[^'"\n]*?\bfrom\s*|\s*\}\s*from\s*|\s*import\s+|[^'"\n]*\bawait import\(\s*|\s*vi\.mock\(\s*)['"](\.{1,2}\/[^'"]+)['"]/gm;

const SHARED_PANEL_MODULES = [
  'call-deadline-presentation.mjs',
  'command-catalog-view.mjs',
  'overlay-renderer.mjs',
  'overlay-widget-form.mjs',
  'panel-catalog.mjs',
  'panel-navigation.mjs',
  'queue-action-state.mjs',
  'queue-call-message.mjs',
  'queue-confirmation-copy.mjs',
  'queue-settings-version.mjs',
  'queue-sync-status.mjs',
  'reward-link-dialog.mjs',
  'setup-messages.mjs',
];

function listSources(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (name === 'node_modules' || name === '.next' || name === 'out') return [];
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return listSources(path);
    return sourceExtensions.some((extension) => name.endsWith(extension)) ? [path] : [];
  });
}

function toRepoPath(path) {
  return relative(root, path).split(sep).join('/');
}

function importsOf(file) {
  return [...readFileSync(file, 'utf8').matchAll(importPattern)].map((match) => ({
    specifier: match[1],
    target: toRepoPath(resolve(dirname(file), match[1])),
  }));
}

describe('apps/shared/panel module boundary (OPS-15 S-03)', () => {
  it('keeps the modules shared by Next and the vanilla panel under apps/shared/panel only', () => {
    for (const name of SHARED_PANEL_MODULES) {
      expect(existsSync(join(root, 'apps/shared/panel', name)), `apps/shared/panel/${name}`).toBe(true);
      expect(existsSync(join(root, 'apps/web', name)), `apps/web/${name} must not exist`).toBe(false);
    }
  });

  it('forbids Next, shared and API server code from importing apps/web', () => {
    const files = ['apps/frontend', 'apps/shared', 'apps/api/src'].flatMap((directory) => listSources(join(root, directory)));
    const offenders = files.flatMap((file) => importsOf(file)
      .filter(({ target }) => target.startsWith('apps/web/'))
      .map(({ specifier }) => `${toRepoPath(file)} -> ${specifier}`));
    expect(offenders).toEqual([]);
  });

  it('resolves every relative import of apps, the vanilla entrypoints and tests to an existing file', () => {
    const files = ['apps', 'tests'].flatMap((directory) => listSources(join(root, directory)));
    const unresolved = files.flatMap((file) => importsOf(file)
      .filter(({ target }) => !existsSync(join(root, target)))
      .map(({ specifier }) => `${toRepoPath(file)} -> ${specifier}`));
    expect(unresolved).toEqual([]);
  });

  it('points the vanilla panel and overlay entrypoints at the shared panel prefix', () => {
    const app = readFileSync(join(root, 'apps/web/app.js'), 'utf8');
    const overlay = readFileSync(join(root, 'apps/web/overlay.js'), 'utf8');
    for (const name of SHARED_PANEL_MODULES.filter((module) => !module.startsWith('overlay-renderer'))) {
      expect(app).toContain(`from '../shared/panel/${name}'`);
    }
    expect(overlay).toContain("from '../shared/panel/overlay-renderer.mjs'");
  });
});
