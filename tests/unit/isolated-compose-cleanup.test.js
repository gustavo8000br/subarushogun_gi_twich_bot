import { describe, expect, it, vi } from 'vitest';
import { cleanupIsolatedComposeProject } from '../helpers/isolated-compose-cleanup.mjs';

const projectName = 'queuebot-accept-12345-1234abcd';
const composeFile = '/tmp/compose.yaml';

function makeDocker() {
  const runDocker = vi.fn((args) => {
    if (args[0] === 'compose' && args.includes('config')) {
      return { status: 0, stdout: JSON.stringify({ volumes: { postgres_data: {}, operational_secrets: {} } }) };
    }
    if (args[0] === 'compose') return { status: 0, stdout: '' };
    if (args[0] === 'volume' && args[1] === 'ls') return { status: 0, stdout: `${projectName}_postgres_data\n${projectName}_operational_secrets\n` };
    if (args[0] === 'volume' && args[1] === 'rm') return { status: 0, stdout: args.slice(2).join('\n') };
    return { status: 1, stderr: `unexpected docker call: ${args.join(' ')}` };
  });
  return runDocker;
}

describe('isolated Compose test cleanup', () => {
  it('stops only the uniquely named test project and removes only its labeled volumes', () => {
    const runDocker = makeDocker();

    cleanupIsolatedComposeProject({ projectName, composeFile, runDocker });

    expect(runDocker).toHaveBeenCalledWith(['compose', '--project-name', projectName, '--file', composeFile, 'down', '--remove-orphans']);
    expect(runDocker).toHaveBeenCalledWith(['volume', 'ls', '--quiet', '--filter', `label=com.docker.compose.project=${projectName}`]);
    expect(runDocker).toHaveBeenCalledWith(['volume', 'rm', `${projectName}_postgres_data`, `${projectName}_operational_secrets`]);
    expect(runDocker.mock.calls.flat().join(' ')).not.toContain('down --volumes');
  });

  it('fails closed if Compose resolves a test volume outside the unique test namespace', () => {
    const runDocker = makeDocker();
    runDocker.mockImplementation((args) => {
      if (args[0] === 'compose' && args.includes('config')) {
        return { status: 0, stdout: JSON.stringify({ volumes: { postgres_data: { name: 'subarushogun-gi-twitch-queue-bot_postgres_data' } } }) };
      }
      return { status: 0, stdout: '' };
    });

    expect(() => cleanupIsolatedComposeProject({ projectName, composeFile, runDocker }))
      .toThrow(/outside the isolated test namespace/i);
    expect(runDocker.mock.calls.some((call) => call[0][0] === 'volume' && call[0][1] === 'rm')).toBe(false);
  });

  it('refuses cleanup when the project name is not an isolated acceptance project', () => {
    const runDocker = makeDocker();

    expect(() => cleanupIsolatedComposeProject({ projectName: 'subarushogun-gi-twitch-queue-bot', composeFile, runDocker }))
      .toThrow(/isolated acceptance project/i);
    expect(runDocker).not.toHaveBeenCalled();
  });
});
