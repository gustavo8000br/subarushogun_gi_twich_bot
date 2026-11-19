import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(`${root}${path}`, 'utf8');
const yaml = createRequire(import.meta.url)('js-yaml');

// Single source of the Node.js pin: `engines.node` in package.json. Every other place must match it,
// so the next bump is a one-line edit plus the mechanical replacement the failing test points at.
const pin = JSON.parse(read('package.json')).engines.node;

const workflowFiles = [
  ...execFileSync('git', ['ls-files', '.github/workflows/*.yml', 'apps/infra/test-owner/*.yml'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean),
];

const collectNodeVersions = (node, found = []) => {
  if (Array.isArray(node)) node.forEach((entry) => collectNodeVersions(entry, found));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'node-version') found.push(value);
      else collectNodeVersions(value, found);
    }
  }
  return found;
};

describe('Node.js pin consistency (single source: engines.node)', () => {
  it('is an exact semver version', () => {
    expect(pin).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('matches package-lock.json root engines', () => {
    expect(JSON.parse(read('package-lock.json')).packages[''].engines.node).toBe(pin);
  });

  it('matches .nvmrc', () => {
    expect(read('.nvmrc').trim()).toBe(pin);
  });

  it('matches both Dockerfile node base images', () => {
    const froms = read('Dockerfile').split('\n').filter((line) => line.startsWith('FROM node:'));
    expect(froms).toHaveLength(2);
    for (const line of froms) expect(line).toMatch(new RegExp(`^FROM node:${pin.replaceAll('.', '\\.')}-alpine3\\.24 AS `));
  });

  it('matches the Dev Container feature and post-create check', () => {
    const config = JSON.parse(read('.devcontainer/devcontainer.json'));
    expect(config.features['ghcr.io/devcontainers/features/node:2.1.1'].version).toBe(pin);
    expect(read('.devcontainer/post-create.sh')).toContain(`EXPECTED_NODE_VERSION="v${pin}"`);
  });

  it('matches the dev-preflight guard (constant and message)', () => {
    const source = read('apps/frontend/scripts/dev-preflight.mjs');
    expect(source).toContain(`const EXPECTED_NODE_VERSION = 'v${pin}';`);
    expect(source).toContain(`requires Node.js ${pin}.`);
  });

  it('matches every node-version in workflows (including the owner test installer model)', () => {
    expect(workflowFiles).toContain('apps/infra/test-owner/windows-owner-test-installer.yml');
    expect(workflowFiles.length).toBeGreaterThanOrEqual(6);
    let total = 0;
    for (const file of workflowFiles) {
      const versions = collectNodeVersions(yaml.load(read(file)));
      total += versions.length;
      for (const version of versions) expect({ file, version: String(version) }).toEqual({ file, version: pin });
    }
    expect(total).toBeGreaterThanOrEqual(13);
  });
});
