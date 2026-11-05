import { describe, expect, it, vi } from 'vitest';
import {
  ISOLATED_POSTGRES_IMAGE,
  ISOLATED_POSTGRES_PULL_TIMEOUT_MS,
  ensurePostgresImage,
} from '../helpers/isolated-postgres-image.mjs';

describe('isolated PostgreSQL test image', () => {
  it('pins the same PostgreSQL image used by Compose', () => {
    expect(ISOLATED_POSTGRES_IMAGE).toBe('postgres:18.6-bookworm');
    expect(ISOLATED_POSTGRES_PULL_TIMEOUT_MS).toBeGreaterThanOrEqual(300_000);
  });

  it('does not pull when the image is already cached', () => {
    const runDocker = vi.fn(() => ({ status: 0, stdout: 'sha256:abc\n', stderr: '' }));

    expect(ensurePostgresImage({ runDocker })).toEqual({ pulled: false });
    expect(runDocker).toHaveBeenCalledTimes(1);
    expect(runDocker.mock.calls[0][0]).toEqual(['image', 'inspect', '--format', '{{.Id}}', 'postgres:18.6-bookworm']);
  });

  it('pulls with the long timeout when the image is missing', () => {
    const runDocker = vi.fn()
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'Error response from daemon: No such image: postgres:18.6-bookworm' })
      .mockReturnValueOnce({ status: 0, stdout: 'Status: Downloaded newer image', stderr: '' });

    expect(ensurePostgresImage({ runDocker })).toEqual({ pulled: true });
    expect(runDocker.mock.calls[1]).toEqual([['pull', 'postgres:18.6-bookworm'], { timeout: ISOLATED_POSTGRES_PULL_TIMEOUT_MS }]);
  });

  it('fails with a clear error when the pull fails or times out', () => {
    const timedOut = Object.assign(new Error('spawnSync docker ETIMEDOUT'), { code: 'ETIMEDOUT' });
    const runDocker = vi.fn()
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'Error: No such image: postgres:18.6-bookworm' })
      .mockReturnValueOnce({ status: null, signal: 'SIGTERM', stdout: '', stderr: '', error: timedOut });

    expect(() => ensurePostgresImage({ runDocker }))
      .toThrow(/docker pull postgres:18\.6-bookworm failed \(status=null signal=SIGTERM code=ETIMEDOUT stderr=\(empty\)\)/);
  });

  it('does not pull when docker image inspect fails for another reason', () => {
    const runDocker = vi.fn(() => ({ status: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon' }));

    expect(() => ensurePostgresImage({ runDocker }))
      .toThrow(/docker image inspect postgres:18\.6-bookworm failed \(status=1 .*Cannot connect to the Docker daemon\)/);
    expect(runDocker).toHaveBeenCalledTimes(1);
  });
});
