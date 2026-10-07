import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const tempRoots = [];

function createFixture() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'queuebot-lifecycle-locale-'));
  tempRoots.push(tempRoot);
  const project = join(tempRoot, 'project with spaces');
  const bin = join(tempRoot, 'bin');
  mkdirSync(join(project, '.local'), { recursive: true });
  mkdirSync(join(project, 'apps', 'infra', 'scripts'), { recursive: true });
  mkdirSync(join(project, 'apps', 'web', 'localization', 'catalogs', 'lifecycle'), { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(project, '.local', 'product-locale.state'), 'locale=en\nrevision=2\n');
  writeFileSync(join(project, 'apps', 'infra', 'scripts', 'host-locale.sh'), readFileSync(new URL('../../apps/infra/scripts/host-locale.sh', import.meta.url), 'utf8'));
  writeFileSync(join(project, 'apps', 'web', 'localization', 'catalogs', 'lifecycle', 'en.tsv'), readFileSync(new URL('../../apps/web/localization/catalogs/lifecycle/en.tsv', import.meta.url), 'utf8'));
  writeFileSync(join(project, 'apps', 'web', 'localization', 'catalogs', 'lifecycle', 'pt-BR.tsv'), readFileSync(new URL('../../apps/web/localization/catalogs/lifecycle/pt-BR.tsv', import.meta.url), 'utf8'));
  writeFileSync(join(bin, 'docker'), '#!/bin/sh\nprintf "docker %s\\n" "$*" >> "$COMMAND_LOG"\n');
  writeFileSync(join(bin, 'git'), '#!/bin/sh\ncase "$1 $2" in\n  "rev-parse --is-inside-work-tree") printf true;;\n  "branch --show-current") printf feature;;\n  "status --porcelain") :;;\nesac\n');
  chmodSync(join(bin, 'docker'), 0o755);
  chmodSync(join(bin, 'git'), 0o755);
  return { project, bin, tempRoot };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('host lifecycle output follows the saved product locale', () => {
  it('localizes updater precondition messages from the product catalog', () => {
    const { project, bin, tempRoot } = createFixture();
    const script = join(project, 'atualizar.sh');
    writeFileSync(script, readFileSync(new URL('../../atualizar.sh', import.meta.url), 'utf8'));
    chmodSync(script, 0o755);
    const result = spawnSync('sh', [script], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, COMMAND_LOG: join(tempRoot, 'commands.log') } });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Update only from the main branch. (Current branch: feature).');
    expect(result.stderr).not.toContain('Atualize a partir');
  });

  it('localizes the preserve-data uninstall confirmation without changing its safe default', () => {
    const { project, bin, tempRoot } = createFixture();
    const script = join(project, 'desinstalar.sh');
    writeFileSync(script, readFileSync(new URL('../../desinstalar.sh', import.meta.url), 'utf8'));
    chmodSync(script, 0o755);
    const result = spawnSync('sh', [script], { input: 'n\n', encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, COMMAND_LOG: join(tempRoot, 'commands.log') } });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Delete this project');
    expect(result.stdout).toContain('Application removed; database, secrets, and public certificate were preserved.');
    expect(result.stdout).not.toContain('Deseja apagar');
  });
});
