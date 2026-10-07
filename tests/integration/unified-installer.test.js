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
    const home = await mkdtemp(join(tmpdir(), 'queuebot-installer-no-stdin-home-'));
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      const artifactPath = join(output, 'subarushogun_twich_bot_setup.sh');
      const result = spawnSync('sh', [artifactPath], {
        input: '', encoding: 'utf8', timeout: 1500, maxBuffer: 1024,
        env: { ...process.env, HOME: home, QUEUEBOT_INSTALL_HOME: join(home, 'product') },
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('Idioma do produto');
      expect(result.stdout).toContain('Escolha o idioma (1-3)');
      expect(result.stdout).not.toContain('\nlanguage\nlanguage_prompt');
      expect(`${result.stdout}\n${result.stderr}`).toContain('terminal interativo');
    } finally {
      await Promise.all([output, home].map((path) => rm(path, { recursive: true, force: true })));
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
        'case "$*" in "info --format {{.Architecture}}") printf "%s\\n" "${QUEUEBOT_TEST_DOCKER_ARCH:-x86_64}" ;; esac',
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

  it('reports a Compose migration/startup failure without deleting product volumes', async () => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-migration-failure-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-migration-failure-'));
    const bin = await mkdtemp(join(tmpdir(), 'queuebot-bin-migration-failure-'));
    const logPath = join(bin, 'docker.log');
    const dockerPath = join(bin, 'docker');
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      await writeFile(dockerPath, [
        '#!/bin/sh',
        'printf "%s\n" "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"',
        'case "$*" in',
        '  "info --format {{.Architecture}}") printf "%s\n" "x86_64" ;;',
        '  *" up -d"*) printf "%s\n" "migration service exited with status 1" >&2; exit 17 ;;',
        'esac',
        'exit 0',
        '',
      ].join('\n'));
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
      const result = spawnSync('sh', [artifactPath], { input: '2\n1\n3100\n0\n', encoding: 'utf8', env });
      const dockerCalls = await readFile(logPath, 'utf8');
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain('migration service exited with status 1');
      expect(dockerCalls).toContain(' up -d');
      expect(dockerCalls).not.toContain('down --volumes');
      expect(await readFile(join(home, 'product', '.env'), 'utf8')).toContain('APP_PORT=3100');
    } finally {
      await Promise.all([output, home, bin].map((path) => rm(path, { recursive: true, force: true })));
    }
  });

  it('reports an unhealthy panel after update and preserves saved settings and volumes', async () => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-health-failure-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-health-failure-'));
    const bin = await mkdtemp(join(tmpdir(), 'queuebot-bin-health-failure-'));
    const logPath = join(bin, 'docker.log');
    const dockerPath = join(bin, 'docker');
    const curlPath = join(bin, 'curl');
    const sleepPath = join(bin, 'sleep');
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      await writeFile(dockerPath, [
        '#!/bin/sh',
        'printf "%s\n" "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"',
        'case "$*" in "info --format {{.Architecture}}") printf "%s\n" "x86_64" ;; esac',
        'exit 0',
        '',
      ].join('\n'));
      await writeFile(curlPath, '#!/bin/sh\nexit 22\n');
      await writeFile(sleepPath, '#!/bin/sh\nexit 0\n');
      await Promise.all([dockerPath, curlPath, sleepPath].map((path) => chmod(path, 0o755)));
      const artifactPath = join(output, 'subarushogun_twich_bot_setup.sh');
      const installHome = join(home, 'product');
      const env = {
        ...process.env,
        HOME: home,
        PATH: `${bin}:${process.env.PATH}`,
        QUEUEBOT_INSTALL_HOME: installHome,
        QUEUEBOT_DOCKER_BIN: dockerPath,
        QUEUEBOT_TEST_DOCKER_LOG: logPath,
        QUEUEBOT_TEST_MODE: '1',
      };
      const install = spawnSync('sh', [artifactPath], { input: '2\n1\n3100\n0\n', encoding: 'utf8', env });
      expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0);
      const savedConfig = await readFile(join(installHome, '.env'), 'utf8');
      const update = spawnSync('sh', [artifactPath], {
        input: '2\n1\n0\n',
        encoding: 'utf8',
        timeout: 10_000,
        env: { ...env, QUEUEBOT_TEST_MODE: '0' },
      });
      const dockerCalls = await readFile(logPath, 'utf8');
      expect(update.status, `${update.stdout}\n${update.stderr}`).toBe(1);
      expect(update.stdout).toContain('The panel did not respond yet');
      expect(dockerCalls).toContain(' logs --tail 80 bot');
      expect(dockerCalls).not.toContain('down --volumes');
      expect(await readFile(join(installHome, '.env'), 'utf8')).toBe(savedConfig);
    } finally {
      await Promise.all([output, home, bin].map((path) => rm(path, { recursive: true, force: true })));
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

  it('checks the Docker daemon architecture and refuses unsupported platforms before pulling the image', async () => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-architecture-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-architecture-'));
    const bin = await mkdtemp(join(tmpdir(), 'queuebot-bin-architecture-'));
    const logPath = join(bin, 'docker.log');
    const dockerPath = join(bin, 'docker');
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      await writeFile(dockerPath, [
        '#!/bin/sh',
        'printf "%s\\n" "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"',
        'case "$*" in',
        '  "info --format {{.Architecture}}") printf "%s\\n" "$QUEUEBOT_TEST_DOCKER_ARCH" ;;',
        '  "compose version") printf "%s\\n" "Docker Compose version v2" ;;',
        'esac',
        'exit 0',
        '',
      ].join('\n'));
      await chmod(dockerPath, 0o755);
      const result = spawnSync('sh', [join(output, 'subarushogun_twich_bot_setup.sh')], {
        input: '2\n1\n',
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          QUEUEBOT_INSTALL_HOME: join(home, 'product'),
          QUEUEBOT_DOCKER_BIN: dockerPath,
          QUEUEBOT_TEST_DOCKER_LOG: logPath,
          QUEUEBOT_TEST_DOCKER_ARCH: 'riscv64',
          QUEUEBOT_TEST_MODE: '1',
        },
      });
      const dockerCalls = await readFile(logPath, 'utf8');
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
      expect(dockerCalls).toContain('info --format {{.Architecture}}');
      expect(dockerCalls).not.toContain('compose --project-name subarushogun-gi-twitch-queue-bot');
      expect(result.stdout).toContain('Idioma do produto');
      expect(result.stdout).toContain('Docker architecture "riscv64" is not supported');
    } finally {
      await Promise.all([output, home, bin].map((path) => rm(path, { recursive: true, force: true })));
    }
  });

  it.each(['amd64', 'arm64', 'aarch64'])('allows a supported Docker daemon architecture (%s)', async (architecture) => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-supported-architecture-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-supported-architecture-'));
    const bin = await mkdtemp(join(tmpdir(), 'queuebot-bin-supported-architecture-'));
    const logPath = join(bin, 'docker.log');
    const dockerPath = join(bin, 'docker');
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      await writeFile(dockerPath, [
        '#!/bin/sh',
        'printf "%s\n" "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"',
        'case "$*" in "info --format {{.Architecture}}") printf "%s\n" "$QUEUEBOT_TEST_DOCKER_ARCH" ;; esac',
        'exit 0',
        '',
      ].join('\n'));
      await chmod(dockerPath, 0o755);
      const result = spawnSync('sh', [join(output, 'subarushogun_twich_bot_setup.sh')], {
        input: '2\n1\n3100\n0\n',
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          QUEUEBOT_INSTALL_HOME: join(home, 'product'),
          QUEUEBOT_DOCKER_BIN: dockerPath,
          QUEUEBOT_TEST_DOCKER_LOG: logPath,
          QUEUEBOT_TEST_DOCKER_ARCH: architecture,
          QUEUEBOT_TEST_MODE: '1',
        },
      });
      const dockerCalls = await readFile(logPath, 'utf8');
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(dockerCalls).toContain('info --format {{.Architecture}}');
      expect(dockerCalls).toContain('compose --progress plain --project-name subarushogun-gi-twitch-queue-bot');
    } finally {
      await Promise.all([output, home, bin].map((path) => rm(path, { recursive: true, force: true })));
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
      await writeFile(dockerPath, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"\ncase "$*" in "info --format {{.Architecture}}") printf '%s\\n' "${'${QUEUEBOT_TEST_DOCKER_ARCH:-x86_64}'}" ;; esac\nexit 0\n`);
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
      await writeFile(dockerPath, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"\ncase "$*" in "info --format {{.Architecture}}") printf '%s\\n' "${'${QUEUEBOT_TEST_DOCKER_ARCH:-x86_64}'}" ;; esac\nexit 0\n`);
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
      await writeFile(dockerPath, '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"\ncase "$*" in "info --format {{.Architecture}}") printf \'%s\\n\' "${QUEUEBOT_TEST_DOCKER_ARCH:-x86_64}" ;; *pull*) [ "${QUEUEBOT_TEST_FAIL_PULL:-0}" = 1 ] && exit 17 ;; esac\nexit 0\n');
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
      await writeFile(dockerPath, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"\ncase "$*" in "info --format {{.Architecture}}") printf '%s\\n' "${'${QUEUEBOT_TEST_DOCKER_ARCH:-x86_64}'}" ;; esac\nexit 0\n`);
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

  it('shows uninstall progress, removes verified product resources, and preserves images used by another project', async () => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-uninstall-progress-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-uninstall-progress-'));
    const bin = await mkdtemp(join(tmpdir(), 'queuebot-bin-uninstall-progress-'));
    const logPath = join(bin, 'docker.log');
    const dockerPath = join(bin, 'docker');
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      await writeFile(dockerPath, [
        '#!/bin/sh',
        'printf "%s\\n" "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"',
        'case "$*" in',
        '  "info --format {{.Architecture}}") printf "%s\\n" "x86_64" ;;',
        '  *"images --quiet"*) printf "%s\\n" "sha256:queuebot-app" "sha256:postgres" ;;',
        '  *"image ls --quiet --no-trunc ghcr.io/gustavo8000br/subarushogun_gi_twich_bot"*) printf "%s\\n" "sha256:queuebot-app" "sha256:queuebot-old-app" ;;',
        '  *"ps --all --quiet --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot"*) if ! grep -q " down " "$QUEUEBOT_TEST_DOCKER_LOG"; then printf "%s\\n" "queuebot-container"; fi ;;',
        '  *"network ls --quiet --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot"*) if ! grep -q " down " "$QUEUEBOT_TEST_DOCKER_LOG"; then printf "%s\\n" "queuebot-network"; fi ;;',
        '  *"volume ls --quiet --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot"*) if ! grep -q "down --volumes" "$QUEUEBOT_TEST_DOCKER_LOG"; then printf "%s\\n" "queuebot-postgres-data" "queuebot-operational-secrets"; fi ;;',
        '  *"ps --all --quiet --filter ancestor=sha256:postgres"*) printf "%s\\n" "other-project-db" ;;',
        '  *"compose down --volumes --remove-orphans"*) printf "%s\\n" "Removed queuebot containers and network" ;;',
        '  *"image rm "*) printf "%s\\n" "Deleted image" ;;',
        'esac',
        'exit 0',
        '',
      ].join('\n'));
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
      await writeFile(logPath, '');

      const kept = spawnSync('sh', [artifactPath], { input: '3\n1\n0\n', encoding: 'utf8', env });
      const keptOutput = `${kept.stdout}\n${kept.stderr}`;
      expect(kept.status, keptOutput).toBe(0);
      expect(keptOutput).toContain('Removing project containers and networks');
      expect(keptOutput).toContain('Uninstall complete');
      expect(keptOutput).toContain('volumes and data preserved');
      expect(keptOutput).toContain('Image kept because another container still uses it: sha256:postgres');
      expect(await readFile(join(installHome, '.env'), 'utf8')).toContain('APP_PORT=3100');
      let dockerCalls = await readFile(logPath, 'utf8');
      expect(dockerCalls).toContain('down --remove-orphans');
      expect(dockerCalls).not.toContain('down --volumes --remove-orphans');
      expect(dockerCalls).toContain('volume ls --quiet --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot');

      const restarted = spawnSync('sh', [artifactPath], { input: '1\n0\n', encoding: 'utf8', env });
      expect(restarted.status, `${restarted.stdout}\n${restarted.stderr}`).toBe(0);
      expect(await readFile(join(installHome, '.env'), 'utf8')).toContain('APP_PORT=3100');
      await writeFile(logPath, '');

      const uninstalled = spawnSync('sh', [artifactPath], { input: '3\n2\nDELETE\n0\n', encoding: 'utf8', env });
      dockerCalls = await readFile(logPath, 'utf8');
      const outputText = `${uninstalled.stdout}\n${uninstalled.stderr}`;

      expect(uninstalled.status, outputText).toBe(0);
      expect(outputText, dockerCalls).toContain('Removing project containers and networks');
      expect(outputText).toContain('Checking this project’s volumes');
      expect(outputText).toContain('Image kept because another container still uses it: sha256:postgres');
      expect(outputText).toContain('Uninstall complete');
      expect(dockerCalls).toContain('images --quiet');
      expect(dockerCalls).toContain('image ls --quiet --no-trunc ghcr.io/gustavo8000br/subarushogun_gi_twich_bot');
      expect(dockerCalls).toContain('compose --progress plain --project-name subarushogun-gi-twitch-queue-bot');
      expect(dockerCalls).toContain('down --volumes --remove-orphans');
      expect(dockerCalls).toContain('network ls --quiet --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot');
      expect(dockerCalls).toContain('volume ls --quiet --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot');
      expect(dockerCalls).toContain('image rm sha256:queuebot-app');
      expect(dockerCalls).toContain('image rm sha256:queuebot-old-app');
      expect(dockerCalls).not.toContain('image rm sha256:postgres');
      expect(dockerCalls).not.toMatch(/(?:system|volume|image|network) prune/);
      await expect(readFile(installHome, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await Promise.all([output, home, bin].map((path) => rm(path, { recursive: true, force: true })));
    }
  });

  it('reports when no managed installation exists instead of presenting uninstall as completed', async () => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-no-install-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-no-install-'));
    const logPath = join(home, 'docker.log');
    const dockerPath = join(home, 'docker');
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      await writeFile(dockerPath, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"\ncase "$*" in "info --format {{.Architecture}}") printf "%s\\n" "x86_64" ;; esac\nexit 0\n');
      await chmod(dockerPath, 0o755);
      const artifactPath = join(output, 'subarushogun_twich_bot_setup.sh');
      const result = spawnSync('sh', [artifactPath], {
        input: '2\n3\n0\n',
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          QUEUEBOT_INSTALL_HOME: join(home, 'product'),
          QUEUEBOT_DOCKER_BIN: dockerPath,
          QUEUEBOT_TEST_DOCKER_LOG: logPath,
          QUEUEBOT_TEST_MODE: '1',
        },
      });

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain('No installation or product resources were found');
      expect(`${result.stdout}\n${result.stderr}`).not.toContain('Uninstall complete');
      const dockerCalls = await readFile(logPath, 'utf8');
      expect(dockerCalls).toContain('network ls --quiet --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot');
      expect(dockerCalls).not.toContain('compose down');
    } finally {
      await Promise.all([output, home].map((path) => rm(path, { recursive: true, force: true })));
    }
  });

  it('does not claim uninstall success when Docker cannot inventory the product images', async () => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-image-inventory-failure-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-image-inventory-failure-'));
    const bin = await mkdtemp(join(tmpdir(), 'queuebot-bin-image-inventory-failure-'));
    const dockerPath = join(bin, 'docker');
    const logPath = join(bin, 'docker.log');
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      await writeFile(dockerPath, [
        '#!/bin/sh',
        'printf "%s\\n" "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"',
        'case "$*" in',
        '  "info --format {{.Architecture}}") printf "%s\n" x86_64 ;;',
        '  *"config --images"*) printf "%s\n" app-image postgres:18 ;;',
        '  *"image ls --quiet --no-trunc"*) exit 1 ;;',
        'esac',
        'exit 0',
        '',
      ].join('\n'));
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
      const install = spawnSync('sh', [artifactPath, '--silent', 'install', '--port', '39119'], { encoding: 'utf8', env });
      expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0);

      const uninstall = spawnSync('sh', [artifactPath, '--silent', 'uninstall'], { encoding: 'utf8', env });
      expect(uninstall.status, `${uninstall.stdout}\n${uninstall.stderr}`).toBe(1);
      expect(`${uninstall.stdout}\n${uninstall.stderr}`, await readFile(logPath, 'utf8')).toContain('Desinstalação incompleta');
      expect(uninstall.stdout).not.toContain('Uninstall complete');
      expect(await readFile(join(env.QUEUEBOT_INSTALL_HOME, '.env'), 'utf8')).toContain('APP_PORT=39119');
    } finally {
      await Promise.all([output, home, bin].map((path) => rm(path, { recursive: true, force: true })));
    }
  });

  it('does not report uninstall complete while an unused product image remains', async () => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-image-remains-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-image-remains-'));
    const bin = await mkdtemp(join(tmpdir(), 'queuebot-bin-image-remains-'));
    const dockerPath = join(bin, 'docker');
    const logPath = join(bin, 'docker.log');
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      await writeFile(dockerPath, [
        '#!/bin/sh',
        'printf "%s\\n" "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"',
        'case "$*" in',
        '  "info --format {{.Architecture}}") printf "%s\\n" x86_64 ;;',
        '  *"config --images"*) printf "%s\\n" ghcr.io/gustavo8000br/subarushogun_gi_twich_bot:main postgres:17-alpine ;;',
        '  *"image ls --quiet --no-trunc"*) printf "%s\\n" sha256:app-image ;;',
        '  *"image ls --quiet"*) printf "%s\\n" sha256:app-image ;;',
        '  *"image rm"*) exit 0 ;;',
        '  *"ps --all --quiet --filter ancestor="*) exit 0 ;;',
        '  *"ps --all --quiet --filter label=com.docker.compose.project="*) if ! grep -q " down " "$QUEUEBOT_TEST_DOCKER_LOG"; then printf "%s\\n" product-container; fi ;;',
        '  *"network ls --quiet --filter label=com.docker.compose.project="*) if ! grep -q " down " "$QUEUEBOT_TEST_DOCKER_LOG"; then printf "%s\\n" product-network; fi ;;',
        '  *"volume ls --quiet --filter label=com.docker.compose.project="*) printf "%s\\n" product-volume ;;',
        'esac',
        'exit 0',
        '',
      ].join('\n'));
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
      const install = spawnSync('sh', [artifactPath, '--silent', 'install', '--port', '39120'], { encoding: 'utf8', env });
      expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0);

      const uninstall = spawnSync('sh', [artifactPath, '--silent', 'uninstall'], { encoding: 'utf8', env });
      expect(uninstall.status).toBe(1);
      expect(`${uninstall.stdout}\n${uninstall.stderr}`).toContain('Desinstalação incompleta');
      expect(`${uninstall.stdout}\n${uninstall.stderr}`).not.toContain('Desinstalação concluída');
      expect(await readFile(join(env.QUEUEBOT_INSTALL_HOME, '.env'), 'utf8')).toContain('APP_PORT=39120');
    } finally {
      await Promise.all([output, home, bin].map((path) => rm(path, { recursive: true, force: true })));
    }
  });

  it('supports unattended install/update/uninstall and requires explicit destructive flags', async () => {
    const output = await mkdtemp(join(tmpdir(), 'queuebot-installer-silent-'));
    const home = await mkdtemp(join(tmpdir(), 'queuebot-home-silent-'));
    const bin = await mkdtemp(join(tmpdir(), 'queuebot-bin-silent-'));
    const logPath = join(bin, 'docker.log');
    const dockerPath = join(bin, 'docker');
    try {
      const packageResult = await packageFor('linux', output);
      expect(packageResult.status, packageResult.stderr).toBe(0);
      await writeFile(dockerPath, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"\ncase "$*" in "info --format {{.Architecture}}") printf "%s\\n" "x86_64" ;; esac\nexit 0\n');
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

      const install = spawnSync('sh', [artifactPath, '--silent', 'install', '--locale', 'en', '--port', '3111'], { encoding: 'utf8', env });
      expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0);
      expect(install.stdout).toContain('Creating/starting database, migrations, and bot');
      expect(install.stdout).not.toContain('Choose a language');
      expect(await readFile(join(installHome, '.env'), 'utf8')).toMatch(/APP_PORT=3111[\s\S]*PRODUCT_INITIAL_LOCALE=en/);

      const unconfirmedErase = spawnSync('sh', [artifactPath, '--silent', 'uninstall', '--erase-data'], { encoding: 'utf8', env });
      expect(unconfirmedErase.status).toBe(2);
      expect(await readFile(join(installHome, '.env'), 'utf8')).toContain('APP_PORT=3111');
      let dockerCalls = await readFile(logPath, 'utf8');
      expect(dockerCalls).not.toContain('down --volumes');

      const contradictoryOptions = spawnSync('sh', [artifactPath, '--silent', 'uninstall', '--keep-data', '--erase-data', '--confirm-erase'], { encoding: 'utf8', env });
      expect(contradictoryOptions.status).toBe(2);
      expect(await readFile(join(installHome, '.env'), 'utf8')).toContain('APP_PORT=3111');
      dockerCalls = await readFile(logPath, 'utf8');
      expect(dockerCalls).not.toContain('down --volumes');

      const cleanUpdate = spawnSync('sh', [artifactPath, '--silent', 'update', '--erase-data', '--confirm-erase'], { encoding: 'utf8', env });
      expect(cleanUpdate.status, `${cleanUpdate.stdout}\n${cleanUpdate.stderr}`).toBe(0);
      expect(await readFile(join(installHome, '.env'), 'utf8')).toMatch(/APP_PORT=3111[\s\S]*PRODUCT_INITIAL_LOCALE=en/);
      dockerCalls = await readFile(logPath, 'utf8');
      expect(dockerCalls).toContain('down --volumes --remove-orphans');
      await writeFile(logPath, '');

      const update = spawnSync('sh', [artifactPath, '--silent', 'update'], { encoding: 'utf8', env });
      expect(update.status, `${update.stdout}\n${update.stderr}`).toBe(0);
      expect(update.stdout).toContain('Update complete');
      dockerCalls = await readFile(logPath, 'utf8');
      expect(dockerCalls).toMatch(/compose .* pull/);
      expect(dockerCalls).not.toContain('down --volumes');
      await writeFile(logPath, '');

      const uninstall = spawnSync('sh', [artifactPath, '--silent', 'uninstall', '--erase-data', '--confirm-erase'], { encoding: 'utf8', env });
      expect(uninstall.status, `${uninstall.stdout}\n${uninstall.stderr}`).toBe(0);
      expect(uninstall.stdout).toContain('Uninstall complete');
      dockerCalls = await readFile(logPath, 'utf8');
      expect(dockerCalls).toContain('down --volumes --remove-orphans');
      await expect(readFile(installHome, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await Promise.all([output, home, bin].map((path) => rm(path, { recursive: true, force: true })));
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
