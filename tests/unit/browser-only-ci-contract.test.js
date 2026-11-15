import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const packageJson = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
const manifest = JSON.parse(readFileSync(`${root}/tests/e2e/browser-only-manifest.json`, 'utf8'));
const workflowText = readFileSync(`${root}/.github/workflows/browser-only.yml`, 'utf8');
const workflow = yaml.load(workflowText);
const onDisk = readdirSync(`${root}/tests/e2e`).filter((name) => name.endsWith('-browser-only.mjs')).sort();
const covered = manifest.covered.map((entry) => entry.file);
const excluded = manifest.excluded.map((entry) => entry.file);

describe('browser-only scripts run in CI (D-13)', () => {
  it('lists every *-browser-only script in the covered or the excluded list, and nothing else', () => {
    expect([...covered, ...excluded].sort()).toEqual(onDisk);
    expect(new Set([...covered, ...excluded]).size).toBe(covered.length + excluded.length);
  });

  it('maps each covered script to the npm script that runs that exact file', () => {
    for (const { file, npm } of manifest.covered) {
      expect(packageJson.scripts[npm], npm).toBe(`node tests/e2e/${file}`);
    }
  });

  it('requires a written reason for each exclusion', () => {
    for (const entry of manifest.excluded) expect(entry.reason?.trim().length, entry.file).toBeGreaterThan(20);
  });

  it('runs the manifest on pull requests and manual dispatch with read-only permissions and pinned actions', () => {
    expect(Object.keys(workflow.on)).toEqual(['pull_request', 'workflow_dispatch']);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    const steps = workflow.jobs['browser-only'].steps;
    for (const step of steps.filter((candidate) => candidate.uses)) expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
    expect(workflowText).toContain('playwright-core install --with-deps chrome');
    expect(workflowText).toContain('npm run test:e2e:browser-only:ci');
    expect(workflowText).not.toContain('secrets.');
    expect(workflowText).not.toContain('docker');
    expect(packageJson.scripts['test:e2e:browser-only:ci']).toBe('node tests/e2e/run-browser-scripts.mjs');
    expect(existsSync(`${root}/tests/e2e/run-browser-scripts.mjs`)).toBe(true);
  });
});
