import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const packageJson = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
const workflow = readFileSync(`${root}/.github/workflows/ci.yml`, 'utf8');

describe('GitHub Actions application CI contract', () => {
  it.each(['api', 'infra', 'web'])('provides independent lint and typecheck commands for %s', (app) => {
    expect(packageJson.scripts[`lint:${app}`]).toBe(`eslint apps/${app} --max-warnings=0`);
    expect(packageJson.scripts[`typecheck:${app}`]).toBe(`tsc --noEmit -p tsconfig.${app}.json`);
    expect(workflow).toContain('app: [api, infra, web]');
    expect(workflow).toContain(`npm run lint:\${{ matrix.app }}`);
    expect(workflow).toContain(`npm run typecheck:\${{ matrix.app }}`);
  });

  it('runs tests, local static analysis, version and Compose checks, then builds the Docker image', () => {
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run review:static');
    expect(workflow).toContain('npm run validate:version');
    expect(workflow).toContain('docker compose config --quiet');
    expect(workflow).toContain('docker compose build bot');
  });

  it('uses read-only permissions, Node 24.20.0 and pull-request validation for main', () => {
    expect(workflow).toContain('pull_request:');
    expect(workflow).toMatch(/branches:\s*\n\s*- main/);
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain("node-version: '24.20.0'");
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10');
    expect(workflow).toContain('uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020');
    expect(workflow).toContain('uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069');
  });
});
