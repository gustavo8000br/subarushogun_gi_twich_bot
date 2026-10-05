import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);

function runStartScript({ browserExitCode = 0 } = {}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'queue bot script test '));
  const projectPath = join(temporaryRoot, 'project with spaces');
  const binPath = join(temporaryRoot, 'bin');
  const scriptPath = join(projectPath, 'iniciar.sh');
  const workingDirectoryCapture = join(temporaryRoot, 'docker-working-directory');
  const browserCapture = join(temporaryRoot, 'browser-url');
  mkdirSync(projectPath);
  mkdirSync(binPath);
  writeFileSync(scriptPath, readFileSync(new URL('iniciar.sh', root), 'utf8'));
  chmodSync(scriptPath, 0o755);
  const shims = {
    docker: `#!/bin/sh\nprintf '%s' "$PWD" > "$DOCKER_CWD_CAPTURE"\nexit 0\n`,
    curl: '#!/bin/sh\nexit 0\n',
    'xdg-open': `#!/bin/sh\nprintf '%s' "$1" > "$BROWSER_URL_CAPTURE"\nexit ${browserExitCode}\n`,
  };
  for (const [name, contents] of Object.entries(shims)) {
    const shimPath = join(binPath, name);
    writeFileSync(shimPath, contents);
    chmodSync(shimPath, 0o755);
  }
  const result = spawnSync('sh', [scriptPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binPath}:${process.env.PATH}`,
      DOCKER_CWD_CAPTURE: workingDirectoryCapture,
      BROWSER_URL_CAPTURE: browserCapture,
    },
  });
  const details = {
    result,
    workingDirectory: readFileSync(workingDirectoryCapture, 'utf8'),
    browserUrl: readFileSync(browserCapture, 'utf8'),
  };
  rmSync(temporaryRoot, { recursive: true, force: true });
  return details;
}

describe('POSIX first-run helper', () => {
  it('runs Compose from a project path containing spaces and opens the exact local panel URL', () => {
    const { result, workingDirectory, browserUrl } = runStartScript();
    expect(result.status, result.stderr).toBe(0);
    expect(workingDirectory).toMatch(/project with spaces$/);
    expect(browserUrl).toBe('https://localhost:3000');
  });

  it('prints the panel address when the browser launcher cannot open it', () => {
    const { result } = runStartScript({ browserExitCode: 1 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Painel: https://localhost:3000');
  });
});
