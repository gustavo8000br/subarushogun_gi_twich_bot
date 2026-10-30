import { describe, expect, it, vi } from 'vitest';
import { cleanupIsolatedPostgres } from '../helpers/isolated-postgres-cleanup.mjs';

const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const containerMissing = { status: 1, stdout: '', stderr: 'error: no such object: queuebot-test' };
const volumeMissing = { status: 1, stdout: '', stderr: 'Error: No such volume: queuebot-test-data' };

/**
 * Fake clock: every sleep advances time, so deadline tests finish without real waiting.
 */
function fakeClock() {
  let current = 0;
  return {
    now: () => current,
    sleep: vi.fn(async (ms) => { current += ms; }),
  };
}

function argsOf(runDocker) {
  return runDocker.mock.calls.map(([args]) => args);
}

describe('isolated PostgreSQL test cleanup', () => {
  it('removes the test container before its volume and verifies both are absent', async () => {
    const runDocker = vi.fn()
      .mockReturnValueOnce(ok('container-id'))
      .mockReturnValueOnce(containerMissing)
      .mockReturnValueOnce(ok('volume-id'))
      .mockReturnValueOnce(volumeMissing);
    const clock = fakeClock();

    await cleanupIsolatedPostgres({ containerName: 'queuebot-test', volumeName: 'queuebot-test-data', runDocker, ...clock });

    expect(argsOf(runDocker)).toEqual([
      ['rm', '--force', 'queuebot-test'],
      ['inspect', 'queuebot-test'],
      ['volume', 'rm', '--force', 'queuebot-test-data'],
      ['volume', 'inspect', 'queuebot-test-data'],
    ]);
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it('waits until the container disappears when inspect still finds it right after rm', async () => {
    const runDocker = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: 'queuebot-test', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '[{}]', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'error: no such object: queuebot-test' })
      .mockReturnValueOnce({ status: 0, stdout: 'queuebot-test-data', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'Error: No such volume: queuebot-test-data' });
    const sleep = vi.fn(async () => {});

    await cleanupIsolatedPostgres({
      containerName: 'queuebot-test', volumeName: 'queuebot-test-data', runDocker, sleep, now: () => 0,
    });

    expect(argsOf(runDocker)).toEqual([
      ['rm', '--force', 'queuebot-test'],
      ['inspect', 'queuebot-test'],
      ['inspect', 'queuebot-test'],
      ['volume', 'rm', '--force', 'queuebot-test-data'],
      ['volume', 'inspect', 'queuebot-test-data'],
    ]);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('treats "removal already in progress" as transient and keeps polling without a second rm', async () => {
    const runDocker = vi.fn()
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'Error response from daemon: removal of container queuebot-test is already in progress' })
      .mockReturnValueOnce(ok('[{}]'))
      .mockReturnValueOnce(containerMissing);
    const clock = fakeClock();

    await cleanupIsolatedPostgres({ containerName: 'queuebot-test', runDocker, ...clock });

    expect(argsOf(runDocker)).toEqual([
      ['rm', '--force', 'queuebot-test'],
      ['inspect', 'queuebot-test'],
      ['inspect', 'queuebot-test'],
    ]);
  });

  it('treats a timed-out rm (status null, error.code ETIMEDOUT) as transient and still verifies removal', async () => {
    const timedOut = Object.assign(new Error('spawnSync docker ETIMEDOUT'), { code: 'ETIMEDOUT' });
    const runDocker = vi.fn()
      .mockReturnValueOnce({ status: null, signal: 'SIGTERM', stdout: '', stderr: '', error: timedOut })
      .mockReturnValueOnce(ok('[{}]'))
      .mockReturnValueOnce(containerMissing);
    const clock = fakeClock();

    await cleanupIsolatedPostgres({ containerName: 'queuebot-test', runDocker, ...clock });

    expect(argsOf(runDocker)).toEqual([
      ['rm', '--force', 'queuebot-test'],
      ['inspect', 'queuebot-test'],
      ['inspect', 'queuebot-test'],
    ]);
  });

  it('retries rm after a non-transient rm failure while the container is still present', async () => {
    const runDocker = vi.fn()
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'Error response from daemon: could not kill container: permission denied' })
      .mockReturnValueOnce(ok('[{}]'))
      .mockReturnValueOnce(ok('queuebot-test'))
      .mockReturnValueOnce(containerMissing);
    const clock = fakeClock();

    await cleanupIsolatedPostgres({ containerName: 'queuebot-test', runDocker, ...clock });

    expect(argsOf(runDocker)).toEqual([
      ['rm', '--force', 'queuebot-test'],
      ['inspect', 'queuebot-test'],
      ['rm', '--force', 'queuebot-test'],
      ['inspect', 'queuebot-test'],
    ]);
  });

  it('is a no-op success when the container was never created and no volume is used', async () => {
    const runDocker = vi.fn()
      .mockReturnValueOnce(ok())
      .mockReturnValueOnce(containerMissing);
    const clock = fakeClock();

    await cleanupIsolatedPostgres({ containerName: 'queuebot-test', runDocker, ...clock });

    expect(argsOf(runDocker)).toEqual([
      ['rm', '--force', 'queuebot-test'],
      ['inspect', 'queuebot-test'],
    ]);
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it('reports status, signal, timeout code and stderr when the container never disappears', async () => {
    const timedOut = Object.assign(new Error('spawnSync docker ETIMEDOUT'), { code: 'ETIMEDOUT' });
    const runDocker = vi.fn((args) => (args[0] === 'rm'
      ? { status: null, signal: 'SIGTERM', stdout: '', stderr: '', error: timedOut }
      : { status: 0, stdout: '[{}]', stderr: '' }));
    const clock = fakeClock();

    const failure = cleanupIsolatedPostgres({
      containerName: 'queuebot-test', volumeName: 'queuebot-test-data', runDocker, ...clock, deadlineMs: 2_000, pollIntervalMs: 500,
    });

    await expect(failure).rejects.toThrow(/container cleanup failed for queuebot-test/i);
    await expect(failure).rejects.toThrow(/inspect: status=0 signal=none code=none/);
    await expect(failure).rejects.toThrow(/rm: status=null signal=SIGTERM code=ETIMEDOUT/);
    expect(argsOf(runDocker).some(([command]) => command === 'volume')).toBe(false);
    expect(clock.now()).toBeGreaterThanOrEqual(2_000);
  });

  it('includes stderr when inspect fails for a reason other than a missing container', async () => {
    const runDocker = vi.fn((args) => (args[0] === 'rm'
      ? ok()
      : { status: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon' }));
    const clock = fakeClock();

    await expect(cleanupIsolatedPostgres({ containerName: 'queuebot-test', runDocker, ...clock, deadlineMs: 1_000 }))
      .rejects.toThrow(/inspect: status=1 signal=none code=none stderr=Cannot connect to the Docker daemon/);
  });

  it('retries volume removal while the volume is still in use', async () => {
    const runDocker = vi.fn()
      .mockReturnValueOnce(ok())
      .mockReturnValueOnce(containerMissing)
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'Error response from daemon: remove queuebot-test-data: volume is in use - [abc]' })
      .mockReturnValueOnce(ok('queuebot-test-data'))
      .mockReturnValueOnce(volumeMissing);
    const clock = fakeClock();

    await cleanupIsolatedPostgres({ containerName: 'queuebot-test', volumeName: 'queuebot-test-data', runDocker, ...clock });

    expect(argsOf(runDocker)).toEqual([
      ['rm', '--force', 'queuebot-test'],
      ['inspect', 'queuebot-test'],
      ['volume', 'rm', '--force', 'queuebot-test-data'],
      ['volume', 'rm', '--force', 'queuebot-test-data'],
      ['volume', 'inspect', 'queuebot-test-data'],
    ]);
    expect(clock.sleep).toHaveBeenCalledTimes(1);
  });

  it('fails visibly with details when the isolated test volume remains after the deadline', async () => {
    const runDocker = vi.fn((args) => {
      if (args[0] === 'rm') return ok();
      if (args[0] === 'inspect') return containerMissing;
      if (args[1] === 'rm') return { status: 1, stdout: '', stderr: 'volume is in use' };
      return ok('still-present');
    });
    const clock = fakeClock();

    const failure = cleanupIsolatedPostgres({
      containerName: 'queuebot-test', volumeName: 'queuebot-test-data', runDocker, ...clock, deadlineMs: 1_500,
    });

    await expect(failure).rejects.toThrow(/volume cleanup failed for queuebot-test-data/i);
    await expect(failure).rejects.toThrow(/volume rm: status=1 signal=none code=none stderr=volume is in use/);
  });

  it('fails visibly when the volume still exists after a successful volume rm until the deadline', async () => {
    const runDocker = vi.fn((args) => {
      if (args[0] === 'rm') return ok();
      if (args[0] === 'inspect') return containerMissing;
      if (args[1] === 'rm') return ok('queuebot-test-data');
      return ok('[{}]');
    });
    const clock = fakeClock();

    await expect(cleanupIsolatedPostgres({
      containerName: 'queuebot-test', volumeName: 'queuebot-test-data', runDocker, ...clock, deadlineMs: 1_000,
    })).rejects.toThrow(/volume inspect: status=0 signal=none code=none/);
  });
});
