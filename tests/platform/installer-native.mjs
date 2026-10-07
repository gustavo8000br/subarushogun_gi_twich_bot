import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
const extension = { windows: 'bat', macos: 'command', linux: 'sh' }[platform];
const artifactName = `subarushogun_twich_bot_setup.${extension}`;
const root = new URL('../../', import.meta.url);
const packager = new URL('../../apps/infra/scripts/package-installer.mjs', import.meta.url);
const fixtureRoot = await mkdtemp(join(tmpdir(), 'queuebot native installer path '));
const output = join(fixtureRoot, 'downloaded artifact');
const installHome = join(fixtureRoot, 'application data', 'product');
const bin = join(fixtureRoot, 'fake docker path');
const log = join(fixtureRoot, 'docker calls.log');
const inputFile = join(fixtureRoot, 'installer input.txt');
const expectedImageTag = process.env.QUEUEBOT_EXPECTED_IMAGE_TAG ?? 'main';

try {
  if (!process.env.QUEUEBOT_PREBUILT_INSTALLER) {
    const packageResult = spawnSync(process.execPath, [packager.pathname, '--platform', platform, '--output', output], { cwd: root, encoding: 'utf8' });
    if (packageResult.status !== 0) throw new Error(packageResult.stderr || 'Installer packaging failed');
  }
  await (await import('node:fs/promises')).mkdir(bin, { recursive: true });
  const fakeDocker = join(bin, platform === 'windows' ? 'docker.cmd' : 'docker');
  if (platform === 'windows') {
    await writeFile(fakeDocker, '@echo off\r\necho %*>>"%QUEUEBOT_TEST_DOCKER_LOG%"\r\nif /I "%~1"=="info" if /I "%~2"=="--format" if "%~3"=="{{.Architecture}}" echo x86_64\r\nexit /b 0\r\n');
  } else {
    await writeFile(fakeDocker, '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$QUEUEBOT_TEST_DOCKER_LOG"\ncase "$*" in "info --format {{.Architecture}}") printf \'%s\\n\' "${QUEUEBOT_TEST_DOCKER_ARCH:-x86_64}" ;; esac\nexit 0\n');
    await chmod(fakeDocker, 0o755);
  }
  const artifact = process.env.QUEUEBOT_PREBUILT_INSTALLER ?? join(output, artifactName);
  await writeFile(inputFile, '2\n1\n3100\n0\n');
  const env = {
    ...process.env,
    HOME: fixtureRoot,
    LOCALAPPDATA: fixtureRoot,
    PATH: `${bin}${delimiter}${process.env.PATH}`,
    QUEUEBOT_INSTALL_HOME: installHome,
    QUEUEBOT_DOCKER_BIN: fakeDocker,
    QUEUEBOT_TEST_DOCKER_LOG: log,
    QUEUEBOT_TEST_MODE: '1',
    QUEUEBOT_TEST_INPUT_FILE: inputFile,
    QUEUEBOT_EXPECTED_IMAGE_TAG: expectedImageTag,
  };
  const launch = (input) => {
    if (platform === 'windows') {
      return spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', '& $env:QUEUEBOT_PREBUILT_INSTALLER'], {
        encoding: 'utf8', env: { ...env, QUEUEBOT_PREBUILT_INSTALLER: artifact }, timeout: 30_000,
      });
    }
    return spawnSync(artifact, [], { input, encoding: 'utf8', env, timeout: 30_000 });
  };
  const result = launch('2\n1\n3100\n0\n');
  if (result.status !== 0) throw new Error(`Native installer failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  let config;
  try {
    config = await readFile(join(installHome, '.env'), 'utf8');
  } catch {
    throw new Error(`Native installer exited without saving configuration:\n${result.stdout}\n${result.stderr}`);
  }
  if (!config.includes('APP_PORT=3100') || !config.includes('PRODUCT_INITIAL_LOCALE=en') || !config.includes(`IMAGE_TAG=${expectedImageTag}`)) {
    throw new Error(`Installer did not save the chosen language/port:\n${config}`);
  }
  await writeFile(join(installHome, '.env'), config.replace(/^IMAGE_TAG=.*$/m, 'IMAGE_TAG=main'));
  await writeFile(inputFile, '2\n1\n0\n');
  const updateResult = launch('2\n1\n0\n');
  if (updateResult.status !== 0) throw new Error(`Native version update failed (${updateResult.status}):\n${updateResult.stdout}\n${updateResult.stderr}`);
  config = await readFile(join(installHome, '.env'), 'utf8');
  if (!config.includes(`IMAGE_TAG=${expectedImageTag}`)) throw new Error(`Update did not select its release image tag:\n${config}`);
  const dockerCalls = await readFile(log, 'utf8');
  if (!/compose .* pull/.test(dockerCalls) || !/compose .* up -d/.test(dockerCalls)) {
    throw new Error(`Installer did not start the product using Compose:\n${dockerCalls}\nInstaller output:\n${result.stdout}\n${result.stderr}\nUpdate output:\n${updateResult.stdout}\n${updateResult.stderr}`);
  }
  if (!result.stdout.includes('https://localhost:3100/callback')) {
    throw new Error(`Installer did not show the exact callback URL:\n${result.stdout}`);
  }
  await writeFile(inputFile, '');
  const emptyInputEnv = { ...env, QUEUEBOT_INSTALL_HOME: join(fixtureRoot, 'empty input product') };
  const emptyInputResult = platform === 'windows'
    ? spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', '& $env:QUEUEBOT_PREBUILT_INSTALLER'], { encoding: 'utf8', env: { ...emptyInputEnv, QUEUEBOT_PREBUILT_INSTALLER: artifact }, timeout: 30_000 })
    : spawnSync(artifact, [], { input: '', encoding: 'utf8', env: emptyInputEnv, timeout: 30_000 });
  if (emptyInputResult.status !== 1 || !`${emptyInputResult.stdout}\n${emptyInputResult.stderr}`.includes('terminal')) {
    throw new Error(`Installer did not exit cleanly when no interactive input was available:\n${emptyInputResult.stdout}\n${emptyInputResult.stderr}`);
  }
  process.stdout.write(`${platform} installer launched directly; locale, port, callback, Compose startup, and release-tag update passed.\n`);
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
