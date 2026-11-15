import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pbkdf2Sync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load } from 'js-yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// OPS-15 / windows-owner-test-installer (AC-T1..AC-T7): the owner-only test installer is protected by a PBKDF2 password
// hash that only exists when the packager is given one; the production installer must stay byte-for-byte unchanged.
// Static contracts run everywhere; PowerShell behaviour runs in a disposable pwsh container (skipped without the image).
const root = fileURLToPath(new URL('../../', import.meta.url));
const packager = join(root, 'apps/infra/scripts/package-installer.mjs');
const helperPath = join(root, 'apps/infra/scripts/gen-test-password-hash.mjs');
const psHelperPath = join(root, 'apps/infra/scripts/windows/Gerar-Hash-Senha.ps1');
const workflowPath = join(root, 'apps/infra/test-owner/windows-owner-test-installer.yml');
const installerPath = join(root, 'apps/infra/installer/installer.ps1');
const IMAGE_TAG = 'v1.0.0-a1b2c3d-beta';
const PWSH_IMAGE = 'mcr.microsoft.com/powershell:latest';
// Decoy values: they only exist in this test and must never show up in any output or file.
const DECOY = 'decoy-Correct-Horse-Battery-Staple-7731';
const WRONG = 'decoy-WRONG-guess-0042-zzzzzzzzzz';
const HASH_ENV = 'TEST_INSTALLER_PASSWORD_HASH';
const HASH_SHAPE = /^pbkdf2-sha256\$600000\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$/;

const decodePayload = (artifact) => Buffer.from(
  artifact.match(/:payload\r?\n([\s\S]*?)\r?\n:endpayload/)?.[1]?.replace(/\s/g, '') ?? '', 'base64',
).toString('utf16le');

const dockerReady = spawnSync('docker', ['image', 'inspect', PWSH_IMAGE], { encoding: 'utf8' }).status === 0;

let work;
let hash;
let helper;
let officialBat;
let testBat;
let testScript;

const build = (extraArgs, env = {}, outputDir = work) => spawnSync(process.execPath, [
  packager, '--platform', 'windows', '--output', outputDir, '--image-tag', IMAGE_TAG, '--product-version', IMAGE_TAG, ...extraArgs,
], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });

beforeAll(async () => {
  await mkdir(join(root, '.local'), { recursive: true });
  work = await mkdtemp(join(root, '.local', 'windows-owner-test-'));
  helper = await import(pathToFileURL(helperPath).href);
  hash = helper.hashPassword(DECOY);
  const officialDir = join(work, 'official');
  const testDir = join(work, 'test');
  const official = build([], {}, officialDir);
  expect(official.status, official.stderr).toBe(0);
  officialBat = await readFile(join(officialDir, 'subarushogun_twich_bot_setup.bat'), 'latin1');
  const guarded = build(['--password-hash-env', HASH_ENV], { [HASH_ENV]: hash }, testDir);
  expect(guarded.status, guarded.stderr).toBe(0);
  testBat = await readFile(join(testDir, 'subarushogun_twich_bot_setup.bat'), 'latin1');
  testScript = decodePayload(testBat).replace(/\r\n/g, '\n');
}, 60_000);

afterAll(async () => {
  if (work) await rm(work, { recursive: true, force: true });
});

describe('AC-T1: production installer is unchanged when no hash is supplied', () => {
  it('embeds exactly installer.ps1 with the usual replacements, no guard, no placeholder', async () => {
    const source = await readFile(installerPath, 'utf8');
    const payload = decodePayload(officialBat);
    const compose = payload.match(/\$ComposeBase64 = '([^']*)'/)[1];
    const expected = source.replace('__COMPOSE_B64__', compose).replaceAll('__IMAGE_TAG__', IMAGE_TAG).replaceAll('__PRODUCT_VERSION__', IMAGE_TAG);
    expect(payload).toBe(expected);
    expect(payload).not.toMatch(/TestPassword|pbkdf2|AsSecureString|__TEST_PASSWORD_HASH__/i);
    expect(source).not.toMatch(/pbkdf2|AsSecureString/i);
  });

  it('keeps the launcher lines identical between official and guarded builds (only the payload differs)', () => {
    const strip = (artifact) => artifact.replace(/:payload\r?\n[\s\S]*?\r?\n:endpayload/, ':payload\n:endpayload');
    expect(strip(testBat)).toBe(strip(officialBat));
  });
});

describe('AC-T2: packager fails closed and never prints the hash', () => {
  const badValues = (good) => {
    const [algorithm, iterations, salt, digest] = good.split('$');
    return {
      empty: '',
      'not the shape': 'plain-text',
      'wrong algorithm': ['pbkdf2-sha1', iterations, salt, digest].join('$'),
      'iterations too low': [algorithm, '1000', salt, digest].join('$'),
      'iterations too high': [algorithm, '9000000', salt, digest].join('$'),
      'short salt': [algorithm, iterations, 'QUJD', digest].join('$'),
      'short digest': [algorithm, iterations, salt, 'QUJD'].join('$'),
      'trailing space': `${good} `,
      'extra field': `${good}$x`,
    };
  };
  for (const name of Object.keys(badValues('pbkdf2-sha256$600000$a$b'))) {
    it(`rejects ${name} with exit 2, no output file and no echo of the value`, async () => {
      const value = badValues(hash)[name];
      const outputDir = join(work, `bad-${name.replace(/\W+/g, '-')}`);
      const result = build(['--password-hash-env', HASH_ENV], { [HASH_ENV]: value }, outputDir);
      expect(result.status).toBe(2);
      if (value.length > 8) expect(`${result.stdout}${result.stderr}`).not.toContain(value);
      const files = await readdir(outputDir).catch(() => []);
      expect(files).not.toContain('subarushogun_twich_bot_setup.bat');
    });
  }

  it('fails closed when the named environment variable is missing (never falls back to an official build)', async () => {
    const outputDir = join(work, 'missing-env');
    const result = build(['--password-hash-env', HASH_ENV], {}, outputDir);
    expect(result.status).toBe(2);
    const files = await readdir(outputDir).catch(() => []);
    expect(files).not.toContain('subarushogun_twich_bot_setup.bat');
  });

  it('accepts only an upper-case variable name and no password or hash on argv', () => {
    expect(build(['--password-hash-env', 'lower'], { lower: hash }, join(work, 'x1')).status).toBe(2);
    for (const option of ['--test-password-hash', '--password']) {
      const result = build([option, hash], {}, join(work, 'x2'));
      expect(result.status).toBe(2);
      expect(`${result.stdout}${result.stderr}`).not.toContain(hash);
    }
  });

  it('rejects the guard for non-Windows platforms', () => {
    const result = spawnSync(process.execPath, [packager, '--platform', 'linux', '--output', join(work, 'lin'), '--password-hash-env', HASH_ENV], {
      cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, [HASH_ENV]: hash },
    });
    expect(result.status).toBe(2);
  });

  it('prints only the output path on success, never the hash', () => {
    const result = build(['--password-hash-env', HASH_ENV], { [HASH_ENV]: hash }, join(work, 'ok'));
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(hash);
    expect(`${result.stdout}${result.stderr}`).not.toContain(DECOY);
  });
});

describe('hash format and helpers (AC-T4)', () => {
  it('uses pbkdf2-sha256$600000$<salt16>$<hash32> and matches node:crypto', () => {
    expect(hash).toMatch(HASH_SHAPE);
    const [algorithm, iterations, salt, digest] = hash.split('$');
    expect(algorithm).toBe('pbkdf2-sha256');
    expect(Number(iterations)).toBe(600000);
    expect(Buffer.from(salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(digest, 'base64')).toHaveLength(32);
    expect(pbkdf2Sync(Buffer.from(DECOY, 'utf8'), Buffer.from(salt, 'base64'), 600000, 32, 'sha256').toString('base64')).toBe(digest);
  });

  it('uses a fresh random salt on every call and verifies correct/incorrect passwords', () => {
    expect(helper.hashPassword(DECOY)).not.toBe(hash);
    expect(helper.verifyPassword(DECOY, hash)).toBe(true);
    expect(helper.verifyPassword(WRONG, hash)).toBe(false);
    expect(helper.verifyPassword(DECOY, 'garbage')).toBe(false);
  });

  it('refuses non-ASCII passwords (console encodings could hash different bytes)', () => {
    expect(() => helper.hashPassword('a-long-password-with-\u00e7-accent')).toThrow(/ASCII/);
  });

  it('every Rfc2898DeriveBytes call passes SHA256 (the constructors without HashAlgorithmName use SHA-1)', async () => {
    const sources = [testScript, await readFile(psHelperPath, 'utf8'), await readFile(installerPath, 'utf8')];
    let calls = 0;
    for (const source of sources) {
      for (const line of source.split(/\r?\n/).filter((item) => item.includes('Rfc2898DeriveBytes('))) {
        calls += 1;
        expect(line, line).toContain('[System.Security.Cryptography.HashAlgorithmName]::SHA256');
      }
      expect(source).not.toMatch(/Rfc2898DeriveBytes\([^)]*\)\s*\n?\s*\.GetBytes[^\n]*SHA1|HashAlgorithmName\]::SHA1|\[Pbkdf2\]|::Pbkdf2\(/);
    }
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('refuses short passwords', () => {
    expect(() => helper.hashPassword('short')).toThrow();
  });

  it('node helper reads the password from stdin, prints only the hash line, and leaks nothing', () => {
    const result = spawnSync(process.execPath, [helperPath], { cwd: root, encoding: 'utf8', input: `${DECOY}\n`, env: { PATH: process.env.PATH } });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toMatch(HASH_SHAPE);
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain(DECOY);
    expect(helper.verifyPassword(DECOY, result.stdout.trim())).toBe(true);
  });

  it('helpers never take a password from argv or the environment and never write files or history', async () => {
    const sources = [await readFile(helperPath, 'utf8'), await readFile(psHelperPath, 'utf8')];
    for (const source of sources) {
      expect(source).not.toMatch(/process\.argv\.slice\(2\)\s*\[0\]|\$args\[0\]|param\s*\(\s*\[string\]\s*\$(Senha|Password)/i);
      expect(source).not.toMatch(/writeFile|appendFile|Out-File|Set-Content|Add-Content|Start-Transcript|process\.env\.(PASSWORD|SENHA)/i);
    }
    expect(sources[1]).toContain('-AsSecureString');
    expect(sources[1]).toMatch(/pbkdf2-sha256/);
  });
});

describe('AC-T1/T3: guard placement and secrecy in the generated installer', () => {
  it('embeds the hash exactly once and never in the .bat outside the encoded payload', () => {
    expect(testScript.split(hash)).toHaveLength(2);
    expect(testBat).not.toContain(hash);
  });

  it('sits after Parse-CommandLine and before every other installer action', () => {
    const parse = testScript.indexOf('$parseStatus=Parse-CommandLine');
    const exitCheck = testScript.indexOf('if ($parseStatus -ne 0) { exit $parseStatus }');
    const begin = testScript.indexOf('# BEGIN TEST PASSWORD GUARD');
    const end = testScript.indexOf('# END TEST PASSWORD GUARD');
    const guardCall = testScript.indexOf('\nInvoke-TestPasswordGuard\n', begin);
    expect(parse).toBeGreaterThan(-1);
    expect(exitCheck).toBeGreaterThan(parse);
    // The guard block starts immediately after the argument-parse check: nothing else runs in between.
    expect(testScript.slice(exitCheck + 'if ($parseStatus -ne 0) { exit $parseStatus }'.length, begin).trim()).toBe('');
    expect(guardCall).toBeGreaterThan(begin);
    expect(guardCall).toBeLessThan(end);
    // Inside the block, the definitions are followed by the single guard call; every main-flow action comes after it.
    const afterGuard = testScript.slice(end);
    for (const marker of ['Prompt-Language)', 'Clear-InstallerScreen\n', 'Write-Host (T \'header\')', 'while ($true)', 'Setup-Product }']) {
      expect(afterGuard.indexOf(marker), marker).toBeGreaterThan(0);
    }
    expect(testScript.match(/function Invoke-TestPasswordGuard/g)).toHaveLength(1);
  });

  const guard = () => testScript.slice(testScript.indexOf('# BEGIN TEST PASSWORD GUARD'), testScript.indexOf('# END TEST PASSWORD GUARD'));

  it('asks with -AsSecureString, zeroes the buffers and compares by accumulated XOR only', () => {
    const text = guard();
    expect(text.length).toBeGreaterThan(200);
    expect(text).toContain('-AsSecureString');
    expect(text).toContain('ZeroFreeBSTR');
    expect(text).toContain('[Array]::Clear');
    expect(text).toContain('-bxor');
    expect(text).toContain('Rfc2898DeriveBytes');
    // Same bounds as the packager (100000 to 2000000 iterations, 16-byte salt, 32-byte hash).
    expect(text).toContain('$iterations -lt 100000');
    expect(text).toContain('$iterations -gt 2000000');
    expect(text).toMatch(/\$salt\.Length -ne 16 -or \$reference\.Length -ne 32/);
    expect(text).toContain('HashAlgorithmName');
    // Older .NET runtimes (< 4.7.2) fall back to the HMAC loop; if that is impossible too, the guard says so and denies.
    expect(text).toContain('QueueBotPbkdf2');
    expect(text).toMatch(/'runtime'\); exit 4/);
    expect(text).toMatch(/exit 4/);
    expect(text).not.toMatch(/\$(expected|actual|derived|computed|digest|hashBytes|calc)\w*\s+-c?(eq|ne)\s+\$/i);
    expect(text).not.toMatch(/-(c|i)?(eq|ne|like|match)\s+\$\w*(hash|digest)\w*/i);
    expect(text).not.toContain('SequenceEqual');
  });

  it('never writes, echoes or exports the password or its bytes', () => {
    const text = guard();
    expect(text).not.toMatch(/Out-File|Set-Content|Add-Content|Export-|Start-Transcript|Tee-Object|\[IO\.File\]|SetEnvironmentVariable|\$env:\w+\s*=/);
    expect(text).not.toMatch(/Write-(Host|Output|Verbose|Debug|Warning|Error)[^\n]*\$(pw|password|plain|bytes|secure|derived|candidate)/i);
    expect(text).not.toMatch(/ConvertFrom-SecureString|Write-Output|\| Out-Host/);
  });

  it('does not let QUEUEBOT_TEST_MODE skip the guard and denies silent runs', () => {
    const text = guard();
    expect(text).not.toMatch(/if\s*\(\s*(-not\s+)?\$TestMode[^)]*\)\s*\{\s*(return|exit 0|\$null)/);
    expect(text).not.toMatch(/\$env:QUEUEBOT_TEST_MODE/);
    expect(text).toContain('$script:NonInteractive');
    expect(text).toMatch(/NonInteractive[\s\S]{0,200}exit 4/);
    expect(text).toMatch(/Start-Sleep\s+-Seconds\s+2/);
    expect(text).toMatch(/\$attempt\s*-lt\s*3|1\.\.3/);
  });

  it('never accepts the password through arguments or the environment', () => {
    expect(guard()).not.toMatch(/QUEUEBOT_INSTALLER_ARGS|QUEUEBOT_PASSWORD|\$env:\w*(PASS|SENHA)/i);
  });

  it('Validar-SubaruShogun.ps1 neither asks for nor records the password', async () => {
    const validator = await readFile(join(root, 'apps/infra/scripts/windows/Validar-SubaruShogun.ps1'), 'utf8');
    expect(validator).not.toMatch(/-AsSecureString|\[string\]\$(Senha|Password)|param\([^)]*(Senha|Password)/i);
  });
});

describe('AC-T5: workflow file (stored outside .github/workflows on purpose)', () => {
  let text;
  let doc;
  beforeAll(async () => {
    text = await readFile(workflowPath, 'utf8');
    doc = load(text);
  });

  it('is not present in .github/workflows (it must never reach main)', async () => {
    const files = await readdir(join(root, '.github/workflows'));
    expect(files.filter((name) => /windows-owner|test-windows/i.test(name))).toEqual([]);
  });

  it('triggers only on push to test/windows-owner', () => {
    const on = doc.on ?? doc[true];
    expect(Object.keys(on)).toEqual(['push']);
    expect(on.push.branches).toEqual(['test/windows-owner']);
    expect(on.push.tags).toBeUndefined();
    // An empty commit does not trigger a paths filter: the marker file must change in every run-starting push.
    expect(on.push.paths).toEqual(['apps/infra/test-owner/RUN-MARKER']);
  });

  it('has no permissions at workflow level, contents: write only in the single job, with the approval Environment', () => {
    expect(doc.permissions).toEqual({});
    const jobs = Object.entries(doc.jobs);
    expect(jobs).toHaveLength(1);
    const [, job] = jobs[0];
    expect(job.permissions).toEqual({ contents: 'write' });
    expect(job.environment).toBe('windows-owner-test');
    expect(job['timeout-minutes']).toBeGreaterThan(0);
    expect(job['timeout-minutes']).toBeLessThanOrEqual(30);
    expect(doc.concurrency).toMatchObject({ group: 'test-windows-owner', 'cancel-in-progress': false });
    expect(job.if).toContain("github.ref == 'refs/heads/test/windows-owner'");
    expect(job.if).toContain("github.actor == 'gustavo8000br'");
  });

  it('checks out without persisting credentials and pins every action to a commit SHA', () => {
    const steps = Object.values(doc.jobs)[0].steps;
    const checkout = steps.find((step) => String(step.uses ?? '').startsWith('actions/checkout@'));
    expect(checkout.with['persist-credentials']).toBe(false);
    for (const step of steps.filter((item) => item.uses)) expect(step.uses, step.uses).toMatch(/@[0-9a-f]{40}(\s|$)/);
    expect(steps.some((step) => /npm ci --ignore-scripts/.test(step.run ?? ''))).toBe(true);
  });

  it('never uploads an artifact (public repository artifacts are downloadable by any signed-in account)', () => {
    expect(text).not.toMatch(/upload-artifact|download-artifact|actions\/cache/i);
  });

  it('exposes the secret and the token only in the env of the step that needs them', () => {
    const steps = Object.values(doc.jobs)[0].steps;
    const withSecret = steps.filter((step) => JSON.stringify(step).includes('secrets.TEST_INSTALLER_PASSWORD_HASH'));
    expect(withSecret).toHaveLength(1);
    expect(withSecret[0].env.TEST_INSTALLER_PASSWORD_HASH).toBe('${{ secrets.TEST_INSTALLER_PASSWORD_HASH }}');
    const withToken = steps.filter((step) => JSON.stringify(step).includes('GH_TOKEN'));
    expect(withToken).toHaveLength(1);
    expect(withToken[0].run).toContain('gh release create');
    expect(doc.env).toBeUndefined();
    expect(Object.values(doc.jobs)[0].env).toBeUndefined();
    expect(text).not.toMatch(/\$\{\{\s*(github\.event|inputs)\./);
  });

  it('never echoes the secret or the installer and never turns shell tracing on', () => {
    const runs = Object.values(doc.jobs)[0].steps.map((step) => step.run ?? '').join('\n');
    expect(runs).not.toMatch(/set\s+-[a-z]*x|set\s+-o\s+xtrace|bash\s+-x/);
    expect(runs).not.toMatch(/(echo|printf|cat)\b[^\n]*TEST_INSTALLER_PASSWORD_HASH/);
    expect(runs).not.toMatch(/\bcat\b[^\n]*\.bat|\benv\b\s*(\||$)|\bprintenv\b|ACTIONS_STEP_DEBUG/m);
    expect(runs).toContain('set -euo pipefail');
    expect(runs).toContain('--password-hash-env TEST_INSTALLER_PASSWORD_HASH');
    expect(runs).not.toMatch(/--password-hash-env\s+"?\$/);
  });

  it('aborts before packaging when the secret is empty (for instance a repository that turned private ignores Secrets)', () => {
    const step = Object.values(doc.jobs)[0].steps.find((item) => (item.run ?? '').includes('package-installer.mjs'));
    expect(step.run.indexOf('-z "${TEST_INSTALLER_PASSWORD_HASH:-}"')).toBeGreaterThan(-1);
    expect(step.run.indexOf('-z "${TEST_INSTALLER_PASSWORD_HASH:-}"')).toBeLessThan(step.run.indexOf('node apps/infra/scripts/package-installer.mjs'));
    expect(step.run).toMatch(/exit 1/);
  });

  it('creates a draft pre-release named test-windows-<run_id> with the SHA256 and no hash in the notes', () => {
    const runs = Object.values(doc.jobs)[0].steps.map((step) => step.run ?? '').join('\n');
    const create = runs.match(/gh release create[\s\S]*?(?=\n\S|$)/)[0];
    expect(create).toContain('--draft');
    expect(create).toContain('--prerelease');
    expect(create).toContain('test-windows-$GITHUB_RUN_ID');
    // GITHUB_TOKEN has no `workflow` scope: a target commit that changes .github/workflows would be refused, so target main.
    expect(create).toContain('--target main');
    expect(create).not.toContain('--target "$GITHUB_SHA"');
    expect(create).toMatch(/--notes[^\n]*\$GITHUB_SHA[^\n]*NEVER publish/);
    expect(runs).toMatch(/sha256sum/);
    expect(runs).not.toMatch(/--latest|gh release (edit|upload)|--draft=false/);
    expect(create).not.toMatch(/--latest|TEST_INSTALLER_PASSWORD_HASH/);
  });
});

describe('leak scan (AC-T3)', () => {
  it('the decoy password and its hash never appear in the built files, their decoded payloads or the build output', async () => {
    const decoyForms = [DECOY, Buffer.from(DECOY).toString('base64'), Buffer.from(DECOY, 'utf16le').toString('base64')];
    for (const artifact of [officialBat, testBat, testScript]) {
      for (const form of decoyForms) expect(artifact).not.toContain(form);
    }
    expect(officialBat).not.toContain(hash);
    const stack = [work];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { stack.push(full); continue; }
        const content = await readFile(full, 'latin1');
        for (const form of decoyForms) expect(content, full).not.toContain(form);
      }
    }
  });
});

describe.skipIf(!dockerReady)('guard behaviour in a disposable pwsh container', () => {
  const runInstaller = async ({ name, lines, args = '', env = {} }) => {
    const dir = join(work, `run-${name}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'installer.ps1'), testScript);
    await writeFile(join(dir, 'input.txt'), `${lines.join('\n')}\n`);
    const envArgs = Object.entries({
      QUEUEBOT_TEST_MODE: '1', QUEUEBOT_TEST_INPUT_FILE: `/work/run-${name}/input.txt`, QUEUEBOT_INSTALL_HOME: `/work/run-${name}/home`,
      QUEUEBOT_INSTALLER_ARGS: args, ...env,
    }).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
    const result = spawnSync('docker', [
      'run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`, '-e', 'HOME=/work', '-e', 'DOTNET_CLI_HOME=/work',
      ...envArgs, '-v', `${work}:/work`, '-w', '/work', PWSH_IMAGE, 'pwsh', '-NoLogo', '-NoProfile', '-File', `/work/run-${name}/installer.ps1`,
    ], { encoding: 'utf8', timeout: 180_000 });
    return { ...result, output: `${result.stdout}\n${result.stderr}`, dir };
  };

  it('lets the correct password through to the installer menu', async () => {
    const result = await runInstaller({ name: 'ok', lines: [DECOY, '2', '0'] });
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('Installer');
    expect(result.output).not.toMatch(/Invalid password|Senha inv/i);
  }, 200_000);

  it('rejects a wrong password three times, exits 4 and never reaches the installer', async () => {
    const result = await runInstaller({ name: 'wrong', lines: [WRONG, WRONG, WRONG, DECOY, '2', '0'] });
    expect(result.status, result.output).toBe(4);
    expect(result.output.match(/Invalid password/g)).toHaveLength(3);
    expect(result.output).not.toContain('Installer version');
    expect(result.output).not.toContain(WRONG);
  }, 200_000);

  it('treats empty and missing input as failed attempts', async () => {
    const result = await runInstaller({ name: 'empty', lines: ['', '', ''] });
    expect(result.status, result.output).toBe(4);
    expect(result.output).not.toContain('Installer version');
  }, 200_000);

  it('QUEUEBOT_TEST_MODE does not bypass the guard (input from file still has to be right)', async () => {
    const result = await runInstaller({ name: 'testmode', lines: ['2', '0', '0'] });
    expect(result.status, result.output).toBe(4);
    expect(result.output).not.toContain('Installer version');
  }, 200_000);

  it('denies silent and non-interactive runs with exit 4 and does not read any answer', async () => {
    const result = await runInstaller({ name: 'silent', lines: [DECOY], args: '--silent install' });
    expect(result.status, result.output).toBe(4);
    expect(result.output).not.toContain('Installer version');
  }, 200_000);

  it('still answers --help with exit 0 before asking for a password', async () => {
    const result = await runInstaller({ name: 'help', lines: [], args: '--help' });
    expect(result.status, result.output).toBe(0);
    expect(result.output).toMatch(/Usage:/);
  }, 200_000);

  it('fails closed for a malformed or unreplaced hash', async () => {
    for (const [name, bad] of [['malformed', 'pbkdf2-sha256$600000$AAAA$BBBB'], ['placeholder', '__TEST_PASSWORD_HASH__'], ['blank', ''], ['lowiter', hash.replace('$600000$', '$1$')]]) {
      const dir = join(work, `run-${name}`);
      await mkdir(dir, { recursive: true });
      const mutated = testScript.replace(hash, bad);
      await writeFile(join(dir, 'installer.ps1'), mutated);
      await writeFile(join(dir, 'input.txt'), `${DECOY}\n2\n0\n`);
      const result = spawnSync('docker', [
        'run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`, '-e', 'HOME=/work', '-e', 'DOTNET_CLI_HOME=/work',
        '-e', 'QUEUEBOT_TEST_MODE=1', '-e', `QUEUEBOT_TEST_INPUT_FILE=/work/run-${name}/input.txt`, '-e', `QUEUEBOT_INSTALL_HOME=/work/run-${name}/home`,
        '-v', `${work}:/work`, '-w', '/work', PWSH_IMAGE, 'pwsh', '-NoLogo', '-NoProfile', '-File', `/work/run-${name}/installer.ps1`,
      ], { encoding: 'utf8', timeout: 180_000 });
      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.status, `${name}\n${output}`).toBe(4);
      expect(output, name).not.toContain('Installer version');
      expect(output, name).not.toContain(DECOY);
    }
  }, 400_000);

  it('verifies a hash made by the Node helper and by the PowerShell helper (interoperability)', async () => {
    const dir = join(work, 'run-ps-helper');
    await mkdir(dir, { recursive: true });
    const made = spawnSync('docker', [
      'run', '--rm', '-i', '--user', `${process.getuid()}:${process.getgid()}`, '-e', 'HOME=/work', '-e', 'DOTNET_CLI_HOME=/work',
      '-v', `${work}:/work`, '-v', `${psHelperPath}:/helper/Gerar-Hash-Senha.ps1:ro`, PWSH_IMAGE, 'pwsh', '-NoLogo', '-NoProfile', '-File', '/helper/Gerar-Hash-Senha.ps1',
    ], { encoding: 'utf8', input: `${DECOY}\n`, timeout: 120_000 });
    expect(made.status, made.stderr).toBe(0);
    expect(`${made.stdout}${made.stderr}`).not.toContain(DECOY);
    const psHash = made.stdout.trim().split('\n').pop();
    expect(psHash).toMatch(HASH_SHAPE);
    expect(helper.verifyPassword(DECOY, psHash)).toBe(true);
    const built = join(work, 'ps-built');
    const result = build(['--password-hash-env', HASH_ENV], { [HASH_ENV]: psHash }, built);
    expect(result.status, result.stderr).toBe(0);
    const script = decodePayload(await readFile(join(built, 'subarushogun_twich_bot_setup.bat'), 'latin1')).replace(/\r\n/g, '\n');
    await mkdir(join(work, 'run-interop'), { recursive: true });
    await writeFile(join(work, 'run-interop/installer.ps1'), script);
    await writeFile(join(work, 'run-interop/input.txt'), `${DECOY}\n2\n0\n`);
    const run = spawnSync('docker', [
      'run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`, '-e', 'HOME=/work', '-e', 'DOTNET_CLI_HOME=/work',
      '-e', 'QUEUEBOT_TEST_MODE=1', '-e', 'QUEUEBOT_TEST_INPUT_FILE=/work/run-interop/input.txt', '-e', 'QUEUEBOT_INSTALL_HOME=/work/run-interop/home',
      '-v', `${work}:/work`, '-w', '/work', PWSH_IMAGE, 'pwsh', '-NoLogo', '-NoProfile', '-File', '/work/run-interop/installer.ps1',
    ], { encoding: 'utf8', timeout: 180_000 });
    expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
  }, 400_000);

  it('the pure PowerShell fallback derivation (Add-Type HMAC loop) matches node:crypto', async () => {
    const text = testScript.slice(testScript.indexOf('# BEGIN TEST PASSWORD GUARD'), testScript.indexOf('# END TEST PASSWORD GUARD'));
    const [, , salt, digest] = hash.split('$');
    const code = `${text.replace(/\nInvoke-TestPasswordGuard\s*$/m, '\n')}\n`
      + `$bytes=[Text.Encoding]::UTF8.GetBytes($env:PW); $d=Get-TestPasswordDigestFallback $bytes ([Convert]::FromBase64String($env:SALT)) 600000; [Convert]::ToBase64String($d)`;
    const result = spawnSync('docker', [
      'run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`, '-e', 'HOME=/work', '-e', 'DOTNET_CLI_HOME=/work',
      '-e', `PW=${DECOY}`, '-e', `SALT=${salt}`, '-v', `${work}:/work`, '-w', '/work', PWSH_IMAGE, 'pwsh', '-NoLogo', '-NoProfile', '-Command', code,
    ], { encoding: 'utf8', timeout: 180_000 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split('\n').pop()).toBe(digest);
  }, 200_000);

  it('leaves no decoy or hash copy in stdout, stderr or any file under the run directories', async () => {
    const stack = [work];
    const forms = [DECOY, WRONG, Buffer.from(DECOY).toString('base64'), Buffer.from(WRONG).toString('base64')];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { stack.push(full); continue; }
        if (entry.name === 'input.txt' || entry.name === 'in.txt') continue; // the scripted test input itself
        const content = await readFile(full, 'latin1');
        for (const form of forms) expect(content, full).not.toContain(form);
      }
    }
  });
});
