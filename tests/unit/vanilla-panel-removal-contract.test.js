import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// FT-42 (AC-42-1, AC-42-4, AC-42-6): the vanilla panel is gone and nothing refers to its path or to the old job names.
const root = fileURLToPath(new URL('../../', import.meta.url));
const REMOVED = ['apps', 'web'].join('/');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.local', 'legacy', 'docs', '.aiox', '.aiox-core', '.claude', '.codex', '.agents']);
// Tests that assert the ABSENCE of the removed path keep naming it; they are the only tests allowed to.
const ABSENCE_ASSERTING_TESTS = new Set([
  'tests/unit/vanilla-panel-removal-contract.test.js', 'tests/unit/shared-panel-boundary.test.js',
  'tests/unit/dockerfile-frontend-imports.test.js', 'tests/unit/first-party-catalog-location.test.js',
  'tests/integration/compose-contract.test.js', 'tests/unit/api-static-surface-contract.test.js',
  'tests/integration/panel-localization-contract.test.js', 'tests/unit/orphan-module-contract.test.js',
]);

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path, files); else files.push(path);
  }
  return files;
}
const repoFiles = ['apps', 'tests', '.github'].flatMap((directory) => walk(join(root, directory)))
  .map((path) => relative(root, path)).filter((path) => /\.(m?js|jsx|json|ya?ml|css|html|tsv)$/.test(path));
const configFiles = ['package.json', 'eslint.config.js', 'tsconfig.json', 'tsconfig.frontend.json', 'Dockerfile', 'compose.yaml', 'compose.build.yaml']
  .filter((file) => existsSync(join(root, file)));

describe('vanilla panel removal (FT-42)', () => {
  it('has no apps/web directory', () => {
    expect(existsSync(join(root, REMOVED))).toBe(false);
  });

  it('is not referenced by apps, tests (other than absence assertions), configuration or CI', () => {
    const offenders = [...repoFiles, ...configFiles]
      .filter((file) => !ABSENCE_ASSERTING_TESTS.has(file))
      .filter((file) => readFileSync(join(root, file), 'utf8').includes(REMOVED));
    expect(offenders).toEqual([]);
  });

  it('keeps no tsconfig.web.json and none of the old web job names (DP-5)', () => {
    const oldNames = [['tsconfig', 'web'].join('.'), ['lint', 'web'].join(':'), ['typecheck', 'web'].join(':'), 'infra, web]'];
    const offenders = [...repoFiles, ...configFiles].filter((file) => file !== 'tests/unit/vanilla-panel-removal-contract.test.js')
      .filter((file) => oldNames.some((name) => readFileSync(join(root, file), 'utf8').includes(name)));
    expect(offenders).toEqual([]);
    expect(existsSync(join(root, oldNames[0]))).toBe(false);
  });

  it('has the frontend jobs: scripts, tsconfig scope and CI matrix', () => {
    const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
    expect(scripts['lint:frontend']).toBe('eslint apps/shared/panel --max-warnings=0');
    expect(scripts['typecheck:frontend']).toBe('tsc --noEmit -p tsconfig.frontend.json');
    const tsconfig = JSON.parse(readFileSync(join(root, 'tsconfig.frontend.json'), 'utf8'));
    expect(tsconfig.include).toEqual(['apps/shared/panel/**/*.mjs']);
    expect(readFileSync(join(root, '.github/workflows/quality-gates.yml'), 'utf8')).toContain('app: [api, infra, frontend]');
  });

  it('keeps no web-route test or importer (the 8 cases left with wave 1)', () => {
    const offenders = repoFiles.filter((file) => /web-route/.test(file)
      || (!ABSENCE_ASSERTING_TESTS.has(file) && /web-route/.test(readFileSync(join(root, file), 'utf8'))));
    expect(offenders).toEqual([]);
  });
});
