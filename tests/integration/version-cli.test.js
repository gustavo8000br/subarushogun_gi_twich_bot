import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const validateCli = join(projectRoot, 'apps/infra/scripts/validate-version.mjs');
const materializeCli = join(projectRoot, 'apps/infra/scripts/materialize-version.mjs');
const workflowPath = join(projectRoot, '.github/workflows/ci.yml');
const composePath = join(projectRoot, 'compose.yaml');
const dockerfilePath = join(projectRoot, 'Dockerfile');
const temporaryRoots = [];

async function createFixture({ withGit = false, withCommit = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'aiox-version-contract-'));
  temporaryRoots.push(root);
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'version-fixture', version: '0.1.0' }));
  await writeFile(join(root, '.release-stage'), 'alpha\n');
  await writeFile(join(root, 'VERSION'), 'v0.1.0-0000000-alpha\n');

  if (withGit) {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'version-test@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Version Contract Test'], { cwd: root });
    if (withCommit) {
      execFileSync('git', ['add', 'package.json', '.release-stage', 'VERSION'], { cwd: root });
      execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root });
    }
  }

  return root;
}

function runCli(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
  });
}

async function snapshotSources(root) {
  return Promise.all(['package.json', '.release-stage', 'VERSION'].map(async (name) => [
    name,
    await readFile(join(root, name), 'utf8'),
  ]));
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('version source and materialization CLIs', () => {
  it('materializes the exact committed identity into the CI image without changing checkout sources', async () => {
    const workflow = await readFile(workflowPath, 'utf8');
    const compose = await readFile(composePath, 'utf8');
    const dockerfile = await readFile(dockerfilePath, 'utf8');

    expect(workflow).toContain('apps/infra/scripts/materialize-version.mjs');
    expect(workflow).toContain('$RUNNER_TEMP/VERSION');
    expect(workflow).toContain('PRODUCT_VERSION');
    expect(compose).toContain('PRODUCT_VERSION: ${PRODUCT_VERSION:-}');
    expect(dockerfile).toContain('ARG PRODUCT_VERSION');
    expect(dockerfile).toContain("printf '%s\\n' \"$PRODUCT_VERSION\" > VERSION");
    expect(workflow).toContain('IMAGE_VERSION="$(docker compose run --rm --no-deps --entrypoint cat bot /app/VERSION)"');
  });

  it('validates source files without changing the checkout', async () => {
    const root = await createFixture();
    const before = await snapshotSources(root);
    const result = runCli(validateCli, ['--root', root], root);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('v0.1.0-0000000-alpha');
    expect(await snapshotSources(root)).toEqual(before);
  });

  it('materializes a marker into the artifact output when Git metadata is unavailable', async () => {
    const root = await createFixture();
    const artifactRoot = await mkdtemp(join(tmpdir(), 'aiox-version-artifact-'));
    temporaryRoots.push(artifactRoot);
    const output = join(artifactRoot, 'VERSION');
    const before = await snapshotSources(root);
    const result = runCli(materializeCli, ['--root', root, '--output', output], root);

    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(output, 'utf8')).toBe('v0.1.0-0000000-alpha\n');
    expect(await snapshotSources(root)).toEqual(before);
  });

  it('materializes the exact seven-character prefix of the source commit outside the checkout', async () => {
    const root = await createFixture({ withGit: true, withCommit: true });
    const artifactRoot = await mkdtemp(join(tmpdir(), 'aiox-version-artifact-'));
    temporaryRoots.push(artifactRoot);
    const output = join(artifactRoot, 'VERSION');
    const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const expected = `v0.1.0-${sourceSha.slice(0, 7)}-alpha\n`;
    const before = await snapshotSources(root);
    const result = runCli(materializeCli, ['--root', root, '--output', output], root);

    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(output, 'utf8')).toBe(expected);
    expect(await snapshotSources(root)).toEqual(before);
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })).toBe('');
  });

  it('fails instead of using the no-Git marker when a Git repository has no discoverable commit', async () => {
    const root = await createFixture({ withGit: true, withCommit: false });
    const artifactRoot = await mkdtemp(join(tmpdir(), 'aiox-version-artifact-'));
    temporaryRoots.push(artifactRoot);
    const output = join(artifactRoot, 'VERSION');
    const before = await snapshotSources(root);
    const result = runCli(materializeCli, ['--root', root, '--output', output], root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('commit');
    expect(await snapshotSources(root)).toEqual(before);
  });
});
