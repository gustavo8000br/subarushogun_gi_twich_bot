import { describe, expect, it, vi } from 'vitest';
import { cleanupIsolatedPostgres } from '../helpers/isolated-postgres-cleanup.mjs';

describe('isolated PostgreSQL test cleanup', () => {
  it('removes the test container before its volume and verifies both are absent', () => {
    const runDocker = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: 'container-id', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'Error: no such object: queuebot-test' })
      .mockReturnValueOnce({ status: 0, stdout: 'volume-id', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'No such volume' });

    cleanupIsolatedPostgres({ containerName: 'queuebot-test', volumeName: 'queuebot-test-data', runDocker });

    expect(runDocker.mock.calls).toEqual([
      [['rm', '--force', 'queuebot-test']],
      [['inspect', 'queuebot-test']],
      [['volume', 'rm', '--force', 'queuebot-test-data']],
      [['volume', 'inspect', 'queuebot-test-data']],
    ]);
  });

  it('fails visibly when the isolated test volume remains after removal', () => {
    const runDocker = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: 'container-id', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'Error: no such object: queuebot-test' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'in use' })
      .mockReturnValueOnce({ status: 0, stdout: 'still-present', stderr: '' });

    expect(() => cleanupIsolatedPostgres({ containerName: 'queuebot-test', volumeName: 'queuebot-test-data', runDocker }))
      .toThrow(/volume cleanup failed/i);
  });
});
