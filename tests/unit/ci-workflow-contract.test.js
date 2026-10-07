import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const packageJson = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
const workflow = readFileSync(`${root}/.github/workflows/ci.yml`, 'utf8');
const releaseWorkflow = (() => {
  try { return readFileSync(`${root}/.github/workflows/release.yml`, 'utf8'); } catch { return ''; }
})();

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
    expect(workflow).toContain('uses: docker/setup-qemu-action@99012661954931238ded8c8b007157a8430204e1 # v4.4.0');
    expect(workflow).not.toContain('docker/setup-qemu-action@29109295f81e9208d7d86ff1c6c12d2833863392');
  });

  it('publishes version-tagged releases with bilingual changelog notes and one native installer per OS', () => {
    expect(releaseWorkflow).toMatch(/push:\s*\n\s*tags:\s*\n\s*- 'v\*'/);
    expect(releaseWorkflow).toContain('node apps/infra/scripts/create-release-notes.mjs');
    expect(releaseWorkflow).toContain('--image-tag "$RELEASE_TAG"');
    expect(releaseWorkflow).toContain('actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333');
    expect(releaseWorkflow).toContain('gh release create');
    expect(releaseWorkflow).toContain('contents: write');
    expect(releaseWorkflow).toContain('git merge-base --is-ancestor');
    expect(releaseWorkflow).toContain('gh run list --workflow ci.yml --commit');
    expect(releaseWorkflow).toContain('release-assets/*');
    expect(releaseWorkflow).toContain('exactly one installer for each supported desktop OS');
    for (const extension of ['sh', 'command', 'bat']) expect(releaseWorkflow).toContain(`extension: ${extension}`);
    expect(releaseWorkflow).toContain('verify-tag');
    expect(releaseWorkflow).not.toContain('ghcr.io');
  });
});
