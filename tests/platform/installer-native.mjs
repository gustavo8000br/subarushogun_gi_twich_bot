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
    await writeFile(fakeDocker, [
      '@echo off',
      'echo %*>>"%QUEUEBOT_TEST_DOCKER_LOG%"',
      'if /I "%~1"=="info" echo x86_64',
      'if /I "%~1"=="info" exit /b 0',
      'echo %*|findstr /C:"config --images" >nul && (echo ghcr.io/gustavo8000br/subarushogun_gi_twich_bot:main&echo postgres:17-alpine&exit /b 0)',
      'echo %*|findstr /C:"images --quiet" >nul && (echo sha256:queuebot-app&echo sha256:postgres&exit /b 0)',
      'echo %*|findstr /C:"image ls --quiet --no-trunc ghcr.io/gustavo8000br/subarushogun_gi_twich_bot" >nul && (findstr /C:"image rm sha256:queuebot-app" "%QUEUEBOT_TEST_DOCKER_LOG%" >nul || echo sha256:queuebot-app&exit /b 0)',
      'echo %*|findstr /C:"image ls --quiet --no-trunc postgres:17-alpine" >nul && (echo sha256:postgres&exit /b 0)',
      'echo %*|findstr /C:"image ls --quiet --no-trunc" >nul && (findstr /C:"image rm sha256:queuebot-app" "%QUEUEBOT_TEST_DOCKER_LOG%" >nul && echo sha256:postgres&exit /b 0&echo sha256:queuebot-app&echo sha256:postgres&exit /b 0)',
      'echo %*|findstr /C:"ps --all --quiet --filter label=com.docker.compose.project" >nul && (findstr /C:" down" "%QUEUEBOT_TEST_DOCKER_LOG%" >nul || echo queuebot-container&exit /b 0)',
      'echo %*|findstr /C:"network ls --quiet --filter label=com.docker.compose.project" >nul && (findstr /C:" down" "%QUEUEBOT_TEST_DOCKER_LOG%" >nul || echo queuebot-network&exit /b 0)',
      'echo %*|findstr /C:"volume ls --quiet --filter label=com.docker.compose.project" >nul && (findstr /C:"down --volumes --remove-orphans" "%QUEUEBOT_TEST_DOCKER_LOG%" >nul || (echo queuebot-postgres-data&echo queuebot-operational-secrets)&exit /b 0)',
      'echo %*|findstr /C:"ps --all --quiet --filter ancestor=sha256:postgres" >nul && (echo other-project-db&exit /b 0)',
      'exit /b 0',
      '',
    ].join('\r\n'));
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
  if (platform === 'windows') {
    const architectureProbe = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-Command', '& $env:QUEUEBOT_DOCKER_BIN info --format "{{.Architecture}}"; exit $LASTEXITCODE',
    ], { encoding: 'utf8', env, timeout: 30_000 });
    if (architectureProbe.status !== 0 || architectureProbe.stdout.trim() !== 'x86_64') {
      throw new Error(`Windows fake Docker architecture fixture failed (${architectureProbe.status}):\n${architectureProbe.stdout}\n${architectureProbe.stderr}`);
    }
  }
  const launch = (input, installerArgs = '') => {
    if (platform === 'windows') {
      return spawnSync('powershell.exe', [
        '-NoLogo', '-NoProfile', '-Command',
        '$installerArgs = @($env:QUEUEBOT_TEST_INSTALLER_ARGS -split "\\s+" | Where-Object { $_ }); & $env:QUEUEBOT_PREBUILT_INSTALLER @installerArgs; exit $LASTEXITCODE',
      ], {
        encoding: 'utf8', env: { ...env, QUEUEBOT_PREBUILT_INSTALLER: artifact, QUEUEBOT_TEST_INSTALLER_ARGS: installerArgs }, timeout: 30_000,
      });
    }
    return spawnSync(artifact, installerArgs ? installerArgs.split(/\s+/) : [], { input, encoding: 'utf8', env, timeout: 30_000 });
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
  if (platform === 'windows' && !dockerCalls.includes('info --format {{.Architecture}}')) {
    throw new Error(`Windows installer did not query the expected Docker architecture:\n${dockerCalls}`);
  }
  if (!/compose .* pull/.test(dockerCalls) || !/compose .* up -d/.test(dockerCalls)) {
    throw new Error(`Installer did not start the product using Compose:\n${dockerCalls}\nInstaller output:\n${result.stdout}\n${result.stderr}\nUpdate output:\n${updateResult.stdout}\n${updateResult.stderr}`);
  }
  if (!result.stdout.includes('https://localhost:3100/callback')) {
    throw new Error(`Installer did not show the exact callback URL:\n${result.stdout}`);
  }
  if (platform === 'windows') {
    const silentUpdate = launch('', '--silent update');
    if (silentUpdate.status !== 0 || !silentUpdate.stdout.includes('Update complete')) {
      const callsOnFailure = await readFile(log, 'utf8');
      throw new Error(`Windows unattended update failed:\n${silentUpdate.stdout}\n${silentUpdate.stderr}\nDocker calls:\n${callsOnFailure}`);
    }
    const unconfirmedErase = launch('', '--silent uninstall --erase-data');
    if (unconfirmedErase.status !== 2 || !(await readFile(join(installHome, '.env'), 'utf8')).includes('APP_PORT=3100')) {
      throw new Error(`Windows unattended uninstall did not refuse an unconfirmed erase:\n${unconfirmedErase.stdout}\n${unconfirmedErase.stderr}`);
    }
    const keptUninstall = launch('', '--silent uninstall --keep-data');
    if (keptUninstall.status !== 0 || !keptUninstall.stdout.includes('volumes and data preserved')) {
      throw new Error(`Windows unattended uninstall did not preserve product volumes:\n${keptUninstall.stdout}\n${keptUninstall.stderr}`);
    }
    let calls = await readFile(log, 'utf8');
    if (!calls.includes('down --remove-orphans') || calls.includes('down --volumes --remove-orphans')) {
      throw new Error(`Windows keep-data uninstall used the wrong Compose volume policy:\n${calls}`);
    }
    const restarted = launch('', '--silent install');
    if (restarted.status !== 0) throw new Error(`Windows installer could not restart after preserving data:\n${restarted.stdout}\n${restarted.stderr}`);
    const erasedUninstall = launch('', '--silent uninstall --erase-data --confirm-erase');
    if (erasedUninstall.status !== 0 || !erasedUninstall.stdout.includes('Uninstall complete')) {
      throw new Error(`Windows unattended erase-data uninstall did not complete with verification:\n${erasedUninstall.stdout}\n${erasedUninstall.stderr}`);
    }
    calls = await readFile(log, 'utf8');
    if (!calls.includes('down --volumes --remove-orphans') || calls.includes('image rm sha256:postgres')) {
      throw new Error(`Windows erase-data uninstall did not remove product volumes safely:\n${calls}`);
    }
    try {
      await readFile(installHome, 'utf8');
      throw new Error('Windows erase-data uninstall left the product install directory behind.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await writeFile(inputFile, '');
  const emptyInputEnv = { ...env, QUEUEBOT_INSTALL_HOME: join(fixtureRoot, 'empty input product') };
  const emptyInputResult = platform === 'windows'
      ? spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', '& $env:QUEUEBOT_PREBUILT_INSTALLER; exit $LASTEXITCODE'], { encoding: 'utf8', env: { ...emptyInputEnv, QUEUEBOT_PREBUILT_INSTALLER: artifact }, timeout: 30_000 })
    : spawnSync(artifact, [], { input: '', encoding: 'utf8', env: emptyInputEnv, timeout: 30_000 });
  if (emptyInputResult.status !== 1 || !`${emptyInputResult.stdout}\n${emptyInputResult.stderr}`.includes('terminal')) {
    throw new Error(`Installer did not exit cleanly when no interactive input was available:\n${emptyInputResult.stdout}\n${emptyInputResult.stderr}`);
  }
  process.stdout.write(`${platform} installer launched directly; locale, port, callback, Compose startup, and release-tag update passed.\n`);
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
