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
    expect(qualityWorkflow).toContain('npm run validate:localization');
    expect(qualityWorkflow).toContain('actionlint -shellcheck= -ignore');
    expect(qualityWorkflow).toContain('v1.7.12');
    expect(qualityWorkflow).toContain('8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8');
    expect(qualityWorkflow).toContain('docker compose config --quiet');
    expect(qualityWorkflow).toContain('docker compose build bot');
  });

  it('keeps native installer smoke tests and uploads only the main Windows QA installer', () => {
    expect(qualityWorkflow).toContain("node-version: '24.20.0'");
    expect(qualityWorkflow).toContain('npm ci');
    expect(qualityWorkflow).toContain('uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10');
    expect(qualityWorkflow).toContain('uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020');
    expect(qualityWorkflow).toContain('uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069');
    expect(mainWorkflow).toContain('uses: docker/setup-qemu-action@99012661954931238ded8c8b007157a8430204e1 # v4.4.0');
    const quality = parseWorkflow(qualityWorkflow);
    const installerSteps = quality.jobs['installer-smoke'].steps;
    const upload = installerSteps.find((step) => step.name === 'Upload Windows installer for owner QA');
    expect(upload).toBeDefined();
    expect(upload.if).toContain("github.event_name == 'push'");
    expect(upload.if).toContain("github.ref == 'refs/heads/main'");
    expect(upload.if).toContain("matrix.platform == 'windows'");
    expect(upload.uses).toBe('actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f');
    expect(upload.with.name).toBe('fnd9-windows-installer-${{ github.sha }}');
    expect(upload.with.path).toBe('${{ runner.temp }}/queuebot-installer/subarushogun_twich_bot_setup.bat');
    expect(upload.with['if-no-files-found']).toBe('error');
    expect(upload.with['retention-days']).toBe(14);
    expect(installerSteps.indexOf(upload)).toBeGreaterThan(installerSteps.findIndex((step) => step.name === 'Launch the installer directly with isolated fake Docker'));
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
    const release = parseWorkflow(releaseWorkflow);
    expect(release.on.push.tags).toEqual(['v*']);
    expect(release.concurrency['cancel-in-progress']).toBe(false);
    expect(release.concurrency.queue).toBe('max');
    expect(release.permissions).toEqual({ contents: 'read' });
    expect(release.jobs['build-installers'].needs).toBe('resolve-release-image');
    expect(release.jobs['build-installers'].permissions).toBeUndefined();
    expect(release.jobs['publish-release'].needs).toBe('build-installers');
    expect(release.jobs['resolve-release-image'].permissions).toEqual({ contents: 'read', packages: 'read' });
    expect(release.jobs['publish-release'].permissions).toEqual({ actions: 'read', contents: 'write' });
    expect(releaseWorkflow).toContain('node apps/infra/scripts/create-release-notes.mjs');
    expect(releaseWorkflow).toContain('--image-tag "$RELEASE_IMAGE_REF"');
    expect(releaseWorkflow).toContain('actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333');
    expect(releaseWorkflow).toContain('gh release create');
    expect(releaseWorkflow).toContain('contents: write');
    expect(releaseWorkflow).toContain('git merge-base --is-ancestor');
    expect(releaseWorkflow).toContain('gh run list --workflow main-cd.yml --commit');
    expect(releaseWorkflow).toContain('release-assets/*');
    expect(releaseWorkflow).toContain('exactly one installer for each supported desktop OS');
    for (const extension of ['sh', 'command', 'bat']) expect(releaseWorkflow).toContain(`extension: ${extension}`);
    expect(releaseWorkflow).toContain('verify-tag');
    expect(releaseWorkflow).not.toContain('docker buildx build');
    expect(releaseWorkflow).not.toContain('packages: write');
    expect(releaseWorkflow).toContain('docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069');
    expect(releaseWorkflow).toContain('Resolve and verify the exact release image digest');
    expect(releaseWorkflow).toContain('--image-tag "$RELEASE_IMAGE_REF"');
    expect(release.jobs['resolve-release-image'].outputs.image_ref).toBe('${{ steps.resolve.outputs.image_ref }}');
    expect(releaseWorkflow).toContain('sha256sum "$manifest"');
  });

  it('verifies the pinned OpenGrep release signature before scanning', () => {
    const quality = parseWorkflow(qualityWorkflow);
    const steps = quality.jobs['static-analysis'].steps;
    const cosign = steps.find((step) => step.name === 'Install pinned Cosign with checksum verification');
    const opengrep = steps.find((step) => step.name === 'Install pinned OpenGrep');
    expect(cosign.uses).toBe('sigstore/cosign-installer@fb28c2b6339dcd94da6e4cbcbc5e888961f6f8c3');
    expect(cosign.with['cosign-release']).toBe('v2.5.0');
    expect(opengrep.run).toContain('opengrep/acf67b45c97c4b63626536605c77064ef536806d/install.sh');
    expect(opengrep.run).toContain('--verify-signatures');
    expect(opengrep.env.HOME).toBe('${{ runner.temp }}/opengrep-home');
    expect(opengrep.run).toContain('test ! -e "$HOME/.opengrep/cli/v1.30.0/opengrep"');
  });

  it('documents commit-scoped registry tags as aliases, not immutable content identities', () => {
    for (const path of ['docs/CI-CD.md', 'docs/pt-BR/CI-CD.md']) {
      const content = readFileSync(`${root}/${path}`, 'utf8');
      expect(content).toMatch(/commit-scoped|commit-specific|identificadas pelo commit|associadas ao commit|vinculadas ao commit/i);
      expect(content).toMatch(/tag.{0,80}(mutable|mutável)|tags.{0,80}(mutable|mutáveis)/i);
      expect(content).toMatch(/digest.{0,80}(content|conteúdo)/i);
      expect(content).toMatch(/100 pending|100 execuções pendentes/i);
      expect(content).toMatch(/cancels additional queued|cancela novas execuções enfileiradas/i);
      expect(content).toMatch(/embeds `<version-tag>@sha256:<manifest-digest>`|grava em cada instalador `<tag-da-versão>@sha256:<digest-do-manifest>`/i);
      expect(content).not.toMatch(/immutable source images|imagens imutáveis|immutable per-commit|tags imutáveis/i);
    }
  });
});
