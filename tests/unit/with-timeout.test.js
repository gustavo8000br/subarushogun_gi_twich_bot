import { describe, expect, it } from 'vitest';
import { withTimeout } from '../helpers/with-timeout.mjs';

describe('withTimeout', () => {
  it('rejects a stalled operation with the supplied diagnostic', async () => {
    await expect(withTimeout(new Promise(() => {}), 5, 'OBS request timed out')).rejects.toThrow('OBS request timed out');
  });

  it('returns a result when the operation completes before its deadline', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 100, 'must not time out')).resolves.toBe('ok');
  });
});
