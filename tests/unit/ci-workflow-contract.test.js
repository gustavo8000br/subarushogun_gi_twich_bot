import { readFileSync, readdirSync } from 'node:fs';
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
  it.each(['api', 'infra', 'frontend'])('provides independent lint and typecheck commands for %s', (app) => {
    // FT-42 (DP-5): the frontend jobs cover the modules shared with Next under apps/shared/panel (JSX stays out until TS-16).
    const lintTargets = app === 'frontend' ? 'apps/shared/panel' : `apps/${app}`;
    expect(packageJson.scripts[`lint:${app}`]).toBe(`eslint ${lintTargets} --max-warnings=0`);
    expect(packageJson.scripts[`typecheck:${app}`]).toBe(`tsc --noEmit -p tsconfig.${app}.json`);
    expect(qualityWorkflow).toContain('app: [api, infra, frontend]');
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
    expect(qualityWorkflow).toContain('actionlint -ignore');
    expect(qualityWorkflow).toContain('v1.7.12');
    expect(qualityWorkflow).toContain('8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8');
    expect(qualityWorkflow).toContain('docker compose -f compose.yaml -f compose.build.yaml config --quiet');
    expect(qualityWorkflow).toContain('docker compose -f compose.yaml -f compose.build.yaml build bot');
    expect(qualityWorkflow).toContain('docker compose -f compose.yaml -f compose.build.yaml run --rm --no-deps --entrypoint cat bot /app/VERSION');
  });

  it('tests installers natively and uploads the immutable beta Windows installer after image publication', () => {
    expect(qualityWorkflow).toContain("node-version: '24.22.3'");
    expect(qualityWorkflow).toContain('npm ci');
    expect(qualityWorkflow).toContain('uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10');
    expect(qualityWorkflow).toContain('uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020');
    expect(qualityWorkflow).toContain('uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069');
    expect(mainWorkflow).toContain('uses: docker/setup-qemu-action@99012661954931238ded8c8b007157a8430204e1 # v4.4.0');
    const quality = parseWorkflow(qualityWorkflow);
    const installerSteps = quality.jobs['installer-smoke'].steps;
    const installerVersion = installerSteps.find((step) => step.name === 'Materialize product version for the installer');
    expect(installerVersion.run).toContain('materialize-version.mjs');
    expect(installerVersion.run).toContain('INSTALLER_VERSION');
    const packageInstaller = installerSteps.find((step) => step.name === 'Package one installer file for this operating system').run;
    expect(packageInstaller).toContain('--image-tag "${{ steps.installer-version.outputs.version }}"');
    expect(packageInstaller).toContain('--product-version "${{ steps.installer-version.outputs.version }}"');
    const nativeSmoke = installerSteps.find((step) => step.name === 'Launch the installer directly with isolated fake Docker');
    expect(nativeSmoke.env.QUEUEBOT_EXPECTED_IMAGE_TAG).toBe('${{ steps.installer-version.outputs.version }}');
    expect(nativeSmoke.env.QUEUEBOT_EXPECTED_PRODUCT_VERSION).toBe('${{ steps.installer-version.outputs.version }}');
    expect(installerSteps.some((step) => step.name === 'Upload Windows installer for owner QA')).toBe(false);
    expect(qualityWorkflow).toContain('Native ${{ matrix.platform }} installer smoke');
    const betaInstaller = parseWorkflow(mainWorkflow).jobs['beta-windows-installer'];
    const upload = betaInstaller.steps.find((step) => step.name === 'Upload beta installer for owner QA');
    expect(upload).toBeDefined();
    expect(upload.uses).toBe('actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f');
    expect(upload.with.name).toBe('beta-windows-installer-${{ needs.publish-image.outputs.source_sha }}');
    expect(upload.with.path).toBe('${{ runner.temp }}/queuebot-beta-installer/subarushogun_twich_bot_setup.bat');
    expect(upload.with['if-no-files-found']).toBe('error');
    expect(upload.with['retention-days']).toBe(14);
    expect(betaInstaller.steps.indexOf(upload)).toBeGreaterThan(betaInstaller.steps.findIndex((step) => step.name === 'Launch beta installer directly with isolated fake Docker'));
    expect(qualityWorkflow).not.toContain('docker/setup-qemu-action@29109295f81e9208d7d86ff1c6c12d2833863392');
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
    expect(publish.outputs.stage).toBe('${{ steps.source.outputs.stage }}');
    expect(publish.outputs.source_sha).toBe('${{ steps.source.outputs.source_sha }}');
    expect(publish.outputs.version).toBe('${{ steps.source.outputs.version }}');
    expect(publish.outputs.image_ref).toBe('${{ steps.manifest.outputs.image_ref }}');
    const manifestStep = publish.steps.find((step) => step.name === 'Publish and verify versioned multi-platform manifest');
    expect(manifestStep.run).toContain('sha256sum');
    expect(manifestStep.run).toContain("printf 'image_ref=%s@%s\\n' \"$PRODUCT_VERSION\" \"$digest\"");
    const betaInstaller = main.jobs['beta-windows-installer'];
    expect(betaInstaller.needs).toEqual(['publish-image']);
    expect(betaInstaller.if).toBe("needs.publish-image.outputs.stage == 'beta'");
    expect(betaInstaller['runs-on']).toBe('windows-latest');
    const betaSteps = betaInstaller.steps;
    expect(betaSteps.find((step) => step.name === 'Package installer pinned to verified beta image digest').run).toContain('--image-tag "$env:BETA_IMAGE_REF"');
    expect(betaSteps.find((step) => step.name === 'Package installer pinned to verified beta image digest').run).toContain('--product-version "$env:BETA_PRODUCT_VERSION"');
    expect(betaSteps.find((step) => step.name === 'Launch beta installer directly with isolated fake Docker').env.QUEUEBOT_EXPECTED_IMAGE_TAG).toBe('${{ needs.publish-image.outputs.image_ref }}');
    const betaUpload = betaSteps.find((step) => step.name === 'Upload beta installer for owner QA');
    expect(betaUpload.with.name).toBe('beta-windows-installer-${{ needs.publish-image.outputs.source_sha }}');
    expect(betaUpload.with['retention-days']).toBe(14);
    expect(main.jobs['beta-windows-installer'].needs).toContain('publish-image');
  });

  it('creates the release tag on demand and publishes only on manual dispatch in every stage', () => {
    const release = parseWorkflow(releaseWorkflow);
    expect(Object.keys(release.on)).toEqual(['workflow_dispatch']);
    expect(release.on.workflow_dispatch).toEqual({});
    expect(release.concurrency['cancel-in-progress']).toBe(false);
    expect(release.concurrency.queue).toBe('max');
    expect(release.permissions).toEqual({ contents: 'read' });
    expect(release.jobs['prepare-release'].if).not.toContain('push');
    expect(release.jobs['prepare-release'].if).toContain("github.actor == 'gustavo8000br'");
    expect(release.jobs['prepare-release'].if).toContain("github.triggering_actor == 'gustavo8000br'");
    expect(release.jobs['prepare-release'].if).toContain("github.ref == 'refs/heads/main'");
    expect(release.jobs['prepare-release'].outputs.release_tag).toBe('${{ steps.source.outputs.release_tag }}');
    expect(release.jobs['verify-public-image'].needs).toEqual(['prepare-release']);
    expect(release.jobs['verify-public-image'].permissions).toEqual({});
    expect(release.jobs['resolve-release-image'].needs).toEqual(['prepare-release', 'verify-public-image']);
    expect(release.jobs['build-installers'].needs).toEqual(['prepare-release', 'resolve-release-image']);
    expect(release.jobs['build-installers'].permissions).toBeUndefined();
    expect(release.jobs['publish-release'].needs).toEqual(['prepare-release', 'resolve-release-image', 'build-installers']);
    expect(release.jobs['resolve-release-image'].if).toContain("needs.prepare-release.outputs.should_release == 'true'");
    expect(release.jobs['publish-release'].permissions).toEqual({ actions: 'read', contents: 'write' });
    expect(releaseWorkflow).toContain('node apps/infra/scripts/create-release-notes.mjs');
    expect(releaseWorkflow).toContain('--image-tag "$RELEASE_IMAGE_REF"');
    expect(releaseWorkflow).toContain('actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333');
    expect(releaseWorkflow).toContain('gh release create');
    expect(releaseWorkflow).toContain('alpha|beta|rc) release_args+=(--prerelease --latest=false)');
    expect(releaseWorkflow).toContain('stable) release_args+=(--latest)');
    expect(releaseWorkflow).toContain('release_tag="v${base_version}-${short_sha}-${stage}"');
    expect(releaseWorkflow).not.toContain('GITHUB_EVENT_NAME');
    expect(releaseWorkflow).toContain('docker pull --platform linux/amd64 "$IMAGE"');
    expect(releaseWorkflow).toContain('Create the version tag from the verified main commit');
    expect(releaseWorkflow).toContain('git tag -a "$RELEASE_TAG" "$SOURCE_SHA"');
    expect(releaseWorkflow).toContain('push origin "refs/tags/$RELEASE_TAG"');
    expect(releaseWorkflow).not.toContain('inputs.release_tag');
    expect(releaseWorkflow).not.toContain('docker login ghcr.io');
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
    expect(releaseWorkflow).toContain('Resolve and verify the exact public release image digest');
    expect(releaseWorkflow).toContain('--image-tag "$RELEASE_IMAGE_REF"');
    expect(release.jobs['resolve-release-image'].outputs.image_ref).toBe('${{ steps.resolve.outputs.image_ref }}');
    expect(releaseWorkflow).toContain('sha256sum "$manifest"');
    const publishSteps = release.jobs['publish-release'].steps;
    expect(publishSteps.findIndex((step) => step.name === 'Create the version tag from the verified main commit'))
      .toBeGreaterThan(publishSteps.findIndex((step) => step.name === 'Check exactly one installer for each supported desktop OS'));
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

describe('Windows runner workflow contract (C1 / LA-25)', () => {
  const workflowFiles = ['ci.yml', 'quality-gates.yml', 'main-cd.yml', 'release.yml'];
  const isWindowsJob = (job) => {
    const runsOn = String(job['runs-on'] ?? '');
    if (/windows/i.test(runsOn)) return true;
    return /matrix\.runner/.test(runsOn) && (job.strategy?.matrix?.include ?? []).some((entry) => /windows/i.test(entry.runner));
  };
  // Bash-only expansion: $UPPER_CASE variables, ${VAR}, $(command), `set -e`, `[[ ... ]]`, `|| true`-style bash idioms.
  const bashStyle = /(?<![\w$])\$(?:\{[A-Za-z_]|\(|[A-Z_][A-Z0-9_]*\b)|\bset -[euo]|\[\[ |printf '[^']*%s/;
  const powershellStyle = /\$env:[A-Za-z_]|\$LASTEXITCODE|Write-Host|Set-Content|\bGet-[A-Z]/;
  const windowsSteps = workflowFiles.flatMap((file) => {
    const parsed = parseWorkflow(readFileSync(`${root}/.github/workflows/${file}`, 'utf8'));
    return Object.entries(parsed.jobs ?? {}).filter(([, job]) => job.steps && isWindowsJob(job))
      .flatMap(([jobName, job]) => job.steps.filter((step) => step.run).map((step) => ({ file, jobName, step })));
  });

  it('finds Windows jobs in the quality gates, Main CD and the release workflow', () => {
    const jobs = new Set(windowsSteps.map(({ file, jobName }) => `${file}:${jobName}`));
    expect(jobs).toContain('quality-gates.yml:installer-smoke');
    expect(jobs).toContain('quality-gates.yml:windows-quality');
    expect(jobs).toContain('main-cd.yml:beta-windows-installer');
    expect([...jobs].some((job) => job.startsWith('release.yml:'))).toBe(true);
  });

  it('never runs bash-style expansion in a step that would use the Windows default shell (pwsh)', () => {
    for (const { file, jobName, step } of windowsSteps) {
      const where = `${file}:${jobName}:${step.name}`;
      const withoutExpressions = step.run.replace(/\$\{\{[\s\S]*?\}\}/g, 'EXPR');
      if (step.shell === 'bash') {
        expect(powershellStyle.test(withoutExpressions), `${where} declares bash but uses PowerShell syntax`).toBe(false);
      } else {
        expect(bashStyle.test(withoutExpressions), `${where} uses bash syntax without shell: bash`).toBe(false);
        if (step.shell !== undefined) expect(['pwsh', 'powershell', 'cmd'], `${where} shell`).toContain(step.shell);
      }
    }
  });

  it('declares the shell explicitly on every run step of the Windows quality job', () => {
    const steps = windowsSteps.filter(({ file, jobName }) => file === 'quality-gates.yml' && jobName === 'windows-quality');
    expect(steps.length).toBeGreaterThanOrEqual(3);
    for (const { step } of steps) expect(['bash', 'pwsh'], `${step.name} needs an explicit shell`).toContain(step.shell);
  });

  it('runs install, typecheck and the Windows contract tests on windows-latest with the pinned Node.js', () => {
    const job = parseWorkflow(qualityWorkflow).jobs['windows-quality'];
    expect(job['runs-on']).toBe('windows-latest');
    expect(job['timeout-minutes']).toBeLessThanOrEqual(20);
    const setup = job.steps.find((step) => step.uses?.startsWith('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'));
    expect(setup.with['node-version']).toBe('24.22.3');
    expect(job.steps.find((step) => step.uses?.startsWith('actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10'))).toBeDefined();
    const commands = job.steps.filter((step) => step.run).map((step) => step.run.trim());
    expect(commands).toContain('npm ci');
    expect(commands).toContain('npm run typecheck');
    const tests = commands.find((command) => command.startsWith('npx vitest run'));
    expect(tests).toContain('tests/unit/windows-native-contract.test.js');
    expect(tests).toContain('tests/unit/windows-installer-contract.test.js');
  });

  it('keeps the Windows quality job out of the required aggregate until a real Windows run proves it stable', () => {
    const quality = parseWorkflow(qualityWorkflow);
    expect(quality.jobs['quality-gate'].needs).not.toContain('windows-quality');
    expect(quality.jobs['windows-quality'].needs).toBeUndefined();
  });

  it('keeps the native installer smoke covering install, update, health-free start and both uninstall policies on Windows', () => {
    const smoke = readFileSync(`${root}/tests/platform/installer-native.mjs`, 'utf8');
    for (const fragment of ["'--silent update'", "'--silent uninstall --keep-data'", "'--silent uninstall --erase-data --confirm-erase'", 'volumes and data preserved', 'down --volumes --remove-orphans']) {
      expect(smoke).toContain(fragment);
    }
  });
});

describe('CI hardening contract (zizmor artipacked, Dependabot, ShellCheck, P-02)', () => {
  const workflowDir = `${root}/.github/workflows`;
  const workflowFiles = readdirSync(workflowDir).filter((name) => name.endsWith('.yml'));
  const checkoutSteps = workflowFiles.flatMap((name) => {
    const parsed = parseWorkflow(readFileSync(`${workflowDir}/${name}`, 'utf8'));
    return Object.entries(parsed.jobs ?? {}).flatMap(([jobId, job]) =>
      (job.steps ?? []).filter((step) => step.uses?.startsWith('actions/checkout@')).map((step) => ({ name, jobId, step })));
  });

  it('finds the checkout steps this contract protects', () => {
    expect(checkoutSteps.length).toBeGreaterThanOrEqual(12);
  });

  it.each(checkoutSteps.map((entry) => [`${entry.name}:${entry.jobId}`, entry.step]))(
    'does not persist the GITHUB_TOKEN after checkout in %s',
    (_label, step) => {
      expect(step.with?.['persist-credentials']).toBe(false);
    },
  );

  it('runs actionlint with ShellCheck enabled so run: scripts are linted', () => {
    expect(qualityWorkflow).toContain('actionlint -ignore');
    expect(qualityWorkflow).not.toMatch(/actionlint\s+-shellcheck=/);
  });

  it('configures Dependabot weekly, grouped and capped for github-actions, npm, docker and docker-compose', () => {
    const config = yaml.load(readFileSync(`${root}/.github/dependabot.yml`, 'utf8'));
    expect(config.version).toBe(2);
    const byEcosystem = Object.fromEntries(config.updates.map((update) => [update['package-ecosystem'], update]));
    expect(Object.keys(byEcosystem).sort()).toEqual(['docker', 'docker-compose', 'github-actions', 'npm']);
    for (const update of Object.values(byEcosystem)) {
      expect(update.directory).toBe('/');
      expect(update.schedule.interval).toBe('weekly');
      expect(update['open-pull-requests-limit']).toBeLessThanOrEqual(3);
      expect(Object.keys(update.groups ?? {}).length).toBeGreaterThan(0);
    }
    expect(byEcosystem.npm.groups['npm-minor-patch']['update-types'].sort()).toEqual(['minor', 'patch']);
  });

  it('lints tests/**/*.mjs and tests/**/*.jsx with ESLint (P-02)', () => {
    const eslintConfig = readFileSync(`${root}/eslint.config.js`, 'utf8');
    const baseFiles = eslintConfig.match(/^\s+files: \[('apps\/\*\*[^\]]*)\],$/m)?.[1] ?? '';
    expect(baseFiles).toContain("'tests/**/*.js'");
    expect(baseFiles).toContain("'tests/**/*.mjs'");
    expect(baseFiles).toContain("'tests/**/*.jsx'");
  });
});
