import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// OPS-15 cutover wave 0: a module in the vanilla panel directory or a frontend script
// must have at least one consumer outside the test suite. Tests alone do not keep
// code alive; code that only a test imports is dead and must be removed with its test.
const root = join(import.meta.dirname, '../..');

const GUARDED_DIRECTORIES = ['apps/web', 'apps/frontend/scripts'];
const GUARDED_EXTENSIONS = ['.mjs', '.js'];
const CONSUMER_EXTENSIONS = ['.mjs', '.js', '.jsx', '.ts', '.tsx', '.html', '.json', '.yaml', '.yml'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.next', 'out']);

function toRepoPath(path) {
  return relative(root, path).split(sep).join('/');
}

function listFiles(directory, extensions) {
  return readdirSync(directory).flatMap((name) => {
    if (SKIPPED_DIRECTORIES.has(name)) return [];
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return listFiles(path, extensions);
    return extensions.some((extension) => name.endsWith(extension)) ? [path] : [];
  });
}

function guardedModules() {
  return GUARDED_DIRECTORIES.flatMap((directory) => readdirSync(join(root, directory))
    .filter((name) => GUARDED_EXTENSIONS.some((extension) => name.endsWith(extension)))
    .map((name) => join(root, directory, name))
    .filter((path) => statSync(path).isFile()));
}

function productionConsumers() {
  const workflows = join(root, '.github/workflows');
  const files = [
    ...listFiles(join(root, 'apps'), CONSUMER_EXTENSIONS),
    ...(existsSync(workflows) ? listFiles(workflows, ['.yml', '.yaml']) : []),
    ...readdirSync(root)
      .filter((name) => name === 'package.json' || name === 'Dockerfile' || /^compose.*\.ya?ml$/.test(name))
      .map((name) => join(root, name)),
  ];
  return files.map((path) => ({ path, source: readFileSync(path, 'utf8') }));
}

function referencesName(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\w.-])${escaped}(?![\\w-])`).test(source);
}

describe('orphan module contract (OPS-15 cutover wave 0)', () => {
  it('keeps no vanilla panel module or frontend script whose only consumer is a test', () => {
    const consumers = productionConsumers();
    const orphans = guardedModules()
      .filter((modulePath) => !consumers.some(({ path, source }) => path !== modulePath
        && referencesName(source, basename(modulePath))))
      .map(toRepoPath);
    expect(orphans).toEqual([]);
  });

  it('matches whole file names only, not longer names that contain them (matcher self-check)', () => {
    expect(referencesName("import { x } from './priority-labels.mjs';", 'priority-labels.mjs')).toBe(true);
    expect(referencesName('"start": "node apps/frontend/scripts/dev-server.mjs"', 'dev-server.mjs')).toBe(true);
    expect(referencesName("import './dev-server-state.mjs';", 'dev-server.mjs')).toBe(false);
    expect(referencesName("import './my-app.js';", 'app.js')).toBe(false);
  });
});
