import { describe, expect, it, vi } from 'vitest';
import { runDevelopmentPreflight } from '../../apps/frontend/scripts/dev-preflight.mjs';

function commandResult(stdout = '') {
  return { status: 0, stdout, stderr: '' };
}

describe('development startup preflight', () => {
  it('checks dependencies and Docker before provisioning the managed database', async () => {
    const checkCommand = vi.fn().mockImplementation((_command, args) => {
      if (args[0] === '--version') return commandResult('v24.20.0');
      if (args[0] === 'compose') return commandResult('Docker Compose version v2.39.1');
      return args[0] === 'info' ? commandResult('27.4.0') : commandResult();
    });
    const checkDependencies = vi.fn().mockResolvedValue(true);

    await runDevelopmentPreflight({
      env: {},
      root: '/repo',
      checkCommand,
      checkDependencies,
    });

    expect(checkCommand.mock.calls.map(([command, args]) => [command, args[0]])).toEqual([
      [process.execPath, '--version'], ['docker', 'compose'], ['docker', 'info'],
    ]);
    expect(checkDependencies).toHaveBeenCalledWith('/repo');
  });

  it.each(['v2.39.1', 'v5.6.0'])(
    'accepts supported Docker Compose %s releases',
    async (version) => {
      const checkCommand = vi.fn().mockImplementation((_command, args) => {
        if (args[0] === '--version') return commandResult('v24.20.0');
        if (args[0] === 'compose') return commandResult(`Docker Compose version ${version}`);
        return args[0] === 'info' ? commandResult('29.9.1') : commandResult();
      });

      await expect(runDevelopmentPreflight({
        env: {}, root: '/repo', checkCommand, checkDependencies: vi.fn().mockResolvedValue(true),
      })).resolves.toBeUndefined();
    },
  );

  it('does not require Docker when an explicit database URL is configured', async () => {
    const checkCommand = vi.fn().mockReturnValue(commandResult('v24.20.0'));
    const checkDependencies = vi.fn().mockResolvedValue(true);

    await runDevelopmentPreflight({
      env: { DATABASE_URL: 'postgresql://dev:dev@localhost/queuebot' },
      root: '/repo',
      checkCommand,
      checkDependencies,
    });

    expect(checkCommand).toHaveBeenCalledTimes(1);
    expect(checkDependencies).toHaveBeenCalledWith('/repo');
  });

  it('fails before Docker/database work on an unsupported Node version', async () => {
    const checkCommand = vi.fn().mockReturnValue(commandResult('v22.1.0'));

    await expect(runDevelopmentPreflight({ env: {}, root: '/repo', checkCommand }))
      .rejects.toThrow('This project requires Node.js 24.20.0. Current version: v22.1.0.');
    expect(checkCommand).toHaveBeenCalledTimes(1);
  });

  it('gives an exact dependency recovery command before any database work', async () => {
    const checkCommand = vi.fn().mockReturnValue(commandResult('v24.20.0'));
    const checkDependencies = vi.fn().mockResolvedValue(false);

    await expect(runDevelopmentPreflight({
      env: { DATABASE_URL: 'postgresql://dev:dev@localhost/queuebot' },
      root: '/repo', checkCommand, checkDependencies,
    })).rejects.toThrow('Project dependencies are missing. Run npm ci from the repository root, then retry npm run dev.');
    expect(checkCommand).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['compose-missing', 'Docker Compose v2 or v5 is required. Install/start Docker Engine or Desktop, then retry npm run dev.'],
    ['engine-unavailable', 'Docker Engine is not running or accessible. Start Docker Desktop/Engine, then retry npm run dev.'],
  ])('reports a safe actionable Docker diagnostic for %s', async (failure, expectedMessage) => {
    const checkCommand = vi.fn().mockImplementation((_command, args) => {
      if (args[0] === '--version') return commandResult('v24.20.0');
      if (args[0] === 'compose') {
        return failure === 'compose-missing'
          ? { status: 1, stdout: '', stderr: 'untrusted internal detail' }
          : commandResult('Docker Compose version v2.39.1');
      }
      return args[0] === 'info'
        ? { status: 1, stdout: '', stderr: 'untrusted daemon detail' }
        : commandResult();
    });
    const checkDependencies = vi.fn().mockResolvedValue(true);

    await expect(runDevelopmentPreflight({ env: {}, root: '/repo', checkCommand, checkDependencies }))
      .rejects.toThrow(expectedMessage);
    try {
      await runDevelopmentPreflight({ env: {}, root: '/repo', checkCommand, checkDependencies });
    } catch (error) {
      expect(error.message).not.toMatch(/untrusted/);
    }
  });

  it('rejects Compose v1 even when the command exits successfully', async () => {
    const checkCommand = vi.fn().mockImplementation((_command, args) => args[0] === '--version'
      ? commandResult('v24.20.0')
      : commandResult('docker-compose version 1.29.2'));

    await expect(runDevelopmentPreflight({
      env: {}, root: '/repo', checkCommand, checkDependencies: vi.fn().mockResolvedValue(true),
    })).rejects.toThrow('Docker Compose v2 or v5 is required.');
    expect(checkCommand).toHaveBeenCalledTimes(2);
  });
});
