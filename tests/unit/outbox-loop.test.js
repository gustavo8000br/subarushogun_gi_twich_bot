import { describe, expect, it, vi } from 'vitest';
import { createOutboxLoop } from '../../apps/api/src/outbox/loop.mjs';

describe('outbox processing loop', () => {
  it('processes work sequentially, waits when idle, and stops without starting another task', async () => {
    const callbacks = [];
    const clearTimeoutImpl = vi.fn();
    const processOne = vi.fn().mockResolvedValueOnce('confirmed').mockResolvedValueOnce('idle');
    const loop = createOutboxLoop({
      worker: { processOne },
      setTimeoutImpl: (callback) => { callbacks.push(callback); return callbacks.length; },
      clearTimeoutImpl,
    });

    loop.start();
    callbacks.shift()();
    await vi.waitFor(() => expect(processOne).toHaveBeenCalledTimes(1));
    callbacks.shift()();
    await vi.waitFor(() => expect(processOne).toHaveBeenCalledTimes(2));
    expect(callbacks).toHaveLength(1);
    loop.stop();
    callbacks.shift()();
    await Promise.resolve();
    expect(processOne).toHaveBeenCalledTimes(2);
    expect(clearTimeoutImpl).toHaveBeenCalledOnce();
  });

  it('reports sanitized processing errors and continues after a delay', async () => {
    const callbacks = [];
    const onError = vi.fn();
    const onDiagnostic = vi.fn();
    const processOne = vi.fn().mockRejectedValueOnce(new Error('sensitive response body'));
    const loop = createOutboxLoop({
      worker: { processOne }, onError, onDiagnostic, source: 'outbox.reward',
      setTimeoutImpl: (callback) => { callbacks.push(callback); return callbacks.length; },
      clearTimeoutImpl: vi.fn(),
    });
    loop.start();
    callbacks.shift()();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('outbox_processing_failed'));
    expect(onDiagnostic).toHaveBeenCalledWith({ source: 'outbox.reward', errorType: 'Error', errorCode: null });
    expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('sensitive response body');
    expect(callbacks).toHaveLength(1);
    expect(onError.mock.calls.flat().join(' ')).not.toContain('sensitive response body');
    loop.stop();
  });
});
