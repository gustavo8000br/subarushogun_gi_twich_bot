import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const packageJson = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
const workflow = readFileSync(`${root}/.github/workflows/ci.yml`, 'utf8');
const mainWorkflow = (() => { try { return readFileSync(`${root}/.github/workflows/main-cd.yml`, 'utf8'); } catch { return ''; } })();
const qualityWorkflow = (() => { try { return readFileSync(`${root}/.github/workflows/quality-gates.yml`, 'utf8'); } catch { return ''; } })();
const releaseWorkflow = (() => {
  try { return readFileSync(`${root}/.github/workflows/release.yml`, 'utf8'); } catch { return ''; }
})();
const parseWorkflow = (content) => yaml.load(content);

describe('GitHub Actions application CI contract', () => {
  it.each(['api', 'infra', 'web'])('provides independent lint and typecheck commands for %s', (app) => {
    expect(packageJson.scripts[`lint:${app}`]).toBe(`eslint apps/${app} --max-warnings=0`);
    expect(packageJson.scripts[`typecheck:${app}`]).toBe(`tsc --noEmit -p tsconfig.${app}.json`);
    expect(qualityWorkflow).toContain('app: [api, infra, web]');
    expect(qualityWorkflow).toContain(`npm run lint:\${{ matrix.app }}`);
    expect(qualityWorkflow).toContain(`npm run typecheck:\${{ matrix.app }}`);
  });

  it('runs shared quality gates on pull requests without defining image publication', () => {
    const ci = parseWorkflow(workflow);
    expect(Object.keys(ci.on)).toEqual(['pull_request', 'workflow_dispatch']);
    expect(ci.on.pull_request.branches).toEqual(['main']);
    expect(ci.jobs['quality-gates'].uses).toBe('./.github/workflows/quality-gates.yml');
    expect(ci.jobs['quality-gates'].name).toBe('CI quality gates');
    expect(ci.jobs['container-publish']).toBeUndefined();
    expect(workflow).not.toContain('packages: write');
  });

  it('exposes a stable aggregate check that fails when any required quality job fails or is canceled', () => {
    const quality = parseWorkflow(qualityWorkflow);
    expect(quality.on.workflow_call).toBeDefined();
    expect(quality.jobs['quality-gate'].if).toContain('always()');
    expect(quality.jobs['quality-gate'].needs).toEqual([
      'app-quality', 'lint-tests', 'installer-smoke', 'tests', 'static-analysis', 'container-build',
    ]);
    expect(qualityWorkflow).toContain('needs.app-quality.result');
    expect(qualityWorkflow).toContain("needs['installer-smoke'].result");
    expect(qualityWorkflow).toContain("needs['container-build'].result");
    expect(qualityWorkflow).toContain('if [[ "$result" != "success" ]]');
    expect(qualityWorkflow).toContain('npm test');
    expect(qualityWorkflow).toContain('npm run review:static');
    expect(qualityWorkflow).toContain('npm run validate:version');
    expect(qualityWorkflow).toContain('docker compose config --quiet');
    expect(qualityWorkflow).toContain('docker compose build bot');
  });

  it('keeps pinned actions and native installer smoke tests without uploading unused CI artifacts', () => {
    expect(qualityWorkflow).toContain("node-version: '24.20.0'");
    expect(qualityWorkflow).toContain('npm ci');
    expect(qualityWorkflow).toContain('uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10');
    expect(qualityWorkflow).toContain('uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020');
    expect(qualityWorkflow).toContain('uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069');
    expect(mainWorkflow).toContain('uses: docker/setup-qemu-action@99012661954931238ded8c8b007157a8430204e1 # v4.4.0');
    expect(qualityWorkflow).not.toContain('actions/upload-artifact');
    expect(qualityWorkflow).not.toContain('docker/setup-qemu-action@29109295f81e9208d7d86ff1c6c12d2833863392');
    expect(qualityWorkflow).toContain('Native ${{ matrix.platform }} installer smoke');
  });

  it('publishes only on main after the shared gate, with a non-cancelable serialized publish job', () => {
    const main = parseWorkflow(mainWorkflow);
    const publish = main.jobs['publish-image'];
    expect(Object.keys(main.on)).toEqual(['push']);
    expect(main.on.push.branches).toEqual(['main']);
    expect(main.jobs['quality-gates'].uses).toBe('./.github/workflows/quality-gates.yml');
    expect(publish.needs).toEqual(['quality-gates']);
    expect(publish.permissions).toEqual({ contents: 'read', packages: 'write' });
    expect(publish.concurrency['cancel-in-progress']).toBe(false);
    expect(mainWorkflow).toContain('CURRENT_MAIN_SHA');
    expect(mainWorkflow).toContain("steps.source-current.outputs.current == 'true'");
  });

  it('publishes version-tagged releases with bilingual changelog notes and one native installer per OS', () => {
    expect(releaseWorkflow).toMatch(/push:\s*\n\s*tags:\s*\n\s*- 'v\*'/);
    expect(releaseWorkflow).toContain('node apps/infra/scripts/create-release-notes.mjs');
    expect(releaseWorkflow).toContain('--image-tag "$RELEASE_TAG"');
    expect(releaseWorkflow).toContain('actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333');
    expect(releaseWorkflow).toContain('gh release create');
    expect(releaseWorkflow).toContain('contents: write');
    expect(releaseWorkflow).toContain('git merge-base --is-ancestor');
    expect(releaseWorkflow).toContain('gh run list --workflow main-cd.yml --commit');
    expect(releaseWorkflow).toContain('release-assets/*');
    expect(releaseWorkflow).toContain('exactly one installer for each supported desktop OS');
    for (const extension of ['sh', 'command', 'bat']) expect(releaseWorkflow).toContain(`extension: ${extension}`);
    expect(releaseWorkflow).toContain('verify-tag');
    expect(releaseWorkflow).not.toContain('ghcr.io');
  });
});
