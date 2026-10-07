import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { load } from 'js-yaml';

const root = new URL('../../', import.meta.url);
const packager = new URL('../../apps/infra/scripts/package-installer.mjs', import.meta.url);

async function packageFor(platform, output, imageTag) {
  const args = [packager.pathname, '--platform', platform, '--output', output];
  if (imageTag) args.push('--image-tag', imageTag);
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('single-file lifecycle installer', () => {
  it('exits with a clear message instead of looping when Linux starts without an interactive input stream', async () => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-no-stdin-'));
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      const artifactPath = join(output, 'subarushogun_twich_bot_setup.sh');
      const result = spawnSync('sh', [artifactPath], { input: '', encoding: 'utf8', timeout: 1500, maxBuffer: 1024 });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain('terminal interativo');
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });

  it.each([
    ['linux', 'subarushogun_twich_bot_setup.sh'],
    ['macos', 'subarushogun_twich_bot_setup.command'],
    ['windows', 'subarushogun_twich_bot_setup.bat'],
  ])('packages exactly one directly launchable artifact for %s', async (platform, expectedName) => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-'));
    try {
      const result = await packageFor(platform, output);
      expect(result.status, result.stderr).toBe(0);
      expect(await readdir(output)).toEqual([expectedName]);
      const artifact = await readFile(join(output, expectedName), 'utf8');
      expect(artifact).toContain('Install / Start');
      expect(artifact).toContain('Update');
      expect(artifact).toContain('Uninstall');
      expect(artifact).toContain('Erase data and install cleanly');
      expect(artifact).toContain('Docker');
      expect(artifact).toContain('APAGAR');
      expect(artifact).toContain('DELETE');
      expect(artifact).toContain('ELIMINAR');
      if (platform === 'windows') {
        expect(artifact).toContain(':payload');
        expect(artifact).toContain(':endpayload');
        const launchLine = artifact.split(/\r?\n/).find((line) => line.startsWith('powershell.exe'));
        expect(launchLine.length).toBeLessThan(8191);
        expect(artifact).toContain('postgres_data');
        expect(artifact).toContain('operational_secrets');
      } else {
        const encodedCompose = artifact.match(/COMPOSE_B64='([^']+)'/)?.[1];
        const composeText = Buffer.from(encodedCompose ?? '', 'base64').toString('utf8');
        expect(composeText).toContain('postgres_data');
        expect(composeText).toContain('operational_secrets');
        const compose = load(composeText);
        expect(Object.values(compose.services).every((service) => !service.build)).toBe(true);
        expect(compose.services.bot.image).toContain('${IMAGE_TAG:-main}');
        expect(composeText).not.toContain('./apps/');
      }
      expect(artifact).not.toContain('git clone');
      if (platform !== 'windows') {
        const info = await import('node:fs/promises').then(({ stat }) => stat(join(output, expectedName)));
        expect(info.mode & 0o111).not.toBe(0);
      }
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });

  it('updates a preserved installation to the release image and retains its old tag if the pull fails', async () => {
    const mainOutput = await mkdtemp(join(tmpdir(), 'queuebot-installer-main-update-'));
    const releaseOutput = await mkdtemp(join(tmpdir(), 'queuebot-installer-release-update-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-version-update-'));
    const bin = await mkdtemp(join(tmpdir(), 'queuebot-bin-version-update-'));
    const logPath = join(bin, 'docker.log');
    const dockerPath = join(bin, 'docker');
    const imageTag = 'v1.0.0-a1b2c3d-beta';
    try {
      const [mainPackage, releasePackage] = await Promise.all([
        packageFor('linux', mainOutput, 'main'),
        packageFor('linux', releaseOutput, imageTag),
      ]);
      expect(mainPackage.status, mainPackage.stderr).toBe(0);
      expect(releasePackage.status, releasePackage.stderr).toBe(0);
      await writeFile(dockerPath, [
        '#!/bin/sh',
        'printf "IMAGE_TAG=%s %s\\n" "${IMAGE_TAG:-<from-env-file>}" "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"',
        'case "$*" in *pull*) if [ "${IMAGE_TAG:-}" = "${QUEUEBOT_FAIL_IMAGE_TAG:-__never__}" ]; then exit 1; fi ;; esac',
        'exit 0',
        '',
      ].join('\n'));
      await chmod(dockerPath, 0o755);
      const mainInstallerPath = join(mainOutput, 'subarushogun_twich_bot_setup.sh');
      const releaseInstallerPath = join(releaseOutput, 'subarushogun_twich_bot_setup.sh');
      const envPath = join(home, 'product', '.env');
      const env = {
        ...process.env,
        HOME: home,
        QUEUEBOT_INSTALL_HOME: join(home, 'product'),
        QUEUEBOT_DOCKER_BIN: dockerPath,
        QUEUEBOT_TEST_DOCKER_LOG: logPath,
        QUEUEBOT_TEST_MODE: '1',
      };
      const firstRun = spawnSync('sh', [mainInstallerPath], { input: '2\n1\n3100\n0\n', encoding: 'utf8', env });
      expect(firstRun.status, `${firstRun.stdout}\n${firstRun.stderr}`).toBe(0);
      expect(await readFile(envPath, 'utf8')).toContain('IMAGE_TAG=main');

      const update = spawnSync('sh', [releaseInstallerPath], { input: '2\n1\n0\n', encoding: 'utf8', env });
      expect(update.status, `${update.stdout}\n${update.stderr}`).toBe(0);
      expect(await readFile(envPath, 'utf8')).toContain(`IMAGE_TAG=${imageTag}`);
      expect(await readFile(logPath, 'utf8')).toContain(`IMAGE_TAG=${imageTag} compose`);

      await writeFile(envPath, (await readFile(envPath, 'utf8')).replace(`IMAGE_TAG=${imageTag}`, 'IMAGE_TAG=main'));
      const failedUpdate = spawnSync('sh', [releaseInstallerPath], {
        input: '2\n1\n0\n', encoding: 'utf8', env: { ...env, QUEUEBOT_FAIL_IMAGE_TAG: imageTag },
      });
      expect(failedUpdate.status, `${failedUpdate.stdout}\n${failedUpdate.stderr}`).toBe(1);
      expect(await readFile(envPath, 'utf8')).toContain('IMAGE_TAG=main');
    } finally {
      await Promise.all([mainOutput, releaseOutput, home, bin].map((path) => rm(path, { recursive: true, force: true })));
    }
  });

  it.each([
    ['linux', 'subarushogun_twich_bot_setup.sh'],
    ['macos', 'subarushogun_twich_bot_setup.command'],
    ['windows', 'subarushogun_twich_bot_setup.bat'],
  ])('embeds the requested versioned GHCR image tag in the %s release installer', async (platform, expectedName) => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-release-'));
    const imageTag = 'v1.0.0-a1b2c3d-beta';
    try {
      const result = await packageFor(platform, output, imageTag);
      expect(result.status, result.stderr).toBe(0);
      const artifact = await readFile(join(output, expectedName), 'utf8');
      const executableSource = platform === 'windows'
        ? Buffer.from(artifact.match(/:payload\r?\n([\s\S]*?)\r?\n:endpayload/)?.[1]?.replace(/\s/g, '') ?? '', 'base64').toString('utf16le')
        : artifact;

      expect(executableSource).toContain(imageTag);
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });

  it('installs from the Linux artifact using its chosen language and port and preserves volumes on update', async () => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-linux-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-'));
    const bin = await mkdtemp(join(tmpdir(), 'queuebot-bin-'));
    const logPath = join(bin, 'docker.log');
    const dockerPath = join(bin, 'docker');
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      await writeFile(dockerPath, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"\nexit 0\n`);
      await chmod(dockerPath, 0o755);
      const artifactPath = join(output, 'subarushogun_twich_bot_setup.sh');
      const env = {
        ...process.env,
        HOME: home,
        QUEUEBOT_INSTALL_HOME: join(home, 'product'),
        QUEUEBOT_DOCKER_BIN: dockerPath,
        QUEUEBOT_TEST_DOCKER_LOG: logPath,
        QUEUEBOT_TEST_MODE: '1',
      };
      const firstRun = spawnSync('sh', [artifactPath], { input: '2\n1\n3100\n0\n', encoding: 'utf8', env });
      expect(firstRun.status, `${firstRun.stdout}\n${firstRun.stderr}`).toBe(0);
      const envText = await readFile(join(home, 'product', '.env'), 'utf8');
      expect(envText).toContain('APP_PORT=3100');
      expect(envText).toContain('PRODUCT_INITIAL_LOCALE=en');
      expect(firstRun.stdout).toContain('https://localhost:3100/callback');

      const update = spawnSync('sh', [artifactPath], { input: '2\n1\n0\n', encoding: 'utf8', env });
      expect(update.status, `${update.stdout}\n${update.stderr}`).toBe(0);
      const commands = await readFile(logPath, 'utf8');
      expect(commands).toMatch(/compose .* pull/);
      expect(commands).toMatch(/compose .* up -d/);
      expect(commands).not.toContain('down --volumes');
      expect(commands).not.toContain('image rm');
    } finally {
      await Promise.all([
        rm(output, { recursive: true, force: true }),
        rm(home, { recursive: true, force: true }),
        rm(bin, { recursive: true, force: true }),
      ]);
    }
  });

  it('requires a typed localized confirmation before clean update and uninstall', async () => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-clean-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-clean-'));
    const bin = await mkdtemp(join(tmpdir(), 'queuebot-bin-clean-'));
    const logPath = join(bin, 'docker.log');
    const dockerPath = join(bin, 'docker');
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      await writeFile(dockerPath, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"\nexit 0\n`);
      await chmod(dockerPath, 0o755);
      const artifactPath = join(output, 'subarushogun_twich_bot_setup.sh');
      const env = {
        ...process.env,
        HOME: home,
        QUEUEBOT_INSTALL_HOME: join(home, 'product'),
        QUEUEBOT_DOCKER_BIN: dockerPath,
        QUEUEBOT_TEST_DOCKER_LOG: logPath,
        QUEUEBOT_TEST_MODE: '1',
      };
      const install = spawnSync('sh', [artifactPath], { input: '2\n1\n3100\n0\n', encoding: 'utf8', env });
      expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0);

      const cancelledUpdate = spawnSync('sh', [artifactPath], { input: '2\n2\nno\n0\n', encoding: 'utf8', env });
      expect(cancelledUpdate.status, `${cancelledUpdate.stdout}\n${cancelledUpdate.stderr}`).toBe(0);
      let commands = await readFile(logPath, 'utf8');
      expect(commands).not.toContain('down --volumes');

      const cleanUpdate = spawnSync('sh', [artifactPath], { input: '2\n2\nDELETE\n3\n3200\n0\n', encoding: 'utf8', env });
      expect(cleanUpdate.status, `${cleanUpdate.stdout}\n${cleanUpdate.stderr}`).toBe(0);
      expect(cleanUpdate.stdout).toContain('queues, history, Twitch authorization');
      commands = await readFile(logPath, 'utf8');
      expect(commands).toMatch(/down --volumes --remove-orphans/);
      expect((await readFile(join(home, 'product', '.env'), 'utf8'))).toContain('APP_PORT=3200');

      const beforeUninstall = await readFile(logPath, 'utf8');
      const keepUninstall = spawnSync('sh', [artifactPath], { input: '3\n1\n0\n', encoding: 'utf8', env });
      expect(keepUninstall.status, `${keepUninstall.stdout}\n${keepUninstall.stderr}`).toBe(0);
      expect(await readFile(join(home, 'product', '.env'), 'utf8')).toContain('APP_PORT=3200');
      expect(await readdir(join(home, 'product', '.local'))).toBeDefined();
      commands = (await readFile(logPath, 'utf8')).slice(beforeUninstall.length);
      expect(commands).toMatch(/down --remove-orphans/);
      expect(commands).not.toMatch(/down --volumes --remove-orphans/);
    } finally {
      await Promise.all([
        rm(output, { recursive: true, force: true }),
        rm(home, { recursive: true, force: true }),
        rm(bin, { recursive: true, force: true }),
      ]);
    }
  });

  it('preserves installed data when a clean update cannot download its image', async () => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-download-failure-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-download-failure-'));
    const bin = await mkdtemp(join(tmpdir(), 'queuebot-bin-download-failure-'));
    const logPath = join(bin, 'docker.log');
    const dockerPath = join(bin, 'docker');
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      await writeFile(dockerPath, '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"\ncase "$*" in *pull*) [ "${QUEUEBOT_TEST_FAIL_PULL:-0}" = 1 ] && exit 17 ;; esac\nexit 0\n');
      await chmod(dockerPath, 0o755);
      const artifactPath = join(output, 'subarushogun_twich_bot_setup.sh');
      const env = {
        ...process.env,
        HOME: home,
        QUEUEBOT_INSTALL_HOME: join(home, 'product'),
        QUEUEBOT_DOCKER_BIN: dockerPath,
        QUEUEBOT_TEST_DOCKER_LOG: logPath,
        QUEUEBOT_TEST_MODE: '1',
      };
      const install = spawnSync('sh', [artifactPath], { input: '2\n1\n3100\n0\n', encoding: 'utf8', env });
      expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0);
      const configPath = join(home, 'product', '.env');
      const savedConfig = await readFile(configPath, 'utf8');
      const failedCleanUpdate = spawnSync('sh', [artifactPath], {
        input: '2\n2\nDELETE\n1\n3200\n0\n',
        encoding: 'utf8',
        env: { ...env, QUEUEBOT_TEST_FAIL_PULL: '1' },
      });
      expect(failedCleanUpdate.status).not.toBe(0);
      expect(await readFile(configPath, 'utf8')).toBe(savedConfig);
      expect(await readdir(join(home, 'product', '.local'))).toBeDefined();
      const commands = await readFile(logPath, 'utf8');
      expect(commands).toContain('pull');
      expect(commands).not.toContain('down --volumes');
    } finally {
      await Promise.all([
        rm(output, { recursive: true, force: true }),
        rm(home, { recursive: true, force: true }),
        rm(bin, { recursive: true, force: true }),
      ]);
    }
  });

  it('erases product data on uninstall only after the matching typed confirmation', async () => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-uninstall-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-uninstall-'));
    const bin = await mkdtemp(join(tmpdir(), 'queuebot-bin-uninstall-'));
    const logPath = join(bin, 'docker.log');
    const dockerPath = join(bin, 'docker');
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      await writeFile(dockerPath, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"\nexit 0\n`);
      await chmod(dockerPath, 0o755);
      const artifactPath = join(output, 'subarushogun_twich_bot_setup.sh');
      const installHome = join(home, 'product');
      const env = {
        ...process.env,
        HOME: home,
        QUEUEBOT_INSTALL_HOME: installHome,
        QUEUEBOT_DOCKER_BIN: dockerPath,
        QUEUEBOT_TEST_DOCKER_LOG: logPath,
        QUEUEBOT_TEST_MODE: '1',
      };
      const install = spawnSync('sh', [artifactPath], { input: '2\n1\n3100\n0\n', encoding: 'utf8', env });
      expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0);
      const cancelled = spawnSync('sh', [artifactPath], { input: '3\n2\nno\n0\n', encoding: 'utf8', env });
      expect(cancelled.status, `${cancelled.stdout}\n${cancelled.stderr}`).toBe(0);
      expect(await readFile(join(installHome, '.env'), 'utf8')).toContain('APP_PORT=3100');
      expect(await readFile(logPath, 'utf8')).not.toContain('down --volumes');

      const erased = spawnSync('sh', [artifactPath], { input: '3\n2\nDELETE\n0\n', encoding: 'utf8', env });
      expect(erased.status, `${erased.stdout}\n${erased.stderr}`).toBe(0);
      await expect(readFile(join(installHome, '.env'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(logPath, 'utf8')).toContain('down --volumes --remove-orphans');
    } finally {
      await Promise.all([
        rm(output, { recursive: true, force: true }),
        rm(home, { recursive: true, force: true }),
        rm(bin, { recursive: true, force: true }),
      ]);
    }
  });

  it('asks before opening official Docker setup guidance and leaves files untouched when Docker is missing', async () => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-no-docker-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-no-docker-'));
    const bin = await mkdtemp(join(tmpdir(), 'queuebot-bin-no-docker-'));
    const dockerPath = join(bin, 'docker');
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      await writeFile(dockerPath, '#!/bin/sh\nexit 1\n');
      await chmod(dockerPath, 0o755);
      const artifactPath = join(output, 'subarushogun_twich_bot_setup.sh');
      const installHome = join(home, 'product');
      const env = {
        ...process.env,
        HOME: home,
        QUEUEBOT_INSTALL_HOME: installHome,
        QUEUEBOT_DOCKER_BIN: dockerPath,
        QUEUEBOT_TEST_MODE: '1',
      };
      const declined = spawnSync('sh', [artifactPath], { input: '2\n1\nn\n', encoding: 'utf8', env });
      expect(declined.status).not.toBe(0);
      expect(declined.stdout).toContain('Docker Engine/Desktop with Compose v2 is unavailable.');
      expect(declined.stdout).toContain('Install Docker manually using the official guide');
      await expect(readFile(join(installHome, '.env'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await Promise.all([
        rm(output, { recursive: true, force: true }),
        rm(home, { recursive: true, force: true }),
        rm(bin, { recursive: true, force: true }),
      ]);
    }
  });
});
