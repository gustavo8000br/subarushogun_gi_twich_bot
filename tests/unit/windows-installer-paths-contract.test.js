import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// C1c: the Windows installer must survive user profiles with accents, spaces and apostrophes (hypotheses from the
// 2026-11-10 infra language-conventions research). Static contract checks run everywhere; the PowerShell behaviour
// checks run in a disposable pwsh container and are skipped when Docker or the image is not available.
const root = fileURLToPath(new URL('../../', import.meta.url));
const packager = join(root, 'apps/infra/scripts/package-installer.mjs');
const IMAGE_TAG = 'v1.0.0-a1b2c3d-beta';
const PWSH_IMAGE = 'mcr.microsoft.com/powershell:latest';
const NASTY_DIR = "Jo\u00e3o O'Brien & 100% !x (1)^y";

const decodePayload = (artifact) => Buffer.from(
  artifact.match(/:payload\r?\n([\s\S]*?)\r?\n:endpayload/)?.[1]?.replace(/\s/g, '') ?? '', 'base64',
).toString('utf16le');

const dockerReady = (() => {
  const result = spawnSync('docker', ['image', 'inspect', PWSH_IMAGE], { encoding: 'utf8' });
  return result.status === 0;
})();

let work;
let bat;
let script;

beforeAll(async () => {
  await mkdir(join(root, '.local'), { recursive: true });
  work = await mkdtemp(join(root, '.local', 'windows-paths-'));
  const result = spawnSync(process.execPath, [
    packager, '--platform', 'windows', '--output', work, '--image-tag', IMAGE_TAG, '--product-version', IMAGE_TAG,
  ], { cwd: root, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  bat = await readFile(join(work, 'subarushogun_twich_bot_setup.bat'), 'latin1');
  script = decodePayload(bat).replace(/\r\n/g, '\n');
}, 30_000);

afterAll(async () => {
  if (work) await rm(work, { recursive: true, force: true });
});

const runPwsh = (args, env = {}) => {
  const envArgs = Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
  return spawnSync('docker', [
    'run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`, '-e', 'HOME=/work', '-e', 'DOTNET_CLI_HOME=/work',
    ...envArgs, '-v', `${work}:/work`, '-w', '/work', PWSH_IMAGE, 'pwsh', '-NoLogo', '-NoProfile', ...args,
  ], { encoding: 'utf8', timeout: 120_000 });
};

describe('Windows installer .env encoding (accented profile path)', () => {
  it('never writes text with the ASCII encoding and writes .env as UTF-8 without BOM', () => {
    expect(script).not.toMatch(/-Encoding\s+ascii/i);
    expect(script).not.toMatch(/Set-Content\s+-LiteralPath\s+\$EnvFile/);
    const helper = script.match(/function Write-EnvFile[\s\S]*?\n}\n/)?.[0] ?? '';
    expect(helper).toContain('UTF8Encoding($false)');
    expect(helper).toContain('WriteAllLines($EnvFile');
  });

  it('reads .env as UTF-8 everywhere so a rewrite cannot corrupt an accent on Windows PowerShell 5.1', () => {
    const reads = script.match(/Get-Content[^\n|]*\$EnvFile[^\n|]*/g) ?? [];
    expect(reads.length).toBeGreaterThanOrEqual(5);
    for (const read of reads) expect(read, read).toMatch(/-Encoding UTF8/);
  });

  it.skipIf(!dockerReady)('keeps an accented, spaced and apostrophe path byte-exact in .env (no BOM, no "?")', async () => {
    const helper = script.match(/function Write-EnvFile[\s\S]*?\n}\n/)?.[0];
    expect(helper).toBeDefined();
    const dir = join(work, NASTY_DIR);
    await mkdir(dir, { recursive: true });
    const catalog = `C:\\Users\\${NASTY_DIR}\\AppData\\Local\\catalogs`;
    const code = `${helper}\n$EnvFile = Join-Path $env:TARGET_DIR '.env'\n`
      + 'Write-EnvFile -Value @("APP_PORT=3000","LOCAL_COMMUNITY_CATALOG_DIRECTORY=$env:CATALOG",@("EXTRA=1","EXTRA2=2"))';
    const result = runPwsh(['-Command', code], { TARGET_DIR: `/work/${NASTY_DIR}`, CATALOG: catalog });
    expect(result.status, result.stderr).toBe(0);
    const bytes = await readFile(join(dir, '.env'));
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    const text = bytes.toString('utf8');
    expect(text).toContain(`LOCAL_COMMUNITY_CATALOG_DIRECTORY=${catalog}`);
    expect(text).not.toContain('?');
    expect(text.split(/\r?\n/).filter(Boolean)).toEqual(['APP_PORT=3000', `LOCAL_COMMUNITY_CATALOG_DIRECTORY=${catalog}`, 'EXTRA=1', 'EXTRA2=2']);
  }, 130_000);
});

describe('Windows .bat launcher with hostile paths (apostrophe, accent, space, &, %, !)', () => {
  const launchLine = () => bat.split('\r\n').find((line) => line.startsWith('powershell.exe'));

  it('hands the file path to PowerShell through an environment variable, never interpolated in a quoted literal', () => {
    const lines = bat.split('\r\n');
    const setIndex = lines.indexOf('set "QUEUEBOT_SELF=%~f0"');
    expect(setIndex).toBeGreaterThan(lines.indexOf(':run'));
    expect(setIndex).toBeLessThan(lines.findIndex((line) => line.startsWith('powershell.exe')));
    expect(launchLine()).not.toContain('%~f0');
    expect(launchLine()).not.toContain('%~dp0');
    expect(launchLine()).toContain('ReadAllText($env:QUEUEBOT_SELF)');
    expect(bat).not.toMatch(/enabledelayedexpansion/i);
  });

  it.skipIf(!dockerReady)('runs the real launch command from a folder named with apostrophe, accent, space, &, %, ! and ^', async () => {
    const dir = join(work, NASTY_DIR);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'setup.bat'), bat, 'latin1');
    const command = launchLine().match(/-Command "(.*)"$/)[1];
    const result = runPwsh(['-Command', command], {
      QUEUEBOT_SELF: `/work/${NASTY_DIR}/setup.bat`, QUEUEBOT_INSTALLER_ARGS: '--help', QUEUEBOT_INSTALL_HOME: '/work/home',
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toMatch(/--(locale|port|language)/i);
  }, 130_000);
});
