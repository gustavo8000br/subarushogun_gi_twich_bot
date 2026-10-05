import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);

function runScript(scriptName, { input = '', gitState = '', branch = 'main' } = {}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'queue maintenance '));
  const project = join(temporaryRoot, 'project with spaces');
  const bin = join(temporaryRoot, 'bin');
  mkdirSync(project); mkdirSync(bin);
  const scriptPath = join(project, scriptName);
  const sourcePath = new URL(scriptName, root);
  writeFileSync(scriptPath, existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : '#!/bin/sh\nprintf "maintenance helper missing\\n" >&2\nexit 127\n');
  chmodSync(scriptPath, 0o755);
  const log = join(temporaryRoot, 'commands.log');
  const localCertificate = join(project, '.local', 'localhost-ca.crt');
  mkdirSync(join(project, '.local')); writeFileSync(localCertificate, 'public test certificate');
  const docker = join(bin, 'docker');
  const git = join(bin, 'git');
  writeFileSync(docker, `#!/bin/sh\nprintf 'docker %s\\n' "$*" >> "$COMMAND_LOG"\n`);
  writeFileSync(git, `#!/bin/sh\nprintf 'git %s\\n' "$*" >> "$COMMAND_LOG"\ncase "$1 $2" in\n  'status --porcelain') printf '%s' "$GIT_STATE";;\n  'branch --show-current') printf '%s' "$GIT_BRANCH";;\nesac\n`);
  chmodSync(docker, 0o755); chmodSync(git, 0o755);
  const result = spawnSync('sh', [scriptPath], { input, encoding: 'utf8', env: {
    ...process.env, PATH: `${bin}:${process.env.PATH}`, COMMAND_LOG: log, GIT_STATE: gitState, GIT_BRANCH: branch,
  } });
  const commands = existsSync(log) ? readFileSync(log, 'utf8') : '';
  return { result, commands, project, temporaryRoot, localCertificate };
}

describe('maintenance helpers', () => {
  it('updates a clean main checkout by fast-forward before rebuilding Compose', () => {
    const { result, commands, temporaryRoot } = runScript('atualizar.sh');
    expect(result.status, result.stderr).toBe(0);
    expect(commands).toContain('git status --porcelain');
    expect(commands).toContain('git fetch origin main');
    expect(commands).toContain('git pull --ff-only origin main');
    expect(commands).toContain('docker compose up --build -d');
    rmSync(temporaryRoot, { recursive: true, force: true });
  });

  it('does not update a dirty checkout or a non-main branch', () => {
    const dirty = runScript('atualizar.sh', { gitState: ' M README.md' });
    expect(dirty.result.status).not.toBe(0);
    expect(dirty.commands).not.toContain('git pull');
    rmSync(dirty.temporaryRoot, { recursive: true, force: true });
    const feature = runScript('atualizar.sh', { branch: 'feat/test' });
    expect(feature.result.status).not.toBe(0);
    expect(feature.commands).not.toContain('git pull');
    rmSync(feature.temporaryRoot, { recursive: true, force: true });
  });

  it('uninstalls the Compose stack and image while preserving volumes by default', () => {
    const { result, commands, temporaryRoot, localCertificate } = runScript('desinstalar.sh', { input: 'n\n' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('preservados');
    expect(commands).toContain('docker compose down --rmi local');
    expect(commands).not.toContain('--volumes');
    expect(existsSync(localCertificate)).toBe(true);
    rmSync(temporaryRoot, { recursive: true, force: true });
  });

  it('deletes volumes and exported certificate only after two explicit confirmations', () => {
    const { result, commands, temporaryRoot, localCertificate } = runScript('desinstalar.sh', { input: 's\nAPAGAR\n' });
    expect(result.status, result.stderr).toBe(0);
    expect(commands).toContain('docker compose down --volumes --rmi local');
    expect(existsSync(localCertificate)).toBe(false);
    rmSync(temporaryRoot, { recursive: true, force: true });
  });

  it('cancels destructive uninstall when the typed confirmation does not match', () => {
    const { result, commands, temporaryRoot, localCertificate } = runScript('desinstalar.sh', { input: 's\nAPAGAR TUDO\n' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Cancelado');
    expect(commands).toBe('');
    expect(existsSync(localCertificate)).toBe(true);
    rmSync(temporaryRoot, { recursive: true, force: true });
  });

  it('ships Windows helpers with quoted project paths and matching data-preservation prompts', async () => {
    const updaterPath = new URL('../../atualizar.bat', import.meta.url);
    const uninstallerPath = new URL('../../desinstalar.bat', import.meta.url);
    const updater = existsSync(updaterPath) ? readFileSync(updaterPath, 'utf8') : '';
    const uninstaller = existsSync(uninstallerPath) ? readFileSync(uninstallerPath, 'utf8') : '';
    expect(updater).toContain('cd /d "%~dp0"');
    expect(updater).toContain('git pull --ff-only origin main');
    expect(updater).toContain('docker compose up --build -d');
    expect(uninstaller).toContain('cd /d "%~dp0"');
    expect(uninstaller).toContain('docker compose down --rmi local');
    expect(uninstaller).toContain('docker compose down --volumes --rmi local');
    expect(uninstaller).toContain('APAGAR');
  });
});
